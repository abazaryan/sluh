import { bestAlternative, type AlignOp } from './compare';
import { parseDeck, shuffle, DEFAULT_DECK_TEXT, type DeckCard } from './deck';
import { suggestGrade, type Grade, type GradeSuggestion } from './grade';
import type { AnswerMode, LogEntry } from './log';
import { RecognitionStartError, type Clock, type RecognitionUpdate, type Speaker, type SpeechRecognizer } from './ports';
import type { Settings } from './settings';

/** If the microphone has not started within this time, give up and offer typing. */
export const MIC_WATCHDOG_MS = 5000;
/** A card graded «Снова» is shown again at the end of the series, up to this many times in total. */
export const MAX_TRIES_PER_CARD = 3;

export const RECOGNITION_ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'Нет доступа к микрофону. Разрешите его для этого сайта или откройте страницу в отдельной вкладке.',
  'service-not-allowed': 'Браузер не разрешил службу распознавания. Откройте страницу в отдельной вкладке.',
  'audio-capture': 'Микрофон не найден или занят другим приложением.',
  network: 'Нет связи со службой распознавания. Она работает только при подключении к интернету.',
  'no-speech': 'Речь не обнаружена.',
  'language-not-supported': 'Выбранный язык не поддерживается этим браузером.',
  aborted: '',
};

/** Errors after which voice input makes no sense and typing is opened. */
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

export type MicState = 'idle' | 'listening' | 'heard' | 'error';
export type Phase = 'start' | 'card' | 'done';

export interface CardResult {
  mode: AnswerMode;
  heard: string;
  alts: string[];
  score: number;
  latencyMs: number;
  totalMs: number;
  micDelayMs: number | null;
  ops: AlignOp[];
  suggestion: GradeSuggestion;
  skipped: boolean;
}

export interface TrainerState {
  phase: Phase;
  card: DeckCard | null;
  /** Increments for every shown card (UI uses it to reset inputs). */
  cardSeq: number;
  progress: { position: number; total: number; fraction: number };
  mic: { state: MicState; message: string; error: boolean };
  live: string;
  showRetry: boolean;
  typedMode: boolean;
  result: CardResult | null;
  selected: Grade;
  /** Entries committed in the current series. */
  session: LogEntry[];
}

export interface TrainerDeps {
  recognizer: SpeechRecognizer;
  speaker: Speaker;
  clock: Clock;
  getSettings(): Settings;
  appendLog(entry: LogEntry): void;
  rng?: () => number;
  /** Defaults to the current time; injectable for tests. */
  isoNow?: () => string;
}

interface QueuedCard extends DeckCard {
  tries: number;
}

const INITIAL: TrainerState = {
  phase: 'start',
  card: null,
  cardSeq: 0,
  progress: { position: 0, total: 0, fraction: 0 },
  mic: { state: 'idle', message: '', error: false },
  live: '',
  showRetry: false,
  typedMode: false,
  result: null,
  selected: 3,
  session: [],
};

/**
 * Runs a series of cards: listens, measures latency, compares, suggests a grade,
 * logs the confirmed grade. All public methods are synchronous so that the UI can
 * call them straight from click handlers (Chrome wants a user gesture for the mic).
 */
export class Trainer {
  private state: TrainerState = INITIAL;
  private readonly listeners = new Set<() => void>();
  private readonly deps: TrainerDeps;

  private queue: QueuedCard[] = [];
  private current: QueuedCard | null = null;
  private total = 0;
  private done = 0;

  private cardShownAt = 0;
  private micReadyAt: number | null = null;
  private firstSpeechAt: number | null = null;
  private firstKeyAt: number | null = null;
  private retries = 0;

  /** Identifies the active recognition attempt; stale callbacks are ignored. */
  private attempt = 0;
  private rec: { abort(): void } | null = null;
  private watchdog: unknown = null;
  private finalAlts: string[] | null = null;
  private lastInterim = '';
  private errorCode: string | null = null;

  constructor(deps: TrainerDeps) {
    this.deps = deps;
  }

  getState = (): TrainerState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private set(patch: Partial<TrainerState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private setMic(state: MicState, message = '', error = false): void {
    this.set({ mic: { state, message, error } });
  }

  // ---------- series ----------

  start(): void {
    const s = this.deps.getSettings();
    let deck = parseDeck(s.deck);
    if (!deck.length) deck = parseDeck(DEFAULT_DECK_TEXT);
    this.queue = shuffle(deck, this.deps.rng).map((c) => ({ ...c, tries: 0 }));
    this.total = this.queue.length;
    this.done = 0;
    this.set({ phase: 'card', session: [] });
    this.nextCard();
  }

  private nextCard(): void {
    this.stopRec();
    const card = this.queue.shift();
    if (!card) {
      this.current = null;
      this.set({ phase: 'done', card: null, result: null });
      return;
    }
    this.current = card;
    this.retries = 0;
    this.firstKeyAt = null;
    this.set({
      card: { ru: card.ru, fr: card.fr },
      cardSeq: this.state.cardSeq + 1,
      progress: {
        position: Math.min(this.done + 1, this.total),
        total: this.total,
        fraction: this.total ? this.done / this.total : 0,
      },
      result: null,
      typedMode: false,
      showRetry: false,
      live: '',
    });
    this.cardShownAt = this.deps.clock.now();
    this.startListening();
  }

  // ---------- recognition ----------

  private stopRec(): void {
    this.attempt++;
    if (this.watchdog !== null) this.deps.clock.clearTimeout(this.watchdog);
    this.watchdog = null;
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
  }

  private startListening(): void {
    this.stopRec();
    const { recognizer, clock } = this.deps;
    if (!recognizer.supported) {
      this.setMic('error', 'Распознавание речи не поддерживается. Отвечайте текстом.', true);
      this.setTyped(true, true);
      return;
    }
    this.finalAlts = null;
    this.lastInterim = '';
    this.errorCode = null;
    this.micReadyAt = null;
    this.firstSpeechAt = null;
    this.set({ showRetry: false, live: '' });
    this.setMic('idle', 'Включаю микрофон…');

    const attempt = this.attempt;
    const live = (): boolean => attempt === this.attempt;
    try {
      this.rec = recognizer.start(this.deps.getSettings().lang, {
        onStart: () => {
          if (!live()) return;
          if (this.watchdog !== null) clock.clearTimeout(this.watchdog);
          this.watchdog = null;
          this.micReadyAt = clock.now();
          this.setMic('listening', 'Говорите');
        },
        onSpeechStart: () => {
          if (live() && this.firstSpeechAt === null) this.firstSpeechAt = clock.now();
        },
        onResult: (u) => {
          if (live()) this.onResult(u);
        },
        onError: (code) => {
          if (live()) this.errorCode = code || 'unknown';
        },
        onEnd: () => {
          if (live()) this.onEnd();
        },
      });
    } catch (e) {
      if (e instanceof RecognitionStartError && e.stage === 'create') {
        this.setMic('error', 'Не удалось запустить распознавание.', true);
        this.setTyped(true, true);
      } else {
        this.setMic('error', 'Не удалось включить микрофон. Нажмите «Повторить».', true);
        this.set({ showRetry: true });
      }
      return;
    }
    this.watchdog = clock.setTimeout(() => {
      if (!live() || this.micReadyAt !== null) return;
      this.stopRec();
      this.setMic(
        'error',
        'Микрофон не включился за 5 секунд. Скорее всего, браузер блокирует его в этом окне. Можно ответить текстом.',
        true,
      );
      this.set({ showRetry: true });
      this.setTyped(true, true);
    }, MIC_WATCHDOG_MS);
  }

  private onResult(u: RecognitionUpdate): void {
    if (this.firstSpeechAt === null) this.firstSpeechAt = this.deps.clock.now();
    if (u.finalAlts && u.finalAlts.length) this.finalAlts = u.finalAlts;
    if (u.interim) this.lastInterim = u.interim;
    this.set({ live: this.finalAlts ? this.finalAlts[0]! : u.interim });
  }

  private onEnd(): void {
    if (this.watchdog !== null) this.deps.clock.clearTimeout(this.watchdog);
    this.watchdog = null;
    this.rec = null;
    if (this.state.typedMode) return;
    const interim = this.lastInterim.trim();
    const alts = this.finalAlts ?? (interim ? [interim] : null);
    if (alts) {
      this.setMic('heard', 'Услышал');
      this.finishAnswer(alts, 'voice');
      return;
    }
    const code = this.errorCode;
    let msg: string;
    if (code) msg = RECOGNITION_ERROR_TEXT[code] ?? `Ошибка распознавания: ${code}`;
    else msg = 'Речь не распознана.';
    this.setMic('error', msg || 'Остановлено.', true);
    this.set({ showRetry: true });
    if (code && FATAL_ERRORS.has(code)) this.setTyped(true, true);
  }

  // ---------- user actions while answering ----------

  retry(): void {
    if (this.state.phase !== 'card' || this.state.result) return;
    this.retries++;
    this.startListening();
  }

  toggleTyped(): void {
    if (this.state.phase !== 'card' || this.state.result) return;
    if (this.state.typedMode) {
      this.set({ typedMode: false });
      this.retries++;
      this.startListening();
    } else {
      this.setTyped(true);
    }
  }

  /** Switches to typing. `keepMic` leaves the current (error) message visible. */
  private setTyped(on: boolean, keepMic = false): void {
    if (!on) {
      this.set({ typedMode: false });
      return;
    }
    this.stopRec();
    this.set({ typedMode: true });
    if (!keepMic && this.deps.recognizer.supported) this.setMic('idle', 'Режим ввода текстом');
  }

  /** Call on the first keystroke in the text box: typed latency starts here. */
  markTyping(): void {
    if (this.firstKeyAt === null) this.firstKeyAt = this.deps.clock.now();
  }

  submitTyped(text: string): void {
    const v = text.trim();
    if (!v || !this.current || this.state.result) return;
    this.finishAnswer([v], 'typed');
  }

  skip(): void {
    if (!this.current || this.state.result) return;
    this.stopRec();
    const t = this.deps.clock.now() - this.cardShownAt;
    this.showResult({
      mode: 'skip',
      heard: '',
      alts: [],
      score: 0,
      latencyMs: t,
      totalMs: t,
      micDelayMs: null,
      ops: [],
      suggestion: { grade: 1, reason: 'вы отметили «Не знаю»' },
      skipped: true,
    });
  }

  private finishAnswer(alts: string[], mode: 'voice' | 'typed'): void {
    const card = this.current;
    if (!card) return;
    const s = this.deps.getSettings();
    const best = bestAlternative(card.fr, alts, { lenient: s.lenient });
    if (!best) return;
    const now = this.deps.clock.now();
    const t0 = mode === 'typed' ? (this.firstKeyAt ?? now) : (this.firstSpeechAt ?? now);
    const latencyMs = Math.max(0, t0 - this.cardShownAt);
    const micDelayMs = this.micReadyAt !== null ? this.micReadyAt - this.cardShownAt : null;
    this.stopRec();
    this.showResult({
      mode,
      heard: best.text,
      alts,
      score: best.result.score,
      latencyMs,
      totalMs: now - this.cardShownAt,
      micDelayMs,
      ops: best.result.ops,
      suggestion: suggestGrade(best.result.score, latencyMs, best.result.nWords, s),
      skipped: false,
    });
  }

  private showResult(result: CardResult): void {
    this.set({ result, selected: result.suggestion.grade });
    if (result.skipped || this.deps.getSettings().autoSpeak) this.speakReference();
  }

  // ---------- result screen ----------

  selectGrade(g: Grade): void {
    if (this.state.result) this.set({ selected: g });
  }

  speakReference(): void {
    const card = this.current;
    if (!card) return;
    try {
      this.deps.speaker.cancel();
      this.deps.speaker.speak(card.fr, this.deps.getSettings().lang);
    } catch {
      /* speech synthesis is optional */
    }
  }

  /** Confirms the selected grade, writes the log entry and shows the next card. */
  next(): void {
    const card = this.current;
    const r = this.state.result;
    if (!card || !r) return;
    const s = this.deps.getSettings();
    const final = this.state.selected;
    const entry: LogEntry = {
      ts: this.deps.isoNow ? this.deps.isoNow() : new Date().toISOString(),
      ru: card.ru,
      expected: card.fr,
      heard: r.heard,
      alts: r.alts,
      mode: r.mode,
      score: Math.round(r.score * 100) / 100,
      latencyMs: Math.round(r.latencyMs),
      totalMs: Math.round(r.totalMs),
      micDelayMs: r.micDelayMs !== null ? Math.round(r.micDelayMs) : null,
      retries: this.retries,
      lang: s.lang,
      suggested: r.suggestion.grade,
      final,
    };
    this.deps.appendLog(entry);
    this.done++;
    card.tries++;
    if (final === 1 && card.tries < MAX_TRIES_PER_CARD) this.queue.push(card);
    this.set({ session: [...this.state.session, entry] });
    try {
      this.deps.speaker.cancel();
    } catch {
      /* ignore */
    }
    this.nextCard();
  }

  /** Stops the microphone (e.g. when the page is closed). */
  dispose(): void {
    this.stopRec();
  }
}
