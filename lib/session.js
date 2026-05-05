(function () {
  const root = (typeof window !== "undefined") ? window
    : (typeof self !== "undefined") ? self
    : globalThis;
  root.Dumly = root.Dumly || {};

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
    const existing = await root.Dumly.db.getAllByIndex(
      'generationSessions', 'sourceKey', sourceKey
    );
    const fresh = existing
      .filter((s) => s.mode === mode && now - s.updatedAt < SESSION_TTL)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];

    if (fresh) {
      fresh.updatedAt = now;
      // Refresh source context so Phase 3 retrieval reads current values
      fresh.sourcePostText = ctx.sourcePostText ?? fresh.sourcePostText;
      fresh.sourcePostAuthorHandle = ctx.sourcePostAuthorHandle ?? fresh.sourcePostAuthorHandle;
      fresh.sourcePostUrl = ctx.sourcePostUrl ?? fresh.sourcePostUrl;
      fresh.sourcePostId = ctx.sourcePostId ?? fresh.sourcePostId;
      await root.Dumly.db.put('generationSessions', fresh);
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
    await root.Dumly.db.put('generationSessions', rec);
    return rec;
  }

  async function markIgnored(sessionId) {
    return root.Dumly.db.runInTx('suggestionCandidates', 'readwrite', async (store) => {
      function req(r) {
        return new Promise((resolve, reject) => {
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      }
      const all = await req(store.index('sessionId').getAll(sessionId));
      for (const c of all) {
        if (c.status === 'shown') {
          c.status = 'ignored';
          await req(store.put(c));
        }
      }
    });
  }

  async function getShownSuggestions(sessionId) {
    const all = await root.Dumly.db.getAllByIndex(
      'suggestionCandidates', 'sessionId', sessionId
    );
    return all
      .filter((c) => c.status === 'shown')
      .sort((a, b) => b.attemptNumber - a.attemptNumber);
  }

  root.Dumly.session = { sourceKey, getOrCreate, markIgnored, getShownSuggestions };
})();
