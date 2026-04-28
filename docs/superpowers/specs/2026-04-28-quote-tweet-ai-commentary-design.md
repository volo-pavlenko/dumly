# Quote Tweet AI Commentary

Generate AI-suggested commentary when users compose quote tweets on X.com.

## Problem

Dumly currently generates AI replies for reply boxes. When a user clicks "Quote" on a post, X.com opens a compose modal with the quoted post embedded — Dumly does nothing here. Users want AI-suggested commentary for quote tweets too.

## Design

### Approach: Unified Detection

Extend the existing `scanAndInject()` flow rather than creating a separate detection path. The button injection mechanism is identical for replies and quotes — the only difference is what content gets extracted and how the prompt is framed. A single code path with a context check at generation time keeps things simple.

### Detection

At generation time (button click), determine whether the context is a reply or a quote compose:

1. From the text area, walk up to find the closest `[role="dialog"]` (modal container).
2. If inside a dialog, check for an embedded quoted post block below the text area.
3. If both conditions match → quote compose context.
4. Otherwise → reply context (existing behavior).

Detection runs at click time, not at injection time. Button injection stays identical.

### Content Extraction

A new `extractQuoteContent(dialog)` function extracts from the quoted post embedded in the compose modal:

- **Post text:** From the embedded quoted post's `[data-testid="tweetText"]`.
- **Author:** From the embedded post's user name/handle.
- **Images:** From any `[data-testid="tweetPhoto"] img` within the embedded post, filtered same as existing logic (excludes emojis and profile images).
- **Nested quote:** If the quoted post itself contains a quote, extract that text too.

No thread context — just the single quoted post. This keeps the prompt focused and token cost lower.

### Prompt Construction

The user's persona setting is reused as-is. The user message is adjusted to indicate quote context:

**User message format:**

```
Post being quoted by @author:
[post text]

[Quoted tweet within: quoted text]    ← only if nested quote exists

Write commentary for quoting this post. You are adding your take above the quoted post — not replying to it directly.
```

Images included as vision content parts, same as existing flow. `max_completion_tokens: 512` unchanged.

Compared to the reply flow:
- No thread context posts.
- Instruction says "write commentary for quoting" instead of "reply to this post."
- No `@myhandle` thread voice continuation.

### Reply Insertion & State Management

No changes. Existing mechanisms work identically:

- Simulated paste into the compose modal's text area.
- `activeGenerations` WeakSet prevents duplicate clicks.
- Same button states (generating spin, error red, disabled).
- Same toast error handling.

### Net-New Code

1. `isQuoteCompose(container)` — detection function (~10 lines).
2. `extractQuoteContent(dialog)` — content extraction from embedded quote (~30 lines).
3. `buildQuotePrompt(content, settings)` — prompt formatting (~15 lines).
4. A branch in `handleClick` that calls the quote path when detected.

Everything else — injection, insertion, settings, error handling — is reused.

## Out of Scope

- Separate persona setting for quotes (reuse the single persona with adjusted instructions).
- Thread context for quote tweets.
- Changes to the settings UI.
- Changes to the popup or manifest.
