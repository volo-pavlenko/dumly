(function () {
  const root = (typeof window !== "undefined") ? window
    : (typeof self !== "undefined") ? self
    : globalThis;
  root.Dumly = root.Dumly || {};

  const DAY = 24 * 60 * 60 * 1000;
  const DEFAULT_POOL_LIMIT = 220;

  function keywordOverlap(textA, tokensB) {
    if (!tokensB?.length) return 0;
    const setA = new Set(root.Dumly.similarity.tokenize(textA));
    const setB = new Set(tokensB);
    let inter = 0;
    for (const t of setB) if (setA.has(t)) inter++;
    return inter / Math.max(1, setB.size);
  }

  function relevance(memory, ctx) {
    const combined = (memory.sourceSummary || memory.sourcePostText || '') + ' '
      + (memory.acceptedText || memory.finalUserText || '') + ' '
      + (memory.userAngle || '');
    const kw = keywordOverlap(combined, ctx.keywords || []);
    const ctxTopics = new Set(ctx.topicTags || ctx.keywords || []);
    const memTopics = new Set(memory.topicTags || []);
    let topicInter = 0;
    for (const t of ctxTopics) if (memTopics.has(t)) topicInter++;
    const topicOverlap = topicInter / Math.max(1, ctxTopics.size);
    const author = memory.sourceAuthorHandle || memory.sourcePostAuthorHandle;
    const authorMatch = !!ctx.sourcePostAuthorHandle && author === ctx.sourcePostAuthorHandle ? 1 : 0;
    const modeMatch = memory.mode === ctx.mode
      || (ctx.mode === 'reply' && memory.mode === 'comment')
      || (ctx.mode === 'comment' && memory.mode === 'reply') ? 1 : 0;
    return 0.25 * kw + 0.35 * topicOverlap + 0.20 * authorMatch + 0.20 * modeMatch;
  }

  function recencyWeight(memory) {
    if (memory.pinned) return 1.2;
    const ageDays = (Date.now() - (memory.createdAt || Date.now())) / DAY;
    const halfLife = memory.memoryKind === 'topic_angle' ? 45 : 90;
    return Math.exp(-ageDays / halfLife);
  }

  function helpfulness(memory) {
    const helpful = memory.helpfulCount || 0;
    const total = helpful + (memory.unhelpfulCount || 0);
    return total ? helpful / Math.max(1, total) : 0.5;
  }

  function score(memory, ctx) {
    const s = root.Dumly.scoring;
    const pinned = memory.pinned ? 1.6 : 1.0;
    const confidence = memory.confidence == null ? 0.5 : memory.confidence;
    const edited = (memory.edited || memory.wasEdited) ? 1.15 : 1.0;
    const useBoost = s.usageBoost(memory);
    const helpful = 0.85 + helpfulness(memory) * 0.3;
    return relevance(memory, ctx)
      * recencyWeight(memory)
      * useBoost
      * (0.75 + confidence * 0.5)
      * helpful
      * edited
      * pinned;
  }

  async function loadCandidatePool(ctx, mode, poolLimit = DEFAULT_POOL_LIMIT) {
    const topicTags = ctx.topicTags || ctx.keywords || [];
    const buckets = await Promise.all([
      root.Dumly.repo.getAcceptedMemoriesByAuthor({
        authorHandle: ctx.sourcePostAuthorHandle, mode, limit: 30,
      }),
      root.Dumly.repo.getRecentAcceptedMemories({ mode, limit: 80 }),
      root.Dumly.repo.getAcceptedMemoriesByTopicTags({ topicTags, mode, limit: 80 }),
      root.Dumly.repo.getPinnedAcceptedMemories({ mode, limit: 30 }),
      root.Dumly.repo.getRecentEditedAcceptedMemories({ mode, limit: 30 }),
      root.Dumly.repo.getHighHelpfulnessMemories({ mode, limit: 30 }),
    ]);
    const byId = new Map();
    for (const bucket of buckets) {
      for (const memory of bucket) {
        if (!byId.has(memory.id)) byId.set(memory.id, memory);
        if (byId.size >= poolLimit) return Array.from(byId.values());
      }
    }
    return Array.from(byId.values()).slice(0, poolLimit);
  }

  async function selectCandidates({ ctx, mode, limit = 4, maxChars = 1800, poolLimit = DEFAULT_POOL_LIMIT }) {
    const pool = await loadCandidatePool(ctx, mode, poolLimit);
    if (!pool.length) return [];

    const scored = pool
      .map((memory) => ({ memory, score: score(memory, ctx) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const out = [];
    let chars = 0;
    for (const s of scored) {
      if (out.length >= limit) break;
      const len = (s.memory.sourceSummary?.length || s.memory.sourcePostText?.length || 0)
        + (s.memory.acceptedText?.length || s.memory.finalUserText?.length || 0)
        + (s.memory.userAngle?.length || 0);
      if (chars + len > maxChars) break;
      out.push(s);
      chars += len;
    }
    return out;
  }

  root.Dumly.retrieval = { selectCandidates, score, loadCandidatePool };
})();
