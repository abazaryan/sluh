import { fmtSec } from './format';

export type Grade = 1 | 2 | 3 | 4;

export const GRADE_NAMES: Record<Grade, string> = {
  1: 'Снова',
  2: 'Трудно',
  3: 'Хорошо',
  4: 'Легко',
};

export interface GradeThresholds {
  /** Seconds to start speaking for «Легко» (4-word phrase). */
  easy: number;
  /** Seconds to start speaking for «Хорошо» (4-word phrase). */
  good: number;
  /** Accuracy % below which the grade is «Снова». */
  again: number;
  /** Accuracy % below which the grade is at most «Трудно». */
  hard: number;
}

/** Extra seconds per word beyond BASE_WORDS added to time thresholds. */
export const SECONDS_PER_EXTRA_WORD = 0.3;
export const BASE_WORDS = 4;

export interface GradeSuggestion {
  grade: Grade;
  reason: string;
}

export function lengthBonusSec(nWords: number): number {
  return Math.max(0, nWords - BASE_WORDS) * SECONDS_PER_EXTRA_WORD;
}

export function suggestGrade(
  score: number,
  latencyMs: number,
  nWords: number,
  t: GradeThresholds,
): GradeSuggestion {
  const pct = score * 100;
  const shown = Math.round(pct);
  if (pct < t.again) {
    return { grade: 1, reason: `точность ${shown}% ниже порога «Снова»` };
  }
  const extra = lengthBonusSec(nWords);
  const lat = latencyMs / 1000;
  let grade: Grade;
  let speed: string;
  if (lat <= t.easy + extra) {
    grade = 4;
    speed = 'быстро';
  } else if (lat <= t.good + extra) {
    grade = 3;
    speed = 'в обычном темпе';
  } else {
    grade = 2;
    speed = 'медленно';
  }
  if (pct < t.hard && grade > 2) {
    return { grade: 2, reason: `точность ${shown}% ниже порога «Хорошо», ${speed}` };
  }
  return { grade, reason: `точность ${shown}%, начали ${speed} (${fmtSec(latencyMs)})` };
}
