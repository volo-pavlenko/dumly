# Dumly — AI-Powered Reply Generator for X.com

## Context

Replying thoughtfully on X.com takes time. Dumly is a Chrome extension that adds an overlay button to reply boxes on x.com. One click analyzes the post (text, images, quoted tweets) and generates a reply using the user's own OpenAI account. The goal is fast, persona-configurable, context-aware reply generation with zero friction.

## Architecture

**Approach:** Content script only — no background service worker for the core flow. The popup is a standalone settings page.

**Files:**

```
dumly/
├── manifest.json      # MV3 manifest, permissions, content script registration
├── content.js         # DOM observer, button injection, OpenAI calls, reply insertion
├── styles.css         # Overlay button and loading state styles
├── popup.html         # Settings UI
└── popup.js           # Settings logic (API key, model, persona)
```

**Manifest V3.** No build step. Vanilla JS + HTML/CSS.

**Permissions:**
- `storage` — persist settings via `chrome.storage.sync`
- `activeTab` — access to the active tab
- `host_permissions: ["https://api.openai.com/*"]` — make API calls from content script without CORS issues

**Content script matches:** `https://x.com/*`, `https://twitter.com/*`

## Post Content Extraction

When the generate button is clicked, the content script walks up from the reply box to the parent post and extracts:

- **Text:** from elements with `data-testid="tweetText"`
- **Images:** `src` URLs from `data-testid="tweetPhoto"` img elements — sent as `image_url` content parts to OpenAI
- **Quoted tweet:** if present, extract text and images from the nested quote container
- **Author:** display name and handle from the post's header

Selectors rely on `data-testid` attributes where available (relatively stable), falling back to structural DOM traversal.

**Out of scope:** Videos, polls, and Spaces are not analyzed. If a post contains only unsupported media, the AI receives a note that the content couldn't be extracted.

## OpenAI API Integration

**Single `chat.completions` call** per generation.

**System prompt:** Built from the user's persona setting. Default:

> You are a witty, concise X/Twitter user. Write a reply to the following post. Keep it under 280 characters unless the context warrants more. Be natural — no hashtags, no emojis unless appropriate.

**User message:** Multi-part content array:
- Text part: post text, author handle, quoted tweet text (if any)
- Image parts: each image as `{ type: "image_url", image_url: { url: "<src>" } }`

**Model:** User-configurable via settings dropdown.
- Options: `gpt-5.4-mini` (default), `gpt-5.4`, `gpt-5.5`

**No streaming.** Replies are short — wait for full response, insert at once.

## Reply Insertion

X.com's reply input is a `contenteditable` div managed by React. Simple `textContent` assignment won't trigger React's state updates (the Reply button stays disabled).

**Strategy:**
1. Focus the reply input element
2. Use `document.execCommand('insertText', false, replyText)` — this triggers React's synthetic event handlers
3. Dispatch `input` and `change` events as backup

**Fallback:** If `execCommand` fails, use `dispatchEvent` with an `InputEvent` of type `insertText`.

## Overlay Button

- Positioned inside/adjacent to the reply box area
- Injected by a `MutationObserver` watching for reply boxes appearing in the DOM
- Small icon button (sparkle/lightning icon) that doesn't obstruct the reply input
- **States:**
  - Idle: shows icon
  - Loading: shows spinner, button disabled
  - Error: brief error message near the button, auto-dismisses after 3 seconds
- Clicking while idle generates a new reply (replaces previous content)

## Extension Popup (Settings)

Simple HTML form, dark theme to match X's aesthetic:

- **API Key** — password input with show/hide toggle
- **Model** — dropdown (`gpt-5.4-mini`, `gpt-5.4`, `gpt-5.5`)
- **Persona** — textarea with default prompt, user can override

Save button persists all fields to `chrome.storage.sync`.

**No API key state:** If the user clicks generate without a key configured, the button shows a tooltip: "Set API key in extension settings."

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No API key | Tooltip on button: "Set API key in extension settings" |
| Invalid API key | Error toast near button, auto-dismiss 3s |
| Rate limited | Error toast with message, auto-dismiss 3s |
| Network error | Error toast with message, auto-dismiss 3s |
| No extractable content | AI receives note about missing content, generates best-effort reply |
| Reply input not found | Button not injected (fails silently) |

## Verification

1. Load unpacked extension in `chrome://extensions`
2. Navigate to x.com, open a reply box on any post
3. Verify overlay button appears
4. Configure API key and model in popup settings
5. Click generate on a text-only post — verify reply is inserted and Reply button enables
6. Click generate on a post with images — verify images are sent to API and reply reflects image content
7. Click generate on a post with a quote tweet — verify quoted content is included
8. Click generate with no API key — verify tooltip appears
9. Click generate with invalid API key — verify error toast
10. Click generate again on same reply box — verify previous content is replaced
11. Change persona in settings, generate — verify tone changes
