(function () {
  const root = (typeof window !== "undefined") ? window
    : (typeof self !== "undefined") ? self
    : globalThis;
  root.Dumly = root.Dumly || {};

  const DAY = 24 * 60 * 60 * 1000;

  function recency(createdAt) {
    const ageDays = (Date.now() - createdAt) / DAY;
    return Math.pow(0.5, ageDays / 30);
  }

  function usageBoost(m) {
    return 1 + Math.min(Math.log1p(m.useCount || 1) * 0.12, 0.4);
  }

  function editBoost(m) { return m.wasEdited ? 1.15 : 1.0; }

  function keywordOverlap(textA, tokensB) {
    if (!tokensB?.length) return 0;
    const setA = new Set(root.Dumly.similarity.tokenize(textA));
    const setB = new Set(tokensB);
    let inter = 0;
    for (const t of setB) if (setA.has(t)) inter++;
    return inter / Math.max(1, setB.size);
  }

  function relevance(memory, ctx) {
    const combined = (memory.sourcePostText || '') + ' ' + (memory.finalUserText || '');
    const kw = keywordOverlap(combined, ctx.keywords || []);
    const authorMatch = !!ctx.sourcePostAuthorHandle
      && memory.sourcePostAuthorHandle === ctx.sourcePostAuthorHandle ? 1 : 0;
    const modeMatch = memory.mode === ctx.mode ? 1 : 0;
    return 0.45 * kw + 0.35 * 0 + 0.10 * authorMatch + 0.10 * modeMatch;
  }

  function score(memory, ctx) {
    return relevance(memory, ctx) * recency(memory.createdAt) * usageBoost(memory) * editBoost(memory);
  }

  async function loadCandidatePool(mode) {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * DAY;
    const recent = (await root.Dumly.db.getAll('acceptedMemories'))
      .filter((m) => m.createdAt > ninetyDaysAgo)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 200);
    const modeOnly = (await root.Dumly.db.getAllByIndex('acceptedMemories', 'mode', mode))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100);
    const byId = new Map();
    for (const m of recent) byId.set(m.id, m);
    for (const m of modeOnly) byId.set(m.id, m);
    return Array.from(byId.values());
  }

  async function selectCandidates({ ctx, mode, limit = 10, maxChars = 3500 }) {
    const pool = await loadCandidatePool(mode);
    if (!pool.length) return [];

    const scored = pool
      .map((memory) => ({ memory, score: score(memory, ctx) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const out = [];
    let chars = 0;
    for (const s of scored) {
      if (out.length >= limit) break;
      const len = (s.memory.sourcePostText?.length || 0) + (s.memory.finalUserText?.length || 0);
      if (chars + len > maxChars) break;
      out.push(s);
      chars += len;
    }
    return out;
  }

  root.Dumly.retrieval = { selectCandidates, score, recency, usageBoost, editBoost };
})();
