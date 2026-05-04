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
