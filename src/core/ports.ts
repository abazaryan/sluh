/**
 * Thin interfaces to browser capabilities. Core logic depends only on these;
 * real implementations live in src/platform, fakes in tests.
 */

export interface RecognitionUpdate {
  /** Alternatives of a final result in this event, if any. */
  finalAlts: string[] | null;
  /** Concatenated interim transcript in this event. */
  interim: string;
}

export interface RecognitionHandlers {
  onStart(): void;
  onSpeechStart(): void;
  onResult(update: RecognitionUpdate): void;
  onError(code: string): void;
  onEnd(): void;
}

export interface RecognitionSession {
  /** Stops immediately; no further handler calls. */
  abort(): void;
}

export class RecognitionStartError extends Error {
  readonly stage: 'create' | 'start';
  constructor(stage: 'create' | 'start') {
    super(`recognition ${stage} failed`);
    this.stage = stage;
  }
}

export interface SpeechRecognizer {
  readonly supported: boolean;
  /** Throws RecognitionStartError if the recognizer cannot be created or started. */
  start(lang: string, handlers: RecognitionHandlers): RecognitionSession;
}

export interface Speaker {
  speak(text: string, lang: string): void;
  cancel(): void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}
