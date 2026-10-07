import { describe, expect, it } from 'vitest';
import { lengthBonusSec, suggestGrade } from './grade';
import { DEFAULT_SETTINGS } from './settings';

const t = DEFAULT_SETTINGS; // easy 2.5 s, good 6 s, again 60 %, hard 85 %
const g = (score: number, sec: number, nWords = 4) => suggestGrade(score, sec * 1000, nWords, t).grade;

describe('suggestGrade: time thresholds (4-word phrase)', () => {
  it('≤ 2.5 s is Easy, boundary included', () => {
    expect(g(1, 0)).toBe(4);
    expect(g(1, 2.5)).toBe(4);
  });

  it('just over 2.5 s up to 6 s is Good', () => {
    expect(g(1, 2.51)).toBe(3);
    expect(g(1, 6)).toBe(3);
  });

  it('over 6 s is Hard', () => {
    expect(g(1, 6.01)).toBe(2);
    expect(g(1, 30)).toBe(2);
  });
});

describe('suggestGrade: accuracy thresholds', () => {
  it('below 60 % is Again even when fast', () => {
    expect(g(0.59, 0.5)).toBe(1);
    expect(g(0, 0.5)).toBe(1);
  });

  it('exactly 60 % is not Again', () => {
    expect(g(0.6, 10)).toBe(2);
  });

  it('below 85 % caps the grade at Hard', () => {
    expect(g(0.84, 1)).toBe(2);
    expect(g(0.75, 4)).toBe(2);
  });

  it('85 % and above allows Easy/Good', () => {
    expect(g(0.85, 1)).toBe(4);
    expect(g(0.9, 4)).toBe(3);
  });
});

describe('suggestGrade: phrase-length bonus', () => {
  it('adds 0.3 s per word over 4', () => {
    expect(lengthBonusSec(0)).toBe(0);
    expect(lengthBonusSec(4)).toBe(0);
    expect(lengthBonusSec(5)).toBeCloseTo(0.3);
    expect(lengthBonusSec(10)).toBeCloseTo(1.8);
  });

  it('a long phrase gets more time for Easy and Good', () => {
    // 8 words → +1.2 s: Easy ≤ 3.7 s, Good ≤ 7.2 s
    expect(g(1, 3.6, 8)).toBe(4);
    expect(g(1, 3.6, 4)).toBe(3);
    expect(g(1, 7.1, 8)).toBe(3);
    expect(g(1, 7.1, 4)).toBe(2);
    expect(g(1, 7.3, 8)).toBe(2);
  });

  it('short phrases get no reduction', () => {
    expect(g(1, 2.5, 1)).toBe(4);
  });
});

describe('suggestGrade: custom thresholds and reasons', () => {
  it('uses the thresholds passed in', () => {
    const custom = { easy: 1, good: 3, again: 50, hard: 70 };
    expect(suggestGrade(1, 1500, 4, custom).grade).toBe(3);
    expect(suggestGrade(0.55, 500, 4, custom).grade).toBe(4 - 2); // capped at Hard
    expect(suggestGrade(0.45, 500, 4, custom).grade).toBe(1);
  });

  it('explains the decision in Russian', () => {
    expect(suggestGrade(0.5, 1000, 4, t).reason).toBe('точность 50% ниже порога «Снова»');
    expect(suggestGrade(1, 1234, 4, t).reason).toBe('точность 100%, начали быстро (1,2 с)');
    expect(suggestGrade(0.75, 1000, 4, t).reason).toBe('точность 75% ниже порога «Хорошо», быстро');
  });
});
