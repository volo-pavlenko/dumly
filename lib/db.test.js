import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

beforeAll(async () => {
  globalThis.window = globalThis;
  await import('./db.js');
});

beforeEach(async () => {
  await window.Dumly.db.deleteDatabase();
});

describe('db.open', () => {
  it('creates all stores with expected indexes', async () => {
    const db = await window.Dumly.db.open();
    const names = Array.from(db.objectStoreNames).sort();
    expect(names).toEqual([
      'acceptedMemories',
      'generationSessions',
      'insertionRecords',
      'negativeMemories',
      'suggestionCandidates',
    ]);
    db.close();
  });
});

describe('db.put / db.get / db.getAll', () => {
  it('round-trips a record', async () => {
    await window.Dumly.db.put('acceptedMemories', {
      id: 'a1', mode: 'reply', sourcePostText: 'hi', createdAt: 1,
    });
    const rec = await window.Dumly.db.get('acceptedMemories', 'a1');
    expect(rec.sourcePostText).toBe('hi');
    const all = await window.Dumly.db.getAll('acceptedMemories');
    expect(all).toHaveLength(1);
  });
});

describe('db.del', () => {
  it('removes a record', async () => {
    await window.Dumly.db.put('acceptedMemories', { id: 'a1', mode: 'reply', createdAt: 1 });
    await window.Dumly.db.del('acceptedMemories', 'a1');
    const rec = await window.Dumly.db.get('acceptedMemories', 'a1');
    expect(rec).toBeUndefined();
  });
});

describe('db.get on missing key', () => {
  it('resolves to undefined', async () => {
    const rec = await window.Dumly.db.get('acceptedMemories', 'nope');
    expect(rec).toBeUndefined();
  });
});

describe('db.getAllByIndex', () => {
  it('returns records matching the index value', async () => {
    await window.Dumly.db.put('acceptedMemories', { id: 'a1', mode: 'reply', createdAt: 1 });
    await window.Dumly.db.put('acceptedMemories', { id: 'a2', mode: 'quote', createdAt: 2 });
    await window.Dumly.db.put('acceptedMemories', { id: 'a3', mode: 'reply', createdAt: 3 });
    const replies = await window.Dumly.db.getAllByIndex('acceptedMemories', 'mode', 'reply');
    expect(replies.map((r) => r.id).sort()).toEqual(['a1', 'a3']);
  });

  it('respects multiEntry index on topicTags', async () => {
    await window.Dumly.db.put('acceptedMemories', {
      id: 'a1', mode: 'reply', createdAt: 1, topicTags: ['product', 'distribution'],
    });
    await window.Dumly.db.put('acceptedMemories', {
      id: 'a2', mode: 'reply', createdAt: 2, topicTags: ['distribution'],
    });
    const dist = await window.Dumly.db.getAllByIndex('acceptedMemories', 'topicTags', 'distribution');
    expect(dist.map((r) => r.id).sort()).toEqual(['a1', 'a2']);
  });
});

describe('candidateId unique index', () => {
  it('rejects when two accepted memories share the same candidateId', async () => {
    await window.Dumly.db.put('acceptedMemories', {
      id: 'a1', mode: 'reply', candidateId: 'c1', createdAt: 1,
    });
    await expect(window.Dumly.db.put('acceptedMemories', {
      id: 'a2', mode: 'reply', candidateId: 'c1', createdAt: 2,
    })).rejects.toBeTruthy();
  });
});
