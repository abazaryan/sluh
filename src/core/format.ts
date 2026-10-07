/** 1234 → "1,2 с" */
export function fmtSec(ms: number): string {
  return (ms / 1000).toFixed(1).replace('.', ',') + ' с';
}

/** Russian plural: 1 карточка, 2 карточки, 5 карточек. */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
