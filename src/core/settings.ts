import { DEFAULT_DECK_TEXT } from './deck';
import type { GradeThresholds } from './grade';

export const LANGS = [
  { value: 'fr-FR', label: 'Французский (Франция)' },
  { value: 'fr-BE', label: 'Французский (Бельгия)' },
  { value: 'fr-CA', label: 'Французский (Канада)' },
] as const;

export interface Settings extends GradeThresholds {
  /** Recognition / speech synthesis language. */
  lang: string;
  /** Ignore accents when comparing. */
  lenient: boolean;
  /** Speak the reference after an answer. */
  autoSpeak: boolean;
  /** Deck text, one "ru | fr" card per line. */
  deck: string;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'fr-FR',
  easy: 2.5,
  good: 6,
  again: 60,
  hard: 85,
  lenient: true,
  autoSpeak: true,
  deck: DEFAULT_DECK_TEXT,
};

function num(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/**
 * Builds valid settings from untrusted input (storage or form values):
 * clamps numbers, keeps good ≥ easy and hard ≥ again, falls back to `base`.
 */
export function sanitizeSettings(input: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const easy = num(o.easy, base.easy, 0.5, 30);
  const good = Math.max(easy, num(o.good, base.good, 1, 60));
  const again = num(o.again, base.again, 10, 95);
  const hard = Math.max(again, num(o.hard, base.hard, 20, 100));
  return {
    lang: typeof o.lang === 'string' && o.lang ? o.lang : base.lang,
    easy,
    good,
    again,
    hard,
    lenient: typeof o.lenient === 'boolean' ? o.lenient : base.lenient,
    autoSpeak: typeof o.autoSpeak === 'boolean' ? o.autoSpeak : base.autoSpeak,
    deck: typeof o.deck === 'string' ? o.deck : base.deck,
  };
}
