import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
  globalThis.window = globalThis;
  await import('./similarity.js');
});

describe('normalizeText', () => {
  it('lowercases, strips URLs, removes punctuation, collapses whitespace', () => {
    const { normalizeText } = window.Dumly.similarity;
    expect(normalizeText('Check https://x.com/post, it RULES!!'))
      .toBe('check it rules');
  });

  it('returns empty string for empty input', () => {
    const { normalizeText } = window.Dumly.similarity;
    expect(normalizeText('')).toBe('');
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical token sets', () => {
    const { jaccardSimilarity } = window.Dumly.similarity;
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    const { jaccardSimilarity } = window.Dumly.similarity;
    expect(jaccardSimilarity('cat dog', 'apple banana')).toBe(0);
  });

  it('ignores stopwords', () => {
    const { jaccardSimilarity } = window.Dumly.similarity;
    // "the and" reduces to nothing; treated as empty -> 0
    expect(jaccardSimilarity('the and', 'cat dog')).toBe(0);
  });

  it('handles punctuation differences', () => {
    const { jaccardSimilarity } = window.Dumly.similarity;
    expect(jaccardSimilarity('hello, world!', 'hello world'))
      .toBeGreaterThanOrEqual(0.99);
  });
});

describe('tokenize', () => {
  it('filters short words and stopwords, lowercases', () => {
    const { tokenize } = window.Dumly.similarity;
    expect(tokenize('The QUICK brown fox')).toEqual(['quick', 'brown', 'fox']);
  });
});
