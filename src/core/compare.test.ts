import { describe, expect, it } from 'vitest';
import { bestAlternative, compare, tokenize } from './compare';

const lenient = { lenient: true };
const strict = { lenient: false };

const words = (s: string, o = lenient) => tokenize(s, o).map((t) => t.k);
const opTypes = (expected: string, heard: string, o = lenient) => compare(expected, heard, o).ops.map((op) => op.t);

describe('tokenize', () => {
  it('ignores case and punctuation', () => {
    expect(words('Bonjour, comment allez-vous ?')).toEqual(['bonjour', 'comment', 'allez', 'vous']);
  });

  it('splits elisions on any apostrophe kind', () => {
    expect(words("J'habite")).toEqual(['j', 'habite']);
    expect(words('J’habite')).toEqual(['j', 'habite']);
    expect(words('J‘habite')).toEqual(['j', 'habite']);
    expect(words('J`habite')).toEqual(['j', 'habite']);
  });

  it('expands ligatures', () => {
    expect(words('Œuvre cœur')).toEqual(['oeuvre', 'coeur']);
  });

  it('keeps accents in strict mode and drops them in lenient mode', () => {
    expect(words('Où ça coûte', strict)).toEqual(['où', 'ça', 'coûte']);
    expect(words('Où ça coûte', lenient)).toEqual(['ou', 'ca', 'coute']);
  });

  it('returns nothing for empty or punctuation-only text', () => {
    expect(words('')).toEqual([]);
    expect(words(' ?! … ')).toEqual([]);
  });
});

describe('compare', () => {
  it('exact answer scores 1 regardless of case and punctuation', () => {
    const r = compare('Où est la gare ?', 'où est la gare', lenient);
    expect(r.score).toBe(1);
    expect(r.nWords).toBe(4);
    expect(r.ops.every((op) => op.t === 'ok')).toBe(true);
  });

  it('elision written differently by the recognizer still matches', () => {
    expect(compare("J'ai besoin d'aide.", 'j’ai besoin d’aide', lenient).score).toBe(1);
    expect(compare("s'il vous plaît", "S'il vous plait", lenient).score).toBe(1);
  });

  it('missing apostrophe merges words and costs points', () => {
    // "jhabite" vs "j habite": 1 substitution + 1 missing word, reference has 4 words
    const r = compare("J'habite à Luxembourg.", 'jhabite à Luxembourg', lenient);
    expect(r.score).toBeCloseTo(1 - 2 / 4);
  });

  it('accents: lenient ignores them, strict counts them as wrong words', () => {
    expect(compare('Je voudrais un café', 'je voudrais un cafe', lenient).score).toBe(1);
    expect(compare('Je voudrais un café', 'je voudrais un cafe', strict).score).toBe(0.75);
    expect(opTypes('Je voudrais un café', 'je voudrais un cafe', strict)).toEqual(['ok', 'ok', 'ok', 'sub']);
  });

  it('extra words lower the score and are marked extra', () => {
    const r = compare('Je ne comprends pas', 'euh je ne comprends pas', lenient);
    expect(r.score).toBeCloseTo(0.8);
    expect(r.ops.map((op) => op.t)).toEqual(['extra', 'ok', 'ok', 'ok', 'ok']);
  });

  it('missing words lower the score and are marked miss', () => {
    const r = compare('Je ne comprends pas', 'je comprends pas', lenient);
    expect(r.score).toBeCloseTo(0.75);
    expect(r.ops.map((op) => op.t)).toEqual(['ok', 'miss', 'ok', 'ok']);
    const miss = r.ops[1];
    expect(miss?.t === 'miss' && miss.e.w).toBe('ne');
  });

  it('wrong word is a substitution', () => {
    expect(opTypes('Où est la gare', 'où est le gare')).toEqual(['ok', 'ok', 'sub', 'ok']);
  });

  it('empty answer scores 0 with every word missing', () => {
    const r = compare('Où est la gare ?', '', lenient);
    expect(r.score).toBe(0);
    expect(r.ops.map((op) => op.t)).toEqual(['miss', 'miss', 'miss', 'miss']);
  });

  it('empty reference and empty answer is a perfect match; any answer to empty reference scores 0', () => {
    expect(compare('', '', lenient).score).toBe(1);
    expect(compare('', 'bonjour', lenient).score).toBe(0);
  });

  it('score never goes below 0', () => {
    expect(compare('oui', 'non non non non', lenient).score).toBe(0);
  });

  it('keeps original word forms in ops for display', () => {
    const r = compare('Enchanté.', 'enchantée', strict);
    expect(r.ops).toHaveLength(1);
    const op = r.ops[0]!;
    expect(op.t).toBe('sub');
    if (op.t === 'sub') {
      expect(op.e.w).toBe('Enchanté');
      expect(op.h.w).toBe('enchantée');
    }
  });
});

describe('bestAlternative', () => {
  it('picks the alternative closest to the reference', () => {
    const best = bestAlternative('Où est la gare', ['ou est le garçon', 'où est la gare', 'oui'], lenient);
    expect(best?.text).toBe('où est la gare');
    expect(best?.result.score).toBe(1);
  });

  it('first alternative wins a tie', () => {
    expect(bestAlternative('a b', ['a c', 'c b'], lenient)?.text).toBe('a c');
  });

  it('returns null for no alternatives', () => {
    expect(bestAlternative('a', [], lenient)).toBeNull();
  });
});
