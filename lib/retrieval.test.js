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

  it('does not use full-table getAll during retrieval', async () => {
    await seedAccepted({ sourcePostText: 'distribution', finalUserText: 'ship it' });
    const original = window.Dumly.db.getAll;
    window.Dumly.db.getAll = () => { throw new Error('full table load'); };
    try {
      const out = await window.Dumly.retrieval.selectCandidates({
        ctx: { sourcePostText: 'distribution', keywords: ['distribution'], mode: 'reply' },
        mode: 'reply', limit: 2,
      });
      expect(out.length).toBeGreaterThan(0);
    } finally {
      window.Dumly.db.getAll = original;
    }
  });

  it('merges and dedupes bounded candidate buckets', async () => {
    for (let i = 0; i < 300; i++) {
      await seedAccepted({
        sourcePostText: 'distribution bucket ' + i,
        finalUserText: 'ship it ' + i,
        sourcePostAuthorHandle: i % 2 ? '@a' : '@b',
        keywords: ['distribution'],
      });
    }
    const pool = await window.Dumly.retrieval.loadCandidatePool({
      sourcePostAuthorHandle: '@a',
      keywords: ['distribution'],
      mode: 'reply',
    }, 'reply', 220);
    expect(pool.length).toBeLessThanOrEqual(220);
    expect(new Set(pool.map((m) => m.id)).size).toBe(pool.length);
  });

  it('scores pinned, same-author, topic-overlap, recent, and helpful memories higher', async () => {
    const old = await seedAccepted({
      sourcePostText: 'generic',
      finalUserText: 'generic reply',
      sourcePostAuthorHandle: '@x',
      keywords: ['other'],
    });
    old.createdAt = Date.now() - 180 * 24 * 60 * 60 * 1000;
    old.confidence = 0.1;
    old.unhelpfulCount = 5;
    await window.Dumly.db.put('acceptedMemories', old);

    const strong = await seedAccepted({
      sourcePostText: 'distribution',
      finalUserText: 'ship into existing channels',
      sourcePostAuthorHandle: '@a',
      keywords: ['distribution'],
    });
    strong.pinned = true;
    strong.helpfulCount = 5;
    strong.confidence = 0.9;
    await window.Dumly.db.put('acceptedMemories', strong);

    const ctx = { sourcePostAuthorHandle: '@a', keywords: ['distribution'], topicTags: ['distribution'], mode: 'reply' };
    expect(window.Dumly.retrieval.score(strong, ctx)).toBeGreaterThan(window.Dumly.retrieval.score(old, ctx));
  });
});
