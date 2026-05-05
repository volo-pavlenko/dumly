(function () {
  window.Dumly = window.Dumly || {};

  let mounted = null;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
    return node;
  }

  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function sparkleIcon(className) {
    const svg = svgEl('svg', {
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    });
    if (className) svg.setAttribute('class', className);
    const path = svgEl('path', {
      d: 'M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z',
    });
    const dot1 = svgEl('circle', { cx: '19', cy: '5', r: '1' });
    const dot2 = svgEl('circle', { cx: '5', cy: '19', r: '1' });
    svg.append(path, dot1, dot2);
    return svg;
  }

  function iconFrom(paths, attrs = {}) {
    const svg = svgEl('svg', {
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      ...attrs,
    });
    for (const d of paths) {
      svg.append(svgEl('path', { d }));
    }
    return svg;
  }

  function checkIcon() { return iconFrom(['M20 6L9 17l-5-5']); }
  function regenerateIcon() {
    return iconFrom(['M21 12a9 9 0 11-3-6.7', 'M21 4v5h-5']);
  }
  function gearIcon() {
    return iconFrom([
      'M12 15a3 3 0 100-6 3 3 0 000 6z',
      'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
    ]);
  }
  function closeIcon() { return iconFrom(['M18 6L6 18', 'M6 6l12 12']); }
  function personIcon() {
    return iconFrom(['M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z']);
  }
  function clockIcon() {
    return iconFrom(['M12 22a10 10 0 100-20 10 10 0 000 20z', 'M12 6v6l4 2']);
  }
  function shieldIcon() {
    return iconFrom(['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4']);
  }
  function lockIcon() {
    return iconFrom([
      'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z',
      'M7 11V7a5 5 0 0110 0v4',
    ]);
  }
  function dotsIcon() {
    return iconFrom([
      'M12 13a1 1 0 100-2 1 1 0 000 2z',
      'M19 13a1 1 0 100-2 1 1 0 000 2z',
      'M5 13a1 1 0 100-2 1 1 0 000 2z',
    ]);
  }

  function buildCardDom(mode) {
    const root = el('div', { className: 'dumly-card', attrs: { role: 'dialog' } });

    // Header: brand + memory status + settings + close
    const header = el('div', { className: 'dumly-card-header' });
    const brand = el('div', { className: 'dumly-card-brand' });
    brand.append(document.createTextNode('Dumly'));
    brand.append(sparkleIcon('dumly-card-brand-sparkle'));
    const memStatus = el('div', { className: 'dumly-card-memory-status' });
    const memDot = el('span', { className: 'dumly-card-memory-dot is-on' });
    memStatus.append(memDot, document.createTextNode('using memory'));
    const spacer = el('div', { className: 'dumly-card-header-spacer' });
    const settingsBtn = el('button', {
      className: 'dumly-card-icon-btn',
      attrs: { type: 'button', 'aria-label': 'Settings' },
    });
    settingsBtn.append(gearIcon());
    const closeBtn = el('button', {
      className: 'dumly-card-icon-btn',
      attrs: { type: 'button', 'aria-label': 'Close' },
    });
    closeBtn.append(closeIcon());

    const overflowMenu = el('div', {
      className: 'dumly-card-overflow-menu',
      attrs: { hidden: 'true' },
    });
    const copyBtn = el('button', { text: 'Copy text', attrs: { type: 'button', 'data-action': 'copy' } });
    const saveBtn = el('button', { text: 'Save to memory', attrs: { type: 'button', 'data-action': 'save' } });
    const rejectBtn = el('button', { text: "Don't suggest like this", attrs: { type: 'button', 'data-action': 'reject' } });
    overflowMenu.append(copyBtn, saveBtn, rejectBtn);

    header.append(brand, memStatus, spacer, settingsBtn, closeBtn, overflowMenu);

    // Subheader: mode label
    const subheader = el('div', {
      className: 'dumly-card-subheader',
      text: mode === 'quote' ? 'Quote suggestion' : 'Reply suggestion',
    });

    // Body: suggestion text
    const bodyWrap = el('div', { className: 'dumly-card-body-wrap' });
    const body = el('div', { className: 'dumly-card-body' });
    bodyWrap.append(body);

    // Primary actions: Use this / Regenerate / ⋯
    const actions = el('div', { className: 'dumly-card-actions' });
    const useBtn = el('button', { className: 'dumly-card-use', attrs: { type: 'button' } });
    useBtn.append(checkIcon(), document.createTextNode('Use this'));
    const regenBtn = el('button', { className: 'dumly-card-regenerate', attrs: { type: 'button' } });
    regenBtn.append(regenerateIcon(), document.createTextNode('Regenerate'));
    const overflowTrigger = el('button', {
      className: 'dumly-card-overflow-trigger',
      attrs: { type: 'button', 'aria-label': 'More' },
    });
    overflowTrigger.append(dotsIcon());
    actions.append(useBtn, regenBtn, overflowTrigger);

    // Tone row
    const toneBlock = el('div', { className: 'dumly-card-tone' });
    toneBlock.append(el('div', { className: 'dumly-card-tone-label', text: 'Tone:' }));
    const toneRow = el('div', { className: 'dumly-card-tone-row' });
    const tones = [
      { key: 'safe', emoji: '😊', label: 'Safe' },
      { key: 'sharp', emoji: '⚡', label: 'Sharp' },
      { key: 'playful', emoji: '🎉', label: 'Playful' },
      { key: 'joke', emoji: '😂', label: 'Joke' },
    ];
    for (const t of tones) {
      const btn = el('button', {
        attrs: { type: 'button', 'data-tone': t.key },
      });
      btn.append(document.createTextNode(t.emoji + ' ' + t.label));
      toneRow.append(btn);
    }
    toneBlock.append(toneRow);

    // Using row (context pills)
    const usingBlock = el('div', { className: 'dumly-card-using' });
    usingBlock.append(el('div', { className: 'dumly-card-using-label', text: 'Using:' }));
    const usingRow = el('div', { className: 'dumly-card-using-row' });
    usingBlock.append(usingRow);

    // Footer with lock icon
    const footer = el('div', { className: 'dumly-card-footer' });
    footer.append(lockIcon(), document.createTextNode('Learns only from responses you use, copy, or save.'));

    root.append(header, subheader, bodyWrap, actions, toneBlock, usingBlock, footer);
    return {
      root, body, overflowMenu, overflowTrigger,
      useBtn, regenBtn, toneRow, usingRow, footer,
      settingsBtn, closeBtn,
    };
  }

  function buildUsingPill(label, icon, variant) {
    const pill = el('div', { className: 'dumly-card-using-pill' + (variant ? ' ' + variant : '') });
    pill.append(icon, document.createTextNode(label));
    return pill;
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
    const {
      root, overflowMenu, overflowTrigger, useBtn, regenBtn,
      toneRow, settingsBtn, closeBtn,
    } = dom;

    overflowTrigger.addEventListener('click', (e) => {
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
        if (btn.classList.contains('is-active')) return;
        toneRow.querySelectorAll('[data-tone]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        handlers.onTone(btn.getAttribute('data-tone'));
      });
    });

    useBtn.addEventListener('click', () => handlers.onUse());
    regenBtn.addEventListener('click', () => handlers.onRegenerate());

    settingsBtn.addEventListener('click', () => {
      if (handlers.onOpenSettings) handlers.onOpenSettings();
    });
    closeBtn.addEventListener('click', () => {
      handlers.onClose?.();
      unmount();
    });

    function position() {
      if (!document.contains(anchorBtn)) {
        unmount();
        return;
      }
      const rect = anchorBtn.getBoundingClientRect();
      const cardH = root.offsetHeight || 440;
      const cardW = 380;
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
      if (!root.contains(e.target) && !anchorBtn.contains(e.target)) {
        handlers.onClose?.(); unmount();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onOutside, true);

    mounted = { root, body: dom.body, onKey, onOutside, reposition, currentCandidateId: null };

    setState('loading');
    return {
      setState, setSuggestion, setUsing, unmount,
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

  function setUsing({ profileActive, memoryCount, repetitionFlagged }) {
    if (!mounted) return;
    const row = mounted.root.querySelector('.dumly-card-using-row');
    if (!row) return;
    row.replaceChildren();
    if (profileActive) {
      row.append(buildUsingPill('Your profile', personIcon()));
    }
    if (memoryCount > 0) {
      const label = memoryCount === 1 ? '1 recent reply' : memoryCount + ' recent replies';
      row.append(buildUsingPill(label, clockIcon()));
    }
    row.append(buildUsingPill(
      repetitionFlagged ? 'Similar reply found' : 'Repetition check',
      shieldIcon(),
      'is-check'
    ));
  }

  window.Dumly.card = { mount, unmount, isMounted };
})();
