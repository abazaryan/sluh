import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK_TEXT, parseDeck, shuffle } from './deck';
import { fmtSec, pluralRu } from './format';
import { appendCapped, isLogEntry, summarize, type LogEntry } from './log';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';

describe('parseDeck', () => {
  it('parses the built-in deck into 11 cards', () => {
    const d = parseDeck(DEFAULT_DECK_TEXT);
    expect(d).toHaveLength(11);
    expect(d[3]).toEqual({ ru: 'Я живу в Люксембурге.', fr: "J'habite à Luxembourg." });
  });

  it('accepts tabs, trims, skips blank and incomplete lines', () => {
    expect(parseDeck('  a |  b  \n\nonly ru\n | x\nc\td\r\n')).toEqual([
      { ru: 'a', fr: 'b' },
      { ru: 'c', fr: 'd' },
    ]);
  });

  it('keeps extra separators inside the answer', () => {
    expect(parseDeck('a | b | c')).toEqual([{ ru: 'a', fr: 'b | c' }]);
  });
});

describe('shuffle', () => {
  it('is a permutation and does not mutate input', () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src);
    expect([...out].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic with an injected rng', () => {
    expect(shuffle([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });
});

describe('format', () => {
  it('fmtSec uses a decimal comma', () => {
    expect(fmtSec(2500)).toBe('2,5 с');
    expect(fmtSec(0)).toBe('0,0 с');
  });

  it('pluralRu', () => {
    const p = (n: number) => pluralRu(n, 'карточка', 'карточки', 'карточек');
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(p)).toEqual([
      'карточка',
      'карточки',
      'карточек',
      'карточек',
      'карточек',
      'карточка',
      'карточки',
      'карточек',
      'карточек',
    ]);
  });
});

describe('sanitizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps numbers and keeps thresholds ordered', () => {
    const s = sanitizeSettings({ easy: 100, good: 2, again: 5, hard: 3 });
    expect(s.easy).toBe(30);
    expect(s.good).toBe(30);
    expect(s.again).toBe(10);
    expect(s.hard).toBe(20);
    const s2 = sanitizeSettings({ again: 90, hard: 50 });
    expect(s2.hard).toBe(90);
  });

  it('accepts form strings with a decimal comma', () => {
    expect(sanitizeSettings({ easy: '3,5', good: '7' }).easy).toBe(3.5);
  });

  it('keeps valid values from storage', () => {
    const s = sanitizeSettings({ lang: 'fr-CA', lenient: false, autoSpeak: false, deck: 'a | b' });
    expect(s).toMatchObject({ lang: 'fr-CA', lenient: false, autoSpeak: false, deck: 'a | b' });
  });
});

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  ts: '2026-01-01T00:00:00.000Z',
  ru: 'r',
  expected: 'e',
  heard: 'e',
  alts: ['e'],
  mode: 'voice',
  score: 1,
  latencyMs: 1000,
  totalMs: 2000,
  micDelayMs: 300,
  retries: 0,
  lang: 'fr-FR',
  suggested: 4,
  final: 4,
  ...over,
});

describe('log', () => {
  it('appendCapped keeps the newest entries', () => {
    const log = [entry({ ru: '1' }), entry({ ru: '2' })];
    const out = appendCapped(log, entry({ ru: '3' }), 2);
    expect(out.map((e) => e.ru)).toEqual(['2', '3']);
    expect(log).toHaveLength(2);
  });

  it('summarize counts final grades and averages non-skipped answers', () => {
    const s = summarize([
      entry({ final: 4, score: 1, latencyMs: 1000 }),
      entry({ final: 2, score: 0.5, latencyMs: 3000 }),
      entry({ final: 1, mode: 'skip', score: 0, latencyMs: 9000 }),
    ]);
    expect(s.counts).toEqual({ 1: 1, 2: 1, 3: 0, 4: 1 });
    expect(s.answered).toBe(2);
    expect(s.avgScore).toBeCloseTo(0.75);
    expect(s.avgLatencyMs).toBe(2000);
  });

  it('summarize of nothing', () => {
    expect(summarize([]).answered).toBe(0);
  });

  it('isLogEntry filters broken records', () => {
    expect(isLogEntry(entry())).toBe(true);
    expect(isLogEntry({ expected: 'x' })).toBe(false);
    expect(isLogEntry(null)).toBe(false);
  });
});
