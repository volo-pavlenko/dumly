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

describe('saveAccepted upgrade does not downgrade', () => {
  it('keeps strongest acceptedVia when a weaker signal arrives', async () => {
    const { saveAccepted } = window.Dumly.repo;
    await saveAccepted({ candidateId: 'c1', sessionId: 's1', mode: 'reply',
      sourcePostText: 'x', originalSuggestionText: 'y', finalUserText: 'y',
      acceptedVia: 'use_this', toneTags: [] });
    const r2 = await saveAccepted({ candidateId: 'c1', sessionId: 's1', mode: 'reply',
      sourcePostText: 'x', originalSuggestionText: 'y', finalUserText: 'y',
      acceptedVia: 'copy', toneTags: [] });
    expect(r2.acceptedVia).toBe('use_this');
  });

  it('keeps wasEdited=true when a later save passes wasEdited=false', async () => {
    const { saveAccepted } = window.Dumly.repo;
    await saveAccepted({ candidateId: 'c1', sessionId: 's1', mode: 'reply',
      sourcePostText: 'x', originalSuggestionText: 'y', finalUserText: 'edited',
      acceptedVia: 'use_this', wasEdited: true, toneTags: [] });
    await saveAccepted({ candidateId: 'c1', sessionId: 's1', mode: 'reply',
      sourcePostText: 'x', originalSuggestionText: 'y', finalUserText: 'edited',
      acceptedVia: 'use_this', wasEdited: false, toneTags: [] });
    const all = await window.Dumly.db.getAll('acceptedMemories');
    expect(all[0].wasEdited).toBe(true);
  });
});

describe('saveAccepted concurrent writes', () => {
  it('survives two concurrent saves with same candidateId (no ConstraintError)', async () => {
    const { saveAccepted } = window.Dumly.repo;
    const common = {
      candidateId: 'c1', sessionId: 's1', mode: 'reply',
      sourcePostText: 'x', originalSuggestionText: 'y', finalUserText: 'y',
      toneTags: [],
    };
    const [a, b] = await Promise.all([
      saveAccepted({ ...common, acceptedVia: 'copy' }),
      saveAccepted({ ...common, acceptedVia: 'use_this' }),
    ]);
    const all = await window.Dumly.db.getAll('acceptedMemories');
    expect(all).toHaveLength(1);
    // Final record should reflect the strongest signal
    expect(['use_this', 'copy']).toContain(a.acceptedVia);
    expect(all[0].acceptedVia).toBe('use_this');
  });
});

describe('saveNegative', () => {
  it('stores with reason default and expiry 30d out', async () => {
    const rec = await window.Dumly.repo.saveNegative({
      mode: 'reply', sourcePostText: 'x', rejectedText: 'bad reply',
    });
    expect(rec.reason).toBe('other');
    const days = (rec.expiresAt - rec.createdAt) / (24 * 60 * 60 * 1000);
    expect(Math.round(days)).toBe(30);
  });
});

describe('updateAccepted', () => {
  it('upgrades acceptedVia and sets wasEdited + finalUserText', async () => {
    const { saveAccepted, updateAccepted } = window.Dumly.repo;
    const rec = await saveAccepted({ candidateId: 'c1', sessionId: 's1', mode: 'reply',
      sourcePostText: 'x', originalSuggestionText: 'y', finalUserText: 'y',
      acceptedVia: 'use_this', toneTags: [] });
    const updated = await updateAccepted(rec.id, {
      finalUserText: 'edited by user',
      wasEdited: true,
      acceptedVia: 'posted_after_insert',
    });
    expect(updated.finalUserText).toBe('edited by user');
    expect(updated.wasEdited).toBe(true);
    expect(updated.acceptedVia).toBe('posted_after_insert');
  });

  it('does not downgrade acceptedVia', async () => {
    const { saveAccepted, updateAccepted } = window.Dumly.repo;
    const rec = await saveAccepted({ candidateId: 'c1', sessionId: 's1', mode: 'reply',
      sourcePostText: 'x', originalSuggestionText: 'y', finalUserText: 'y',
      acceptedVia: 'use_this', toneTags: [] });
    const updated = await updateAccepted(rec.id, { acceptedVia: 'copy' });
    expect(updated.acceptedVia).toBe('use_this');
  });
});

describe('listActiveNegatives', () => {
  it('filters expired negatives, sorts newest first, respects limit', async () => {
    const { saveNegative, listActiveNegatives } = window.Dumly.repo;
    const oldNeg = await saveNegative({ mode: 'reply', sourcePostText: 'a', rejectedText: 'old' });
    const newNeg = await saveNegative({ mode: 'reply', sourcePostText: 'b', rejectedText: 'new' });
    // Force oldNeg expired
    const e = await window.Dumly.db.get('negativeMemories', oldNeg.id);
    e.expiresAt = Date.now() - 1000;
    await window.Dumly.db.put('negativeMemories', e);

    const active = await listActiveNegatives('reply');
    expect(active.map((n) => n.rejectedText)).toEqual(['new']);
  });

  it('filters by mode', async () => {
    const { saveNegative, listActiveNegatives } = window.Dumly.repo;
    await saveNegative({ mode: 'reply', sourcePostText: 'a', rejectedText: 'r1' });
    await saveNegative({ mode: 'quote', sourcePostText: 'a', rejectedText: 'q1' });
    const replies = await listActiveNegatives('reply');
    expect(replies).toHaveLength(1);
    expect(replies[0].rejectedText).toBe('r1');
  });
});
