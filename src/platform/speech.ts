import {
  RecognitionStartError,
  type RecognitionHandlers,
  type RecognitionSession,
  type Speaker,
  type SpeechRecognizer,
} from '../core/ports';

// Minimal typings for the Web Speech API (not in lib.dom for all TS versions).
interface SRAlternative {
  transcript: string;
}
interface SRResult {
  readonly isFinal: boolean;
  readonly length: number;
  [i: number]: SRAlternative;
}
interface SREvent {
  resultIndex: number;
  results: { length: number; [i: number]: SRResult };
}
interface SRInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type SRConstructor = new () => SRInstance;

function getSRConstructor(): SRConstructor | null {
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isRecognitionSupported(): boolean {
  return getSRConstructor() !== null;
}

export function createBrowserRecognizer(): SpeechRecognizer {
  const SR = getSRConstructor();
  return {
    supported: SR !== null,
    start(lang: string, h: RecognitionHandlers): RecognitionSession {
      if (!SR) throw new RecognitionStartError('create');
      let r: SRInstance;
      try {
        r = new SR();
      } catch {
        throw new RecognitionStartError('create');
      }
      r.lang = lang;
      r.interimResults = true;
      r.maxAlternatives = 3;
      r.continuous = false;
      r.onstart = () => h.onStart();
      r.onspeechstart = () => h.onSpeechStart();
      r.onresult = (e) => {
        let finalAlts: string[] | null = null;
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (!res) continue;
          if (res.isFinal) {
            const alts: string[] = [];
            for (let k = 0; k < res.length; k++) {
              const t = (res[k]?.transcript ?? '').trim();
              if (t) alts.push(t);
            }
            if (alts.length) finalAlts = alts;
          } else {
            interim += res[0]?.transcript ?? '';
          }
        }
        h.onResult({ finalAlts, interim });
      };
      r.onerror = (e) => h.onError(e.error ?? 'unknown');
      r.onend = () => h.onEnd();
      const detach = () => {
        r.onstart = r.onspeechstart = r.onresult = r.onerror = r.onend = null;
      };
      try {
        r.start();
      } catch {
        detach();
        throw new RecognitionStartError('start');
      }
      return {
        abort() {
          detach();
          try {
            r.abort();
          } catch {
            /* ignore */
          }
        },
      };
    },
  };
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices() ?? [];
  const want = lang.toLowerCase();
  const prefix = want.slice(0, 2);
  return (
    voices.find((v) => v.lang.replace('_', '-').toLowerCase() === want) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
  );
}

export function createBrowserSpeaker(): Speaker {
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  return {
    speak(text, lang) {
      if (!available) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.95;
      const v = pickVoice(lang);
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    },
    cancel() {
      if (available) speechSynthesis.cancel();
    },
  };
}

export function countFrenchVoices(): number {
  try {
    return (speechSynthesis.getVoices() ?? []).filter((v) => /^fr/i.test(v.lang)).length;
  } catch {
    return 0;
  }
}

/** Calls `fn` when the browser's voice list changes; returns an unsubscribe function. */
export function onVoicesChanged(fn: () => void): () => void {
  try {
    speechSynthesis.addEventListener('voiceschanged', fn);
    return () => speechSynthesis.removeEventListener('voiceschanged', fn);
  } catch {
    return () => {};
  }
}
