(function () {
  window.Dumly = window.Dumly || {};

  const HOUR = 60 * 60 * 1000;
  const SESSION_TTL = 24 * HOUR;

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function sourceKey(ctx) {
    if (ctx.sourcePostId) return 'id:' + ctx.sourcePostId;
    return 'h:' + hash((ctx.sourcePostText || '') + '|' + (ctx.sourcePostAuthorHandle || ''));
  }

  async function getOrCreate(sourceKey, mode, ctx) {
    const now = Date.now();
    const existing = await window.Dumly.db.getAllByIndex(
      'generationSessions', 'sourceKey', sourceKey
    );
    const fresh = existing
      .filter((s) => s.mode === mode && now - s.updatedAt < SESSION_TTL)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];

    if (fresh) {
      fresh.updatedAt = now;
      await window.Dumly.db.put('generationSessions', fresh);
      return fresh;
    }

    const rec = {
      id: crypto.randomUUID(),
      platform: 'x',
      mode,
      sourceKey,
      sourcePostId: ctx.sourcePostId,
      sourcePostText: ctx.sourcePostText,
      sourcePostAuthorHandle: ctx.sourcePostAuthorHandle,
      sourcePostUrl: ctx.sourcePostUrl,
      createdAt: now,
      updatedAt: now,
      selectedTone: 'default',
      acceptedMemoryId: null,
    };
    await window.Dumly.db.put('generationSessions', rec);
    return rec;
  }

  async function markIgnored(sessionId) {
    const all = await window.Dumly.db.getAllByIndex(
      'suggestionCandidates', 'sessionId', sessionId
    );
    for (const c of all) {
      if (c.status === 'shown') {
        c.status = 'ignored';
        await window.Dumly.db.put('suggestionCandidates', c);
      }
    }
  }

  async function getShownSuggestions(sessionId) {
    const all = await window.Dumly.db.getAllByIndex(
      'suggestionCandidates', 'sessionId', sessionId
    );
    return all
      .filter((c) => c.status === 'shown')
      .sort((a, b) => b.attemptNumber - a.attemptNumber);
  }

  window.Dumly.session = { sourceKey, getOrCreate, markIgnored, getShownSuggestions };
})();
