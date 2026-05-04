(function () {
  window.Dumly = window.Dumly || {};

  let mounted = null;

  function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
    return node;
  }

  function buildCardDom(mode) {
    const root = el('div', { className: 'dumly-card', attrs: { role: 'dialog' } });

    const header = el('div', { className: 'dumly-card-header' });
    const label = el('span', {
      className: 'dumly-card-label',
      text: mode === 'quote' ? 'Quote suggestion' : 'Reply suggestion',
    });
    const overflowBtn = el('button', {
      className: 'dumly-card-overflow',
      text: '...', attrs: { type: 'button', 'aria-label': 'More' },
    });
    const overflowMenu = el('div', { className: 'dumly-card-overflow-menu', attrs: { hidden: 'true' } });
    const copyBtn = el('button', { text: 'Copy text', attrs: { type: 'button', 'data-action': 'copy' } });
    const saveBtn = el('button', { text: 'Save to memory', attrs: { type: 'button', 'data-action': 'save' } });
    const rejectBtn = el('button', { text: "Don't suggest like this", attrs: { type: 'button', 'data-action': 'reject' } });
    overflowMenu.append(copyBtn, saveBtn, rejectBtn);
    header.append(label, overflowBtn, overflowMenu);

    const body = el('div', { className: 'dumly-card-body' });

    const toneRow = el('div', { className: 'dumly-card-tone' });
    toneRow.append(el('span', { text: 'Tone:' }));
    for (const t of ['safe', 'sharp', 'playful']) {
      toneRow.append(el('button', {
        text: t[0].toUpperCase() + t.slice(1),
        attrs: { type: 'button', 'data-tone': t },
      }));
    }

    const actions = el('div', { className: 'dumly-card-actions' });
    const useBtn = el('button', { className: 'dumly-card-use', text: 'Use this', attrs: { type: 'button' } });
    const regenBtn = el('button', { className: 'dumly-card-regenerate', text: 'New angle', attrs: { type: 'button' } });
    actions.append(useBtn, regenBtn);

    const footer = el('div', {
      className: 'dumly-card-footer',
      text: 'Learns only from responses you use, copy, or save.',
    });

    root.append(header, body, toneRow, actions, footer);
    return { root, body, label, overflowBtn, overflowMenu, useBtn, regenBtn, toneRow, footer };
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
    const { root, body, overflowBtn, overflowMenu, useBtn, regenBtn, toneRow } = dom;

    overflowBtn.addEventListener('click', (e) => {
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

    function position() {
      if (!document.contains(anchorBtn)) {
        unmount();
        return;
      }
      const rect = anchorBtn.getBoundingClientRect();
      const cardH = root.offsetHeight || 220;
      const cardW = 360;
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

    mounted = { root, body, onKey, onOutside, reposition, currentCandidateId: null };

    setState('loading');
    return {
      setState, setSuggestion, setFooterHint, unmount,
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

  function setFooterHint(text) {
    if (!mounted) return;
    const footer = mounted.root.querySelector('.dumly-card-footer');
    footer.textContent = text
      ? text + ' - Learns only from responses you use, copy, or save.'
      : 'Learns only from responses you use, copy, or save.';
  }

  window.Dumly.card = { mount, unmount, isMounted };
})();
