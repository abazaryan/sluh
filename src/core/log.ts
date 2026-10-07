import type { Grade } from './grade';

export type AnswerMode = 'voice' | 'typed' | 'skip';

/** One answered card. Shape matches the prototype's journal (sluh.log). */
export interface LogEntry {
  ts: string;
  ru: string;
  expected: string;
  heard: string;
  alts: string[];
  mode: AnswerMode;
  /** 0..1, rounded to 2 decimals. */
  score: number;
  latencyMs: number;
  totalMs: number;
  micDelayMs: number | null;
  retries: number;
  lang: string;
  suggested: Grade;
  final: Grade;
}

export const MAX_LOG_ENTRIES = 300;

export function appendCapped(log: readonly LogEntry[], entry: LogEntry, max = MAX_LOG_ENTRIES): LogEntry[] {
  const next = [...log, entry];
  return next.length > max ? next.slice(-max) : next;
}

export interface SessionSummary {
  counts: Record<Grade, number>;
  /** Non-skipped answers. */
  answered: number;
  avgScore: number;
  avgLatencyMs: number;
}

export function summarize(entries: readonly LogEntry[]): SessionSummary {
  const counts: Record<Grade, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let score = 0;
  let lat = 0;
  let n = 0;
  for (const e of entries) {
    counts[e.final]++;
    if (e.mode !== 'skip') {
      score += e.score;
      lat += e.latencyMs;
      n++;
    }
  }
  return { counts, answered: n, avgScore: n ? score / n : 0, avgLatencyMs: n ? lat / n : 0 };
}

export function isLogEntry(v: unknown): v is LogEntry {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.expected === 'string' &&
    typeof o.score === 'number' &&
    typeof o.latencyMs === 'number' &&
    [1, 2, 3, 4].includes(o.suggested as number) &&
    [1, 2, 3, 4].includes(o.final as number)
  );
}
