import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
  globalThis.window = globalThis;
  await import('./settings.js');
});

describe('mergePersonasToBio', () => {
  it('joins non-empty personas with blank line', () => {
    const { mergePersonasToBio } = window.Dumly.settings;
    expect(mergePersonasToBio('A', 'B')).toBe('A\n\nB');
    expect(mergePersonasToBio('A', '')).toBe('A');
    expect(mergePersonasToBio('', 'B')).toBe('B');
    expect(mergePersonasToBio('', '')).toBe('');
  });
});
