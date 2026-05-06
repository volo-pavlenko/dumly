(function () {
  const PAGE_SIZE = 200;

  const state = {
    tab: 'accepted',
    accepted: { items: [], offset: 0, hasMore: false },
    negative: { items: [], offset: 0, hasMore: false },
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

  function memoryText(m) {
    return m.acceptedText || m.finalUserText || m.rejectedText || '';
  }

  function applySearch(list) {
    const { search } = state;
    let out = list.slice();
    if (search) {
      const needle = search.toLowerCase();
      out = out.filter((m) =>
        (m.sourceSummary || m.sourcePostText || '').toLowerCase().includes(needle)
        || memoryText(m).toLowerCase().includes(needle)
        || (m.topicTags || []).join(' ').toLowerCase().includes(needle)
      );
    }
    return out;
  }

  function renderAccepted() {
    const list = applySearch(state.accepted.items);
    acceptedPanel.replaceChildren();
    if (!list.length) {
      acceptedPanel.append(el('div', { className: 'empty', text: 'No accepted memories yet.' }));
      loadMore.hidden = !state.accepted.hasMore;
      return;
    }
    for (const m of list) acceptedPanel.append(renderAcceptedRow(m));
    loadMore.hidden = !state.accepted.hasMore;
  }

  function renderAcceptedRow(m) {
    const row = el('div', { className: 'mem-row' });
    const meta = el('div', { className: 'mem-meta' });
    if (m.pinned) meta.append(el('span', { className: 'pinned', text: 'star' }));
    const bits = [];
    if (m.sourceAuthorHandle || m.sourcePostAuthorHandle) bits.push(m.sourceAuthorHandle || m.sourcePostAuthorHandle);
    bits.push(m.mode);
    bits.push(fmtDate(m.createdAt));
    if (m.useCount > 1) bits.push('used ' + m.useCount + 'x');
    if (m.helpfulCount) bits.push('helpful ' + m.helpfulCount);
    if (m.confidence != null) bits.push('conf ' + Number(m.confidence).toFixed(2));
    meta.append(document.createTextNode(bits.join(' | ')));
    row.append(meta);
    row.append(el('div', { className: 'mem-source', text: m.sourceSummary || m.sourcePostText || '(no source)' }));
    row.append(el('div', { className: 'mem-user', text: m.acceptedText || m.finalUserText || '' }));
    if (m.topicTags?.length || m.styleTags?.length) {
      row.append(el('div', {
        className: 'mem-meta',
        text: [...(m.topicTags || []).slice(0, 5), ...(m.styleTags || []).slice(0, 5)].join(' | '),
      }));
    }

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
      state.accepted.items = state.accepted.items.filter((x) => x.id !== m.id);
      renderAccepted();
    });
    actions.append(pinBtn, delBtn);
    row.append(actions);
    return row;
  }

  function renderNegative() {
    const list = applySearch(state.negative.items);
    negativePanel.replaceChildren();
    if (!list.length) {
      negativePanel.append(el('div', { className: 'empty', text: 'No negative memories.' }));
      return;
    }
    for (const n of list) {
      const row = el('div', { className: 'mem-row' });
      const meta = el('div', { className: 'mem-meta',
        text: `${n.mode} | ${fmtDate(n.createdAt)} | scope: ${n.scope || 'topic'} | reason: ${n.reason || 'other'}` });
      row.append(meta);
      row.append(el('div', { className: 'mem-source', text: n.sourcePostText || '(no source)' }));
      row.append(el('div', { className: 'mem-rejected', text: n.rejectedText || '' }));
      const actions = el('div', { className: 'mem-actions' });
      const delBtn = el('button', { className: 'delete', text: 'Delete' });
      delBtn.addEventListener('click', async () => {
        await window.Dumly.db.del('negativeMemories', n.id);
        state.negative.items = state.negative.items.filter((x) => x.id !== n.id);
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
      loadCurrentTab(true);
    });
  });

  qs('#search').addEventListener('input', (e) => { state.search = e.target.value; render(); });
  qs('#mode-filter').addEventListener('change', (e) => { state.mode = e.target.value; loadCurrentTab(true); });
  qs('#sort').addEventListener('change', (e) => { state.sort = e.target.value; loadCurrentTab(true); });

  loadMore.addEventListener('click', () => {
    loadCurrentTab(false);
  });

  async function loadAccepted(reset) {
    if (reset) state.accepted = { items: [], offset: 0, hasMore: false };
    const page = await window.Dumly.repo.listAcceptedPage({
      offset: state.accepted.offset,
      pageSize: PAGE_SIZE,
      mode: state.mode || undefined,
      sort: state.sort,
    });
    state.accepted.items.push(...page.items);
    state.accepted.offset += page.items.length;
    state.accepted.hasMore = page.hasMore;
    renderAccepted();
  }

  async function loadNegative(reset) {
    if (reset) state.negative = { items: [], offset: 0, hasMore: false };
    const page = await window.Dumly.repo.listNegativePage({
      offset: state.negative.offset,
      pageSize: PAGE_SIZE,
      mode: state.mode || undefined,
      sort: state.sort,
    });
    state.negative.items.push(...page.items);
    state.negative.offset += page.items.length;
    state.negative.hasMore = page.hasMore;
    renderNegative();
  }

  function loadCurrentTab(reset) {
    if (state.tab === 'accepted') return loadAccepted(reset);
    return loadNegative(reset);
  }

  loadCurrentTab(true);
})();
