# Phase 1 — Scaffolding, Storage, Migration

**Goal:** Set up test tooling, split `content.js` into namespaced modules, create IndexedDB layer, implement pure-logic libs (similarity, session, repo core), migrate persona → bio. No user-visible behavior change.

**Exit:** Current button still works exactly as today. `npm test` green. DB exists; nothing writes yet.

---

### Task 1: Set up test tooling

**Files:**
- Create: `package.json`, `.gitignore`, `vitest.config.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "dumly",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "fake-indexeddb": "^5.0.2"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
package-lock.json
.DS_Store
*.zip
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
export default {
  test: {
    environment: 'node',
    include: ['lib/**/*.test.js'],
  },
};
```

- [ ] **Step 4: Install and verify**

Run: `npm install && npm test`
Expected: vitest reports "No test files found" and exits 0.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore vitest.config.js
git commit -m "chore: add vitest and fake-indexeddb for dev-only testing"
```

---

### Task 2: Create `lib/similarity.js` with TDD

**Files:**
- Create: `lib/similarity.js`, `lib/similarity.test.js`

- [ ] **Step 1: Write failing test for `normalizeText`**

Create `lib/similarity.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
  globalThis.window = globalThis;
  await import('./similarity.js');
});

describe('normalizeText', () => {
  it('lowercases, strips URLs, removes punctuation, collapses whitespace', () => {
    const { normalizeText } = window.Dumly.similarity;
    expect(normalizeText('Check https://x.com/post, it RULES!!'))
      .toBe('check it rules');
  });

  it('returns empty string for empty input', () => {
    const { normalizeText } = window.Dumly.similarity;
    expect(normalizeText('')).toBe('');
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test`
Expected: fail — `Cannot read properties of undefined (reading 'normalizeText')`.

- [ ] **Step 3: Implement `normalizeText`**

Create `lib/similarity.js`:

```js
(function () {
  window.Dumly = window.Dumly || {};

  function normalizeText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  window.Dumly.similarity = { normalizeText };
})();
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`
Expected: 2 passing.

- [ ] **Step 5: Add tests for `jaccardSimilarity` + STOPWORDS + `tokenize`**

Append to `lib/similarity.test.js`:

```js
describe('jaccardSimilarity', () => {
  it('returns 1 for identical token sets', () => {
    const { jaccardSimilarity } = window.Dumly.similarity;
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    const { jaccardSimilarity } = window.Dumly.similarity;
    expect(jaccardSimilarity('cat dog', 'apple banana')).toBe(0);
  });

  it('ignores stopwords', () => {
    const { jaccardSimilarity } = window.Dumly.similarity;
    // "the and" reduces to nothing; treated as empty → 0
    expect(jaccardSimilarity('the and', 'cat dog')).toBe(0);
  });

  it('handles punctuation differences', () => {
    const { jaccardSimilarity } = window.Dumly.similarity;
    expect(jaccardSimilarity('hello, world!', 'hello world'))
      .toBeGreaterThanOrEqual(0.99);
  });
});

describe('tokenize', () => {
  it('filters short words and stopwords, lowercases', () => {
    const { tokenize } = window.Dumly.similarity;
    expect(tokenize('The QUICK brown fox')).toEqual(['quick', 'brown', 'fox']);
  });
});
```

- [ ] **Step 6: Implement `tokenize`, `jaccardSimilarity`, STOPWORDS**

Replace `lib/similarity.js` body (keep IIFE wrapper):

```js
const STOPWORDS = new Set([
  'the','and','for','are','but','not','you','all','any','can','had','her','was',
  'one','our','out','day','get','has','him','his','how','man','new','now','old',
  'see','two','way','who','boy','did','its','let','put','say','she','too','use',
  'this','that','with','from','your','will','have','what','when','they','them',
  'been','were','into','then','than','some','only','also','more','very','just',
  'here','there','about','which','their','would','could','should','because',
  'these','those','where','while','after','before','upon','being','having','such',
]);

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function jaccardSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

window.Dumly.similarity = { normalizeText, tokenize, jaccardSimilarity, STOPWORDS };
```

- [ ] **Step 7: Run, expect pass**

Run: `npm test`
Expected: all passing.

- [ ] **Step 8: Commit**

```bash
git add lib/similarity.js lib/similarity.test.js
git commit -m "feat(lib): add similarity module (normalize, tokenize, jaccard)"
```

---

### Task 3: Create `lib/db.js` (IndexedDB open + CRUD primitives)

**Files:**
- Create: `lib/db.js`, `lib/db.test.js`

- [ ] **Step 1: Write failing test for DB open + schema**

Create `lib/db.test.js`:

```js
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
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test`
Expected: fail — module does not exist.

- [ ] **Step 3: Implement `lib/db.js`**

```js
(function () {
  window.Dumly = window.Dumly || {};

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

  function deleteDatabase() {
    dbPromise = null;
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  }

  window.Dumly.db = {
    open, put, get, getAll, del, getAllByIndex, count, deleteDatabase,
    _reqToPromise: reqToPromise,
    _tx: tx,
  };
})();
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add lib/db.js lib/db.test.js
git commit -m "feat(lib): add IndexedDB layer with schema v1"
```

---

### Task 4: Create `lib/repo.js` with truncation + save primitives

**Files:**
- Create: `lib/repo.js`, `lib/repo.test.js`

- [ ] **Step 1: Write failing tests**

Create `lib/repo.test.js`:

```js
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

beforeAll(async () => {
  globalThis.window = globalThis;
  globalThis.crypto = globalThis.crypto || { randomUUID: () => 'uuid-' + Math.random() };
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
```

- [ ] **Step 2: Run, expect fail**

Run: `npm test`

- [ ] **Step 3: Implement `lib/repo.js`**

```js
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
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add lib/repo.js lib/repo.test.js
git commit -m "feat(lib): add repo with saveCandidate/saveAccepted/saveNegative + dedup"
```

---

### Task 5: Create `lib/session.js` with TDD

**Files:**
- Create: `lib/session.js`, `lib/session.test.js`

- [ ] **Step 1: Write failing tests**

Create `lib/session.test.js`:

```js
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

beforeAll(async () => {
  globalThis.window = globalThis;
  globalThis.crypto = globalThis.crypto || { randomUUID: () => 'uuid-' + Math.random() };
  await import('./db.js');
  await import('./repo.js');
  await import('./session.js');
});

beforeEach(async () => {
  await window.Dumly.db.deleteDatabase();
});

describe('sourceKey', () => {
  it('is deterministic for same inputs', () => {
    const { sourceKey } = window.Dumly.session;
    const a = sourceKey({ sourcePostId: 'p1', sourcePostText: 'x', sourcePostAuthorHandle: '@a' });
    const b = sourceKey({ sourcePostId: 'p1', sourcePostText: 'x', sourcePostAuthorHandle: '@a' });
    expect(a).toBe(b);
  });

  it('falls back to text+author when no id', () => {
    const { sourceKey } = window.Dumly.session;
    const a = sourceKey({ sourcePostText: 'x', sourcePostAuthorHandle: '@a' });
    expect(a).toBeTruthy();
  });
});

describe('getOrCreate', () => {
  it('creates a new session on first call', async () => {
    const { getOrCreate } = window.Dumly.session;
    const s = await getOrCreate('key1', 'reply', { sourcePostText: 'x' });
    expect(s.id).toBeTruthy();
    expect(s.sourceKey).toBe('key1');
  });

  it('reuses recent session for same sourceKey within TTL', async () => {
    const { getOrCreate } = window.Dumly.session;
    const a = await getOrCreate('key1', 'reply', { sourcePostText: 'x' });
    const b = await getOrCreate('key1', 'reply', { sourcePostText: 'x' });
    expect(b.id).toBe(a.id);
  });
});

describe('markIgnored', () => {
  it('flips shown candidates in this session to ignored; leaves others', async () => {
    const { saveCandidate } = window.Dumly.repo;
    const { markIgnored } = window.Dumly.session;
    const c1 = await saveCandidate({ sessionId: 's1', mode: 'reply',
      suggestionText: 'a', tone: 'default', attemptNumber: 1, status: 'shown' });
    const c2 = await saveCandidate({ sessionId: 's1', mode: 'reply',
      suggestionText: 'b', tone: 'default', attemptNumber: 2, status: 'used' });
    const c3 = await saveCandidate({ sessionId: 's2', mode: 'reply',
      suggestionText: 'c', tone: 'default', attemptNumber: 1, status: 'shown' });
    await markIgnored('s1');
    const f1 = await window.Dumly.db.get('suggestionCandidates', c1.id);
    const f2 = await window.Dumly.db.get('suggestionCandidates', c2.id);
    const f3 = await window.Dumly.db.get('suggestionCandidates', c3.id);
    expect(f1.status).toBe('ignored');
    expect(f2.status).toBe('used');
    expect(f3.status).toBe('shown');
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement `lib/session.js`**

```js
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
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add lib/session.js lib/session.test.js
git commit -m "feat(lib): add session with sourceKey, getOrCreate, markIgnored"
```

---

### Task 6: Extract `lib/scraping.js` from `content.js`

**Files:**
- Create: `lib/scraping.js`
- Modify: `content.js`

- [ ] **Step 1: Create `lib/scraping.js`**

Copy the following functions from current `content.js` into an IIFE-wrapped `lib/scraping.js`: `getLoggedInHandle`, `extractArticleContent`, `isQuoteCompose`, `extractQuoteContent`, `extractPostContent`. Also import `tokenize` for building `keywords`.

```js
(function () {
  window.Dumly = window.Dumly || {};

  function getLoggedInHandle() {
    const profileLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      if (href) return '@' + href.slice(1);
    }
    return '';
  }

  function extractArticleContent(article) {
    // ... copy exactly from content.js (lines 15-62)
  }

  function isQuoteCompose(editorContainer) {
    // ... copy exactly (lines 64-72)
  }

  function extractQuoteContent(editorContainer) {
    // ... copy exactly (lines 74-127)
  }

  function extractPostContent(editorElement) {
    // ... copy exactly (lines 176-201)
  }

  function buildExtractedContext(editorContainer) {
    const mode = isQuoteCompose(editorContainer) ? 'quote' : 'reply';
    if (mode === 'quote') {
      const q = extractQuoteContent(editorContainer);
      if (!q) return null;
      return {
        mode,
        sourcePostText: q.text || '',
        sourcePostAuthorHandle: q.author || '',
        sourcePostUrl: null,
        sourcePostId: null,
        images: q.images || [],
        nestedQuoteText: q.nestedQuoteText || '',
        keywords: window.Dumly.similarity.tokenize(q.text || ''),
      };
    }
    const r = extractPostContent(editorContainer);
    const last = (r.thread && r.thread.length) ? r.thread[r.thread.length - 1] : null;
    return {
      mode,
      sourcePostText: last ? last.text || '' : '',
      sourcePostAuthorHandle: last ? last.author || '' : '',
      sourcePostUrl: null,
      sourcePostId: null,
      thread: r.thread,
      myHandle: r.myHandle,
      keywords: window.Dumly.similarity.tokenize(last ? last.text || '' : ''),
    };
  }

  window.Dumly.scraping = {
    getLoggedInHandle,
    extractArticleContent,
    isQuoteCompose,
    extractQuoteContent,
    extractPostContent,
    buildExtractedContext,
  };
})();
```

Verbatim-copy functions from the original `content.js` file. Do NOT reimplement.

- [ ] **Step 2: Remove the copied functions from `content.js` and call via namespace**

In `content.js`, remove the copied function declarations. Replace call sites with `Dumly.scraping.*`:
- `getLoggedInHandle()` → `Dumly.scraping.getLoggedInHandle()`
- `isQuoteCompose(replyBox)` → `Dumly.scraping.isQuoteCompose(replyBox)`
- `extractQuoteContent(replyBox)` → `Dumly.scraping.extractQuoteContent(replyBox)`
- `extractPostContent(replyBox)` → `Dumly.scraping.extractPostContent(replyBox)`

- [ ] **Step 3: Update `manifest.json` to load scraping.js and similarity.js before content.js**

Replace `content_scripts[0].js`:

```json
"js": [
  "lib/db.js",
  "lib/similarity.js",
  "lib/scraping.js",
  "content.js"
]
```

- [ ] **Step 4: Manual QA**

Load the unpacked extension (`chrome://extensions`). Open x.com:
- Reply composer → Dumly button visible, generates and inserts reply (same as before).
- Quote composer → Dumly button visible, generates and inserts commentary (same as before).

If behavior changed, the refactor is wrong — fix before committing.

- [ ] **Step 5: Commit**

```bash
git add lib/scraping.js content.js manifest.json
git commit -m "refactor: extract scraping into lib/scraping.js (no behavior change)"
```

---

### Task 7: Extract `lib/openai.js` from `content.js`

**Files:**
- Create: `lib/openai.js`
- Modify: `content.js`

- [ ] **Step 1: Create `lib/openai.js`**

```js
(function () {
  window.Dumly = window.Dumly || {};

  async function chat(messages, settings) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + settings.apiKey,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        max_completion_tokens: 512,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || 'API error: ' + response.status;
      throw new Error(msg);
    }
    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  window.Dumly.openai = { chat };
})();
```

- [ ] **Step 2: Refactor `content.js` generators to use `Dumly.openai.chat`**

In `generateReply` and `generateQuoteCommentary`, replace the inline `fetch(...)` + error-handling block with:

```js
return await window.Dumly.openai.chat(messages, settings);
```

where `messages` is the existing messages array built above.

- [ ] **Step 3: Update manifest.json**

Add `lib/openai.js` to `content_scripts[0].js` (before `content.js`).

- [ ] **Step 4: Manual QA**

Reload extension, verify reply + quote generation still work.

- [ ] **Step 5: Commit**

```bash
git add lib/openai.js content.js manifest.json
git commit -m "refactor: extract OpenAI fetch into lib/openai.js"
```

---

### Task 8: Create `lib/settings.js` with migration

**Files:**
- Create: `lib/settings.js`, `lib/settings.test.js`
- Modify: `content.js`, `manifest.json`

- [ ] **Step 1: Write failing tests (migration only — tests synchronous pure logic)**

Create `lib/settings.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
  globalThis.window = globalThis;
  await import('./settings.js');
});

describe('mergePersonasToBio', () => {
  it('joins non-empty personas with blank line', () => {
    const { mergePersonasToBio } = window.Dumly.settings;
    expect(mergePersonasToBio('A', 'B')).toBe('A\n\nB');
    expect(mergePersonasToBio('A', '')).toBe('A');
    expect(mergePersonasToBio('', 'B')).toBe('B');
    expect(mergePersonasToBio('', '')).toBe('');
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement `lib/settings.js`**

```js
(function () {
  window.Dumly = window.Dumly || {};

  const DEFAULT_SETTINGS = {
    apiKey: '',
    model: 'gpt-5.4-mini',
    memorySettings: {
      useProfile: true,
      learnFromUse: true,
      learnFromCopy: true,
      rememberNegatives: true,
    },
  };

  const DEFAULT_PROFILE = {
    id: 'default',
    bio: '',
    tone: '',
    preferredAngles: [],
    avoidPatterns: [],
    updatedAt: 0,
  };

  function mergePersonasToBio(persona, quotePersona) {
    return [persona, quotePersona].filter(Boolean).join('\n\n');
  }

  function getSync() {
    if (!chrome?.storage?.sync) return Promise.reject(new Error('storage unavailable'));
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, resolve);
    });
  }

  function setSync(obj) {
    return new Promise((resolve) => chrome.storage.sync.set(obj, resolve));
  }

  function removeSync(keys) {
    return new Promise((resolve) => chrome.storage.sync.remove(keys, resolve));
  }

  function getLocal() {
    return new Promise((resolve) => chrome.storage.local.get(null, resolve));
  }

  function setLocal(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  async function loadSettings() {
    const raw = await getSync();
    return {
      apiKey: raw.apiKey ?? DEFAULT_SETTINGS.apiKey,
      model: raw.model ?? DEFAULT_SETTINGS.model,
      memorySettings: { ...DEFAULT_SETTINGS.memorySettings, ...(raw.memorySettings || {}) },
    };
  }

  async function loadProfile() {
    const raw = await getLocal();
    return { ...DEFAULT_PROFILE, ...(raw.userProfile || {}) };
  }

  async function saveProfile(profile) {
    const merged = { ...DEFAULT_PROFILE, ...profile, updatedAt: Date.now() };
    await setLocal({ userProfile: merged });
    return merged;
  }

  async function runMigrationV2() {
    const local = await getLocal();
    if (local.migrationV2Done) return;
    const sync = await getSync();
    const bio = mergePersonasToBio(sync.persona || '', sync.quotePersona || '');
    if (!local.userProfile) {
      await setLocal({
        userProfile: { ...DEFAULT_PROFILE, bio, updatedAt: Date.now() },
      });
    }
    await removeSync(['persona', 'quotePersona']);
    if (!sync.memorySettings) {
      await setSync({ memorySettings: DEFAULT_SETTINGS.memorySettings });
    }
    await setLocal({ migrationV2Done: true });
  }

  window.Dumly.settings = {
    DEFAULT_SETTINGS,
    DEFAULT_PROFILE,
    mergePersonasToBio,
    loadSettings,
    loadProfile,
    saveProfile,
    runMigrationV2,
  };
})();
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Refactor `content.js` `loadSettings` to delegate**

Replace the `loadSettings()` function in `content.js` with:

```js
function loadSettings() {
  return window.Dumly.settings.loadSettings().then((s) => ({
    ...s,
    persona: /* temporary: still-used by current generateReply */ '',
    quotePersona: '',
  }));
}
```

And call `window.Dumly.settings.runMigrationV2()` once near the top of the IIFE (fire-and-forget):

```js
window.Dumly.settings.runMigrationV2().catch(() => {});
```

Note: `generateReply` / `generateQuoteCommentary` currently reference `settings.persona` / `settings.quotePersona`. For Phase 1 (no behavior change), fall back to reading these from sync BEFORE migration wipes them. Adjust the content.js code path: the IIFE should load raw sync via `chrome.storage.sync.get({ persona, quotePersona })` inside `loadSettings()` so existing behavior continues until Phase 2 rewrites prompt construction. The migration path is idempotent and will run only once.

Refined `content.js` loadSettings replacement:

```js
function loadSettings() {
  return Promise.all([
    window.Dumly.settings.loadSettings(),
    new Promise((resolve) => chrome.storage.sync.get({ persona: '', quotePersona: '' }, resolve)),
  ]).then(([s, legacy]) => ({
    ...s,
    persona: legacy.persona || /* default */ 'You are a witty, concise X/Twitter user. Write a reply to the following post. Keep it under 280 characters unless the context warrants more. Be natural — no hashtags, no emojis unless appropriate.',
    quotePersona: legacy.quotePersona || '',
  }));
}
```

Because migration runs asynchronously in the IIFE, the first call after migration completes will have `persona === ''` — fall back to the default persona text in that case (the fallback above handles it).

- [ ] **Step 6: Update manifest.json**

Add `lib/settings.js` to `content_scripts[0].js` (before `content.js`).

- [ ] **Step 7: Manual QA**

Reload extension:
- With existing persona configured, generate a reply — still works.
- Open popup after 1s delay, confirm persona fields still show (Phase 1 doesn't touch popup yet).
- Inspect `chrome.storage.local` in DevTools: `userProfile.bio` should contain the migrated persona text.
- Inspect `chrome.storage.sync`: `persona` / `quotePersona` should no longer exist.

- [ ] **Step 8: Commit**

```bash
git add lib/settings.js lib/settings.test.js content.js manifest.json
git commit -m "feat(lib): add settings module with persona→bio migration"
```

---

## Phase 1 manual QA checklist

- [ ] `npm test` green.
- [ ] Reply generation works on x.com (unchanged behavior).
- [ ] Quote generation works on x.com (unchanged behavior).
- [ ] No errors in console on page load.
- [ ] IndexedDB `dumly` database created (DevTools → Application → IndexedDB).
- [ ] Migration moved persona → `chrome.storage.local.userProfile.bio`.
- [ ] `chrome.storage.sync` no longer contains `persona` or `quotePersona`.

If all pass, Phase 1 complete.
