(function () {
  "use strict";

  const BUTTON_ATTR = "data-dumly-injected";

  function extractPostContent(editorElement) {
    let article = editorElement.closest("article");

    if (!article) {
      article = document.querySelector(
        '[data-testid="tweet"] article, article[data-testid="tweet"]'
      );
    }

    if (!article) {
      const articles = document.querySelectorAll("article");
      if (articles.length > 0) {
        article = articles[0];
      }
    }

    if (!article) {
      return { text: "", images: [], quotedText: "", author: "" };
    }

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

  function loadSettings() {
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

    let textBlock = "";
    if (postContent.author) {
      textBlock += "Post by " + postContent.author + ":\n";
    }
    if (postContent.text) {
      textBlock += postContent.text;
    }
    if (postContent.quotedText) {
      textBlock += "\n\nQuoted tweet: " + postContent.quotedText;
    }
    if (!textBlock.trim() && postContent.images.length === 0) {
      textBlock = "(This post contains media that could not be extracted. Write a general engaging reply.)";
    }

    if (textBlock.trim()) {
      userParts.push({ type: "text", text: textBlock.trim() });
    }

    postContent.images.forEach((url) => {
      userParts.push({
        type: "image_url",
        image_url: { url },
      });
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
        max_tokens: 512,
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

    const selection = window.getSelection();
    selection.selectAllChildren(textbox);
    selection.collapseToStart();

    if (textbox.textContent.length > 0) {
      selection.selectAllChildren(textbox);
    }

    const inserted = document.execCommand("insertText", false, text);

    if (!inserted) {
      const inputEvent = new InputEvent("beforeinput", {
        inputType: "insertText",
        data: text,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      textbox.dispatchEvent(inputEvent);

      if (textbox.textContent === "" || textbox.textContent !== text) {
        textbox.textContent = text;
        textbox.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
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

      const settings = await loadSettings();

      if (!settings.apiKey) {
        btn.title = "Set API key in Dumly extension settings";
        showError(btn, "Set API key in extension settings");
        return;
      }

      btn.disabled = true;
      activeGenerations.add(replyBox);
      btn.textContent = "";
      btn.appendChild(createSpinner());

      try {
        const content = extractPostContent(replyBox);
        const reply = await generateReply(content, settings);
        insertReply(replyBox, reply);
      } catch (err) {
        console.error("[Dumly] Generation failed:", err);
        showError(btn, err.message.slice(0, 60));
      } finally {
        btn.disabled = false;
        activeGenerations.delete(replyBox);
        btn.textContent = "";
        btn.appendChild(createIconSvg());
        btn.title = "Generate AI reply";
      }
    });

    return btn;
  }

  function injectButton(editorContainer) {
    if (editorContainer.querySelector("[" + BUTTON_ATTR + "]")) return;

    const toolbarRow = editorContainer.closest('[data-testid="toolBar"]')
      || editorContainer.parentElement?.querySelector('[role="group"]');

    const btn = createDumlyButton(editorContainer);

    if (toolbarRow) {
      toolbarRow.prepend(btn);
    } else {
      const wrapper = editorContainer.closest('[data-testid="tweetTextarea_0_label"]')
        || editorContainer.parentElement;
      if (wrapper) {
        wrapper.style.position = "relative";
        btn.classList.add("dumly-generate-btn--floating");
        wrapper.appendChild(btn);
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

  const observer = new MutationObserver(() => {
    scanAndInject();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scanAndInject();

  console.log("[Dumly] Content script loaded");
})();
