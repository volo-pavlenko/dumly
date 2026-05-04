(function () {
  'use strict';

  const BUTTON_ATTR = 'data-dumly-injected';
  const activeGenerations = new WeakSet();

  window.Dumly.settings.runMigrationV2().catch(() => {});

  (async function scheduleCleanup() {
    try {
      const local = await new Promise((r) => chrome.storage.local.get({ lastCleanupAt: 0 }, r));
      const ONE_DAY = 24 * 60 * 60 * 1000;
      if (Date.now() - (local.lastCleanupAt || 0) > ONE_DAY) {
        await window.Dumly.repo.runCleanup();
        await new Promise((r) => chrome.storage.local.set({ lastCleanupAt: Date.now() }, r));
      }
    } catch (e) {
      console.warn('[Dumly] cleanup failed:', e);
    }
  })();

  async function maybeCleanup() {
    try {
      const cnt = await window.Dumly.db.count('acceptedMemories');
      if (cnt > window.Dumly.repo.LIMITS.acceptedMax) {
        await window.Dumly.repo.runCleanup();
        await new Promise((r) => chrome.storage.local.set({ lastCleanupAt: Date.now() }, r));
      }
    } catch {}
  }

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

  function createSparkleSvg() {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'dumly-generate-btn-sparkle');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z');
    const dot1 = document.createElementNS(SVG_NS, 'circle');
    dot1.setAttribute('cx', '19'); dot1.setAttribute('cy', '5'); dot1.setAttribute('r', '1');
    const dot2 = document.createElementNS(SVG_NS, 'circle');
    dot2.setAttribute('cx', '5'); dot2.setAttribute('cy', '19'); dot2.setAttribute('r', '1');
    svg.append(path, dot1, dot2);
    return svg;
  }

  async function openCardForEditor(editorContainer, anchorBtn) {
    if (window.Dumly.card.isMounted()) window.Dumly.card.unmount();

    const ctx = window.Dumly.scraping.buildExtractedContext(editorContainer);
    if (!ctx) {
      showError(anchorBtn, 'Could not extract post content');
      return;
    }

    const key = window.Dumly.session.sourceKey(ctx);
    const session = await window.Dumly.session.getOrCreate(key, ctx.mode, ctx);

    let currentCandidate = null;
    let cardHandle = null;

    function emptyProfile() {
      return { bio: '', tone: '', preferredAngles: [], avoidPatterns: [] };
    }

    function hasProfileContent(p) {
      if (!p) return false;
      return !!(p.bio || p.tone || p.preferredAngles?.length || p.avoidPatterns?.length);
    }

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

        const memories = await window.Dumly.retrieval.selectCandidates({
          ctx, mode: session.mode, limit: 10, maxChars: 3500,
        });
        const negatives = await window.Dumly.repo.listActiveNegatives(session.mode, 20);

        const messages = window.Dumly.prompt.buildGeneration({
          mode: session.mode,
          source: ctx,
          tone,
          profile: useProfile ? profile : emptyProfile(),
          memories,
          negatives,
          avoidList,
        });
        const text = await window.Dumly.openai.chat(messages, settings);
        const attempt = avoidList.length + 1;
        currentCandidate = await window.Dumly.repo.saveCandidate({
          sessionId: session.id, mode: session.mode,
          suggestionText: text, tone, attemptNumber: attempt, status: 'shown',
        });
        cardHandle.setSuggestion(text, currentCandidate.id);

        const repetitionFlagged = memories.some(({ memory }) =>
          window.Dumly.similarity.jaccardSimilarity(text, memory.finalUserText) >= 0.82
        );
        cardHandle.setUsing({
          profileActive: useProfile && hasProfileContent(profile),
          memoryCount: memories.length,
          repetitionFlagged,
        });
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
          cardHandle.setState('error', 'Set API key in extension settings');
          return;
        }
        const profile = await window.Dumly.settings.loadProfile();
        const useProfile = settings.memorySettings.useProfile !== false;
        const messages = window.Dumly.prompt.buildRewrite({
          currentSuggestionText: currentCandidate.suggestionText,
          targetTone,
          profile: useProfile ? profile : emptyProfile(),
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
        maybeCleanup();
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
      try {
        await navigator.clipboard.writeText(currentCandidate.suggestionText);
      } catch {}
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
        maybeCleanup();
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
      maybeCleanup();
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

    cardHandle = window.Dumly.card.mount(editorContainer, anchorBtn, { mode: session.mode }, {
      onUse: runUse,
      onRegenerate: () => runGenerate(currentCandidate?.tone || 'default', true),
      onTone: runRewrite,
      onCopy: runCopy,
      onSave: runSave,
      onReject: runReject,
      onClose: () => {},
      onOpenSettings: () => {
        try {
          window.open(chrome.runtime.getURL('popup.html'), '_blank');
        } catch {}
      },
    });

    runGenerate('default', false);
  }

  function createDumlyButton(replyBox) {
    const btn = document.createElement('button');
    btn.setAttribute(BUTTON_ATTR, 'true');
    btn.className = 'dumly-generate-btn';
    btn.title = 'Generate AI suggestion';
    btn.appendChild(document.createTextNode('Dumly'));
    btn.appendChild(createSparkleSvg());

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
