# Phase 3 — Retrieval & Prompt Injection

**Goal:** Add memory retrieval and negative memory injection to prompts. Add repetition-hint footer when new suggestion is ≥0.82 Jaccard similar to a recent accepted memory.

**Exit:** Memory loop closed — past accepted responses influence generation.

---

### Task 1: Create `lib/retrieval.js` with TDD

**Files:**
- Create: `lib/retrieval.js`, `lib/retrieval.test.js`
- Modify: `manifest.json`

- [ ] **Step 1: Write failing tests**

Create `lib/retrieval.test.js`:

```js
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

beforeAll(async () => {
  globalThis.window = globalThis;
  globalThis.crypto = globalThis.crypto || { randomUUID: () => 'uuid-' + Math.random() };
  await import('./db.js');
  await import('./similarity.js');
  await import('./repo.js');
  await import('./retrieval.js');
});

beforeEach(async () => {
  await window.Dumly.db.deleteDatabase();
});

async function seedAccepted(overrides) {
  const base = {
    mode: 'reply',
    sourcePostText: 'Discussing distribution strategy', sourcePostAuthorHandle: '@a',
    finalUserText: 'distribution beats building', originalSuggestionText: 'd',
    acceptedVia: 'use_this', candidateId: 'c-' + Math.random(),
    sessionId: 's-' + Math.random(),
  };
  return window.Dumly.repo.saveAccepted({ ...base, ...overrides });
}

describe('selectCandidates', () => {
  it('returns empty array when no memories', async () => {
    const { selectCandidates } = window.Dumly.retrieval;
    const out = await selectCandidates({
      ctx: { sourcePostText: 'x', keywords: ['x'], mode: 'reply' },
      mode: 'reply', limit: 5, maxChars: 1000,
    });
    expect(out).toEqual([]);
  });

  it('scores keyword overlap higher', async () => {
    await seedAccepted({ sourcePostText: 'cats and dogs', finalUserText: 'pets rock' });
    await seedAccepted({ sourcePostText: 'distribution is king', finalUserText: 'ship it' });
    const { selectCandidates } = window.Dumly.retrieval;
    const out = await selectCandidates({
      ctx: { sourcePostText: 'distribution plan', keywords: ['distribution', 'plan'], mode: 'reply' },
      mode: 'reply', limit: 5, maxChars: 1000,
    });
    expect(out[0].memory.sourcePostText).toContain('distribution');
  });

  it('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await seedAccepted({ sourcePostText: 'topic ' + i, finalUserText: 'x' });
    }
    const { selectCandidates } = window.Dumly.retrieval;
    const out = await selectCandidates({
      ctx: { sourcePostText: 'topic', keywords: ['topic'], mode: 'reply' },
      mode: 'reply', limit: 2, maxChars: 10000,
    });
    expect(out.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement `lib/retrieval.js`**

```js
(function () {
  window.Dumly = window.Dumly || {};

  const DAY = 24 * 60 * 60 * 1000;

  function recency(createdAt) {
    const ageDays = (Date.now() - createdAt) / DAY;
    return Math.pow(0.5, ageDays / 30);
  }

  function usageBoost(m) {
    return 1 + Math.min(Math.log1p(m.useCount || 1) * 0.12, 0.4);
  }

  function editBoost(m) { return m.wasEdited ? 1.15 : 1.0; }

  function keywordOverlap(textA, tokensB) {
    if (!tokensB?.length) return 0;
    const setA = new Set(window.Dumly.similarity.tokenize(textA));
    const setB = new Set(tokensB);
    let inter = 0;
    for (const t of setB) if (setA.has(t)) inter++;
    return inter / Math.max(1, setB.size);
  }

  function relevance(memory, ctx) {
    const combined = (memory.sourcePostText || '') + ' ' + (memory.finalUserText || '');
    const kw = keywordOverlap(combined, ctx.keywords || []);
    const authorMatch = !!ctx.sourcePostAuthorHandle
      && memory.sourcePostAuthorHandle === ctx.sourcePostAuthorHandle ? 1 : 0;
    const modeMatch = memory.mode === ctx.mode ? 1 : 0;
    return 0.45 * kw + 0.35 * 0 + 0.10 * authorMatch + 0.10 * modeMatch;
  }

  function score(memory, ctx) {
    return relevance(memory, ctx) * recency(memory.createdAt) * usageBoost(memory) * editBoost(memory);
  }

  async function loadCandidatePool(mode) {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * DAY;
    const recent = (await window.Dumly.db.getAll('acceptedMemories'))
      .filter((m) => m.createdAt > ninetyDaysAgo)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 200);
    const modeOnly = (await window.Dumly.db.getAllByIndex('acceptedMemories', 'mode', mode))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100);
    const byId = new Map();
    for (const m of recent) byId.set(m.id, m);
    for (const m of modeOnly) byId.set(m.id, m);
    return Array.from(byId.values());
  }

  async function selectCandidates({ ctx, mode, limit = 10, maxChars = 3500 }) {
    const pool = await loadCandidatePool(mode);
    if (!pool.length) return [];

    const scored = pool
      .map((memory) => ({ memory, score: score(memory, ctx) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const out = [];
    let chars = 0;
    for (const s of scored) {
      if (out.length >= limit) break;
      const len = (s.memory.sourcePostText?.length || 0) + (s.memory.finalUserText?.length || 0);
      if (chars + len > maxChars) break;
      out.push(s);
      chars += len;
    }
    return out;
  }

  window.Dumly.retrieval = { selectCandidates, score, recency, usageBoost, editBoost };
})();
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Update manifest.json**

Add `lib/retrieval.js` to `content_scripts[0].js` after `lib/repo.js`.

- [ ] **Step 6: Commit**

```bash
git add lib/retrieval.js lib/retrieval.test.js manifest.json
git commit -m "feat(lib): add retrieval with keyword/recency/usage scoring"
```

---

### Task 2: Wire retrieval + negatives + repetition hint into content.js

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Update `runGenerate` in content.js**

In the existing `runGenerate(tone, regenerate)` function, replace the empty `memories: []` and `negatives: []` with real data. Also add the repetition check after generation.

Locate this block in content.js:

```js
const messages = window.Dumly.prompt.buildGeneration({
  mode: session.mode,
  source: ctx,
  tone,
  profile: useProfile ? profile : { bio: '', tone: '', preferredAngles: [], avoidPatterns: [] },
  memories: [],
  negatives: [],
  avoidList,
});
```

Replace with:

```js
const memories = await window.Dumly.retrieval.selectCandidates({
  ctx, mode: session.mode, limit: 10, maxChars: 3500,
});
const negatives = await window.Dumly.repo.listActiveNegatives(session.mode, 20);

const messages = window.Dumly.prompt.buildGeneration({
  mode: session.mode,
  source: ctx,
  tone,
  profile: useProfile ? profile : { bio: '', tone: '', preferredAngles: [], avoidPatterns: [] },
  memories,
  negatives,
  avoidList,
});
```

And after `cardHandle.setSuggestion(text, currentCandidate.id);` within `runGenerate`, add:

```js
const hintFlagged = memories.some(({ memory }) =>
  window.Dumly.similarity.jaccardSimilarity(text, memory.finalUserText) >= 0.82
);
cardHandle.setFooterHint(hintFlagged ? '(similar to a recent reply)' : '');
```

- [ ] **Step 2: Manual QA**

Reload extension. With several accepted memories already in DB:
- Generate a reply — confirm prompt (DevTools → Network → payload) contains `User wrote:` blocks.
- Generate a second reply on a similar post — if repetition triggers, footer shows "(similar to a recent reply)".
- Add a negative via "Don't suggest like this" — subsequent generations include it under "Avoid these patterns...".

- [ ] **Step 3: Commit**

```bash
git add content.js
git commit -m "feat: inject retrieved memories, negatives, and repetition hint into card"
```

---

## Phase 3 manual QA checklist

- [ ] `npm test` green.
- [ ] Prompt payload (DevTools Network) contains memories block when accepted memories exist.
- [ ] Prompt payload contains negatives block when negatives exist for the mode.
- [ ] Footer shows "(similar to a recent reply)" when generated text is near-duplicate of an existing accepted memory.
- [ ] Prompt payload omits memories/negatives blocks when DB is empty.

If all pass, Phase 3 complete.
