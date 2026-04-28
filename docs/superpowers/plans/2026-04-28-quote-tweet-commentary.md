# Quote Tweet AI Commentary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-generated commentary when users compose quote tweets on X.com, reusing the existing button injection and generation pipeline.

**Architecture:** Extend the unified `handleClick` flow in `content.js` with a quote-compose detection check, a dedicated content extractor for the quote modal, and a quote-specific prompt builder. All other infrastructure (injection, insertion, settings, errors) is reused unchanged.

**Tech Stack:** Vanilla JavaScript, Chrome Extension Manifest V3, OpenAI API

---

## File Structure

All changes are in a single file:

- **Modify:** `content.js` — add quote detection, extraction, and prompt functions; branch in the click handler

No new files. No changes to `popup.html`, `popup.js`, `styles.css`, or `manifest.json`.

---

### Task 1: Add `isQuoteCompose` Detection Function

**Files:**
- Modify: `content.js:63` (insert new function after `extractArticleContent`)

This function determines whether a given editor container is inside a quote-compose modal. Quote compose on X.com opens a `[role="dialog"]` modal containing the text area and the quoted post embedded below it.

- [ ] **Step 1: Add the `isQuoteCompose` function**

Insert after the closing `}` of `extractArticleContent` (line 62), before `extractPostContent` (line 64):

```javascript
function isQuoteCompose(editorContainer) {
  const dialog = editorContainer.closest('[role="dialog"]');
  if (!dialog) return false;
  const quotedPost = dialog.querySelector('[data-testid="quoteTweet"], [data-testid="card.wrapper"]');
  if (quotedPost) return true;
  const embeddedLinks = dialog.querySelectorAll('[role="link"][tabindex="0"]');
  for (const link of embeddedLinks) {
    if (link.querySelector('[data-testid="tweetText"]')) return true;
  }
  return false;
}
```

Detection strategy:
1. Check if the editor is inside a `[role="dialog"]` — quote compose always uses a modal.
2. Look for `[data-testid="quoteTweet"]` or `[data-testid="card.wrapper"]` — X.com's known selectors for the embedded quote block.
3. Fallback: look for `[role="link"][tabindex="0"]` containers that contain tweet text — the general structure X.com uses for embedded quotes.

- [ ] **Step 2: Verify the file still loads without errors**

Open X.com, open DevTools console, confirm `[Dumly] Content script loaded` appears with no errors.

- [ ] **Step 3: Commit**

```bash
git add content.js
git commit -m "feat: add isQuoteCompose detection function"
```

---

### Task 2: Add `extractQuoteContent` Function

**Files:**
- Modify: `content.js` (insert new function after `isQuoteCompose`)

This function extracts the quoted post's content from the compose modal — text, author, images, and any nested quote.

- [ ] **Step 1: Add the `extractQuoteContent` function**

Insert directly after `isQuoteCompose`:

```javascript
function extractQuoteContent(editorContainer) {
  const dialog = editorContainer.closest('[role="dialog"]');
  if (!dialog) return null;

  var author = "";
  var text = "";
  var images = [];
  var nestedQuoteText = "";

  var quotedPost = dialog.querySelector('[data-testid="quoteTweet"]')
    || dialog.querySelector('[data-testid="card.wrapper"]');

  if (!quotedPost) {
    var links = dialog.querySelectorAll('[role="link"][tabindex="0"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].querySelector('[data-testid="tweetText"]')) {
        quotedPost = links[i];
        break;
      }
    }
  }

  if (!quotedPost) return null;

  var tweetTextEl = quotedPost.querySelector('[data-testid="tweetText"]');
  if (tweetTextEl) {
    text = tweetTextEl.innerText;
  }

  var userNameEl = quotedPost.querySelector('[data-testid="User-Name"]');
  if (userNameEl) {
    var handleLinks = userNameEl.querySelectorAll("a");
    var handles = [];
    handleLinks.forEach(function(link) {
      var href = link.getAttribute("href");
      if (href && href.startsWith("/")) {
        handles.push("@" + href.slice(1));
      }
    });
    author = handles.length > 0 ? handles[0] : userNameEl.innerText;
  }

  var photoEls = quotedPost.querySelectorAll('[data-testid="tweetPhoto"] img');
  photoEls.forEach(function(img) {
    var src = img.src;
    if (src && !src.includes("emoji") && !src.includes("profile_images")) {
      images.push(src);
    }
  });

  var nestedQuote = quotedPost.querySelector('[role="link"][tabindex="0"]');
  if (nestedQuote) {
    var nestedTextEl = nestedQuote.querySelector('[data-testid="tweetText"]');
    if (nestedTextEl) {
      nestedQuoteText = nestedTextEl.innerText;
    }
  }

  return { text: text, author: author, images: images, nestedQuoteText: nestedQuoteText };
}
```

- [ ] **Step 2: Verify the file still loads without errors**

Open X.com, open DevTools console, confirm `[Dumly] Content script loaded` appears with no errors.

- [ ] **Step 3: Commit**

```bash
git add content.js
git commit -m "feat: add extractQuoteContent for quote compose modal"
```

---

### Task 3: Add `generateQuoteCommentary` Function

**Files:**
- Modify: `content.js` (insert new function after `extractQuoteContent`)

This function builds the prompt and calls the OpenAI API for quote commentary. It reuses the same API call pattern as `generateReply` but with a quote-specific user message.

- [ ] **Step 1: Add the `generateQuoteCommentary` function**

Insert directly after `extractQuoteContent`:

```javascript
async function generateQuoteCommentary(quoteContent, settings) {
  var userParts = [];

  var textBlock = "";
  if (quoteContent.author) textBlock += "Post being quoted by " + quoteContent.author + ":\n";
  if (quoteContent.text) textBlock += quoteContent.text;
  if (quoteContent.nestedQuoteText) textBlock += "\n\nQuoted tweet within: " + quoteContent.nestedQuoteText;

  if (!textBlock.trim() && quoteContent.images.length === 0) {
    textBlock = "(This post contains media that could not be extracted. Write general engaging commentary.)";
  }

  if (textBlock.trim()) {
    textBlock += "\n\nWrite commentary for quoting this post. You are adding your take above the quoted post — not replying to it directly.";
    userParts.push({ type: "text", text: textBlock.trim() });
  }

  quoteContent.images.forEach(function(url) {
    userParts.push({ type: "image_url", image_url: { url: url } });
  });

  var response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + settings.apiKey,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: "system", content: settings.persona },
        { role: "user", content: userParts },
      ],
      max_completion_tokens: 512,
    }),
  });

  if (!response.ok) {
    var err = await response.json().catch(function() { return {}; });
    var msg = (err.error && err.error.message) ? err.error.message : "API error: " + response.status;
    throw new Error(msg);
  }

  var data = await response.json();
  return data.choices[0].message.content.trim();
}
```

- [ ] **Step 2: Verify the file still loads without errors**

Open X.com, open DevTools console, confirm `[Dumly] Content script loaded` appears with no errors.

- [ ] **Step 3: Commit**

```bash
git add content.js
git commit -m "feat: add generateQuoteCommentary for quote tweet prompts"
```

---

### Task 4: Branch the Click Handler for Quote Compose

**Files:**
- Modify: `content.js` — the `btn.addEventListener("click", ...)` block inside `createDumlyButton` (currently lines 239-273)

Replace the `try` block (lines 260-263) to check for quote compose context first.

- [ ] **Step 1: Update the click handler's try block**

Find this code inside the click handler (lines 260-263):

```javascript
      try {
        const content = extractPostContent(replyBox);
        const reply = await generateReply(content, settings);
        insertReply(replyBox, reply);
```

Replace with:

```javascript
      try {
        var generatedText;
        if (isQuoteCompose(replyBox)) {
          var quoteContent = extractQuoteContent(replyBox);
          if (!quoteContent) {
            var fallbackContent = extractPostContent(replyBox);
            generatedText = await generateReply(fallbackContent, settings);
          } else {
            generatedText = await generateQuoteCommentary(quoteContent, settings);
          }
        } else {
          var replyContent = extractPostContent(replyBox);
          generatedText = await generateReply(replyContent, settings);
        }
        insertReply(replyBox, generatedText);
```

This checks `isQuoteCompose` first. If it's a quote compose but extraction fails (DOM changed unexpectedly), it falls back to the existing reply flow gracefully.

- [ ] **Step 2: Test with a reply box**

Navigate to any tweet on X.com. Click the reply area, then click the Dumly lightning bolt button. Confirm the reply is generated as before — existing behavior is unchanged.

- [ ] **Step 3: Test with a quote compose modal**

On X.com, click the share/retweet button on any tweet, select "Quote". The compose modal opens with the quoted post embedded. Click the Dumly button. Confirm:
- The button appears in the modal's toolbar
- Commentary is generated (not a reply-style response)
- The text is inserted into the compose area

- [ ] **Step 4: Test edge case — quote compose with images**

Find a tweet with images, open quote compose, click Dumly. Confirm the generated commentary references or acknowledges the visual content.

- [ ] **Step 5: Test edge case — quote of a quote**

Find a tweet that itself quotes another tweet. Open quote compose for it. Click Dumly. Confirm the nested quote context is included in the generated commentary.

- [ ] **Step 6: Commit**

```bash
git add content.js
git commit -m "feat: branch click handler for quote tweet commentary"
```

---

### Task 5: Update Button Title for Quote Context

**Files:**
- Modify: `content.js` — inside `createDumlyButton`, the button title and the title reset in the click handler

Currently the button always says "Generate AI reply". In quote compose context, it should say "Generate AI commentary".

- [ ] **Step 1: Update button title dynamically in the click handler**

Find these two lines inside the click handler (around lines 245-246):

```javascript
      btn.classList.remove("dumly-error");
      btn.title = "Generate AI reply";
```

Replace with:

```javascript
      btn.classList.remove("dumly-error");
      var isQuote = isQuoteCompose(replyBox);
      btn.title = isQuote ? "Generate AI commentary" : "Generate AI reply";
```

Then update the `try` block to reuse the `isQuote` variable. Find:

```javascript
        if (isQuoteCompose(replyBox)) {
```

Replace with:

```javascript
        if (isQuote) {
```

- [ ] **Step 2: Also update the initial button title**

Find the line in `createDumlyButton` (around line 236):

```javascript
    btn.title = "Generate AI reply";
```

This is set at creation time before we know the context. Leave it as "Generate AI reply" — the click handler updates it dynamically. This is acceptable since the button is injected into both contexts and the tooltip updates on first click.

No change needed here — just confirming the decision.

- [ ] **Step 3: Test tooltip**

Hover over the Dumly button in a reply box — tooltip says "Generate AI reply". Open a quote compose modal, click the button, hover again — tooltip says "Generate AI commentary".

- [ ] **Step 4: Commit**

```bash
git add content.js
git commit -m "feat: update button title for quote compose context"
```

---

### Task 6: End-to-End Verification

No code changes — just manual testing to confirm everything works together.

- [ ] **Step 1: Test normal reply flow (regression)**

Open a tweet, click reply, click Dumly button. Confirm reply is generated and inserted correctly. Confirm thread context still works (open a tweet with a conversation, reply to a deeper tweet).

- [ ] **Step 2: Test quote compose flow**

Click retweet → Quote on any tweet. Confirm:
- Dumly button appears in the modal toolbar
- Clicking it generates commentary (not a reply)
- Text is inserted into the compose area
- Button spins while generating
- Button is disabled during generation (can't double-click)

- [ ] **Step 3: Test error handling in quote compose**

Remove the API key from settings, open quote compose, click Dumly. Confirm the error toast appears ("Set API key in extension settings").

- [ ] **Step 4: Test rapid navigation**

Open quote compose, close it, open it again quickly. Confirm no duplicate buttons, no orphaned buttons, no errors in console.

- [ ] **Step 5: Final commit — spec document**

```bash
git add docs/
git commit -m "docs: add quote tweet commentary design spec and implementation plan"
```
