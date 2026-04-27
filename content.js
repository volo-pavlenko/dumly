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

  function createDumlyButton(replyBox) {
    const btn = document.createElement("button");
    btn.setAttribute(BUTTON_ATTR, "true");
    btn.className = "dumly-generate-btn";
    btn.title = "Generate AI reply";
    btn.appendChild(createIconSvg());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const content = extractPostContent(replyBox);
      console.log("[Dumly] Extracted post content:", content);
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
