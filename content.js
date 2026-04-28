(function () {
  "use strict";

  const BUTTON_ATTR = "data-dumly-injected";

  function getLoggedInHandle() {
    const profileLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    if (profileLink) {
      const href = profileLink.getAttribute("href");
      if (href) return "@" + href.slice(1);
    }
    return "";
  }

  function extractArticleContent(article) {
    let text = "";
    const tweetTextEl = article.querySelector('[data-testid="tweetText"]');
    if (tweetTextEl) {
      text = tweetTextEl.innerText;
    }

    let author = "";
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    if (userNameEl) {
      const links = userNameEl.querySelectorAll("a");
      const handles = [];
      links.forEach((link) => {
        const href = link.getAttribute("href");
        if (href && href.startsWith("/")) {
          handles.push("@" + href.slice(1));
        }
      });
      author = handles.length > 0 ? handles[0] : userNameEl.innerText;
    }

    const images = [];
    const photoEls = article.querySelectorAll('[data-testid="tweetPhoto"] img');
    photoEls.forEach((img) => {
      const src = img.src;
      if (src && !src.includes("emoji") && !src.includes("profile_images")) {
        images.push(src);
      }
    });

    let quotedText = "";
    const quoteContainer = article.querySelector('[role="link"][tabindex="0"]');
    if (quoteContainer) {
      const quoteTextEl = quoteContainer.querySelector('[data-testid="tweetText"]');
      if (quoteTextEl) {
        quotedText = quoteTextEl.innerText;
      }
      const quotePhotos = quoteContainer.querySelectorAll("img");
      quotePhotos.forEach((img) => {
        const src = img.src;
        if (src && !src.includes("emoji") && !src.includes("profile_images")) {
          images.push(src);
        }
      });
    }

    return { text, images, quotedText, author };
  }

  function isQuoteCompose(editorContainer) {
    const dialog = editorContainer.closest('[role="dialog"]');
    if (!dialog) return false;
    const attachments = dialog.querySelector('[data-testid="attachments"]');
    if (attachments && attachments.querySelector('[data-testid="tweetText"]')) return true;
    const quotedPost = dialog.querySelector('[data-testid="quoteTweet"], [data-testid="card.wrapper"]');
    if (quotedPost) return true;
    return false;
  }

  function extractQuoteContent(editorContainer) {
    const dialog = editorContainer.closest('[role="dialog"]');
    if (!dialog) return null;

    let author = "";
    let text = "";
    const images = [];
    let nestedQuoteText = "";

    let quotedPost = dialog.querySelector('[data-testid="attachments"]');

    if (!quotedPost || !quotedPost.querySelector('[data-testid="tweetText"]')) {
      quotedPost = dialog.querySelector('[data-testid="quoteTweet"]')
        || dialog.querySelector('[data-testid="card.wrapper"]');
    }

    if (!quotedPost) return null;

    const tweetTextEl = quotedPost.querySelector('[data-testid="tweetText"]');
    if (tweetTextEl) {
      text = tweetTextEl.innerText;
    }

    const userNameEl = quotedPost.querySelector('[data-testid="User-Name"]');
    if (userNameEl) {
      const handleLinks = userNameEl.querySelectorAll("a");
      const handles = [];
      handleLinks.forEach((link) => {
        const href = link.getAttribute("href");
        if (href && href.startsWith("/")) {
          handles.push("@" + href.slice(1));
        }
      });
      author = handles.length > 0 ? handles[0] : userNameEl.innerText;
    }

    const photoEls = quotedPost.querySelectorAll('[data-testid="tweetPhoto"] img');
    photoEls.forEach((img) => {
      const src = img.src;
      if (src && !src.includes("emoji") && !src.includes("profile_images")) {
        images.push(src);
      }
    });

    const nestedQuote = quotedPost.querySelector('[role="link"][tabindex="0"]');
    if (nestedQuote) {
      const nestedTextEl = nestedQuote.querySelector('[data-testid="tweetText"]');
      if (nestedTextEl) {
        nestedQuoteText = nestedTextEl.innerText;
      }
    }

    return { text, author, images, nestedQuoteText };
  }

  async function generateQuoteCommentary(quoteContent, settings) {
    const userParts = [];

    let textBlock = "";
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

    quoteContent.images.forEach((url) => {
      userParts.push({ type: "image_url", image_url: { url: url } });
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || "API error: " + response.status;
      throw new Error(msg);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  function extractPostContent(editorElement) {
    const myHandle = getLoggedInHandle();
    const allArticles = Array.from(document.querySelectorAll("article"));

    if (allArticles.length === 0) {
      return { thread: [], myHandle };
    }

    // Find which articles are above the editor in the DOM
    const editorRect = editorElement.getBoundingClientRect();
    const threadArticles = allArticles.filter((a) => {
      return a.getBoundingClientRect().bottom <= editorRect.top + 10;
    });

    // Take last 5 posts for context
    const relevant = threadArticles.slice(-5);

    if (relevant.length === 0) {
      // Fallback: grab the first article on the page
      relevant.push(allArticles[0]);
    }

    const thread = relevant.map((article) => extractArticleContent(article));

    return { thread, myHandle };
  }

  function loadSettings() {
    if (!chrome.storage?.sync) {
      return Promise.reject(new Error("Extension was updated — please refresh the page"));
    }
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          apiKey: "",
          model: "gpt-5.4-mini",
          persona:
            "You are a witty, concise X/Twitter user. Write a reply to the following post. Keep it under 280 characters unless the context warrants more. Be natural — no hashtags, no emojis unless appropriate.",
        },
        resolve
      );
    });
  }

  async function generateReply(postContent, settings) {
    const userParts = [];
    var myHandle = postContent.myHandle;
    var thread = postContent.thread;

    if (!thread || thread.length === 0) {
      userParts.push({ type: "text", text: "(No content could be extracted. Write a general engaging reply.)" });
    } else if (thread.length === 1) {
      var post = thread[0];
      var label = (myHandle && post.author === myHandle) ? "You (" + post.author + ")" : post.author;
      var textBlock = "";
      if (label) textBlock += "Post by " + label + ":\n";
      if (post.text) textBlock += post.text;
      if (post.quotedText) textBlock += "\n\nQuoted tweet: " + post.quotedText;
      if (!textBlock.trim() && post.images.length === 0) {
        textBlock = "(This post contains media that could not be extracted. Write a general engaging reply.)";
      }
      if (textBlock.trim()) userParts.push({ type: "text", text: textBlock.trim() });
      post.images.forEach(function(url) {
        userParts.push({ type: "image_url", image_url: { url: url } });
      });
    } else {
      var threadText = "Thread context (most recent messages):\n\n";
      thread.forEach(function(post, i) {
        var label = (myHandle && post.author === myHandle) ? "You (" + post.author + ")" : post.author;
        threadText += label + ": " + (post.text || "(media)");
        if (post.quotedText) threadText += " [quoting: " + post.quotedText + "]";
        threadText += "\n\n";
      });
      threadText += "---\nReply to this last post.";
      if (myHandle) threadText += " You are " + myHandle + " — continue your voice and position from the thread.";
      userParts.push({ type: "text", text: threadText.trim() });

      // Include images from the last post only (the one being replied to)
      var lastPost = thread[thread.length - 1];
      lastPost.images.forEach(function(url) {
        userParts.push({ type: "image_url", image_url: { url: url } });
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || "API error: " + response.status;
      throw new Error(msg);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  function insertReply(editorElement, text) {
    const textbox = editorElement.querySelector('[role="textbox"]')
      || editorElement.closest('[role="textbox"]')
      || editorElement;

    textbox.focus();
    document.execCommand("selectAll", false, null);

    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    textbox.dispatchEvent(new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    }));
  }

  function showError(anchorElement, message) {
    const existing = anchorElement.parentElement?.querySelector(".dumly-error-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "dumly-error-toast";
    toast.textContent = message;

    const parent = anchorElement.parentElement;
    if (parent) {
      parent.style.position = "relative";
      parent.appendChild(toast);
    }

    setTimeout(() => toast.remove(), 3000);
  }

  function createIconSvg() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", "13 2 3 14 12 14 11 22 21 10 12 10 13 2");
    svg.appendChild(polygon);
    return svg;
  }

  function createSpinner() {
    const spinner = document.createElement("div");
    spinner.className = "dumly-spinner";
    return spinner;
  }

  const activeGenerations = new WeakSet();

  function createDumlyButton(replyBox) {
    const btn = document.createElement("button");
    btn.setAttribute(BUTTON_ATTR, "true");
    btn.className = "dumly-generate-btn";
    btn.title = "Generate AI reply";
    btn.appendChild(createIconSvg());

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (btn.disabled || activeGenerations.has(replyBox)) return;
      btn.classList.remove("dumly-error");
      const isQuote = isQuoteCompose(replyBox);
      btn.title = isQuote ? "Generate AI commentary" : "Generate AI reply";
      activeGenerations.add(replyBox);

      const settings = await loadSettings();

      if (!settings.apiKey) {
        activeGenerations.delete(replyBox);
        btn.title = "Set API key in Dumly extension settings";
        showError(btn, "Set API key in extension settings");
        return;
      }

      btn.disabled = true;
      btn.classList.add("dumly-generating");

      try {
        let generatedText;
        if (isQuote) {
          const quoteContent = extractQuoteContent(replyBox);
          if (!quoteContent) {
            const fallbackContent = extractPostContent(replyBox);
            generatedText = await generateReply(fallbackContent, settings);
          } else {
            generatedText = await generateQuoteCommentary(quoteContent, settings);
          }
        } else {
          const replyContent = extractPostContent(replyBox);
          generatedText = await generateReply(replyContent, settings);
        }
        insertReply(replyBox, generatedText);
      } catch (err) {
        console.error("[Dumly] Generation failed:", err);
        btn.classList.add("dumly-error");
        btn.title = err.message.slice(0, 60);
      } finally {
        btn.disabled = false;
        btn.classList.remove("dumly-generating");
        activeGenerations.delete(replyBox);
      }
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
    if (editorContainer.querySelector("[" + BUTTON_ATTR + "]")) return;

    const btn = createDumlyButton(editorContainer);

    if (isQuoteCompose(editorContainer)) {
      editorContainer.style.position = "relative";
      btn.classList.add("dumly-generate-btn--floating");
      editorContainer.appendChild(btn);
    } else {
      const toolbar = findToolbar(editorContainer);
      if (toolbar) {
        if (toolbar.querySelector("[" + BUTTON_ATTR + "]")) return;
        toolbar.prepend(btn);
      } else {
        editorContainer.style.position = "relative";
        btn.classList.add("dumly-generate-btn--floating");
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
    document.querySelectorAll("[" + BUTTON_ATTR + "]").forEach((btn) => {
      if (!document.body.contains(btn.closest("article") || btn.parentElement)) {
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

  console.log("[Dumly] Content script loaded");
})();
