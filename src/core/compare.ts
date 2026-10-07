/** Word-level comparison of a spoken/typed answer against the reference. */

export interface Token {
  /** Word as written/heard. */
  w: string;
  /** Normalized key used for matching. */
  k: string;
}

export type AlignOp =
  | { t: 'ok'; e: Token; h: Token }
  | { t: 'sub'; e: Token; h: Token }
  | { t: 'miss'; e: Token }
  | { t: 'extra'; h: Token };

export interface CompareOptions {
  /** Ignore accents (é = e, ç = c …). */
  lenient: boolean;
}

export interface CompareResult {
  /** 0..1, 1 − wordDistance / max(len(expected), len(heard)). */
  score: number;
  ops: AlignOp[];
  /** Number of words in the expected answer. */
  nWords: number;
}

export function wordKey(word: string, opts: CompareOptions): string {
  let k = word.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  if (opts.lenient) k = k.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return k;
}

/** Splits text into words; apostrophes split elisions (j'habite → j, habite). */
export function tokenize(text: string, opts: CompareOptions): Token[] {
  return String(text)
    .replace(/[’‘`']/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => ({ w, k: wordKey(w, opts) }));
}

/** Levenshtein alignment over words, with the edit script. */
export function align(a: Token[], b: Token[]): { dist: number; ops: AlignOp[] } {
  const n = a.length;
  const m = b.length;
  const d: number[][] = [];
  for (let i = 0; i <= n; i++) d.push(new Array<number>(m + 1).fill(0));
  const at = (i: number, j: number): number => d[i]![j]!;
  for (let i = 0; i <= n; i++) d[i]![0] = i;
  for (let j = 0; j <= m; j++) d[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const c = a[i - 1]!.k === b[j - 1]!.k ? 0 : 1;
      d[i]![j] = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + c);
    }
  }
  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const e = a[i - 1]!;
      const h = b[j - 1]!;
      const same = e.k === h.k;
      if (at(i, j) === at(i - 1, j - 1) + (same ? 0 : 1)) {
        ops.push(same ? { t: 'ok', e, h } : { t: 'sub', e, h });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && at(i, j) === at(i - 1, j) + 1) {
      ops.push({ t: 'miss', e: a[i - 1]! });
      i--;
    } else {
      ops.push({ t: 'extra', h: b[j - 1]! });
      j--;
    }
  }
  ops.reverse();
  return { dist: at(n, m), ops };
}

export function compare(expected: string, heard: string, opts: CompareOptions): CompareResult {
  const a = tokenize(expected, opts);
  const b = tokenize(heard, opts);
  const r = align(a, b);
  const denom = Math.max(a.length, b.length);
  const score = denom === 0 ? 1 : Math.max(0, 1 - r.dist / denom);
  return { score, ops: r.ops, nWords: a.length };
}

/** Picks the recognition alternative that matches the reference best (first wins ties). */
export function bestAlternative(
  expected: string,
  alts: readonly string[],
  opts: CompareOptions,
): { text: string; result: CompareResult } | null {
  let best: { text: string; result: CompareResult } | null = null;
  for (const text of alts) {
    const result = compare(expected, text, opts);
    if (!best || result.score > best.result.score) best = { text, result };
  }
  return best;
}
