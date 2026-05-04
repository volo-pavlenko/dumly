# Phase 4 — Popup Tabs + Memory Review Page

**Goal:** Replace persona fields with profile editor. Add three-tab popup (Settings | Profile | Memory). Add full-page `memory.html` for browsing/pinning/deleting accepted and negative memories.

**Exit:** User can view and curate memory.

---

### Task 1: Rewrite popup as three-tab layout

**Files:**
- Modify: `popup.html`, `popup.js`

- [ ] **Step 1: Replace `popup.html`**

All DOM built declaratively in static HTML. No innerHTML in JS.

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <h2>Dumly Settings</h2>

  <div class="tabs">
    <button class="tab is-active" data-tab="settings">Settings</button>
    <button class="tab" data-tab="profile">Profile</button>
    <button class="tab" data-tab="memory">Memory</button>
  </div>

  <section class="tab-panel" data-panel="settings">
    <label for="api-key">OpenAI API Key</label>
    <div class="input-row">
      <input id="api-key" type="password" placeholder="sk-...">
      <button id="toggle-key" type="button">Show</button>
    </div>

    <label for="model">Model</label>
    <select id="model">
      <option value="gpt-5.4-mini">gpt-5.4-mini</option>
      <option value="gpt-5.4">gpt-5.4</option>
      <option value="gpt-5.5">gpt-5.5</option>
    </select>

    <button id="save-settings" class="primary">Save</button>
    <div id="settings-status" class="status"></div>
  </section>

  <section class="tab-panel" data-panel="profile" hidden>
    <label for="bio">Bio</label>
    <textarea id="bio" rows="3" placeholder="What you work on, what you care about..."></textarea>

    <label for="tone">Tone</label>
    <textarea id="tone" rows="2" placeholder="Short, casual, builder-like..."></textarea>

    <label for="angles">Preferred angles (one per line)</label>
    <textarea id="angles" rows="3" placeholder="product thinking&#10;distribution vs building"></textarea>

    <label for="avoid">Avoid patterns (one per line)</label>
    <textarea id="avoid" rows="3" placeholder="generic replies&#10;too much hype"></textarea>

    <button id="save-profile" class="primary">Save</button>
    <div id="profile-status" class="status"></div>
  </section>

  <section class="tab-panel" data-panel="memory" hidden>
    <div class="counts">
      <div>Accepted: <span id="accepted-count">0</span> / 1000</div>
      <div>Negative: <span id="negative-count">0</span> / 200</div>
    </div>

    <label><input type="checkbox" id="toggle-useProfile"> Use my profile</label>
    <label><input type="checkbox" id="toggle-learnFromUse"> Learn from responses I use</label>
    <label><input type="checkbox" id="toggle-learnFromCopy"> Learn from copied responses</label>
    <label><input type="checkbox" id="toggle-rememberNegatives"> Remember "don't suggest like this" feedback</label>

    <button id="save-toggles" class="primary">Save toggles</button>

    <div class="actions">
      <button id="review-memory">Review memory</button>
      <button id="clear-memory" class="danger">Clear memory</button>
    </div>
    <div id="memory-status" class="status"></div>
  </section>

  <script src="lib/db.js"></script>
  <script src="lib/settings.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `popup.css`**

```css
body { width: 360px; padding: 14px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #15202b; color: #e7e9ea; margin: 0; }
h2 { margin: 0 0 10px; font-size: 16px; }
.tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid #263341; }
.tab { background: none; border: none; color: #8b98a5; padding: 6px 10px; cursor: pointer; font-size: 13px; border-bottom: 2px solid transparent; }
.tab.is-active { color: #e7e9ea; border-color: #1d9bf0; }
.tab-panel { display: flex; flex-direction: column; gap: 6px; }
label { font-size: 12px; color: #8b98a5; margin-top: 6px; }
input[type="text"], input[type="password"], select, textarea {
  background: #1e2d3d; color: #e7e9ea; border: 1px solid #38444d; border-radius: 6px;
  padding: 8px; font-size: 13px; box-sizing: border-box; width: 100%; font-family: inherit; resize: vertical;
}
.input-row { position: relative; }
.input-row button {
  position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
  background: none; border: none; color: #8b98a5; cursor: pointer; font-size: 12px;
}
button.primary { background: #1d9bf0; color: white; border: none; border-radius: 20px; padding: 8px; cursor: pointer; font-weight: 600; font-size: 13px; }
button.danger { background: #f4212e; color: white; border: none; border-radius: 20px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
.counts { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px solid #263341; margin-bottom: 4px; }
.actions { display: flex; gap: 8px; margin-top: 8px; }
.actions button { flex: 1; background: #1e2d3d; color: #e7e9ea; border: 1px solid #38444d; border-radius: 6px; padding: 6px; cursor: pointer; font-size: 13px; }
.actions .danger { border-color: #f4212e; color: #f4212e; background: transparent; }
.status { text-align: center; font-size: 12px; color: #00ba7c; min-height: 16px; }
```

- [ ] **Step 3: Replace `popup.js`**

```js
(function () {
  const qs = (s) => document.querySelector(s);
  const status = (id, msg) => {
    const el = qs('#' + id);
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 2000);
  };

  // Tabs
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
      btn.classList.add('is-active');
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-panel').forEach((p) => {
        p.hidden = p.getAttribute('data-panel') !== target;
      });
    });
  });

  // Migration on popup open
  window.Dumly.settings.runMigrationV2().catch(() => {});

  // Settings tab
  const apiInput = qs('#api-key');
  const toggleKey = qs('#toggle-key');
  const modelSel = qs('#model');
  qs('#save-settings').addEventListener('click', async () => {
    const payload = { apiKey: apiInput.value.trim(), model: modelSel.value };
    await new Promise((r) => chrome.storage.sync.set(payload, r));
    status('settings-status', 'Saved!');
  });
  toggleKey.addEventListener('click', () => {
    const isPw = apiInput.type === 'password';
    apiInput.type = isPw ? 'text' : 'password';
    toggleKey.textContent = isPw ? 'Hide' : 'Show';
  });

  window.Dumly.settings.loadSettings().then((s) => {
    apiInput.value = s.apiKey;
    modelSel.value = s.model;
    qs('#toggle-useProfile').checked = s.memorySettings.useProfile !== false;
    qs('#toggle-learnFromUse').checked = s.memorySettings.learnFromUse !== false;
    qs('#toggle-learnFromCopy').checked = s.memorySettings.learnFromCopy !== false;
    qs('#toggle-rememberNegatives').checked = s.memorySettings.rememberNegatives !== false;
  });

  // Profile tab
  const bio = qs('#bio'), tone = qs('#tone'), angles = qs('#angles'), avoid = qs('#avoid');
  window.Dumly.settings.loadProfile().then((p) => {
    bio.value = p.bio;
    tone.value = p.tone;
    angles.value = (p.preferredAngles || []).join('\n');
    avoid.value = (p.avoidPatterns || []).join('\n');
  });
  qs('#save-profile').addEventListener('click', async () => {
    const profile = {
      bio: bio.value.trim(),
      tone: tone.value.trim(),
      preferredAngles: angles.value.split('\n').map((l) => l.trim()).filter(Boolean),
      avoidPatterns: avoid.value.split('\n').map((l) => l.trim()).filter(Boolean),
    };
    await window.Dumly.settings.saveProfile(profile);
    status('profile-status', 'Saved!');
  });

  // Memory tab: toggles
  qs('#save-toggles').addEventListener('click', async () => {
    const memorySettings = {
      useProfile: qs('#toggle-useProfile').checked,
      learnFromUse: qs('#toggle-learnFromUse').checked,
      learnFromCopy: qs('#toggle-learnFromCopy').checked,
      rememberNegatives: qs('#toggle-rememberNegatives').checked,
    };
    await new Promise((r) => chrome.storage.sync.set({ memorySettings }, r));
    status('memory-status', 'Saved!');
  });

  // Counts
  (async () => {
    try {
      const a = await window.Dumly.db.count('acceptedMemories');
      const n = await window.Dumly.db.count('negativeMemories');
      qs('#accepted-count').textContent = a;
      qs('#negative-count').textContent = n;
    } catch (e) {
      qs('#accepted-count').textContent = '?';
      qs('#negative-count').textContent = '?';
    }
  })();

  // Review + Clear
  qs('#review-memory').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('memory.html') });
  });
  qs('#clear-memory').addEventListener('click', async () => {
    const choice = prompt('Type "all", "accepted", or "negative" to clear:');
    if (!choice) return;
    const db = await window.Dumly.db.open();
    const stores = choice === 'all' ? ['acceptedMemories', 'negativeMemories']
                 : choice === 'accepted' ? ['acceptedMemories']
                 : choice === 'negative' ? ['negativeMemories']
                 : null;
    if (!stores) return status('memory-status', 'Cancelled.');
    for (const name of stores) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        const req = tx.objectStore(name).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
    status('memory-status', 'Cleared.');
    qs('#accepted-count').textContent = await window.Dumly.db.count('acceptedMemories');
    qs('#negative-count').textContent = await window.Dumly.db.count('negativeMemories');
  });
})();
```

- [ ] **Step 4: Manual QA**

Reload extension. Click extension icon:
- All three tabs visible; switching works.
- Settings tab shows existing API key and model; saving persists.
- Profile tab shows migrated bio (from persona if any) and empty fields; saving persists (check `chrome.storage.local.userProfile`).
- Memory tab shows counts, four toggle checkboxes, Review + Clear buttons.
- Review memory opens new tab with `memory.html` (404 until Task 2; that's fine).
- Clear memory with "accepted" wipes only `acceptedMemories`.

- [ ] **Step 5: Commit**

```bash
git add popup.html popup.css popup.js
git commit -m "feat(popup): three-tab layout (Settings/Profile/Memory) with toggles and clear"
```

---

### Task 2: Create `memory.html` + `memory.js` review page

**Files:**
- Create: `memory.html`, `memory.js`, `memory.css`

- [ ] **Step 1: Create `memory.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Dumly Memory</title>
  <link rel="stylesheet" href="memory.css">
</head>
<body>
  <header>
    <h1>Dumly Memory</h1>
    <nav>
      <button class="tab is-active" data-tab="accepted">Accepted</button>
      <button class="tab" data-tab="negative">Negative</button>
    </nav>
  </header>

  <section class="controls">
    <input id="search" type="text" placeholder="Search...">
    <select id="mode-filter">
      <option value="">All modes</option>
      <option value="reply">Reply</option>
      <option value="quote">Quote</option>
    </select>
    <select id="sort">
      <option value="newest">Newest</option>
      <option value="oldest">Oldest</option>
      <option value="most-used">Most used</option>
    </select>
  </section>

  <main>
    <section class="tab-panel" data-panel="accepted"></section>
    <section class="tab-panel" data-panel="negative" hidden></section>
  </main>

  <button id="load-more" hidden>Load more</button>

  <script src="lib/db.js"></script>
  <script src="lib/repo.js"></script>
  <script src="memory.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `memory.css`**

```css
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  background: #15202b; color: #e7e9ea; margin: 0; padding: 20px;
  max-width: 820px; margin: 0 auto; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
h1 { margin: 0; font-size: 20px; }
nav { display: flex; gap: 8px; }
.tab { background: none; border: 1px solid #38444d; color: #8b98a5;
  padding: 6px 12px; border-radius: 20px; cursor: pointer; font-size: 13px; }
.tab.is-active { color: white; background: #1d9bf0; border-color: #1d9bf0; }
.controls { display: flex; gap: 8px; margin-bottom: 12px; }
.controls input, .controls select {
  background: #1e2d3d; color: #e7e9ea; border: 1px solid #38444d;
  border-radius: 6px; padding: 6px 8px; font-size: 13px;
}
.controls input { flex: 1; }
.mem-row {
  border: 1px solid #263341; border-radius: 10px; padding: 10px 12px;
  margin-bottom: 10px; background: #1a2733;
}
.mem-meta { font-size: 12px; color: #8b98a5; margin-bottom: 6px; }
.mem-meta .pinned { color: #ffd400; margin-right: 4px; }
.mem-source, .mem-user, .mem-rejected {
  font-size: 13px; margin: 4px 0; line-height: 1.4; white-space: pre-wrap;
  overflow: hidden; text-overflow: ellipsis; max-height: 3em;
}
.mem-source::before { content: "Source: "; color: #8b98a5; }
.mem-user::before { content: "You wrote: "; color: #8b98a5; }
.mem-rejected::before { content: "Rejected: "; color: #8b98a5; }
.mem-actions { display: flex; gap: 6px; margin-top: 6px; }
.mem-actions button {
  background: #1e2d3d; color: #e7e9ea; border: 1px solid #38444d;
  border-radius: 4px; padding: 3px 10px; cursor: pointer; font-size: 12px;
}
.mem-actions .delete { color: #f4212e; border-color: #f4212e; }
#load-more {
  display: block; margin: 16px auto; background: #1d9bf0; color: white;
  border: none; border-radius: 20px; padding: 8px 24px; cursor: pointer; font-size: 13px;
}
.empty { color: #8b98a5; text-align: center; padding: 40px; }
```

- [ ] **Step 3: Create `memory.js`**

All rows built with DOM methods (no innerHTML).

```js
(function () {
  const PAGE_SIZE = 200;

  const state = {
    tab: 'accepted',
    accepted: { all: [], rendered: 0 },
    negative: { all: [], rendered: 0 },
    search: '',
    mode: '',
    sort: 'newest',
  };

  const qs = (s) => document.querySelector(s);
  const acceptedPanel = qs('[data-panel="accepted"]');
  const negativePanel = qs('[data-panel="negative"]');
  const loadMore = qs('#load-more');

  function el(tag, opts = {}) {
    const n = document.createElement(tag);
    if (opts.className) n.className = opts.className;
    if (opts.text) n.textContent = opts.text;
    return n;
  }

  function fmtDate(ts) {
    const days = Math.floor((Date.now() - ts) / 86400000);
    if (days < 1) return 'today';
    if (days < 2) return 'yesterday';
    if (days < 30) return days + ' days ago';
    const months = Math.floor(days / 30);
    return months + ' months ago';
  }

  function applyFilters(list, kind) {
    const { search, mode, sort } = state;
    let out = list.slice();
    if (mode) out = out.filter((m) => m.mode === mode);
    if (search) {
      const needle = search.toLowerCase();
      out = out.filter((m) =>
        (m.sourcePostText || '').toLowerCase().includes(needle)
        || (m.finalUserText || m.rejectedText || '').toLowerCase().includes(needle)
      );
    }
    if (sort === 'newest') out.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === 'oldest') out.sort((a, b) => a.createdAt - b.createdAt);
    else if (sort === 'most-used' && kind === 'accepted') {
      out.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
    }
    return out;
  }

  function renderAccepted() {
    const list = applyFilters(state.accepted.all, 'accepted');
    acceptedPanel.replaceChildren();
    if (!list.length) {
      acceptedPanel.append(el('div', { className: 'empty', text: 'No accepted memories yet.' }));
      loadMore.hidden = true;
      return;
    }
    const visible = list.slice(0, state.accepted.rendered || PAGE_SIZE);
    for (const m of visible) acceptedPanel.append(renderAcceptedRow(m));
    state.accepted.rendered = visible.length;
    loadMore.hidden = visible.length >= list.length;
  }

  function renderAcceptedRow(m) {
    const row = el('div', { className: 'mem-row' });
    const meta = el('div', { className: 'mem-meta' });
    if (m.pinned) meta.append(el('span', { className: 'pinned', text: '★' }));
    const bits = [];
    if (m.sourcePostAuthorHandle) bits.push(m.sourcePostAuthorHandle);
    bits.push(m.mode);
    bits.push(fmtDate(m.createdAt));
    if (m.useCount > 1) bits.push('used ' + m.useCount + 'x');
    meta.append(document.createTextNode(bits.join(' • ')));
    row.append(meta);
    row.append(el('div', { className: 'mem-source', text: m.sourcePostText || '(no source)' }));
    row.append(el('div', { className: 'mem-user', text: m.finalUserText || '' }));

    const actions = el('div', { className: 'mem-actions' });
    const pinBtn = el('button', { text: m.pinned ? 'Unpin' : 'Pin' });
    pinBtn.addEventListener('click', async () => {
      m.pinned = !m.pinned;
      await window.Dumly.db.put('acceptedMemories', m);
      renderAccepted();
    });
    const delBtn = el('button', { className: 'delete', text: 'Delete' });
    delBtn.addEventListener('click', async () => {
      await window.Dumly.db.del('acceptedMemories', m.id);
      state.accepted.all = state.accepted.all.filter((x) => x.id !== m.id);
      renderAccepted();
    });
    actions.append(pinBtn, delBtn);
    row.append(actions);
    return row;
  }

  function renderNegative() {
    const list = applyFilters(state.negative.all, 'negative');
    negativePanel.replaceChildren();
    if (!list.length) {
      negativePanel.append(el('div', { className: 'empty', text: 'No negative memories.' }));
      return;
    }
    for (const n of list) {
      const row = el('div', { className: 'mem-row' });
      const meta = el('div', { className: 'mem-meta',
        text: `${n.mode} • ${fmtDate(n.createdAt)} • reason: ${n.reason || 'other'}` });
      row.append(meta);
      row.append(el('div', { className: 'mem-source', text: n.sourcePostText || '(no source)' }));
      row.append(el('div', { className: 'mem-rejected', text: n.rejectedText || '' }));
      const actions = el('div', { className: 'mem-actions' });
      const delBtn = el('button', { className: 'delete', text: 'Delete' });
      delBtn.addEventListener('click', async () => {
        await window.Dumly.db.del('negativeMemories', n.id);
        state.negative.all = state.negative.all.filter((x) => x.id !== n.id);
        renderNegative();
      });
      actions.append(delBtn);
      row.append(actions);
      negativePanel.append(row);
    }
  }

  function render() {
    if (state.tab === 'accepted') renderAccepted();
    else renderNegative();
  }

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.tab = btn.getAttribute('data-tab');
      acceptedPanel.hidden = state.tab !== 'accepted';
      negativePanel.hidden = state.tab !== 'negative';
      loadMore.hidden = state.tab !== 'accepted';
      render();
    });
  });

  qs('#search').addEventListener('input', (e) => { state.search = e.target.value; render(); });
  qs('#mode-filter').addEventListener('change', (e) => { state.mode = e.target.value; render(); });
  qs('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

  loadMore.addEventListener('click', () => {
    state.accepted.rendered += PAGE_SIZE;
    renderAccepted();
  });

  (async () => {
    state.accepted.all = await window.Dumly.db.getAll('acceptedMemories');
    state.negative.all = await window.Dumly.db.getAll('negativeMemories');
    state.accepted.rendered = PAGE_SIZE;
    render();
  })();
})();
```

- [ ] **Step 4: Manual QA**

Reload extension. Popup → Memory → Review memory opens `memory.html`:
- Accepted tab shows rows for each record, newest first.
- Search filters in both directions (source + user text).
- Mode filter limits to reply/quote.
- Sort switch works (Newest / Oldest / Most used).
- Pin toggles star and persists (reload page, star still there).
- Delete removes row and persists.
- Negative tab shows negative memories with reason + rejected text.
- Empty state shows when tab has no records.

- [ ] **Step 5: Commit**

```bash
git add memory.html memory.css memory.js
git commit -m "feat: add full-page memory review with search/filter/sort/pin/delete"
```

---

## Phase 4 manual QA checklist

- [ ] Popup opens with three tabs; switching works.
- [ ] Settings tab: API key + model save correctly.
- [ ] Profile tab: all 4 fields persist to `chrome.storage.local.userProfile`.
- [ ] Profile's bio contains migrated persona on first open (if any).
- [ ] Memory tab counts match `npm run` IndexedDB (manual cross-check).
- [ ] Toggles persist to `memorySettings`; `useProfile=false` makes prompts omit profile (verify with DevTools).
- [ ] `Review memory` opens `memory.html` in new tab.
- [ ] `Clear memory` works for all / accepted / negative.
- [ ] Memory page: search/filter/sort work; pin persists; delete works.
- [ ] Negative tab shows records with reason + rejected text.

If all pass, Phase 4 complete.
