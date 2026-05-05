(function () {
  // Attach to the right global: window (pages), self (service worker), globalThis (node test).
  const root = (typeof window !== 'undefined') ? window
    : (typeof self !== 'undefined') ? self
    : globalThis;
  root.Dumly = root.Dumly || {};

  const DB_NAME = 'dumly';
  const DB_VERSION = 1;

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        const accepted = db.createObjectStore('acceptedMemories', { keyPath: 'id' });
        accepted.createIndex('createdAt', 'createdAt');
        accepted.createIndex('lastUsedAt', 'lastUsedAt');
        accepted.createIndex('mode', 'mode');
        accepted.createIndex('sourcePostAuthorHandle', 'sourcePostAuthorHandle');
        accepted.createIndex('pinned', 'pinned');
        accepted.createIndex('candidateId', 'candidateId', { unique: true });
        accepted.createIndex('topicTags', 'topicTags', { multiEntry: true });

        const negative = db.createObjectStore('negativeMemories', { keyPath: 'id' });
        negative.createIndex('createdAt', 'createdAt');
        negative.createIndex('expiresAt', 'expiresAt');
        negative.createIndex('mode', 'mode');

        const sessions = db.createObjectStore('generationSessions', { keyPath: 'id' });
        sessions.createIndex('sourceKey', 'sourceKey');
        sessions.createIndex('updatedAt', 'updatedAt');

        const candidates = db.createObjectStore('suggestionCandidates', { keyPath: 'id' });
        candidates.createIndex('sessionId', 'sessionId');
        candidates.createIndex('status', 'status');
        candidates.createIndex('expiresAt', 'expiresAt');

        const ins = db.createObjectStore('insertionRecords', { keyPath: 'id' });
        ins.createIndex('sessionId', 'sessionId');
        ins.createIndex('candidateId', 'candidateId');
        ins.createIndex('insertedAt', 'insertedAt');
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
