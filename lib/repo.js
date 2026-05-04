(function () {
  window.Dumly = window.Dumly || {};

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  const LIMITS = {
    acceptedMax: 1000,
    acceptedTargetAfterCleanup: 700,
    negativeMax: 200,
    suggestionCandidateRetentionHours: 24,
    negativeMemoryTTLDays: 30,
    sessionTTLHours: 24,
    insertionRecordTTLDays: 7,
    maxSourcePostChars: 1000,
    maxFinalUserTextChars: 500,
    maxOriginalSuggestionChars: 500,
    maxRejectedTextChars: 500,
    maxPromptMemories: 10,
    maxPromptMemoryChars: 3500,
  };

  const ACCEPTANCE_STRENGTH = {
    posted_after_insert: 1.4,
    use_this: 1.2,
    manual_save: 1.1,
    copy: 1.0,
  };

  function rank(via) { return ACCEPTANCE_STRENGTH[via] ?? 0; }
  function truncate(s, n) { return String(s || '').slice(0, n); }
  function uuid() { return crypto.randomUUID(); }

  async function saveCandidate(input) {
    const now = Date.now();
    const rec = {
      id: uuid(),
      sessionId: input.sessionId,
      mode: input.mode,
      suggestionText: truncate(input.suggestionText, 2000),
      tone: input.tone,
      attemptNumber: input.attemptNumber,
      status: input.status,
      createdAt: now,
      expiresAt: now + LIMITS.suggestionCandidateRetentionHours * HOUR,
    };
    await window.Dumly.db.put('suggestionCandidates', rec);
    return rec;
  }

  async function markCandidate(id, status) {
    const rec = await window.Dumly.db.get('suggestionCandidates', id);
    if (!rec) return;
    rec.status = status;
    await window.Dumly.db.put('suggestionCandidates', rec);
  }

  async function saveAccepted(input) {
    // Dedup by candidateId
    const existing = await window.Dumly.db.getAllByIndex(
      'acceptedMemories', 'candidateId', input.candidateId, 1
    );
    const now = Date.now();
    if (existing.length) {
      const rec = existing[0];
      if (rank(input.acceptedVia) > rank(rec.acceptedVia)) {
        rec.acceptedVia = input.acceptedVia;
      }
      rec.useCount = (rec.useCount || 1) + 1;
      rec.lastUsedAt = now;
      if (input.wasEdited) rec.wasEdited = true;
      if (input.finalUserText) {
        rec.finalUserText = truncate(input.finalUserText, LIMITS.maxFinalUserTextChars);
      }
      await window.Dumly.db.put('acceptedMemories', rec);
      return rec;
    }

    const rec = {
      id: uuid(),
      platform: 'x',
      mode: input.mode,
      candidateId: input.candidateId,
      sessionId: input.sessionId,
      sourcePostId: input.sourcePostId,
      sourcePostText: truncate(input.sourcePostText, LIMITS.maxSourcePostChars),
      sourcePostAuthorHandle: input.sourcePostAuthorHandle,
      sourcePostUrl: input.sourcePostUrl,
      originalSuggestionText: truncate(input.originalSuggestionText, LIMITS.maxOriginalSuggestionChars),
      finalUserText: truncate(input.finalUserText, LIMITS.maxFinalUserTextChars),
      acceptedVia: input.acceptedVia,
      wasEdited: !!input.wasEdited,
      topicTags: input.topicTags || [],
      toneTags: input.toneTags || [],
      createdAt: now,
      lastUsedAt: now,
      useCount: 1,
      pinned: false,
    };
    await window.Dumly.db.put('acceptedMemories', rec);
    return rec;
  }

  async function updateAccepted(id, patch) {
    const rec = await window.Dumly.db.get('acceptedMemories', id);
    if (!rec) return;
    if (patch.finalUserText != null) {
      rec.finalUserText = truncate(patch.finalUserText, LIMITS.maxFinalUserTextChars);
    }
    if (patch.wasEdited != null) rec.wasEdited = patch.wasEdited;
    if (patch.acceptedVia && rank(patch.acceptedVia) >= rank(rec.acceptedVia)) {
      rec.acceptedVia = patch.acceptedVia;
    }
    await window.Dumly.db.put('acceptedMemories', rec);
    return rec;
  }

  async function saveNegative(input) {
    const now = Date.now();
    const rec = {
      id: uuid(),
      platform: 'x',
      mode: input.mode,
      sourcePostText: truncate(input.sourcePostText, LIMITS.maxSourcePostChars),
      rejectedText: truncate(input.rejectedText, LIMITS.maxRejectedTextChars),
      reason: input.reason || 'other',
      createdAt: now,
      expiresAt: now + LIMITS.negativeMemoryTTLDays * DAY,
    };
    await window.Dumly.db.put('negativeMemories', rec);
    return rec;
  }

  async function saveInsertionRecord(input) {
    const rec = {
      id: uuid(),
      sessionId: input.sessionId,
      candidateId: input.candidateId,
      insertedText: input.insertedText,
      insertedAt: Date.now(),
    };
    await window.Dumly.db.put('insertionRecords', rec);
    return rec;
  }

  async function listActiveNegatives(mode, limit = 20) {
    const all = await window.Dumly.db.getAllByIndex('negativeMemories', 'mode', mode);
    const now = Date.now();
    return all
      .filter((n) => n.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  window.Dumly.repo = {
    LIMITS,
    ACCEPTANCE_STRENGTH,
    saveCandidate,
    markCandidate,
    saveAccepted,
    updateAccepted,
    saveNegative,
    saveInsertionRecord,
    listActiveNegatives,
  };
})();
