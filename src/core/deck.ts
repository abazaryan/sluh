export interface DeckCard {
  /** Prompt in Russian. */
  ru: string;
  /** Reference answer in French. */
  fr: string;
}

export const DEFAULT_DECK_TEXT = [
  'Здравствуйте, как дела? | Bonjour, comment allez-vous ?',
  "Я хотел бы кофе, пожалуйста. | Je voudrais un café, s'il vous plaît.",
  'Где находится вокзал? | Où est la gare ?',
  "Я живу в Люксембурге. | J'habite à Luxembourg.",
  'Сколько это стоит? | Combien ça coûte ?',
  'Я не понимаю. | Je ne comprends pas.',
  "Можете повторить, пожалуйста? | Pouvez-vous répéter, s'il vous plaît ?",
  'Я работаю разработчиком. | Je travaille comme développeur.',
  'Который час? | Quelle heure est-il ?',
  'Приятно познакомиться. | Enchanté.',
  "Мне нужна помощь. | J'ai besoin d'aide.",
].join('\n');

/** One card per line: "русский | français" (a tab also works as separator). */
export function parseDeck(text: string): DeckCard[] {
  const out: DeckCard[] = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const parts = line.split(/\s*[|\t]\s*/);
    const ru = parts[0]?.trim() ?? '';
    const fr = parts.slice(1).join(' | ').trim();
    if (parts.length >= 2 && ru && fr) out.push({ ru, fr });
  }
  return out;
}

/** Fisher–Yates; rng injectable for tests. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}
