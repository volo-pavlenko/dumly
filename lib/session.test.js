import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

beforeAll(async () => {
  globalThis.window = globalThis;
  if (!globalThis.crypto) globalThis.crypto = { randomUUID: () => 'uuid-' + Math.random() };
  await import('./db.js');
  await import('./repo.js');
  await import('./session.js');
});

beforeEach(async () => {
  await window.Dumly.db.deleteDatabase();
});

describe('sourceKey', () => {
  it('is deterministic for same inputs', () => {
    const { sourceKey } = window.Dumly.session;
    const a = sourceKey({ sourcePostId: 'p1', sourcePostText: 'x', sourcePostAuthorHandle: '@a' });
    const b = sourceKey({ sourcePostId: 'p1', sourcePostText: 'x', sourcePostAuthorHandle: '@a' });
    expect(a).toBe(b);
  });

  it('falls back to text+author when no id', () => {
    const { sourceKey } = window.Dumly.session;
    const a = sourceKey({ sourcePostText: 'x', sourcePostAuthorHandle: '@a' });
    expect(a).toBeTruthy();
  });
});

describe('getOrCreate', () => {
  it('creates a new session on first call', async () => {
    const { getOrCreate } = window.Dumly.session;
    const s = await getOrCreate('key1', 'reply', { sourcePostText: 'x' });
    expect(s.id).toBeTruthy();
    expect(s.sourceKey).toBe('key1');
  });

  it('reuses recent session for same sourceKey within TTL', async () => {
    const { getOrCreate } = window.Dumly.session;
    const a = await getOrCreate('key1', 'reply', { sourcePostText: 'x' });
    const b = await getOrCreate('key1', 'reply', { sourcePostText: 'x' });
    expect(b.id).toBe(a.id);
  });
});

describe('markIgnored', () => {
  it('flips shown candidates in this session to ignored; leaves others', async () => {
    const { saveCandidate } = window.Dumly.repo;
    const { markIgnored } = window.Dumly.session;
    const c1 = await saveCandidate({ sessionId: 's1', mode: 'reply',
      suggestionText: 'a', tone: 'default', attemptNumber: 1, status: 'shown' });
    const c2 = await saveCandidate({ sessionId: 's1', mode: 'reply',
      suggestionText: 'b', tone: 'default', attemptNumber: 2, status: 'used' });
    const c3 = await saveCandidate({ sessionId: 's2', mode: 'reply',
      suggestionText: 'c', tone: 'default', attemptNumber: 1, status: 'shown' });
    await markIgnored('s1');
    const f1 = await window.Dumly.db.get('suggestionCandidates', c1.id);
    const f2 = await window.Dumly.db.get('suggestionCandidates', c2.id);
    const f3 = await window.Dumly.db.get('suggestionCandidates', c3.id);
    expect(f1.status).toBe('ignored');
    expect(f2.status).toBe('used');
    expect(f3.status).toBe('shown');
  });
});

describe('getOrCreate TTL expiration', () => {
  it('creates a new session when the existing one is older than TTL', async () => {
    const { getOrCreate } = window.Dumly.session;
    const a = await getOrCreate('key1', 'reply', { sourcePostText: 'x' });
    // Force expiry
    const rec = await window.Dumly.db.get('generationSessions', a.id);
    rec.updatedAt = Date.now() - 25 * 60 * 60 * 1000; // 25h ago
    await window.Dumly.db.put('generationSessions', rec);

    const b = await getOrCreate('key1', 'reply', { sourcePostText: 'x' });
    expect(b.id).not.toBe(a.id);
  });
});

describe('getOrCreate mode isolation', () => {
  it('does not reuse a session from a different mode', async () => {
    const { getOrCreate } = window.Dumly.session;
    const a = await getOrCreate('key1', 'reply', { sourcePostText: 'x' });
    const b = await getOrCreate('key1', 'quote', { sourcePostText: 'x' });
    expect(b.id).not.toBe(a.id);
    expect(b.mode).toBe('quote');
  });
});

describe('getOrCreate refreshes ctx on reuse', () => {
  it('updates sourcePostText/AuthorHandle/Url when ctx changes', async () => {
    const { getOrCreate } = window.Dumly.session;
    await getOrCreate('key1', 'reply', {
      sourcePostText: 'original', sourcePostAuthorHandle: '@a',
    });
    const refreshed = await getOrCreate('key1', 'reply', {
      sourcePostText: 'edited', sourcePostAuthorHandle: '@a',
    });
    expect(refreshed.sourcePostText).toBe('edited');
  });
});

describe('getShownSuggestions', () => {
  it('returns only shown candidates sorted by attemptNumber desc', async () => {
    const { saveCandidate } = window.Dumly.repo;
    const { getShownSuggestions } = window.Dumly.session;
    await saveCandidate({ sessionId: 's1', mode: 'reply', suggestionText: 'a',
      tone: 'default', attemptNumber: 1, status: 'shown' });
    await saveCandidate({ sessionId: 's1', mode: 'reply', suggestionText: 'b',
      tone: 'default', attemptNumber: 3, status: 'shown' });
    await saveCandidate({ sessionId: 's1', mode: 'reply', suggestionText: 'c',
      tone: 'default', attemptNumber: 2, status: 'used' });
    await saveCandidate({ sessionId: 's2', mode: 'reply', suggestionText: 'd',
      tone: 'default', attemptNumber: 1, status: 'shown' });

    const result = await getShownSuggestions('s1');
    expect(result.map((c) => c.suggestionText)).toEqual(['b', 'a']);
  });
});
