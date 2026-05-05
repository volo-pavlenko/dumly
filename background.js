// Dumly service worker — owns the single extension-origin IndexedDB,
// serves RPC requests from content scripts, popup, and memory page.

importScripts(
  'lib/db.js',
  'lib/similarity.js',
  'lib/repo.js',
  'lib/session.js',
  'lib/retrieval.js'
);

const handlers = {
  // db.js surface
  'db.put': (args) => self.Dumly.db.put(args.storeName, args.record),
  'db.get': (args) => self.Dumly.db.get(args.storeName, args.key),
  'db.getAll': (args) => self.Dumly.db.getAll(args.storeName),
  'db.del': (args) => self.Dumly.db.del(args.storeName, args.key),
  'db.getAllByIndex': (args) => self.Dumly.db.getAllByIndex(args.storeName, args.indexName, args.query, args.limit),
  'db.count': (args) => self.Dumly.db.count(args.storeName),
  'db.deleteDatabase': () => self.Dumly.db.deleteDatabase(),
  'db.clearStore': async (args) => {
    const db = await self.Dumly.db.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(args.storeName, 'readwrite');
      const req = tx.objectStore(args.storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  // repo.js surface
  'repo.saveCandidate': (args) => self.Dumly.repo.saveCandidate(args.input),
  'repo.markCandidate': (args) => self.Dumly.repo.markCandidate(args.id, args.status),
  'repo.saveAccepted': (args) => self.Dumly.repo.saveAccepted(args.input),
  'repo.updateAccepted': (args) => self.Dumly.repo.updateAccepted(args.id, args.patch),
  'repo.saveNegative': (args) => self.Dumly.repo.saveNegative(args.input),
  'repo.saveInsertionRecord': (args) => self.Dumly.repo.saveInsertionRecord(args.input),
  'repo.listActiveNegatives': (args) => self.Dumly.repo.listActiveNegatives(args.mode, args.limit),
  'repo.runCleanup': () => self.Dumly.repo.runCleanup(),
  'repo.clearAll': () => self.Dumly.repo.clearAll(),

  // session.js surface (sourceKey is pure — clients compute it locally)
  'session.getOrCreate': (args) => self.Dumly.session.getOrCreate(args.sourceKey, args.mode, args.ctx),
  'session.markIgnored': (args) => self.Dumly.session.markIgnored(args.sessionId),
  'session.getShownSuggestions': (args) => self.Dumly.session.getShownSuggestions(args.sessionId),

  // retrieval.js surface
  'retrieval.selectCandidates': (args) => self.Dumly.retrieval.selectCandidates(args),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') return false;
  const handler = handlers[message.action];
  if (!handler) {
    sendResponse({ error: 'Unknown action: ' + message.action });
    return false;
  }
  Promise.resolve()
    .then(() => handler(message.args || {}))
    .then((result) => sendResponse({ result }))
    .catch((err) => sendResponse({ error: err?.message || String(err) }));
  return true;  // async response
});
