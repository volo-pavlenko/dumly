// Dumly RPC client — replaces window.Dumly.{db,repo,session,retrieval}
// in page contexts (content script, popup, memory) so every DB call
// routes through the service worker, which owns the shared IndexedDB.
//
// Pure-logic helpers (retentionScore, sourceKey, LIMITS) stay available
// locally because they don't touch the DB.

(function () {
  window.Dumly = window.Dumly || {};

  function call(action, args) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ action, args: args || {} }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'rpc error'));
            return;
          }
          if (!response) {
            reject(new Error('No response from service worker'));
            return;
          }
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          resolve(response.result);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // --- db proxy ---
  window.Dumly.db = {
    put: (storeName, record) => call('db.put', { storeName, record }),
    get: (storeName, key) => call('db.get', { storeName, key }),
    getAll: (storeName) => call('db.getAll', { storeName }),
    del: (storeName, key) => call('db.del', { storeName, key }),
    getAllByIndex: (storeName, indexName, query, limit) =>
      call('db.getAllByIndex', { storeName, indexName, query, limit }),
    count: (storeName) => call('db.count', { storeName }),
    deleteDatabase: () => call('db.deleteDatabase'),
    clearStore: (storeName) => call('db.clearStore', { storeName }),
  };

  // --- repo proxy ---
  // LIMITS + ACCEPTANCE_STRENGTH duplicated here so consumers like
  // content.js can read them synchronously. Keep in sync with lib/repo.js.
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

  window.Dumly.repo = {
    LIMITS,
    saveCandidate: (input) => call('repo.saveCandidate', { input }),
    markCandidate: (id, status) => call('repo.markCandidate', { id, status }),
    saveAccepted: (input) => call('repo.saveAccepted', { input }),
    updateAccepted: (id, patch) => call('repo.updateAccepted', { id, patch }),
    saveNegative: (input) => call('repo.saveNegative', { input }),
    saveInsertionRecord: (input) => call('repo.saveInsertionRecord', { input }),
    listActiveNegatives: (mode, limit) => call('repo.listActiveNegatives', { mode, limit }),
    runCleanup: () => call('repo.runCleanup'),
    clearAll: () => call('repo.clearAll'),
  };

  // --- session proxy ---
  // sourceKey is pure; compute locally so callers don't wait on RPC.
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  window.Dumly.session = {
    sourceKey(ctx) {
      if (ctx.sourcePostId) return 'id:' + ctx.sourcePostId;
      return 'h:' + hash((ctx.sourcePostText || '') + '|' + (ctx.sourcePostAuthorHandle || ''));
    },
    getOrCreate: (sourceKey, mode, ctx) => call('session.getOrCreate', { sourceKey, mode, ctx }),
    markIgnored: (sessionId) => call('session.markIgnored', { sessionId }),
    getShownSuggestions: (sessionId) => call('session.getShownSuggestions', { sessionId }),
  };

  // --- retrieval proxy ---
  window.Dumly.retrieval = {
    selectCandidates: (opts) => call('retrieval.selectCandidates', opts),
  };
})();
