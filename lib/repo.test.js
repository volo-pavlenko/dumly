import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

beforeAll(async () => {
  globalThis.window = globalThis;
  if (!globalThis.crypto) {
    globalThis.crypto = { randomUUID: () => 'uuid-' + Math.random() };
  }
  await import('./db.js');
  await import('./repo.js');
});

beforeEach(async () => {
  await window.Dumly.db.deleteDatabase();
});

describe('saveCandidate', () => {
  it('saves and assigns an id + expiresAt', async () => {
    const { saveCandidate } = window.Dumly.repo;
    const c = await saveCandidate({
      sessionId: 's1', mode: 'reply', suggestionText: 'hi',
      tone: 'default', attemptNumber: 1, status: 'shown',
    });
    expect(c.id).toBeTruthy();
    expect(c.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe('saveAccepted', () => {
  it('truncates long fields', async () => {
    const { saveAccepted } = window.Dumly.repo;
    const long = 'a'.repeat(2000);
    const rec = await saveAccepted({
      sessionId: 's1', candidateId: 'c1', mode: 'reply',
      sourcePostText: long, originalSuggestionText: long,
      finalUserText: long, acceptedVia: 'use_this', toneTags: [],
    });
    expect(rec.sourcePostText.length).toBe(1000);
    expect(rec.finalUserText.length).toBe(500);
    expect(rec.originalSuggestionText.length).toBe(500);
  });

  it('deduplicates by candidateId, upgrading acceptedVia to strongest', async () => {
    const { saveAccepted } = window.Dumly.repo;
    await saveAccepted({ candidateId: 'c1', sessionId: 's1', mode: 'reply',
      sourcePostText: 'x', originalSuggestionText: 'y', finalUserText: 'y',
      acceptedVia: 'copy', toneTags: [] });
    const r2 = await saveAccepted({ candidateId: 'c1', sessionId: 's1', mode: 'reply',
      sourcePostText: 'x', originalSuggestionText: 'y', finalUserText: 'y',
      acceptedVia: 'use_this', toneTags: [] });
    expect(r2.acceptedVia).toBe('use_this');
    const all = await window.Dumly.db.getAll('acceptedMemories');
    expect(all).toHaveLength(1);
  });
});

describe('markCandidate', () => {
  it('updates status', async () => {
    const { saveCandidate, markCandidate } = window.Dumly.repo;
    const c = await saveCandidate({ sessionId: 's1', mode: 'reply',
      suggestionText: 'hi', tone: 'default', attemptNumber: 1, status: 'shown' });
    await markCandidate(c.id, 'used');
    const fresh = await window.Dumly.db.get('suggestionCandidates', c.id);
    expect(fresh.status).toBe('used');
  });
});
