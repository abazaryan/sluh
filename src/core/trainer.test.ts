import { beforeEach, describe, expect, it } from 'vitest';
import type { LogEntry } from './log';
import { RecognitionStartError, type Clock, type RecognitionHandlers, type SpeechRecognizer } from './ports';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { MIC_WATCHDOG_MS, Trainer } from './trainer';

class FakeClock implements Clock {
  t = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private seq = 0;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.seq;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(h: unknown) {
    this.timers = this.timers.filter((x) => x.id !== h);
  }
  advance(ms: number) {
    this.t += ms;
    const due = this.timers.filter((x) => x.at <= this.t);
    this.timers = this.timers.filter((x) => x.at > this.t);
    due.forEach((x) => x.fn());
  }
}

class FakeRecognizer implements SpeechRecognizer {
  supported = true;
  failWith: RecognitionStartError | null = null;
  sessions: { lang: string; h: RecognitionHandlers; aborted: boolean }[] = [];
  start(lang: string, h: RecognitionHandlers) {
    if (this.failWith) throw this.failWith;
    const s = { lang, h, aborted: false };
    this.sessions.push(s);
    return { abort: () => (s.aborted = true) };
  }
  get last() {
    return this.sessions[this.sessions.length - 1]!;
  }
}

const DECK = 'Где находится вокзал? | Où est la gare ?\nЯ не понимаю. | Je ne comprends pas.';

let clock: FakeClock;
let rec: FakeRecognizer;
let spoken: string[];
let log: LogEntry[];
let settings: Settings;
let tr: Trainer;

beforeEach(() => {
  clock = new FakeClock();
  rec = new FakeRecognizer();
  spoken = [];
  log = [];
  settings = { ...DEFAULT_SETTINGS, deck: DECK };
  tr = new Trainer({
    recognizer: rec,
    speaker: { speak: (t) => spoken.push(t), cancel: () => {} },
    clock,
    getSettings: () => settings,
    appendLog: (e) => log.push(e),
    rng: () => 0.99, // keeps deck order
    isoNow: () => 'T',
  });
});

/** Simulates the recognizer hearing `text` after `delayMs` of silence. */
function say(text: string, delayMs: number, micStartMs = 200) {
  const h = rec.last.h;
  clock.advance(micStartMs);
  h.onStart();
  clock.advance(delayMs - micStartMs);
  h.onSpeechStart();
  h.onResult({ finalAlts: null, interim: text.slice(0, 3) });
  clock.advance(800);
  h.onResult({ finalAlts: [text, 'autre chose'], interim: '' });
  h.onEnd();
}

describe('Trainer', () => {
  it('starts a series and starts listening on the first card', () => {
    tr.start();
    const s = tr.getState();
    expect(s.phase).toBe('card');
    expect(s.card?.fr).toBe('Où est la gare ?');
    expect(s.progress).toEqual({ position: 1, total: 2, fraction: 0 });
    expect(rec.sessions).toHaveLength(1);
    expect(rec.last.lang).toBe('fr-FR');
    expect(s.mic.message).toBe('Включаю микрофон…');
  });

  it('voice answer: measures latency to speech start, grades, logs confirmed grade', () => {
    tr.start();
    say('où est la gare', 2000);
    const s = tr.getState();
    expect(s.result?.mode).toBe('voice');
    expect(s.result?.score).toBe(1);
    expect(s.result?.latencyMs).toBe(2000);
    expect(s.result?.micDelayMs).toBe(200);
    expect(s.result?.totalMs).toBe(2800);
    expect(s.result?.suggestion.grade).toBe(4);
    expect(s.selected).toBe(4);
    expect(spoken).toEqual(['Où est la gare ?']); // autoSpeak

    tr.selectGrade(3);
    tr.next();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      expected: 'Où est la gare ?',
      heard: 'où est la gare',
      alts: ['où est la gare', 'autre chose'],
      mode: 'voice',
      score: 1,
      latencyMs: 2000,
      micDelayMs: 200,
      suggested: 4,
      final: 3,
      retries: 0,
    });
    expect(tr.getState().card?.fr).toBe('Je ne comprends pas.');
    expect(tr.getState().progress.position).toBe(2);
  });

  it('uses interim text when no final result arrives', () => {
    tr.start();
    const h = rec.last.h;
    h.onStart();
    clock.advance(1000);
    h.onResult({ finalAlts: null, interim: ' où est la gare ' });
    h.onEnd();
    expect(tr.getState().result?.heard).toBe('où est la gare');
    expect(tr.getState().result?.latencyMs).toBe(1000);
  });

  it('no speech: shows error and retry, retry counts', () => {
    tr.start();
    const h = rec.last.h;
    h.onStart();
    h.onError('no-speech');
    h.onEnd();
    let s = tr.getState();
    expect(s.result).toBeNull();
    expect(s.mic).toEqual({ state: 'error', message: 'Речь не обнаружена.', error: true });
    expect(s.showRetry).toBe(true);
    expect(s.typedMode).toBe(false);

    tr.retry();
    expect(rec.sessions).toHaveLength(2);
    say('où est la gare', 1000);
    tr.next();
    expect(log[0]?.retries).toBe(1);
    s = tr.getState();
    expect(s.showRetry).toBe(false);
  });

  it('permission denied switches to typing', () => {
    tr.start();
    rec.last.h.onError('not-allowed');
    rec.last.h.onEnd();
    expect(tr.getState().typedMode).toBe(true);
    expect(tr.getState().mic.message).toContain('Нет доступа к микрофону');
  });

  it('unknown error code is shown as is', () => {
    tr.start();
    rec.last.h.onError('weird');
    rec.last.h.onEnd();
    expect(tr.getState().mic.message).toBe('Ошибка распознавания: weird');
  });

  it('watchdog: mic that never starts is aborted after 5 s and typing is offered', () => {
    tr.start();
    clock.advance(MIC_WATCHDOG_MS - 1);
    expect(tr.getState().typedMode).toBe(false);
    clock.advance(1);
    const s = tr.getState();
    expect(rec.last.aborted).toBe(true);
    expect(s.typedMode).toBe(true);
    expect(s.showRetry).toBe(true);
    expect(s.mic.state).toBe('error');
    expect(s.mic.message).toContain('5 секунд');
  });

  it('watchdog does not fire once the mic has started', () => {
    tr.start();
    clock.advance(100);
    rec.last.h.onStart();
    clock.advance(MIC_WATCHDOG_MS * 2);
    expect(tr.getState().typedMode).toBe(false);
    expect(tr.getState().mic.state).toBe('listening');
  });

  it('late callbacks from an aborted session are ignored', () => {
    tr.start();
    const old = rec.last.h;
    tr.toggleTyped();
    old.onResult({ finalAlts: ['où est la gare'], interim: '' });
    old.onEnd();
    expect(tr.getState().result).toBeNull();
    expect(tr.getState().typedMode).toBe(true);
  });

  it('typed answer: latency from first keystroke', () => {
    tr.start();
    tr.toggleTyped();
    expect(rec.last.aborted).toBe(true);
    expect(tr.getState().mic.message).toBe('Режим ввода текстом');
    clock.advance(3000);
    tr.markTyping();
    clock.advance(4000);
    tr.markTyping();
    tr.submitTyped('  ');
    expect(tr.getState().result).toBeNull();
    tr.submitTyped('où est la gare');
    const r = tr.getState().result!;
    expect(r.mode).toBe('typed');
    expect(r.latencyMs).toBe(3000);
    expect(r.totalMs).toBe(7000);
    expect(r.micDelayMs).toBeNull();
    expect(r.suggestion.grade).toBe(3);
  });

  it('switching back to voice restarts listening and counts as a retry', () => {
    tr.start();
    tr.toggleTyped();
    tr.toggleTyped();
    expect(tr.getState().typedMode).toBe(false);
    expect(rec.sessions).toHaveLength(2);
  });

  it('"Не знаю" suggests Again and always speaks the reference', () => {
    settings = { ...settings, autoSpeak: false };
    tr.start();
    clock.advance(4000);
    tr.skip();
    const r = tr.getState().result!;
    expect(r.skipped).toBe(true);
    expect(r.suggestion.grade).toBe(1);
    expect(r.latencyMs).toBe(4000);
    expect(spoken).toEqual(['Où est la gare ?']);
  });

  it('autoSpeak off: no speech after a voice answer', () => {
    settings = { ...settings, autoSpeak: false };
    tr.start();
    say('où est la gare', 1000);
    expect(spoken).toEqual([]);
  });

  it('Again re-queues the card at the end, at most 3 tries in total', () => {
    settings = { ...settings, deck: 'a | un' };
    tr.start();
    for (let i = 0; i < 3; i++) {
      expect(tr.getState().phase).toBe('card');
      tr.skip();
      tr.next();
    }
    expect(tr.getState().phase).toBe('done');
    expect(log).toHaveLength(3);
    expect(tr.getState().session).toHaveLength(3);
  });

  it('series ends after all cards; start() begins a fresh series', () => {
    tr.start();
    say('où est la gare', 1000);
    tr.next();
    say('je ne comprends pas', 1000);
    tr.next();
    expect(tr.getState().phase).toBe('done');
    expect(tr.getState().session).toHaveLength(2);
    tr.start();
    expect(tr.getState().session).toHaveLength(0);
    expect(tr.getState().phase).toBe('card');
  });

  it('empty deck falls back to the built-in examples', () => {
    settings = { ...settings, deck: 'nothing useful' };
    tr.start();
    expect(tr.getState().progress.total).toBe(11);
  });

  it('accent leniency follows settings', () => {
    settings = { ...settings, lenient: false };
    tr.start();
    say('ou est la gare', 1000);
    expect(tr.getState().result?.score).toBe(0.75);
  });

  it('no recognition support: error and typing', () => {
    rec.supported = false;
    tr.start();
    const s = tr.getState();
    expect(s.typedMode).toBe(true);
    expect(s.mic.message).toContain('не поддерживается');
  });

  it('recognizer start failure offers retry; create failure offers typing', () => {
    rec.failWith = new RecognitionStartError('start');
    tr.start();
    expect(tr.getState().showRetry).toBe(true);
    expect(tr.getState().typedMode).toBe(false);

    rec.failWith = new RecognitionStartError('create');
    tr.retry();
    expect(tr.getState().typedMode).toBe(true);
  });

  it('notifies subscribers and returns stable snapshots between changes', () => {
    let calls = 0;
    const off = tr.subscribe(() => calls++);
    const before = tr.getState();
    expect(tr.getState()).toBe(before);
    tr.start();
    expect(calls).toBeGreaterThan(0);
    off();
    const n = calls;
    tr.skip();
    expect(calls).toBe(n);
  });
});
