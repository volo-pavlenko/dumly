import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

beforeAll(async () => {
  globalThis.window = globalThis;
  if (!globalThis.crypto) globalThis.crypto = { randomUUID: () => 'uuid-' + Math.random() };
  await import('./db.js');
  await import('./similarity.js');
  await import('./scoring.js');
  await import('./repo.js');
  await import('./retrieval.js');
});

beforeEach(async () => {
  await window.Dumly.db.deleteDatabase();
});

async function seedAccepted(overrides) {
  const base = {
    mode: 'reply',
    sourcePostText: 'Discussing distribution strategy', sourcePostAuthorHandle: '@a',
    finalUserText: 'distribution beats building', originalSuggestionText: 'd',
    acceptedVia: 'use_this', candidateId: 'c-' + Math.random(),
    sessionId: 's-' + Math.random(),
  };
  return window.Dumly.repo.saveAccepted({ ...base, ...overrides });
}

describe('selectCandidates', () => {
  it('returns empty array when no memories', async () => {
    const { selectCandidates } = window.Dumly.retrieval;
    const out = await selectCandidates({
      ctx: { sourcePostText: 'x', keywords: ['x'], mode: 'reply' },
      mode: 'reply', limit: 5, maxChars: 1000,
    });
    expect(out).toEqual([]);
  });

  it('scores keyword overlap higher', async () => {
    await seedAccepted({ sourcePostText: 'cats and dogs', finalUserText: 'pets rock' });
    await seedAccepted({ sourcePostText: 'distribution is king', finalUserText: 'ship it' });
    const { selectCandidates } = window.Dumly.retrieval;
    const out = await selectCandidates({
      ctx: { sourcePostText: 'distribution plan', keywords: ['distribution', 'plan'], mode: 'reply' },
      mode: 'reply', limit: 5, maxChars: 1000,
    });
    expect(out[0].memory.sourcePostText).toContain('distribution');
  });

  it('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await seedAccepted({ sourcePostText: 'topic ' + i, finalUserText: 'x' });
    }
    const { selectCandidates } = window.Dumly.retrieval;
    const out = await selectCandidates({
      ctx: { sourcePostText: 'topic', keywords: ['topic'], mode: 'reply' },
      mode: 'reply', limit: 2, maxChars: 10000,
    });
    expect(out.length).toBeLessThanOrEqual(2);
  });
});
