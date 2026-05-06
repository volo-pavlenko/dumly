import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

beforeAll(async () => {
  globalThis.window = globalThis;
  if (!globalThis.crypto) {
    globalThis.crypto = { randomUUID: () => 'uuid-' + Math.random() };
  }
  await import('./db.js');
  await import('./scoring.js');
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

  it('stores memory ids and angle summaries', async () => {
    const c = await window.Dumly.repo.saveCandidate({
      sessionId: 's1', mode: 'reply', suggestionText: 'one specific angle about distribution',
      tone: 'default', attemptNumber: 1, status: 'shown',
      memoryIdsUsed: ['m1'], negativeMemoryIdsUsed: ['n1'],
    });
    expect(c.memoryIdsUsed).toEqual(['m1']);
    expect(c.negativeMemoryIdsUsed).toEqual(['n1']);
    expect(c.angleSummary).toContain('one specific angle');
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

  it('saves structured metadata defaults', async () => {
    const rec = await window.Dumly.repo.saveAccepted({
      sessionId: 's1', candidateId: 'c-meta', mode: 'reply',
      sourcePostText: 'Distribution beats product polish early',
      originalSuggestionText: 'ship where people already are',
      finalUserText: 'ship where people already are',
      acceptedVia: 'use_this',
      keywords: ['distribution', 'product', 'early'],
    });
    expect(rec.sourceSummary).toContain('Distribution');
    expect(rec.userAngle).toContain('ship where');
    expect(rec.topicTags).toContain('distribution');
    expect(rec.styleTags).toContain('short');
    expect(rec.memoryKind).toBeTruthy();
    expect(rec.confidence).toBe(0.5);
    expect(rec.helpfulCount).toBe(0);
    expect(rec.unhelpfulCount).toBe(0);
    expect(rec.pinned).toBe(false);
  });

  it('deduplicates by normalized accepted text and updates existing memory', async () => {
    await window.Dumly.repo.saveAccepted({
      sessionId: 's1', candidateId: 'c-norm-1', mode: 'reply',
      sourcePostText: 'first source', originalSuggestionText: 'Ship it.',
      finalUserText: 'Ship it.', acceptedVia: 'copy', keywords: ['launch'],
    });
    const second = await window.Dumly.repo.saveAccepted({
      sessionId: 's2', candidateId: 'c-norm-2', mode: 'reply',
      sourcePostText: 'second source', originalSuggestionText: 'ship it',
      finalUserText: 'ship it', acceptedVia: 'use_this', keywords: ['distribution'],
    });
    const all = await window.Dumly.db.getAll('acceptedMemories');
    expect(all).toHaveLength(1);
    expect(second.useCount).toBe(2);
    expect(second.acceptedVia).toBe('use_this');
    expect(second.topicTags).toEqual(expect.arrayContaining(['launch', 'distribution']));
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
    expect(rec.scope).toBe('topic');
    expect(rec.topicTags).toEqual([]);
    expect(rec.styleTags).toEqual([]);
    expect(rec.confidence).toBe(0.5);
  });
});

describe('bounded query helpers', () => {
  async function accepted(i, extra = {}) {
    return window.Dumly.repo.saveAccepted({
      sessionId: 's' + i, candidateId: 'cq' + i, mode: extra.mode || 'reply',
      sourcePostText: extra.sourcePostText || 'topic source ' + i,
      sourcePostAuthorHandle: extra.author || '@a',
      originalSuggestionText: 'g' + i,
      finalUserText: 'accepted text ' + i,
      acceptedVia: 'use_this',
      keywords: extra.keywords || ['topic' + i],
      wasEdited: !!extra.wasEdited,
    });
  }

  it('queries by mode, author, topic tag, pinned, edited, and session candidates', async () => {
    const a = await accepted(1, { author: '@same', keywords: ['distribution'], wasEdited: true });
    const b = await accepted(2, { mode: 'quote', author: '@other', keywords: ['pricing'] });
    a.pinned = true;
    await window.Dumly.db.put('acceptedMemories', a);
    await window.Dumly.repo.saveCandidate({ sessionId: 'session-x', mode: 'reply', suggestionText: 'angle', status: 'shown' });

    expect((await window.Dumly.repo.getRecentAcceptedMemories({ mode: 'reply', limit: 10 })).map((m) => m.id)).toContain(a.id);
    expect((await window.Dumly.repo.getRecentAcceptedMemories({ mode: 'reply', limit: 10 })).map((m) => m.id)).not.toContain(b.id);
    expect(await window.Dumly.repo.getAcceptedMemoriesByAuthor({ authorHandle: '@same', mode: 'reply', limit: 10 })).toHaveLength(1);
    expect(await window.Dumly.repo.getAcceptedMemoriesByTopicTags({ topicTags: ['distribution'], mode: 'reply', limit: 10 })).toHaveLength(1);
    expect(await window.Dumly.repo.getPinnedAcceptedMemories({ mode: 'reply', limit: 10 })).toHaveLength(1);
    expect(await window.Dumly.repo.getRecentEditedAcceptedMemories({ mode: 'reply', limit: 10 })).toHaveLength(1);
    expect(await window.Dumly.repo.getSessionCandidates({ sessionId: 'session-x', limit: 10 })).toHaveLength(1);
  });

  it('increments helpful and unhelpful counters', async () => {
    const a = await accepted(3);
    await window.Dumly.repo.markMemoriesHelpful([a.id]);
    await window.Dumly.repo.markMemoriesUnhelpful([a.id]);
    const fresh = await window.Dumly.db.get('acceptedMemories', a.id);
    expect(fresh.helpfulCount).toBe(1);
    expect(fresh.unhelpfulCount).toBe(1);
    expect(fresh.useCount).toBeGreaterThan(a.useCount);
  });

  it('returns paginated accepted and negative pages', async () => {
    for (let i = 0; i < 55; i++) await accepted('page-' + i);
    await window.Dumly.repo.saveNegative({ mode: 'reply', sourcePostText: 'x', rejectedText: 'nope' });
    const page1 = await window.Dumly.repo.listAcceptedPage({ pageSize: 30 });
    const page2 = await window.Dumly.repo.listAcceptedPage({ offset: 30, pageSize: 30 });
    expect(page1.items).toHaveLength(30);
    expect(page1.hasMore).toBe(true);
    expect(page2.items.length).toBeGreaterThan(0);
    expect((await window.Dumly.repo.listNegativePage({ pageSize: 30 })).items).toHaveLength(1);
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

describe('runCleanup', () => {
  it('deletes expired suggestion candidates', async () => {
    const { saveCandidate } = window.Dumly.repo;
    const expired = await saveCandidate({
      sessionId: 's1', mode: 'reply', suggestionText: 'old',
      tone: 'default', attemptNumber: 1, status: 'shown',
    });
    const rec = await window.Dumly.db.get('suggestionCandidates', expired.id);
    rec.expiresAt = Date.now() - 1000;
    await window.Dumly.db.put('suggestionCandidates', rec);

    await window.Dumly.repo.runCleanup();

    const still = await window.Dumly.db.get('suggestionCandidates', expired.id);
    expect(still).toBeUndefined();
  });

  it('deletes expired negatives', async () => {
    const n = await window.Dumly.repo.saveNegative({
      mode: 'reply', sourcePostText: 'x', rejectedText: 'y', reason: 'other',
    });
    const rec = await window.Dumly.db.get('negativeMemories', n.id);
    rec.expiresAt = Date.now() - 1000;
    await window.Dumly.db.put('negativeMemories', rec);

    await window.Dumly.repo.runCleanup();
    const still = await window.Dumly.db.get('negativeMemories', n.id);
    expect(still).toBeUndefined();
  });

  it('trims accepted memories down to target when over cap, preserves pinned', async () => {
    const originalMax = window.Dumly.repo.LIMITS.acceptedMax;
    const originalTarget = window.Dumly.repo.LIMITS.acceptedTargetAfterCleanup;
    window.Dumly.repo.LIMITS.acceptedMax = 5;
    window.Dumly.repo.LIMITS.acceptedTargetAfterCleanup = 3;

    for (let i = 0; i < 8; i++) {
      await window.Dumly.repo.saveAccepted({
        sessionId: 's' + i, candidateId: 'c' + i, mode: 'reply',
        sourcePostText: 'post' + i, originalSuggestionText: 'o' + i,
        finalUserText: 'u' + i, acceptedVia: 'use_this', toneTags: [],
      });
    }
    const all = await window.Dumly.db.getAll('acceptedMemories');
    all[0].pinned = true;
    await window.Dumly.db.put('acceptedMemories', all[0]);

    await window.Dumly.repo.runCleanup();

    const remaining = await window.Dumly.db.getAll('acceptedMemories');
    expect(remaining.length).toBeLessThanOrEqual(4);
    expect(remaining.some((r) => r.pinned)).toBe(true);

    window.Dumly.repo.LIMITS.acceptedMax = originalMax;
    window.Dumly.repo.LIMITS.acceptedTargetAfterCleanup = originalTarget;
  });
});

describe('retentionScore', () => {
  it('returns Infinity for pinned', () => {
    const { retentionScore } = window.Dumly.repo;
    expect(retentionScore({ pinned: true, createdAt: 0, acceptedVia: 'use_this' }))
      .toBe(Number.POSITIVE_INFINITY);
  });

  it('weights posted_after_insert highest among non-pinned', () => {
    const { retentionScore } = window.Dumly.repo;
    const base = { createdAt: Date.now(), useCount: 1, wasEdited: false };
    const a = retentionScore({ ...base, acceptedVia: 'posted_after_insert' });
    const b = retentionScore({ ...base, acceptedVia: 'copy' });
    expect(a).toBeGreaterThan(b);
  });
});
