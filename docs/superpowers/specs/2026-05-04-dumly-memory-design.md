# Dumly Memory Design

**Status:** Approved
**Date:** 2026-05-04
**Target version:** Dumly 2.0.0

## Goal

Let Dumly generate replies and quote-posts that sound more like the user, avoid repeating what they already said, and learn only from intentional actions (Use this / Copy / Save / Don't suggest like this). Mode is inferred from composer context — no manual Comment/Quote switch.

Core product rule:

> Dumly learns from responses the user chooses, not from what Dumly guesses.

## Non-goals

- Full social-history scraping.
- Saving every generated suggestion as long-term memory.
- Loading the entire memory database into RAM.
- A manual Comment/Quote switch.
- Treating regeneration as acceptance.
- Post-composer mode (home timeline "What's happening?"). Deferred.

## Scope

In: reply mode, quote mode, card UI, profile, accepted/negative memory with retrieval, cleanup, edit detection, migration from persona/quotePersona, memory review page.

Out: post mode, semantic embeddings, topic-tag generation, "View memory used" overflow item, cross-device sync of memory records.

---

## 1. Architecture Overview

### File layout

```
manifest.json                      — bump to 2.0.0; no new permissions
popup.html / popup.js              — tabs: Settings | Profile | Memory
memory.html / memory.js            — full-page browse/delete/pin of accepted & negative
styles.css                         — extend with card, chips, overflow, toast

content.js                         — orchestrator: scan composers, inject button, wire card

lib/
  scraping.js                      — extract source, detect mode, logged-in handle, tokenize
  openai.js                        — fetch wrapper (generate + rewrite)
  prompt.js                        — buildGeneration, buildRewrite
  similarity.js                    — normalizeText, jaccardSimilarity, STOPWORDS
  settings.js                      — chrome.storage wrapper + sync/local split + migration
  session.js                       — sourceKey, getOrCreate, markIgnored, getShownSuggestions
  db.js                            — IndexedDB open, schema v1, raw CRUD
  repo.js                          — saveAccepted, saveNegative, runCleanup, retentionScore
  retrieval.js                     — selectCandidates(ctx) → scored list
  card.js                          — floating suggestion card component
  post-observer.js                 — watch Post button, snapshot finalUserText
```

### Module pattern

Each lib file is an IIFE that attaches to `window.Dumly = window.Dumly || {}`. Example:

```js
(function () {
  window.Dumly = window.Dumly || {};
  window.Dumly.repo = {
    saveAccepted, saveNegative, /* ... */
  };
})();
```

Content script loads all libs in order (manifest `content_scripts[0].js`), content.js consumes them as `Dumly.repo.saveAccepted(…)`.

No bundler. `package.json` is added for dev-only testing (`vitest` + `fake-indexeddb`); Chrome packaging stays hand-assembled from source.

### Module load order

```
lib/db.js, lib/similarity.js, lib/settings.js,
lib/scraping.js, lib/openai.js, lib/prompt.js,
lib/session.js, lib/repo.js, lib/retrieval.js,
lib/post-observer.js, lib/card.js,
content.js
```

### Storage layers

| Layer | Content | Rationale |
|---|---|---|
| `chrome.storage.sync` | `apiKey`, `model`, `memorySettings` | Tiny, cross-device |
| `chrome.storage.local` | `userProfile`, `lastCleanupAt` | Larger, device-local |
| IndexedDB (`dumly`) | accepted, negative, sessions, candidates, insertion records | Structured, indexed, capacity |

### Separation of concerns

- `content.js` never talks to IndexedDB directly — always via `repo`.
- `repo` never builds prompts — `prompt.js` does.
- `card.js` never calls OpenAI — emits events consumed by `content.js`.

---

## 2. Data Model & IndexedDB Schema

Database: `dumly`, version 1. Opened lazily on first use.

### Stores & indexes

```
acceptedMemories      keyPath: 'id'
  indexes: createdAt, lastUsedAt, mode, sourcePostAuthorHandle, pinned,
           candidateId (unique: true), topicTags (multiEntry: true)

negativeMemories      keyPath: 'id'
  indexes: createdAt, expiresAt, mode

generationSessions    keyPath: 'id'
  indexes: sourceKey, updatedAt

suggestionCandidates  keyPath: 'id'
  indexes: sessionId, status, expiresAt

insertionRecords      keyPath: 'id'
  indexes: sessionId, candidateId, insertedAt
```

### Record shapes

```js
// AcceptedMemory
{ id, platform: 'x', mode,                          // 'reply' | 'quote'
  candidateId,                                      // unique; prevents duplicate saves per candidate
  sessionId,
  sourcePostId, sourcePostText, sourcePostAuthorHandle, sourcePostUrl,
  originalSuggestionText, finalUserText,
  acceptedVia,                                      // 'use_this' | 'copy' | 'manual_save' | 'posted_after_insert'
  wasEdited,
  topicTags: [], toneTags: [],                      // toneTags from tone chip at save
  createdAt, lastUsedAt, useCount, pinned }

// NegativeMemory
{ id, platform: 'x', mode,
  sourcePostText, rejectedText, reason,             // 'too_generic' | 'too_promotional' | 'too_long' | 'wrong_tone' | 'repetitive' | 'other'
  createdAt, expiresAt }                            // createdAt + 30d

// GenerationSession
{ id, platform: 'x', mode,
  sourceKey,                                        // hash(sourcePostId || text+author)
  sourcePostId, sourcePostText, sourcePostAuthorHandle, sourcePostUrl,
  createdAt, updatedAt,
  selectedTone,                                     // 'default' | 'safe' | 'sharp' | 'playful'
  acceptedMemoryId }

// SuggestionCandidate
{ id, sessionId, mode,
  suggestionText, tone,
  attemptNumber,
  status,                                           // 'shown' | 'used' | 'copied' | 'ignored' | 'rejected' | 'expired'
  createdAt, expiresAt }                            // createdAt + 24h

// InsertionRecord
{ id, sessionId, candidateId, insertedText, insertedAt }
```

### UserProfile (`chrome.storage.local`)

```js
{ id: 'default',
  bio: '',
  tone: '',
  preferredAngles: [],
  avoidPatterns: [],
  updatedAt }
```

### Settings (`chrome.storage.sync`)

```js
{ apiKey, model,
  memorySettings: {
    useProfile: true,
    learnFromUse: true,
    learnFromCopy: true,
    rememberNegatives: true
  } }
```

### Migration (v1 → 2.0.0)

On first load of 2.0.0:
1. Read existing `persona` + `quotePersona` from `chrome.storage.sync`.
2. If `chrome.storage.local.userProfile` absent, seed `bio` with `[persona, quotePersona].filter(Boolean).join('\n\n')`. Empty `tone`, `preferredAngles`, `avoidPatterns`.
3. Remove `persona` and `quotePersona` from `sync` after seeding.
4. Set `memorySettings` defaults if absent.

Guarded by a `migrationV2Done` flag in `chrome.storage.local` — runs exactly once.

### ID generation

`crypto.randomUUID()` (MV3 supports it).

### Field truncation on write

Enforced by repo before writing:
- `sourcePostText`: 1000 chars
- `finalUserText`, `originalSuggestionText`, `rejectedText`: 500 chars

---

## 3. Generation Flow

### 3.1 Button click

```
content.js.handleButtonClick(editorContainer):
  1. Unmount any existing card.
  2. mode = isQuoteCompose(container) ? 'quote' : 'reply'
  3. Extract source (scraping):
       reply  → { thread, myHandle }
       quote  → { text, author, images, nestedQuoteText }
  4. Reduce to the single source post for indexing:
       reply  → lastArticle = thread[thread.length - 1]
                sourcePostText   = lastArticle.text
                sourcePostAuthor = lastArticle.author
                (full thread is still passed to the prompt builder for context.)
       quote  → sourcePostText   = quote.text
                sourcePostAuthor = quote.author
  5. Build ExtractedContext:
       { mode, sourcePostText, sourcePostAuthorHandle, sourcePostUrl,
         sourcePostId, thread (reply only), images (quote only),
         nestedQuoteText (quote only),
         keywords: tokenize(sourcePostText) }
  6. sourceKey = hash(sourcePostId || sourcePostText+sourcePostAuthor)
  7. session = Dumly.session.getOrCreate(sourceKey, mode, ctx)
  8. Mount card.
  9. Kick off generation (tone='default').
```

### 3.2 Card lifecycle

Single instance globally. States: `loading`, `ready`, `error`. Mounted once per click; unmounts on Use/outside-click/Esc/Reject-regenerate. Re-clicking the button within 24h for the same sourceKey restores the session.

### 3.3 Generate

```
generate(session, tone='default'):
  1. profile   = Dumly.settings.getProfile()
  2. negatives = Dumly.repo.listActiveNegatives(mode, limit=20)
  3. memories  = Dumly.retrieval.selectCandidates({
                   ctx, mode, limit: 10, maxChars: 3500
                 })
  4. avoid     = Dumly.session.getShownSuggestions(session.id)
                   .map(c => c.suggestionText)
  5. messages  = Dumly.prompt.buildGeneration({
                   mode, source: ctx, profile, memories,
                   negatives, avoidList: avoid, tone
                 })
  6. text      = await Dumly.openai.chat(messages, settings)
  7. candidate = Dumly.repo.saveCandidate({
                   sessionId, mode, suggestionText: text,
                   tone, attemptNumber, status: 'shown'
                 })
  8. Repetition check: if jaccardSimilarity(normalize(text), normalize(any recent top-5 accepted)) >= 0.82 → mark card footer with "(similar to a recent reply)" hint. No retry loop.
  9. card.setSuggestion(text, candidate.id)
```

### 3.4 New angle (regenerate)

- Mark all `status: 'shown'` candidates for session as `ignored`.
- Re-run `generate` with the same tone; `attemptNumber + 1`. The prompt's avoid-list now includes the rejected text.

### 3.5 Tone chip

```
rewriteTone(session, currentCandidate, targetTone):
  messages = Dumly.prompt.buildRewrite({
    currentSuggestionText, targetTone, profile, mode, source
  })
  text = await Dumly.openai.chat(messages, settings)
  candidate = saveCandidate({ ..., tone: targetTone, status: 'shown' })
  card.setSuggestion(text, candidate.id)
```

Previous candidate stays `shown` — tone rewrite is NOT explicit rejection.

### 3.6 Use this

```
1. insertReply(editorContainer, candidate.suggestionText)
2. repo.markCandidate(candidateId, 'used')
3. accepted = repo.saveAccepted({
     mode, sourcePost..., originalSuggestionText: candidate.suggestionText,
     finalUserText: candidate.suggestionText, acceptedVia: 'use_this',
     wasEdited: false, toneTags: [candidate.tone]
   })
4. repo.saveInsertionRecord({ sessionId, candidateId, insertedText, insertedAt })
5. session.acceptedMemoryId = accepted.id
6. Dumly.postObserver.watch(editorContainer, candidate.suggestionText, accepted.id)
7. card.unmount()
```

### 3.7 Overflow

- **Copy text** → `navigator.clipboard.writeText`, `markCandidate('copied')`, `saveAccepted(acceptedVia: 'copy')`, toast "Copied" 2s, card stays open.
- **Save to memory** → same as copy but no clipboard call, `acceptedVia: 'manual_save'`.
- **Don't suggest like this** → optional reason picker (default `other`), `markCandidate('rejected')`, `saveNegative(…)`, auto-regenerate (as New angle).

At most one accepted memory per (sessionId, candidateId) pair: `saveAccepted` checks the existing `acceptedMemories` index for the candidateId and, if a record exists, updates `acceptedVia` (prefer the strongest signal — posted_after_insert > use_this > manual_save > copy) and increments `useCount` instead of inserting a duplicate. This keeps Copy-then-Use-this clean.

### 3.8 Close (outside-click / Esc)

No DB writes. Just `card.unmount()`. Session persists 24h — re-clicking button restores it.

### 3.9 Settings toggle gating

- `learnFromUse=false` → step 3 in 3.6 is no-op.
- `learnFromCopy=false` → Copy saves nothing.
- `rememberNegatives=false` → `saveNegative` is no-op.
- `useProfile=false` → profile block omitted by prompt builder.

### 3.10 Post-button observer

After `Use this`, `postObserver.watch` attaches a single-use click listener:

```
dialog = editorContainer.closest('[role="dialog"]') || document
button = dialog.querySelector('[data-testid="tweetButtonInline"]')
      || dialog.querySelector('[data-testid="tweetButton"]')

on click:
  currentText = editorContainer.querySelector('[role="textbox"]').innerText
  if currentText && currentText !== insertedText:
    repo.updateAccepted(acceptedMemoryId, {
      finalUserText: currentText.slice(0, 500),
      wasEdited: true,
      acceptedVia: 'posted_after_insert'
    })
  else:
    repo.updateAccepted(acceptedMemoryId, { acceptedVia: 'posted_after_insert' })
```

Fails silently if Post button not found after 2s retry. Falls back to `acceptedVia: 'use_this'` data already saved.

---

## 4. Prompt Construction

### 4.1 buildGeneration

**System:**

```
You are Dumly, an assistant that helps the user write X posts in their voice.

Your job is to propose ONE response that sounds like the user — not generic AI.

Detected mode: {reply | quote}
Selected tone: {default | safe | sharp | playful}

{if mode=='reply'} Make the response conversational and suitable as a reply under the source post.
{if mode=='quote'} Make the response work as a standalone thought above the quoted post.

{tone instructions}
  default  → Match the user profile tone.
  safe     → Balanced, friendly, low-risk.
  sharp    → More opinionated, crisper, stronger point — not rude.
  playful  → Light humor, casual — not forced.

Rules:
- Use relevant memory only if it naturally fits.
- Do NOT copy previous responses word-for-word.
- Keep it short and natural. No hashtags, no emojis unless appropriate.
- Return the response text ONLY — no quotes, no preamble, no commentary.
```

**User (content array):**

```
Current post (source):
"""
{source.sourcePostText}
"""
{if author} Author: {handle}

{if profile populated}
User profile:
  Bio: {bio}
  Tone: {tone}
  Preferred angles:
    - {angle}
  Avoid patterns:
    - {pattern}

{if memories.length}
Relevant previous responses by the user (for voice reference — do NOT copy):
  1. In response to: "{trimmed sourcePostText}"
     User wrote: "{finalUserText}"
  2. ...

{if negatives.length, up to 5}
Avoid these patterns the user explicitly rejected:
  - "{trimmed rejectedText}" — reason: {reason}

{if avoidList populated}
Avoid repeating these suggestions already shown in this session:
  - "{trimmed text}"

Generate the response now.
```

Images (from quote/thread): appended as `{ type: 'image_url', image_url: { url } }` parts, matching today's behavior.

### 4.2 buildRewrite

**System:**

```
You are Dumly. Rewrite the current suggestion in the requested tone.

Detected mode: {reply | quote}
Target tone: {safe | sharp | playful}

Preserve the same core idea unless it becomes unnatural.
Keep it short. Return ONLY the rewritten text.
```

**User:**

```
Source post: "{source.sourcePostText}"
{profile block — same as generation}

Current suggestion:
"""
{currentSuggestionText}
"""

Rewrite it in the {targetTone} tone.
```

### 4.3 Budgets (constants in prompt.js)

- Profile block: 800 chars total.
- Per-memory block: 300 chars. Memory block: 3500 chars.
- Negatives: max 5, 200 chars each.
- Avoid-list: max 5, 200 chars each.
- Source post: 1000 chars.

If serialized input exceeds ~4000 token-equivalents (char/4 heuristic), drop memories first (lowest retention), then oldest avoid-list items.

### 4.4 API call (`lib/openai.js`)

- URL: `https://api.openai.com/v1/chat/completions`
- `max_completion_tokens: 512`
- Authorization: `Bearer ${settings.apiKey}`
- Model: `settings.model`
- Throws with parsed error message on non-2xx.

---

## 5. Retrieval & Scoring

### 5.1 Candidate pool

Load two dedup'd sets from IndexedDB (never full-scan):

- **Recent:** `acceptedMemories` where `createdAt > now - 90d`, ordered `createdAt desc`, limit 200.
- **Mode:** `acceptedMemories` where `mode == ctx.mode`, limit 100.

Merge by id.

### 5.2 Score

```js
score(memory, ctx) =
  relevance(memory, ctx) * recency(createdAt) * usageBoost(memory) * editBoost(memory)

relevance(memory, ctx) =
  0.45 * keywordOverlap(memory.sourcePostText + memory.finalUserText, ctx.keywords)
  + 0.35 * topicScore                                   // 0 at MVP
  + 0.10 * (memory.sourcePostAuthorHandle === ctx.sourcePostAuthorHandle ? 1 : 0)
  + 0.10 * (memory.mode === ctx.mode ? 1 : 0)

keywordOverlap(textA, tokensB) =
  |tokens(textA) ∩ tokensB| / max(1, |tokensB|)

recency(createdAt) = 0.5 ** (ageDays / 30)              // half-life 30d

usageBoost(memory) = 1 + min(ln(1 + useCount) * 0.12, 0.4)

editBoost(memory) = memory.wasEdited ? 1.15 : 1.0
```

### 5.3 Tokenize

```js
function tokenize(text) {
  return text.toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOPWORDS.has(t));
}
```

`STOPWORDS` is a ~100-word English list in `similarity.js`.

### 5.4 Select top N within budget

Sort by score desc. Walk the list, accumulating until `limit` (10) or `maxChars` (3500) exhausted. Returns `{ memory, score }[]`.

### 5.5 Negatives

`repo.listActiveNegatives(mode, limit=20)` → `negativeMemories` where `expiresAt > now && mode == ctx.mode`, ordered `createdAt desc`. Prompt builder takes top 5.

### 5.6 Avoid-list

`session.getShownSuggestions(sessionId)` → `suggestionCandidates` where `sessionId AND status='shown'`, ordered `attemptNumber desc`. Texts only.

### 5.7 Debug

`chrome.storage.sync.DUMLY_DEBUG=true` → `console.log` selected memories + scores before call. Off by default, not exposed in UI.

---

## 6. UI: Floating Card

### 6.1 Layout

```
┌─────────────────────────────────────────────┐
│  Reply suggestion                       ⋯   │
├─────────────────────────────────────────────┤
│  [ suggestion text — multi-line ]           │
├─────────────────────────────────────────────┤
│  Tone:  [Safe]  [Sharp]  [Playful]          │
├─────────────────────────────────────────────┤
│  [  Use this  ]     [ New angle ]           │
├─────────────────────────────────────────────┤
│  Learns only from responses you use,        │
│  copy, or save.                             │
└─────────────────────────────────────────────┘
```

### 6.2 Elements

- **Header:** mode label ("Reply suggestion" / "Quote suggestion") + `⋯` overflow trigger.
- **Overflow menu:** Copy text / Save to memory / Don't suggest like this.
- **Body:** loading (spinner) / ready (pre-wrap text) / error (message + Retry).
- **Tone row:** 3 chips, active chip highlighted. Default state = no chip active.
- **Primary actions:** `Use this`, `New angle`.
- **Footer:** static copy.

### 6.3 Positioning

- Absolute-positioned, anchored to Dumly button. z-index 10000.
- Reply (button in toolbar): card above toolbar, right-aligned to button.
- Quote (button floating top-right of editor): card below button, flush to editor right.
- Width 360px. Max-height 320px (body scrolls on overflow).
- Reposition on `scroll` / `resize` (passive listeners, removed on unmount).

### 6.4 Dismissal

- Outside click → unmount.
- Esc → unmount.
- Re-click Dumly button while mounted → no-op (focus card).

### 6.5 Events emitted

```
onGenerate, onRegenerate, onTone(tone),
onUse, onCopy, onSave, onReject(reason),
onClose
```

`card.js` owns DOM + internal state. `content.js` owns data flow.

### 6.6 Error handling

- API error → error state, truncated message (80 chars), Retry button.
- No API key → error state, "Set API key in extension settings".

---

## 7. Cleanup, Limits & Edit Detection

### 7.1 Cleanup runner

`repo.runCleanup()` invoked:
- Content script load, if `chrome.storage.local.lastCleanupAt` missing or > 24h old.
- Opportunistically after `saveAccepted` if count > `acceptedMax`.

Order:
1. Delete `suggestionCandidates` where `expiresAt < now`.
2. Delete `negativeMemories` where `expiresAt < now`.
3. Delete `generationSessions` where `updatedAt < now - 24h`.
4. Delete `insertionRecords` where `insertedAt < now - 7d`.
5. If `acceptedMemories` count > 1000: compute retention scores for non-pinned, sort asc, delete until count == 700.

Store `lastCleanupAt = now` in `chrome.storage.local`.

### 7.2 Retention score

```js
retentionScore(memory) =
  pinned ? Infinity
         : recency(createdAt) * usageBoost(memory) * acceptanceStrength(acceptedVia) * editBoost

acceptanceStrength(via) = {
  'posted_after_insert': 1.4,
  'use_this': 1.2,
  'manual_save': 1.1,
  'copy': 1.0
}[via] ?? 1.0
```

### 7.3 Hard limits

```js
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
  maxPromptMemoryChars: 3500
};
```

`negativeMax` enforced on save: if exceeded, delete oldest.

### 7.4 Edit detection (`lib/post-observer.js`)

```
watch(editorContainer, insertedText, acceptedMemoryId):
  1. dialog = editorContainer.closest('[role="dialog"]') || document
  2. Locate Post button:
       - '[data-testid="tweetButtonInline"]'  (reply / inline)
       - '[data-testid="tweetButton"]'        (modal post)
  3. Attach single-use click listener.
  4. On click: read current composer text; if differs, updateAccepted(…,
     finalUserText: ..., wasEdited: true, acceptedVia: 'posted_after_insert').
  5. MutationObserver fallback: if editorContainer detaches before click,
     give up silently after 30s.
  6. If button not found after 2s retry, bail silently.
```

Failure modes handled:
- User never posts → memory keeps `use_this` / `wasEdited: false`.
- User uses again on another generation → first listener replaced.
- x.com selector changes → silent bail; core flow unaffected.

---

## 8. Extension UIs (Popup & Memory Review)

### 8.1 Popup (`popup.html` / `popup.js`) — three tabs

**Settings tab:**
- API key (existing input + show/hide)
- Model (existing select)
- Save + status line

Persona fields are REMOVED. Migration runs on first open.

**Profile tab:**
- Bio textarea
- Tone textarea
- Preferred angles textarea (one per line → array)
- Avoid patterns textarea (one per line → array)
- Save + status line

Writes `chrome.storage.local.userProfile`.

**Memory tab:**
- Counts: `Accepted: N / 1000`  `Negative: N / 200`
- Four toggles:
  - Use my profile
  - Learn from responses I use
  - Learn from copied responses
  - Remember "don't suggest like this" feedback
- `Review memory` → opens `chrome.runtime.getURL('memory.html')` in a new tab.
- `Clear memory` → confirm dialog (all / accepted only / negative only) → `repo.clearAll()` / `clearAccepted()` / `clearNegative()`.

Toggles write `chrome.storage.sync.memorySettings`.

### 8.2 Memory review page (`memory.html` / `memory.js`)

Full-page, two tabs: Accepted | Negative.

**Accepted tab:**

```
[ Search... ]  [ All modes ▼ ]  [ Sort: Newest ▼ ]

─────────────────────────────────────────────
⭐ @handle • Reply • 3 days ago • used 2x
> Source: "AI is going to change everything..."
> You wrote: "the 'everything' doing a lot of work here"
[ Pin ] [ Delete ]
```

Row: author (if any), mode, relative date, useCount if >1, pinned indicator. Source + user text truncated to 240 chars with hover-to-expand. Pin toggles `pinned`. Delete is immediate.

Load newest 200 on mount; "Load more" paginates.

**Negative tab:**

```
Reply • 2 days ago • reason: too_generic
> Source: "Just shipped my side project..."
> Rejected: "Nice — what stack did you use?"
[ Delete ]
```

Search / mode filter / sort operate client-side on loaded list.

Palette: `#15202b` / `#1e2d3d` / `#1d9bf0`, reused from popup.

### 8.3 manifest.json

- Bump `version` to `2.0.0`.
- `memory.html` is an extension page — opens via `chrome.runtime.getURL`. No `web_accessible_resources` change needed.
- Content scripts array expanded to load all `lib/*.js` before `content.js`.

---

## 9. Testing Strategy

### 9.1 Tooling

Add dev-only deps: `vitest`, `fake-indexeddb`. `package.json` committed; `node_modules/` and `package-lock.json` gitignored. Chrome `.zip` stays hand-assembled — no build output.

### 9.2 Unit-tested modules (TDD)

- `lib/similarity.js` — normalizeText, jaccardSimilarity with threshold cases.
- `lib/prompt.js` — buildGeneration (mode labels, tone block, empty profile, memory cap, negatives cap, images passthrough), buildRewrite.
- `lib/retrieval.js` — score ordering, author/mode bonuses, 30d decay, char-budget cap, empty corpus.
- `lib/repo.js` — retentionScore (pinned=Infinity), acceptanceStrength table, runCleanup order, pinned preservation over cap, truncation, toggle gating.
- `lib/session.js` — sourceKey determinism, getOrCreate TTL, markIgnored scope.

`fake-indexeddb` plugs into `globalThis` for repo/session tests.

### 9.3 Manual QA (no auto tests)

- `lib/scraping.js` — x.com DOM (already verified manually in current shipping code).
- `lib/card.js` — DOM + visual.
- `lib/post-observer.js` — selector-fragile.
- `content.js` — integration.
- `lib/openai.js` — trivial fetch wrapper.
- `lib/db.js` — tested indirectly via repo.

### 9.4 Manual QA checklist

- Reply button injection on feed / thread / search / modal replies.
- Quote button injection on quote compose modal.
- Card renders correctly — reply (above toolbar), quote (below button).
- Outside click / Esc closes card.
- Re-open same post within 24h restores session; different post = new session.
- Tone chip rewrites without marking prior candidate ignored.
- New angle marks prior shown as ignored, regenerates.
- Use this inserts, closes card, saves accepted memory.
- Edit composer text after Use this, then Post → `finalUserText` updated, `wasEdited = true`.
- Don't suggest like this saves negative memory, auto-regenerates.
- Profile edits in popup persist; appear in prompt.
- Memory review page lists accepted & negative.
- Pin protects from cleanup (verify after exceeding `acceptedMax`).
- Migration: existing persona text appears in bio on first open of 2.0.0.

---

## 10. Implementation Phases

Each phase is self-contained: green tests + manual QA pass, no regression of prior phases.

### Phase 1 — Scaffolding, storage, migration

- `package.json`, `vitest`, `fake-indexeddb`, `.gitignore`.
- Split `content.js` into `lib/scraping.js`, `lib/openai.js`, `lib/settings.js` (no behavior change).
- `lib/db.js`, `lib/repo.js`, `lib/session.js`, `lib/similarity.js` — TDD.
- Migration of persona → bio (once, guarded flag).

Exit: existing button behavior unchanged. DB exists; nothing writes yet.

### Phase 2 — Card UI + direct generation

- `lib/card.js` — full component, positioning, states, events.
- `lib/prompt.js` — buildGeneration (profile only, no memories), buildRewrite. TDD.
- `content.js` — button → session → card mount → generate → Use/New angle/tone/Copy/Save/Reject/Close.
- `lib/post-observer.js` — watch Post button.
- Writes to IndexedDB for candidates, accepted, negatives, insertion records.
- 24h session restore.

Exit: full spec behavior except prompts have no memory injection.

### Phase 3 — Retrieval & prompt injection

- `lib/retrieval.js` — selectCandidates, scoring, budget. TDD.
- Extend `lib/prompt.js` to include memories + negatives + avoid-list. TDD.
- Post-generation repetition hint in card footer.

Exit: memory loop closed.

### Phase 4 — Popup + profile + memory review

- `popup.html` / `popup.js` — three tabs.
- `memory.html` / `memory.js` — full-page browser with pin/delete, search, mode filter, sort, Load more.

Exit: user can view and curate memory.

### Phase 5 — Cleanup wiring, polish

- `repo.runCleanup()` on content script load (24h gate).
- Opportunistic cleanup after `saveAccepted` if count > max.
- Clear memory actions with confirmation.
- Final manual QA pass.
- Bump `manifest.json` to `2.0.0`.

Exit: 2.0.0 ready.

### Rollback posture

Each phase = clean commit range. Phase 3 regression → revert to Phase 2's profile-only prompts without data loss; memory keeps accumulating.

---

## Acceptance criteria

### Save behavior

- Generated suggestions save only as `SuggestionCandidate`.
- Regeneration does not create accepted memory.
- Tone rewrite does not create accepted memory.
- `Use this` → accepted with `acceptedVia: 'use_this'`.
- `Copy text` → accepted with `acceptedVia: 'copy'`.
- `Save to memory` → accepted with `acceptedVia: 'manual_save'`.
- `Don't suggest like this` → negative memory.
- Post after `Use this` + edit → `acceptedVia: 'posted_after_insert'`, `wasEdited: true`, `finalUserText` replaced.

### UI behavior

- Card shows detected mode label, not a switch.
- Reply composer → "Reply suggestion"; quote composer → "Quote suggestion".
- Primary actions: `Use this`, `New angle`. Overflow: Copy / Save / Don't suggest like this.
- Tone chips rewrite current suggestion, do not save memory.
- Footer reads `"Learns only from responses you use, copy, or save."`.

### Retrieval behavior

- Prompt includes user profile when `useProfile` enabled and profile populated.
- Prompt includes ≤5 accepted memories.
- Prompt includes session avoid-list after regeneration.
- Prompt includes negative memory only when populated and mode-matched.
- Retrieval never loads all accepted records into RAM.

### Forgetting / limits

- Suggestion candidates expire after 24h.
- Negative memories expire after 30d.
- Accepted memories capped at 1000; cleanup targets 700.
- Cleanup runs no more than once per 24h unless count exceeds cap.
- Pinned memories never auto-deleted.

### Quality behavior

- Recent memories weighted higher via 30d half-life.
- Repetition hint when new suggestion ≥0.82 Jaccard to recent accepted.
- `finalUserText` preferred over `originalSuggestionText` for retrieval.
- Prompt instructs "use only if it naturally fits."

---

## Open questions (to resolve during implementation)

None. Design approved across all 10 sections.
