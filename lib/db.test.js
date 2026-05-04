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
