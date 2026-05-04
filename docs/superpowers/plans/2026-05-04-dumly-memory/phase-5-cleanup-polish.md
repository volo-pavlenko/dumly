# Phase 5 — Cleanup, Polish, 2.0.0

**Goal:** Run cleanup automatically. Ship 2.0.0.

**Exit:** Dumly 2.0.0 ready to package.

---

### Task 1: Implement `repo.runCleanup()` with TDD

**Files:**
- Modify: `lib/repo.js`, `lib/repo.test.js`

- [ ] **Step 1: Write failing tests**

Append to `lib/repo.test.js`:

```js
describe('runCleanup', () => {
  it('deletes expired suggestion candidates', async () => {
    const { saveCandidate } = window.Dumly.repo;
    const expired = await saveCandidate({
      sessionId: 's1', mode: 'reply', suggestionText: 'old',
      tone: 'default', attemptNumber: 1, status: 'shown',
    });
    // Force expiry
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
    // Set very low caps for test by monkeypatching LIMITS
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
    // Pin one
    const all = await window.Dumly.db.getAll('acceptedMemories');
    all[0].pinned = true;
    await window.Dumly.db.put('acceptedMemories', all[0]);

    await window.Dumly.repo.runCleanup();

    const remaining = await window.Dumly.db.getAll('acceptedMemories');
    expect(remaining.length).toBeLessThanOrEqual(4); // target 3 + 1 pinned
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
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Add `retentionScore` + `runCleanup` to `lib/repo.js`**

Append inside the IIFE, before the `window.Dumly.repo = { ... }` block:

```js
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function recency(createdAt) {
  const ageDays = (Date.now() - createdAt) / DAY;
  return Math.pow(0.5, ageDays / 30);
}
function usageBoost(m) { return 1 + Math.min(Math.log1p(m.useCount || 1) * 0.12, 0.4); }
function editBoost(m) { return m.wasEdited ? 1.15 : 1.0; }

function retentionScore(m) {
  if (m.pinned) return Number.POSITIVE_INFINITY;
  const strength = ACCEPTANCE_STRENGTH[m.acceptedVia] ?? 1.0;
  return recency(m.createdAt) * usageBoost(m) * strength * editBoost(m);
}

async function runCleanup() {
  const now = Date.now();

  // 1. Expire suggestion candidates
  const cands = await window.Dumly.db.getAll('suggestionCandidates');
  for (const c of cands) {
    if (c.expiresAt < now) await window.Dumly.db.del('suggestionCandidates', c.id);
  }

  // 2. Expire negatives
  const negs = await window.Dumly.db.getAll('negativeMemories');
  for (const n of negs) {
    if (n.expiresAt < now) await window.Dumly.db.del('negativeMemories', n.id);
  }

  // 3. Expire sessions > 24h old by updatedAt
  const sessions = await window.Dumly.db.getAll('generationSessions');
  const sessionCutoff = now - LIMITS.sessionTTLHours * HOUR;
  for (const s of sessions) {
    if (s.updatedAt < sessionCutoff) await window.Dumly.db.del('generationSessions', s.id);
  }

  // 4. Expire insertion records > 7d
  const ins = await window.Dumly.db.getAll('insertionRecords');
  const insCutoff = now - LIMITS.insertionRecordTTLDays * DAY;
  for (const r of ins) {
    if (r.insertedAt < insCutoff) await window.Dumly.db.del('insertionRecords', r.id);
  }

  // 5. Accepted cap
  const accepted = await window.Dumly.db.getAll('acceptedMemories');
  const nonPinned = accepted.filter((a) => !a.pinned);
  if (nonPinned.length > LIMITS.acceptedMax) {
    const needsGone = nonPinned.length - LIMITS.acceptedTargetAfterCleanup;
    const sorted = nonPinned
      .map((m) => ({ m, s: retentionScore(m) }))
      .sort((a, b) => a.s - b.s);
    for (let i = 0; i < needsGone; i++) {
      await window.Dumly.db.del('acceptedMemories', sorted[i].m.id);
    }
  }

  // 6. Negative cap
  if (negs.length > LIMITS.negativeMax) {
    const sortedNegs = [...negs].sort((a, b) => a.createdAt - b.createdAt);
    const over = negs.length - LIMITS.negativeMax;
    for (let i = 0; i < over; i++) {
      await window.Dumly.db.del('negativeMemories', sortedNegs[i].id);
    }
  }
}

async function clearAll() {
  const db = await window.Dumly.db.open();
  const names = ['acceptedMemories', 'negativeMemories', 'generationSessions',
                 'suggestionCandidates', 'insertionRecords'];
  for (const name of names) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      const req = tx.objectStore(name).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
```

Then extend the exports object:

```js
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
  runCleanup,
  retentionScore,
  clearAll,
};
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test`

- [ ] **Step 5: Commit**

```bash
git add lib/repo.js lib/repo.test.js
git commit -m "feat(repo): add runCleanup, retentionScore, clearAll"
```

---

### Task 2: Wire cleanup into content script load

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Add cleanup gate at content script startup**

Near the top of the content.js IIFE, after `runMigrationV2`, add:

```js
(async function scheduleCleanup() {
  try {
    const local = await new Promise((r) => chrome.storage.local.get({ lastCleanupAt: 0 }, r));
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (Date.now() - (local.lastCleanupAt || 0) > ONE_DAY) {
      await window.Dumly.repo.runCleanup();
      await new Promise((r) => chrome.storage.local.set({ lastCleanupAt: Date.now() }, r));
    }
  } catch (e) {
    console.warn('[Dumly] cleanup failed:', e);
  }
})();
```

- [ ] **Step 2: Add opportunistic cleanup after saveAccepted**

In content.js `runUse` / `runCopy` / `runSave` functions, after any `saveAccepted` call, add (wrap each):

```js
try {
  const cnt = await window.Dumly.db.count('acceptedMemories');
  if (cnt > window.Dumly.repo.LIMITS.acceptedMax) {
    await window.Dumly.repo.runCleanup();
  }
} catch {}
```

Rather than duplicate, extract into a helper near the top of the IIFE:

```js
async function maybeCleanup() {
  try {
    const cnt = await window.Dumly.db.count('acceptedMemories');
    if (cnt > window.Dumly.repo.LIMITS.acceptedMax) {
      await window.Dumly.repo.runCleanup();
      await new Promise((r) => chrome.storage.local.set({ lastCleanupAt: Date.now() }, r));
    }
  } catch {}
}
```

Call `maybeCleanup()` once (fire-and-forget) immediately after each `saveAccepted` call site in `runUse`, `runCopy`, `runSave`.

- [ ] **Step 3: Manual QA**

Reload extension. Open DevTools → Application → Storage → `chrome.storage.local`:
- After content script loads, `lastCleanupAt` should be set to a recent timestamp.
- Reload again within 5 minutes — `lastCleanupAt` should NOT change (24h gate).

- [ ] **Step 4: Commit**

```bash
git add content.js
git commit -m "feat: schedule daily cleanup + opportunistic cleanup on saveAccepted"
```

---

### Task 3: Bump to 2.0.0

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Update version in manifest.json**

```json
"version": "2.0.0",
```

- [ ] **Step 2: Commit**

```bash
git add manifest.json
git commit -m "chore: bump version to 2.0.0"
```

---

### Task 4: Final manual QA pass

- [ ] Run `npm test` — all green.
- [ ] Fresh profile install: remove all Dumly data (clear IndexedDB + chrome storage). Load extension, confirm:
  - No console errors on load.
  - Migration runs; `userProfile` seeded.
  - Button injects on reply + quote composers.
  - Card renders, generates, inserts, saves memory.
  - Popup tabs work; all 4 toggles persist.
  - Memory review page loads and shows fresh data.
- [ ] Upgrade install: simulate by editing `chrome.storage.sync` directly to have `persona: 'test persona'` and `quotePersona: ''`. Reload extension. Confirm:
  - `chrome.storage.local.userProfile.bio === 'test persona'`.
  - `chrome.storage.sync.persona` and `quotePersona` are gone.
  - `migrationV2Done: true` in `chrome.storage.local`.
- [ ] Full flow with existing memory: seed 5 accepted memories manually or via usage. Generate a reply — confirm prompt payload in DevTools Network includes "Relevant previous responses by the user" block.
- [ ] Confirm `wasEdited: true` captured after post-button click when composer text was edited.
- [ ] Confirm pin protects a record from cleanup (manually set `acceptedMax` low, run `Dumly.repo.runCleanup()` in console, verify pinned survive).

If all green, ship.

- [ ] **Step 5: Package `.zip` for Chrome store**

Run from repo root (adjust to match existing project approach):

```bash
zip -r dumly-v2.0.0.zip manifest.json content.js popup.html popup.css popup.js memory.html memory.css memory.js styles.css lib/ icons/ -x 'lib/*.test.js'
```

Verify by loading the `.zip` in a clean Chrome profile via `chrome://extensions → Load unpacked` after extracting.

---

## Phase 5 manual QA checklist

- [ ] `npm test` green (all phases).
- [ ] `runCleanup` runs once per 24h on content script load.
- [ ] Opportunistic cleanup triggers when over `acceptedMax`.
- [ ] Pinned memories survive cleanup.
- [ ] Expired candidates/negatives/sessions/insertions cleared.
- [ ] manifest.json version is 2.0.0.
- [ ] `.zip` builds and loads in clean Chrome profile.
- [ ] End-to-end flow works in fresh install (no prior Dumly data).
- [ ] End-to-end flow works after upgrade from 1.0.0 (persona → bio).

If all pass, ship 2.0.0.
