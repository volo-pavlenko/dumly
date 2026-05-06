(function () {
  // Attach to the right global: window (pages), self (service worker), globalThis (node test).
  const root = (typeof window !== 'undefined') ? window
    : (typeof self !== 'undefined') ? self
    : globalThis;
  root.Dumly = root.Dumly || {};

  const DB_NAME = 'dumly';
  const DB_VERSION = 2;

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        function ensureStore(name, opts) {
          return db.objectStoreNames.contains(name)
            ? req.transaction.objectStore(name)
            : db.createObjectStore(name, opts);
        }

        function ensureIndex(store, name, keyPath, opts) {
          if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, opts);
        }

        const accepted = ensureStore('acceptedMemories', { keyPath: 'id' });
        ensureIndex(accepted, 'createdAt', 'createdAt');
        ensureIndex(accepted, 'lastUsedAt', 'lastUsedAt');
        ensureIndex(accepted, 'mode', 'mode');
        ensureIndex(accepted, 'sourcePostAuthorHandle', 'sourcePostAuthorHandle');
        ensureIndex(accepted, 'sourceAuthorHandle', 'sourceAuthorHandle');
        ensureIndex(accepted, 'pinned', 'pinned');
        ensureIndex(accepted, 'candidateId', 'candidateId', { unique: true });
        ensureIndex(accepted, 'topicTags', 'topicTags', { multiEntry: true });
        ensureIndex(accepted, 'styleTags', 'styleTags', { multiEntry: true });
        ensureIndex(accepted, 'useCount', 'useCount');
        ensureIndex(accepted, 'confidence', 'confidence');
        ensureIndex(accepted, 'edited', 'edited');
        ensureIndex(accepted, 'wasEdited', 'wasEdited');
        ensureIndex(accepted, 'memoryKind', 'memoryKind');
        ensureIndex(accepted, 'sourceTextHash', 'sourceTextHash');
        ensureIndex(accepted, 'normalizedAcceptedText', 'normalizedAcceptedText');

        const negative = ensureStore('negativeMemories', { keyPath: 'id' });
        ensureIndex(negative, 'createdAt', 'createdAt');
        ensureIndex(negative, 'expiresAt', 'expiresAt');
        ensureIndex(negative, 'mode', 'mode');
        ensureIndex(negative, 'scope', 'scope');
        ensureIndex(negative, 'reason', 'reason');
        ensureIndex(negative, 'sourceAuthorHandle', 'sourceAuthorHandle');
        ensureIndex(negative, 'sourcePostAuthorHandle', 'sourcePostAuthorHandle');
        ensureIndex(negative, 'topicTags', 'topicTags', { multiEntry: true });
        ensureIndex(negative, 'styleTags', 'styleTags', { multiEntry: true });
        ensureIndex(negative, 'sourceTextHash', 'sourceTextHash');

        const sessions = ensureStore('generationSessions', { keyPath: 'id' });
        ensureIndex(sessions, 'sourceKey', 'sourceKey');
        ensureIndex(sessions, 'updatedAt', 'updatedAt');
        ensureIndex(sessions, 'createdAt', 'createdAt');
        ensureIndex(sessions, 'sourceTextHash', 'sourceTextHash');
        ensureIndex(sessions, 'mode', 'mode');

        const candidates = ensureStore('suggestionCandidates', { keyPath: 'id' });
        ensureIndex(candidates, 'sessionId', 'sessionId');
        ensureIndex(candidates, 'status', 'status');
        ensureIndex(candidates, 'expiresAt', 'expiresAt');
        ensureIndex(candidates, 'createdAt', 'createdAt');
        ensureIndex(candidates, 'sourceTextHash', 'sourceTextHash');
        ensureIndex(candidates, 'mode', 'mode');

        const ins = ensureStore('insertionRecords', { keyPath: 'id' });
        ensureIndex(ins, 'sessionId', 'sessionId');
        ensureIndex(ins, 'candidateId', 'candidateId');
        ensureIndex(ins, 'insertedAt', 'insertedAt');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  async function tx(storeName, mode = 'readonly') {
    const db = await open();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(storeName, record) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.put(record));
  }

  async function get(storeName, key) {
    const store = await tx(storeName);
    return reqToPromise(store.get(key));
  }

  async function getAll(storeName) {
    const store = await tx(storeName);
    return reqToPromise(store.getAll());
  }

  async function del(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.delete(key));
  }

  async function getAllByIndex(storeName, indexName, query, limit) {
    const store = await tx(storeName);
    const index = store.index(indexName);
    return reqToPromise(index.getAll(query, limit));
  }

  async function count(storeName) {
    const store = await tx(storeName);
    return reqToPromise(store.count());
  }

  async function runInTx(storeName, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      Promise.resolve(fn(store)).then((r) => { result = r; }, reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  async function deleteDatabase() {
    const prev = dbPromise;
    dbPromise = null;
    if (prev) {
      try { (await prev).close(); } catch {}
    }
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IDB delete blocked by another tab; close other X tabs and retry.'));
    });
  }

  root.Dumly.db = {
    open, put, get, getAll, del, getAllByIndex, count, deleteDatabase,
    runInTx,
    _reqToPromise: reqToPromise,
    _tx: tx,
  };
})();
