(function () {
  const PAGE_SIZE = 200;

  const state = {
    tab: 'accepted',
    accepted: { all: [], rendered: 0 },
    negative: { all: [], rendered: 0 },
    search: '',
    mode: '',
    sort: 'newest',
  };

  const qs = (s) => document.querySelector(s);
  const acceptedPanel = qs('[data-panel="accepted"]');
  const negativePanel = qs('[data-panel="negative"]');
  const loadMore = qs('#load-more');

  function el(tag, opts = {}) {
    const n = document.createElement(tag);
    if (opts.className) n.className = opts.className;
    if (opts.text) n.textContent = opts.text;
    return n;
  }

  function fmtDate(ts) {
    const days = Math.floor((Date.now() - ts) / 86400000);
    if (days < 1) return 'today';
    if (days < 2) return 'yesterday';
    if (days < 30) return days + ' days ago';
    const months = Math.floor(days / 30);
    return months + ' months ago';
  }

  function applyFilters(list, kind) {
    const { search, mode, sort } = state;
    let out = list.slice();
    if (mode) out = out.filter((m) => m.mode === mode);
    if (search) {
      const needle = search.toLowerCase();
      out = out.filter((m) =>
        (m.sourcePostText || '').toLowerCase().includes(needle)
        || (m.finalUserText || m.rejectedText || '').toLowerCase().includes(needle)
      );
    }
    if (sort === 'newest') out.sort((a, b) => b.createdAt - a.createdAt);
    else if (sort === 'oldest') out.sort((a, b) => a.createdAt - b.createdAt);
    else if (sort === 'most-used' && kind === 'accepted') {
      out.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
    }
    return out;
  }

  function renderAccepted() {
    const list = applyFilters(state.accepted.all, 'accepted');
    acceptedPanel.replaceChildren();
    if (!list.length) {
      acceptedPanel.append(el('div', { className: 'empty', text: 'No accepted memories yet.' }));
      loadMore.hidden = true;
      return;
    }
    const visible = list.slice(0, state.accepted.rendered || PAGE_SIZE);
    for (const m of visible) acceptedPanel.append(renderAcceptedRow(m));
    state.accepted.rendered = visible.length;
    loadMore.hidden = visible.length >= list.length;
  }

  function renderAcceptedRow(m) {
    const row = el('div', { className: 'mem-row' });
    const meta = el('div', { className: 'mem-meta' });
    if (m.pinned) meta.append(el('span', { className: 'pinned', text: 'star' }));
    const bits = [];
    if (m.sourcePostAuthorHandle) bits.push(m.sourcePostAuthorHandle);
    bits.push(m.mode);
    bits.push(fmtDate(m.createdAt));
    if (m.useCount > 1) bits.push('used ' + m.useCount + 'x');
    meta.append(document.createTextNode(bits.join(' | ')));
    row.append(meta);
    row.append(el('div', { className: 'mem-source', text: m.sourcePostText || '(no source)' }));
    row.append(el('div', { className: 'mem-user', text: m.finalUserText || '' }));

    const actions = el('div', { className: 'mem-actions' });
    const pinBtn = el('button', { text: m.pinned ? 'Unpin' : 'Pin' });
    pinBtn.addEventListener('click', async () => {
      m.pinned = !m.pinned;
      await window.Dumly.db.put('acceptedMemories', m);
      renderAccepted();
    });
    const delBtn = el('button', { className: 'delete', text: 'Delete' });
    delBtn.addEventListener('click', async () => {
      await window.Dumly.db.del('acceptedMemories', m.id);
      state.accepted.all = state.accepted.all.filter((x) => x.id !== m.id);
      renderAccepted();
    });
    actions.append(pinBtn, delBtn);
    row.append(actions);
    return row;
  }

  function renderNegative() {
    const list = applyFilters(state.negative.all, 'negative');
    negativePanel.replaceChildren();
    if (!list.length) {
      negativePanel.append(el('div', { className: 'empty', text: 'No negative memories.' }));
      return;
    }
    for (const n of list) {
      const row = el('div', { className: 'mem-row' });
      const meta = el('div', { className: 'mem-meta',
        text: `${n.mode} | ${fmtDate(n.createdAt)} | reason: ${n.reason || 'other'}` });
      row.append(meta);
      row.append(el('div', { className: 'mem-source', text: n.sourcePostText || '(no source)' }));
      row.append(el('div', { className: 'mem-rejected', text: n.rejectedText || '' }));
      const actions = el('div', { className: 'mem-actions' });
      const delBtn = el('button', { className: 'delete', text: 'Delete' });
      delBtn.addEventListener('click', async () => {
        await window.Dumly.db.del('negativeMemories', n.id);
        state.negative.all = state.negative.all.filter((x) => x.id !== n.id);
        renderNegative();
      });
      actions.append(delBtn);
      row.append(actions);
      negativePanel.append(row);
    }
  }

  function render() {
    if (state.tab === 'accepted') renderAccepted();
    else renderNegative();
  }

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.tab = btn.getAttribute('data-tab');
      acceptedPanel.hidden = state.tab !== 'accepted';
      negativePanel.hidden = state.tab !== 'negative';
      loadMore.hidden = state.tab !== 'accepted';
      render();
    });
  });

  qs('#search').addEventListener('input', (e) => { state.search = e.target.value; render(); });
  qs('#mode-filter').addEventListener('change', (e) => { state.mode = e.target.value; render(); });
  qs('#sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

  loadMore.addEventListener('click', () => {
    state.accepted.rendered += PAGE_SIZE;
    renderAccepted();
  });

  (async () => {
    state.accepted.all = await window.Dumly.db.getAll('acceptedMemories');
    state.negative.all = await window.Dumly.db.getAll('negativeMemories');
    state.accepted.rendered = PAGE_SIZE;
    render();
  })();
})();
