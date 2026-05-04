# Phase 2 — Card UI + Generation Flow

**Goal:** Replace direct-insert with floating card. Profile-only prompts (no memory retrieval yet). Every action persists to IndexedDB. Edit detection via post-button observer.

**Exit:** Full card behavior end-to-end. Memory is being written; nothing is read back into prompts yet.

---

### Task 1: Create `lib/prompt.js` (buildGeneration + buildRewrite)

**Files:**
- Create: `lib/prompt.js`, `lib/prompt.test.js`
- Modify: `manifest.json`

- [ ] **Step 1: Write failing tests**

Create `lib/prompt.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
  globalThis.window = globalThis;
  await import('./prompt.js');
});

const emptyProfile = { bio: '', tone: '', preferredAngles: [], avoidPatterns: [] };

describe('buildGeneration', () => {
  it('emits correct mode label and tone block', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const msgs = buildGeneration({
      mode: 'reply', tone: 'sharp',
      source: { sourcePostText: 'Hello world', sourcePostAuthorHandle: '@a', thread: [] },
      profile: emptyProfile, memories: [], negatives: [], avoidList: [],
    });
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('Detected mode: reply');
    expect(msgs[0].content).toContain('Selected tone: sharp');
    expect(msgs[0].content).toContain('conversational and suitable as a reply');
  });

  it('omits profile block when profile is empty', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const msgs = buildGeneration({
      mode: 'quote', tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '', thread: [] },
      profile: emptyProfile, memories: [], negatives: [], avoidList: [],
    });
    const text = msgs[1].content.map((p) => p.text || '').join('\n');
    expect(text).not.toContain('User profile:');
  });

  it('caps memories at maxPromptMemories', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const many = Array.from({ length: 20 }, (_, i) => ({
      memory: { sourcePostText: 'src' + i, finalUserText: 'user' + i, mode: 'reply' },
    }));
    const msgs = buildGeneration({
      mode: 'reply', tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '', thread: [] },
      profile: emptyProfile, memories: many, negatives: [], avoidList: [],
    });
    const text = msgs[1].content.map((p) => p.text || '').join('\n');
    const matches = text.match(/User wrote:/g) || [];
    expect(matches.length).toBeLessThanOrEqual(10);
  });

  it('passes quote images through as image_url parts', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const msgs = buildGeneration({
      mode: 'quote', tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '@x',
                images: ['https://img/1.jpg', 'https://img/2.jpg'] },
      profile: emptyProfile, memories: [], negatives: [], avoidList: [],
    });
    const imgs = msgs[1].content.filter((p) => p.type === 'image_url');
    expect(imgs).toHaveLength(2);
  });
});

describe('buildRewrite', () => {
  it('includes current suggestion and target tone', () => {
    const { buildRewrite } = window.Dumly.prompt;
    const msgs = buildRewrite({
      currentSuggestionText: 'Hi there',
      targetTone: 'playful',
      profile: emptyProfile,
      mode: 'reply',
      source: { sourcePostText: 'S' },
    });
    expect(msgs[0].content).toContain('Target tone: playful');
    expect(msgs[1].content).toContain('Hi there');
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement `lib/prompt.js`**

```js
(function () {
  window.Dumly = window.Dumly || {};

  const LIMITS = {
    maxPromptMemories: 10,
    maxPromptMemoryChars: 3500,
    perMemoryChars: 300,
    profileBlockChars: 800,
    negativesMax: 5,
    negativeCharsEach: 200,
    avoidMax: 5,
    avoidCharsEach: 200,
    sourceChars: 1000,
  };

  const TONE_BLOCK = `
default  -> Match the user profile tone.
safe     -> Balanced, friendly, low-risk.
sharp    -> More opinionated, crisper, stronger point - not rude.
playful  -> Light humor, casual - not forced.`;

  function trunc(s, n) { return String(s || '').slice(0, n); }

  function systemGeneration(mode, tone) {
    const modeLine = mode === 'reply'
      ? 'Make the response conversational and suitable as a reply under the source post.'
      : 'Make the response work as a standalone thought above the quoted post.';
    return [
      'You are Dumly, an assistant that helps the user write X posts in their voice.',
      '',
      'Your job is to propose ONE response that sounds like the user - not generic AI.',
      '',
      'Detected mode: ' + mode,
      'Selected tone: ' + tone,
      '',
      modeLine,
      '',
      'Tone instructions:' + TONE_BLOCK,
      '',
      'Rules:',
      '- Use relevant memory only if it naturally fits.',
      '- Do NOT copy previous responses word-for-word.',
      '- Keep it short and natural. No hashtags, no emojis unless appropriate.',
      '- Return the response text ONLY - no quotes, no preamble, no commentary.',
    ].join('\n');
  }

  function profileBlock(profile) {
    if (!profile) return '';
    const parts = [];
    if (profile.bio) parts.push('Bio: ' + profile.bio);
    if (profile.tone) parts.push('Tone: ' + profile.tone);
    if (profile.preferredAngles?.length) {
      parts.push('Preferred angles:\n' + profile.preferredAngles.map((a) => '  - ' + a).join('\n'));
    }
    if (profile.avoidPatterns?.length) {
      parts.push('Avoid patterns:\n' + profile.avoidPatterns.map((a) => '  - ' + a).join('\n'));
    }
    if (!parts.length) return '';
    return trunc('User profile:\n' + parts.join('\n'), LIMITS.profileBlockChars);
  }

  function memoriesBlock(memories) {
    if (!memories?.length) return '';
    const lines = ['Relevant previous responses by the user (for voice reference - do NOT copy):'];
    let totalChars = lines[0].length;
    let count = 0;
    for (const { memory } of memories) {
      if (count >= LIMITS.maxPromptMemories) break;
      const block = `${count + 1}. In response to: "${trunc(memory.sourcePostText, 120)}"\n   User wrote: "${trunc(memory.finalUserText, LIMITS.perMemoryChars)}"`;
      if (totalChars + block.length > LIMITS.maxPromptMemoryChars) break;
      lines.push(block);
      totalChars += block.length;
      count++;
    }
    return lines.join('\n');
  }

  function negativesBlock(negatives) {
    if (!negatives?.length) return '';
    const top = negatives.slice(0, LIMITS.negativesMax);
    const lines = ['Avoid these patterns the user explicitly rejected:'];
    for (const n of top) {
      lines.push(`  - "${trunc(n.rejectedText, LIMITS.negativeCharsEach)}" - reason: ${n.reason || 'other'}`);
    }
    return lines.join('\n');
  }

  function avoidListBlock(avoidList) {
    if (!avoidList?.length) return '';
    const top = avoidList.slice(0, LIMITS.avoidMax);
    const lines = ['Avoid repeating these suggestions already shown in this session:'];
    for (const t of top) lines.push(`  - "${trunc(t, LIMITS.avoidCharsEach)}"`);
    return lines.join('\n');
  }

  function userPartsGeneration({ mode, source, profile, memories, negatives, avoidList }) {
    const textBlocks = [];

    let sourceBlock = 'Current post (source):\n"""\n' + trunc(source.sourcePostText, LIMITS.sourceChars) + '\n"""';
    if (source.sourcePostAuthorHandle) sourceBlock += '\nAuthor: ' + source.sourcePostAuthorHandle;
    if (mode === 'reply' && source.thread?.length > 1) {
      const threadText = source.thread
        .map((p) => `  - ${p.author || '?'}: ${trunc(p.text || '(media)', 200)}`)
        .join('\n');
      sourceBlock += '\n\nThread context (oldest first):\n' + threadText;
    }
    if (source.nestedQuoteText) {
      sourceBlock += '\n\nQuoted tweet within: ' + trunc(source.nestedQuoteText, 300);
    }
    textBlocks.push(sourceBlock);

    const pb = profileBlock(profile);
    if (pb) textBlocks.push(pb);

    const mb = memoriesBlock(memories);
    if (mb) textBlocks.push(mb);

    const nb = negativesBlock(negatives);
    if (nb) textBlocks.push(nb);

    const ab = avoidListBlock(avoidList);
    if (ab) textBlocks.push(ab);

    textBlocks.push('Generate the response now.');

    const parts = [{ type: 'text', text: textBlocks.join('\n\n') }];
    if (source.images?.length) {
      for (const url of source.images) parts.push({ type: 'image_url', image_url: { url } });
    }
    return parts;
  }

  function buildGeneration(input) {
    return [
      { role: 'system', content: systemGeneration(input.mode, input.tone) },
      { role: 'user', content: userPartsGeneration(input) },
    ];
  }

  function systemRewrite(mode, targetTone) {
    return [
      'You are Dumly. Rewrite the current suggestion in the requested tone.',
      '',
      'Detected mode: ' + mode,
      'Target tone: ' + targetTone,
      '',
      'Preserve the same core idea unless it becomes unnatural.',
      'Keep it short. Return ONLY the rewritten text.',
    ].join('\n');
  }

  function buildRewrite({ currentSuggestionText, targetTone, profile, mode, source }) {
    const blocks = [];
    blocks.push('Source post: "' + trunc(source.sourcePostText, LIMITS.sourceChars) + '"');
    const pb = profileBlock(profile);
    if (pb) blocks.push(pb);
    blocks.push('Current suggestion:\n"""\n' + currentSuggestionText + '\n"""');
    blocks.push('Rewrite it in the ' + targetTone + ' tone.');
    return [
      { role: 'system', content: systemRewrite(mode, targetTone) },
      { role: 'user', content: blocks.join('\n\n') },
    ];
  }

  window.Dumly.prompt = { buildGeneration, buildRewrite, LIMITS };
})();
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Update manifest.json**

Insert `lib/prompt.js` into `content_scripts[0].js` after `lib/openai.js`.

- [ ] **Step 6: Commit**

```bash
git add lib/prompt.js lib/prompt.test.js manifest.json
git commit -m "feat(lib): add prompt builder with profile/memories/negatives/avoidList"
```

---

### Task 2: Create `lib/card.js`

**Files:**
- Create: `lib/card.js`
- Modify: `styles.css`, `manifest.json`

No unit tests (DOM + visual). Manual QA only.

- [ ] **Step 1: Create `lib/card.js`**

All DOM is built via `createElement`/`textContent` (no innerHTML).

```js
(function () {
  window.Dumly = window.Dumly || {};

  let mounted = null;

  function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
    return node;
  }

  function buildCardDom(mode) {
    const root = el('div', { className: 'dumly-card', attrs: { role: 'dialog' } });

    const header = el('div', { className: 'dumly-card-header' });
    const label = el('span', {
      className: 'dumly-card-label',
      text: mode === 'quote' ? 'Quote suggestion' : 'Reply suggestion',
    });
    const overflowBtn = el('button', {
      className: 'dumly-card-overflow',
      text: '...', attrs: { type: 'button', 'aria-label': 'More' },
    });
    const overflowMenu = el('div', { className: 'dumly-card-overflow-menu', attrs: { hidden: 'true' } });
    const copyBtn = el('button', { text: 'Copy text', attrs: { type: 'button', 'data-action': 'copy' } });
    const saveBtn = el('button', { text: 'Save to memory', attrs: { type: 'button', 'data-action': 'save' } });
    const rejectBtn = el('button', { text: "Don't suggest like this", attrs: { type: 'button', 'data-action': 'reject' } });
    overflowMenu.append(copyBtn, saveBtn, rejectBtn);
    header.append(label, overflowBtn, overflowMenu);

    const body = el('div', { className: 'dumly-card-body' });

    const toneRow = el('div', { className: 'dumly-card-tone' });
    toneRow.append(el('span', { text: 'Tone:' }));
    for (const t of ['safe', 'sharp', 'playful']) {
      toneRow.append(el('button', {
        text: t[0].toUpperCase() + t.slice(1),
        attrs: { type: 'button', 'data-tone': t },
      }));
    }

    const actions = el('div', { className: 'dumly-card-actions' });
    const useBtn = el('button', { className: 'dumly-card-use', text: 'Use this', attrs: { type: 'button' } });
    const regenBtn = el('button', { className: 'dumly-card-regenerate', text: 'New angle', attrs: { type: 'button' } });
    actions.append(useBtn, regenBtn);

    const footer = el('div', {
      className: 'dumly-card-footer',
      text: 'Learns only from responses you use, copy, or save.',
    });

    root.append(header, body, toneRow, actions, footer);
    return { root, body, label, overflowBtn, overflowMenu, useBtn, regenBtn, toneRow, footer };
  }

  function unmount() {
    if (!mounted) return;
    mounted.root.remove();
    document.removeEventListener('keydown', mounted.onKey, true);
    document.removeEventListener('mousedown', mounted.onOutside, true);
    window.removeEventListener('scroll', mounted.reposition, true);
    window.removeEventListener('resize', mounted.reposition);
    mounted = null;
  }

  function isMounted() { return !!mounted; }

  function mount(editorContainer, anchorBtn, initial, handlers) {
    if (mounted) unmount();

    const dom = buildCardDom(initial.mode);
    const { root, body, overflowBtn, overflowMenu, useBtn, regenBtn, toneRow } = dom;

    overflowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      overflowMenu.hidden = !overflowMenu.hidden;
    });
    overflowMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      overflowMenu.hidden = true;
      const action = btn.getAttribute('data-action');
      if (action === 'copy') handlers.onCopy();
      else if (action === 'save') handlers.onSave();
      else if (action === 'reject') handlers.onReject('other');
    });

    toneRow.querySelectorAll('[data-tone]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toneRow.querySelectorAll('[data-tone]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        handlers.onTone(btn.getAttribute('data-tone'));
      });
    });

    useBtn.addEventListener('click', () => handlers.onUse());
    regenBtn.addEventListener('click', () => handlers.onRegenerate());

    function position() {
      const rect = anchorBtn.getBoundingClientRect();
      const cardH = root.offsetHeight || 220;
      const cardW = 360;
      let top = initial.mode === 'quote' ? rect.bottom + 8 : rect.top - cardH - 8;
      let left = Math.min(window.innerWidth - cardW - 8, Math.max(8, rect.right - cardW));
      root.style.top = Math.max(8, top) + 'px';
      root.style.left = left + 'px';
    }

    document.body.appendChild(root);
    position();

    const reposition = () => position();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    const onKey = (e) => {
      if (e.key === 'Escape') { handlers.onClose?.(); unmount(); }
    };
    const onOutside = (e) => {
      if (!root.contains(e.target) && e.target !== anchorBtn) {
        handlers.onClose?.(); unmount();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onOutside, true);

    mounted = { root, body, onKey, onOutside, reposition, currentCandidateId: null };

    setState('loading');
    return {
      setState, setSuggestion, setFooterHint, unmount,
      getCurrentCandidateId: () => mounted?.currentCandidateId ?? null,
    };
  }

  function setState(state, message) {
    if (!mounted) return;
    const { body } = mounted;
    body.classList.remove('is-loading', 'is-error');
    if (state === 'loading') {
      body.classList.add('is-loading');
      body.textContent = 'Generating...';
    } else if (state === 'error') {
      body.classList.add('is-error');
      body.textContent = message || 'Something went wrong.';
    }
  }

  function setSuggestion(text, candidateId) {
    if (!mounted) return;
    mounted.currentCandidateId = candidateId;
    mounted.body.classList.remove('is-loading', 'is-error');
    mounted.body.textContent = text;
  }

  function setFooterHint(text) {
    if (!mounted) return;
    const footer = mounted.root.querySelector('.dumly-card-footer');
    footer.textContent = text
      ? text + ' - Learns only from responses you use, copy, or save.'
      : 'Learns only from responses you use, copy, or save.';
  }

  window.Dumly.card = { mount, unmount, isMounted };
})();
```

- [ ] **Step 2: Add card styles**

Append to `styles.css`:

```css
.dumly-card {
  position: fixed;
  width: 360px;
  max-height: 320px;
  background: #15202b;
  color: #e7e9ea;
  border: 1px solid #38444d;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  z-index: 10000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dumly-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #263341;
  position: relative;
}
.dumly-card-label { font-size: 13px; color: #8b98a5; }
.dumly-card-overflow {
  background: none; border: none; color: #8b98a5; cursor: pointer;
  font-size: 18px; line-height: 1; padding: 2px 6px;
}
.dumly-card-overflow-menu {
  position: absolute; top: 32px; right: 8px; background: #1e2d3d;
  border: 1px solid #38444d; border-radius: 8px; z-index: 10001;
  display: flex; flex-direction: column; min-width: 180px;
}
.dumly-card-overflow-menu button {
  background: none; border: none; color: #e7e9ea;
  padding: 8px 12px; text-align: left; cursor: pointer; font-size: 13px;
}
.dumly-card-overflow-menu button:hover { background: #2a3b4d; }
.dumly-card-body {
  padding: 12px; font-size: 14px; line-height: 1.4;
  white-space: pre-wrap; overflow-y: auto; flex: 1; min-height: 80px;
}
.dumly-card-body.is-loading { color: #8b98a5; font-style: italic; }
.dumly-card-body.is-error { color: #f4212e; }
.dumly-card-tone {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-top: 1px solid #263341; font-size: 12px; color: #8b98a5;
}
.dumly-card-tone button {
  background: #1e2d3d; color: #e7e9ea; border: 1px solid #38444d;
  border-radius: 999px; padding: 3px 10px; cursor: pointer; font-size: 12px;
}
.dumly-card-tone button.is-active { background: #1d9bf0; color: white; border-color: #1d9bf0; }
.dumly-card-actions {
  display: flex; gap: 8px; padding: 8px 12px;
  border-top: 1px solid #263341;
}
.dumly-card-actions button {
  flex: 1; padding: 8px; border-radius: 20px; border: 1px solid #38444d;
  background: #1e2d3d; color: #e7e9ea; cursor: pointer; font-weight: 600; font-size: 13px;
}
.dumly-card-actions .dumly-card-use { background: #1d9bf0; border-color: #1d9bf0; color: white; }
.dumly-card-footer {
  padding: 6px 12px; font-size: 11px; color: #8b98a5;
  border-top: 1px solid #263341; text-align: center;
}
```

- [ ] **Step 3: Update manifest.json**

Add `lib/card.js` to `content_scripts[0].js` after `lib/prompt.js`.

- [ ] **Step 4: Commit**

```bash
git add lib/card.js styles.css manifest.json
git commit -m "feat(lib): add floating card component"
```

---

### Task 3: Create `lib/post-observer.js`

**Files:**
- Create: `lib/post-observer.js`
- Modify: `manifest.json`

- [ ] **Step 1: Create `lib/post-observer.js`**

```js
(function () {
  window.Dumly = window.Dumly || {};

  function watch(editorContainer, insertedText, acceptedMemoryId) {
    const dialog = editorContainer.closest('[role="dialog"]') || document;
    let attempts = 0;

    function findButton() {
      return dialog.querySelector('[data-testid="tweetButtonInline"]')
        || dialog.querySelector('[data-testid="tweetButton"]');
    }

    function attach(button) {
      const onClick = () => {
        button.removeEventListener('click', onClick, true);
        const textbox = editorContainer.querySelector('[role="textbox"]');
        const currentText = textbox ? textbox.innerText : '';
        if (currentText && currentText !== insertedText) {
          window.Dumly.repo.updateAccepted(acceptedMemoryId, {
            finalUserText: currentText,
            wasEdited: true,
            acceptedVia: 'posted_after_insert',
          }).catch(() => {});
        } else {
          window.Dumly.repo.updateAccepted(acceptedMemoryId, {
            acceptedVia: 'posted_after_insert',
          }).catch(() => {});
        }
      };
      button.addEventListener('click', onClick, true);

      const bodyObserver = new MutationObserver(() => {
        if (!document.body.contains(editorContainer)) {
          button.removeEventListener('click', onClick, true);
          bodyObserver.disconnect();
        }
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => bodyObserver.disconnect(), 30000);
    }

    function tryAttach() {
      const btn = findButton();
      if (btn) { attach(btn); return; }
      if (++attempts < 10) setTimeout(tryAttach, 200);
    }

    tryAttach();
  }

  window.Dumly.postObserver = { watch };
})();
```

- [ ] **Step 2: Update manifest.json**

Add `lib/post-observer.js` after `lib/card.js`.

- [ ] **Step 3: Commit**

```bash
git add lib/post-observer.js manifest.json
git commit -m "feat(lib): watch Post button to detect edits after Use this"
```

---

### Task 4: Finalize content_scripts load order

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Replace `content_scripts[0].js`**

```json
"js": [
  "lib/db.js",
  "lib/similarity.js",
  "lib/settings.js",
  "lib/scraping.js",
  "lib/openai.js",
  "lib/prompt.js",
  "lib/session.js",
  "lib/repo.js",
  "lib/post-observer.js",
  "lib/card.js",
  "content.js"
]
```

`lib/retrieval.js` is added in Phase 3.

- [ ] **Step 2: Commit**

```bash
git add manifest.json
git commit -m "chore: finalize Phase 2 content script load order"
```

---

### Task 5: Rewrite `content.js` as orchestrator

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Replace entire content.js**

```js
(function () {
  'use strict';

  const BUTTON_ATTR = 'data-dumly-injected';
  const activeGenerations = new WeakSet();

  window.Dumly.settings.runMigrationV2().catch(() => {});

  function showError(anchorElement, message) {
    const existing = anchorElement.parentElement?.querySelector('.dumly-error-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'dumly-error-toast';
    toast.textContent = message;
    const parent = anchorElement.parentElement;
    if (parent) {
      parent.style.position = 'relative';
      parent.appendChild(toast);
    }
    setTimeout(() => toast.remove(), 3000);
  }

  function insertReply(editorElement, text) {
    const textbox = editorElement.querySelector('[role="textbox"]')
      || editorElement.closest('[role="textbox"]')
      || editorElement;
    textbox.focus();
    document.execCommand('selectAll', false, null);
    requestAnimationFrame(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      textbox.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true,
      }));
    });
  }

  function createIconSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    p.setAttribute('points', '13 2 3 14 12 14 11 22 21 10 12 10 13 2');
    svg.appendChild(p); return svg;
  }

  async function openCardForEditor(editorContainer, anchorBtn) {
    if (window.Dumly.card.isMounted()) window.Dumly.card.unmount();

    const ctx = window.Dumly.scraping.buildExtractedContext(editorContainer);
    if (!ctx) return showError(anchorBtn, 'Could not extract post content');

    const key = window.Dumly.session.sourceKey(ctx);
    const session = await window.Dumly.session.getOrCreate(key, ctx.mode, ctx);

    let currentCandidate = null;

    async function runGenerate(tone, regenerate) {
      try {
        cardHandle.setState('loading');
        if (regenerate) await window.Dumly.session.markIgnored(session.id);

        const settings = await window.Dumly.settings.loadSettings();
        if (!settings.apiKey) {
          cardHandle.setState('error', 'Set API key in extension settings');
          return;
        }
        const profile = await window.Dumly.settings.loadProfile();
        const useProfile = settings.memorySettings.useProfile !== false;
        const avoidList = (await window.Dumly.session.getShownSuggestions(session.id))
          .map((c) => c.suggestionText);

        const messages = window.Dumly.prompt.buildGeneration({
          mode: session.mode,
          source: ctx,
          tone,
          profile: useProfile ? profile : { bio: '', tone: '', preferredAngles: [], avoidPatterns: [] },
          memories: [],   // Phase 3 fills this
          negatives: [],  // Phase 3 fills this
          avoidList,
        });
        const text = await window.Dumly.openai.chat(messages, settings);
        const attempt = avoidList.length + 1;
        currentCandidate = await window.Dumly.repo.saveCandidate({
          sessionId: session.id, mode: session.mode,
          suggestionText: text, tone, attemptNumber: attempt, status: 'shown',
        });
        cardHandle.setSuggestion(text, currentCandidate.id);
      } catch (err) {
        console.error('[Dumly] generate failed:', err);
        cardHandle.setState('error', (err.message || 'error').slice(0, 80));
      }
    }

    async function runRewrite(targetTone) {
      if (!currentCandidate) return;
      try {
        cardHandle.setState('loading');
        const settings = await window.Dumly.settings.loadSettings();
        if (!settings.apiKey) {
          cardHandle.setState('error', 'Set API key in extension settings'); return;
        }
        const profile = await window.Dumly.settings.loadProfile();
        const messages = window.Dumly.prompt.buildRewrite({
          currentSuggestionText: currentCandidate.suggestionText,
          targetTone,
          profile: settings.memorySettings.useProfile !== false ? profile
            : { bio: '', tone: '', preferredAngles: [], avoidPatterns: [] },
          mode: session.mode,
          source: ctx,
        });
        const text = await window.Dumly.openai.chat(messages, settings);
        const attempt = (currentCandidate.attemptNumber || 0) + 1;
        currentCandidate = await window.Dumly.repo.saveCandidate({
          sessionId: session.id, mode: session.mode,
          suggestionText: text, tone: targetTone, attemptNumber: attempt, status: 'shown',
        });
        cardHandle.setSuggestion(text, currentCandidate.id);
      } catch (err) {
        console.error('[Dumly] rewrite failed:', err);
        cardHandle.setState('error', (err.message || 'error').slice(0, 80));
      }
    }

    async function runUse() {
      if (!currentCandidate) return;
      insertReply(editorContainer, currentCandidate.suggestionText);
      const settings = await window.Dumly.settings.loadSettings();
      if (settings.memorySettings.learnFromUse !== false) {
        await window.Dumly.repo.markCandidate(currentCandidate.id, 'used');
        const accepted = await window.Dumly.repo.saveAccepted({
          sessionId: session.id,
          candidateId: currentCandidate.id,
          mode: session.mode,
          sourcePostId: ctx.sourcePostId,
          sourcePostText: ctx.sourcePostText,
          sourcePostAuthorHandle: ctx.sourcePostAuthorHandle,
          sourcePostUrl: ctx.sourcePostUrl,
          originalSuggestionText: currentCandidate.suggestionText,
          finalUserText: currentCandidate.suggestionText,
          acceptedVia: 'use_this',
          wasEdited: false,
          toneTags: [currentCandidate.tone],
        });
        await window.Dumly.repo.saveInsertionRecord({
          sessionId: session.id,
          candidateId: currentCandidate.id,
          insertedText: currentCandidate.suggestionText,
        });
        window.Dumly.postObserver.watch(editorContainer, currentCandidate.suggestionText, accepted.id);
      }
      window.Dumly.card.unmount();
    }

    async function runCopy() {
      if (!currentCandidate) return;
      try { await navigator.clipboard.writeText(currentCandidate.suggestionText); } catch {}
      const settings = await window.Dumly.settings.loadSettings();
      if (settings.memorySettings.learnFromCopy !== false) {
        await window.Dumly.repo.markCandidate(currentCandidate.id, 'copied');
        await window.Dumly.repo.saveAccepted({
          sessionId: session.id,
          candidateId: currentCandidate.id,
          mode: session.mode,
          sourcePostId: ctx.sourcePostId,
          sourcePostText: ctx.sourcePostText,
          sourcePostAuthorHandle: ctx.sourcePostAuthorHandle,
          sourcePostUrl: ctx.sourcePostUrl,
          originalSuggestionText: currentCandidate.suggestionText,
          finalUserText: currentCandidate.suggestionText,
          acceptedVia: 'copy',
          wasEdited: false,
          toneTags: [currentCandidate.tone],
        });
      }
    }

    async function runSave() {
      if (!currentCandidate) return;
      await window.Dumly.repo.saveAccepted({
        sessionId: session.id,
        candidateId: currentCandidate.id,
        mode: session.mode,
        sourcePostId: ctx.sourcePostId,
        sourcePostText: ctx.sourcePostText,
        sourcePostAuthorHandle: ctx.sourcePostAuthorHandle,
        sourcePostUrl: ctx.sourcePostUrl,
        originalSuggestionText: currentCandidate.suggestionText,
        finalUserText: currentCandidate.suggestionText,
        acceptedVia: 'manual_save',
        wasEdited: false,
        toneTags: [currentCandidate.tone],
      });
    }

    async function runReject(reason) {
      if (!currentCandidate) return;
      const settings = await window.Dumly.settings.loadSettings();
      if (settings.memorySettings.rememberNegatives !== false) {
        await window.Dumly.repo.markCandidate(currentCandidate.id, 'rejected');
        await window.Dumly.repo.saveNegative({
          mode: session.mode,
          sourcePostText: ctx.sourcePostText,
          rejectedText: currentCandidate.suggestionText,
          reason,
        });
      }
      await runGenerate('default', true);
    }

    const cardHandle = window.Dumly.card.mount(editorContainer, anchorBtn, { mode: session.mode }, {
      onUse: runUse,
      onRegenerate: () => runGenerate(currentCandidate?.tone || 'default', true),
      onTone: runRewrite,
      onCopy: runCopy,
      onSave: runSave,
      onReject: runReject,
      onClose: () => {},
    });

    runGenerate('default', false);
  }

  function createDumlyButton(replyBox) {
    const btn = document.createElement('button');
    btn.setAttribute(BUTTON_ATTR, 'true');
    btn.className = 'dumly-generate-btn';
    btn.title = 'Generate AI suggestion';
    btn.appendChild(createIconSvg());

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activeGenerations.has(replyBox)) return;
      activeGenerations.add(replyBox);
      openCardForEditor(replyBox, btn).finally(() => activeGenerations.delete(replyBox));
    });

    return btn;
  }

  function findToolbar(startElement) {
    let ancestor = startElement.parentElement;
    while (ancestor && ancestor !== document.body) {
      const toolbar = ancestor.querySelector('[data-testid="toolBar"]');
      if (toolbar) return toolbar;
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  function injectButton(editorContainer) {
    if (editorContainer.querySelector('[' + BUTTON_ATTR + ']')) return;
    const btn = createDumlyButton(editorContainer);
    if (window.Dumly.scraping.isQuoteCompose(editorContainer)) {
      editorContainer.style.position = 'relative';
      btn.classList.add('dumly-generate-btn--floating');
      editorContainer.appendChild(btn);
    } else {
      const toolbar = findToolbar(editorContainer);
      if (toolbar) {
        if (toolbar.querySelector('[' + BUTTON_ATTR + ']')) return;
        toolbar.prepend(btn);
      } else {
        editorContainer.style.position = 'relative';
        btn.classList.add('dumly-generate-btn--floating');
        editorContainer.appendChild(btn);
      }
    }
  }

  function scanAndInject() {
    const editors = document.querySelectorAll(
      '[data-testid="tweetTextarea_0"][role="textbox"]'
    );
    editors.forEach((editor) => {
      const container = editor.closest('[data-testid="tweetTextarea_0_label"]')
        || editor.parentElement;
      if (container) injectButton(container);
    });
  }

  function cleanupOrphanedButtons() {
    document.querySelectorAll('[' + BUTTON_ATTR + ']').forEach((btn) => {
      if (!document.body.contains(btn.closest('article') || btn.parentElement)) {
        btn.remove();
      }
    });
  }

  const observer = new MutationObserver(() => {
    scanAndInject();
    cleanupOrphanedButtons();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scanAndInject();

  console.log('[Dumly] Content script loaded (v2)');
})();
```

- [ ] **Step 2: Manual QA — end-to-end card flow**

Reload extension. On x.com:

- Click Dumly button in a reply composer → card appears above toolbar with spinner, then suggestion.
- Click "Use this" → inserts, card closes. DevTools → Application → IndexedDB → `dumly` → `acceptedMemories` has 1 record with `acceptedVia: 'use_this'`.
- Regenerate → new suggestion, previous marked `ignored` in `suggestionCandidates`.
- Tone chips rewrite without marking previous as ignored.
- Overflow → Copy text → clipboard contains text, accepted record exists/updated.
- Overflow → Save to memory → new accepted record with `acceptedVia: 'manual_save'`.
- Overflow → Don't suggest like this → new `negativeMemories` record, auto-regenerate fires.
- Esc / outside-click closes card with no DB writes.
- Edit composer text after Use this, click Post → accepted record has `wasEdited: true` and updated `finalUserText`.
- Same post, re-click Dumly within 24h → same sessionId in DB.

- [ ] **Step 3: Commit**

```bash
git add content.js
git commit -m "feat: rewrite content.js as card-based orchestrator (profile-only prompts)"
```

---

## Phase 2 manual QA checklist

- [ ] Card renders in reply composer (above toolbar).
- [ ] Card renders in quote composer (below floating button).
- [ ] Tone chips switch active state, trigger rewrite.
- [ ] New angle marks prior shown candidates as ignored.
- [ ] Outside click / Esc closes card silently.
- [ ] Use this inserts, closes, saves accepted memory.
- [ ] Copy text + Save to memory + Don't suggest like this all persist.
- [ ] Edit inserted text, click Post → memory updated with `wasEdited: true`.
- [ ] Re-opening same post within 24h restores session.
- [ ] `npm test` still green.

If all pass, Phase 2 complete.
