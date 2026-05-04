(function () {
  window.Dumly = window.Dumly || {};

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

  function extractPostContent(editorElement) {
    const myHandle = getLoggedInHandle();
    const allArticles = Array.from(document.querySelectorAll("article"));

    if (allArticles.length === 0) {
      return { thread: [], myHandle };
    }

    const editorRect = editorElement.getBoundingClientRect();
    const threadArticles = allArticles.filter((a) => {
      return a.getBoundingClientRect().bottom <= editorRect.top + 10;
    });

    const relevant = threadArticles.slice(-5);

    if (relevant.length === 0) {
      relevant.push(allArticles[0]);
    }

    const thread = relevant.map((article) => extractArticleContent(article));

    return { thread, myHandle };
  }

  function buildExtractedContext(editorContainer) {
    const mode = isQuoteCompose(editorContainer) ? 'quote' : 'reply';
    if (mode === 'quote') {
      const q = extractQuoteContent(editorContainer);
      if (!q) return null;
      return {
        mode,
        sourcePostText: q.text || '',
        sourcePostAuthorHandle: q.author || '',
        sourcePostUrl: null,
        sourcePostId: null,
        images: q.images || [],
        nestedQuoteText: q.nestedQuoteText || '',
        keywords: window.Dumly.similarity.tokenize(q.text || ''),
      };
    }
    const r = extractPostContent(editorContainer);
    const last = (r.thread && r.thread.length) ? r.thread[r.thread.length - 1] : null;
    return {
      mode,
      sourcePostText: last ? last.text || '' : '',
      sourcePostAuthorHandle: last ? last.author || '' : '',
      sourcePostUrl: null,
      sourcePostId: null,
      thread: r.thread,
      myHandle: r.myHandle,
      keywords: window.Dumly.similarity.tokenize(last ? last.text || '' : ''),
    };
  }

  window.Dumly.scraping = {
    getLoggedInHandle,
    extractArticleContent,
    isQuoteCompose,
    extractQuoteContent,
    extractPostContent,
    buildExtractedContext,
  };
})();
