(function () {
  const root = (typeof window !== 'undefined') ? window
    : (typeof self !== 'undefined') ? self
    : globalThis;
  root.Dumly = root.Dumly || {};

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  const LIMITS = {
    acceptedMax: 1000,
    acceptedTargetAfterCleanup: 700,
    negativeMax: 200,
    suggestionCandidateRetentionHours: 24,
    negativeMemoryTTLDays: 30,
    sessionTTLHours: 24,
    insertionRecordTTLDays: 7,
    maxSourcePostChars: 1000,
    maxFinalUserTextChars: 500,
    maxOriginalSuggestionChars: 500,
    maxRejectedTextChars: 500,
    maxPromptMemories: 10,
    maxPromptMemoryChars: 3500,
  };

  const ACCEPTANCE_STRENGTH = {
    posted_after_insert: 1.4,
    use_this: 1.2,
    manual_save: 1.1,
    copy: 1.0,
  };

  function rank(via) { return ACCEPTANCE_STRENGTH[via] ?? 0; }
  function truncate(s, n) { return String(s || '').slice(0, n); }
  function uuid() { return crypto.randomUUID(); }
  function uniq(list) { return Array.from(new Set((list || []).filter(Boolean))); }
  function modeAliases(mode) {
    if (mode === 'comment' || mode === 'reply') return ['reply', 'comment'];
    return [mode || 'reply'];
  }
  function normalizeText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function hashText(text) {
    const str = normalizeText(text);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }
  function getSourceText(m) { return m.sourcePostText || m.sourceText || ''; }
  function getAcceptedText(m) { return m.acceptedText || m.finalUserText || ''; }
  function getGeneratedText(m) { return m.generatedText || m.originalSuggestionText || ''; }
  function getAuthorHandle(m) { return m.sourceAuthorHandle || m.sourcePostAuthorHandle || ''; }
  function boolEdited(m) { return !!(m.edited || m.wasEdited); }
  function helpfulness(m) {
    const helpful = m.helpfulCount || 0;
    const total = helpful + (m.unhelpfulCount || 0);
    return total ? helpful / total : 0.5;
  }
  function mergeTags(a, b, max = 12) { return uniq([...(a || []), ...(b || [])]).slice(0, max); }
  function compact(text, n) {
    return truncate(String(text || '').replace(/\s+/g, ' ').trim(), n);
  }
  function deriveStyleTags(text) {
    const t = String(text || '').trim();
    const lower = t.toLowerCase();
    const tags = [];
    if (t.length <= 120) tags.push('short');
    if (t && t === lower) tags.push('lowercase');
    if (/\?$/.test(t)) tags.push('question');
    if (/\b(i think|i'd|i would|should|must|needs?|better|worse|wrong|right)\b/i.test(t)) tags.push('opinionated');
    if (/\b(lol|funny|joke|wild|absurd|ridiculous)\b/i.test(t)) tags.push('playful');
    if (/\b(build|ship|product|users?|practical|actually|works?)\b/i.test(t)) tags.push('practical');
    if (/\b(ship|build|builder|prototype|distribution|launch)\b/i.test(t)) tags.push('builder_tone');
    if (/\b(really|sure|maybe|doubt|skeptical|unless|but)\b/i.test(t)) tags.push('skeptical');
    return uniq(tags);
  }
  function buildMemoryMetadata(input) {
    const sourceText = input.sourcePostText || input.sourcePost || '';
    const acceptedText = input.acceptedText || input.finalUserText || input.generatedText || '';
    const keywords = input.keywords || root.Dumly.similarity?.tokenize?.(sourceText) || [];
    const topicTags = uniq([...(input.topicTags || []), ...keywords])
      .map((t) => normalizeText(t).replace(/\s+/g, '_'))
      .filter((t) => t.length >= 3)
      .slice(0, 8);
    const styleTags = mergeTags(input.styleTags || input.toneTags, deriveStyleTags(acceptedText), 10);
    const userAngle = compact(acceptedText, 140);
    const memoryKind = input.memoryKind
      || (boolEdited(input) ? 'style' : topicTags.length ? 'topic_angle' : 'example');
    return {
      sourceSummary: compact(sourceText, 180),
      userAngle,
      topicTags,
      styleTags,
      memoryKind,
      sourceTextHash: input.sourceTextHash || hashText(sourceText),
      normalizedAcceptedText: normalizeText(acceptedText),
    };
  }
  function normalizeAcceptedRecord(rec) {
    const meta = buildMemoryMetadata({
      ...rec,
      sourcePostText: getSourceText(rec),
      acceptedText: getAcceptedText(rec),
      generatedText: getGeneratedText(rec),
    });
    const sourceAuthorHandle = getAuthorHandle(rec);
    return {
      ...rec,
      mode: rec.mode || 'reply',
      sourceAuthor: rec.sourceAuthor || rec.sourcePostAuthor || '',
      sourceAuthorHandle,
      sourcePostAuthorHandle: rec.sourcePostAuthorHandle || sourceAuthorHandle,
      sourceTextHash: rec.sourceTextHash || meta.sourceTextHash,
      sourceSummary: rec.sourceSummary || meta.sourceSummary,
      acceptedText: rec.acceptedText || rec.finalUserText || '',
      generatedText: rec.generatedText || rec.originalSuggestionText || '',
      finalUserText: rec.finalUserText || rec.acceptedText || '',
      originalSuggestionText: rec.originalSuggestionText || rec.generatedText || '',
      userAngle: rec.userAngle || meta.userAngle,
      topicTags: rec.topicTags || [],
      styleTags: rec.styleTags || rec.toneTags || [],
      memoryKind: rec.memoryKind || 'example',
      updatedAt: rec.updatedAt || rec.createdAt || Date.now(),
      lastUsedAt: rec.lastUsedAt || rec.createdAt || Date.now(),
      useCount: rec.useCount || 0,
      confidence: rec.confidence == null ? 0.5 : rec.confidence,
      helpfulCount: rec.helpfulCount || 0,
      unhelpfulCount: rec.unhelpfulCount || 0,
      edited: !!(rec.edited || rec.wasEdited),
      wasEdited: !!(rec.wasEdited || rec.edited),
      editDistance: rec.editDistance || 0,
      pinned: !!rec.pinned,
      distilledIntoTraitIds: rec.distilledIntoTraitIds || [],
      normalizedAcceptedText: rec.normalizedAcceptedText || meta.normalizedAcceptedText,
    };
  }
  function normalizeNegativeRecord(rec) {
    const sourceText = rec.sourcePostText || rec.sourceText || '';
    const sourceAuthorHandle = rec.sourceAuthorHandle || rec.sourcePostAuthorHandle || '';
    return {
      ...rec,
      mode: rec.mode || 'reply',
      sourceAuthor: rec.sourceAuthor || '',
      sourceAuthorHandle,
      sourcePostAuthorHandle: rec.sourcePostAuthorHandle || sourceAuthorHandle,
      sourceTextHash: rec.sourceTextHash || hashText(sourceText),
      reason: rec.reason || 'other',
      scope: rec.scope || 'topic',
      topicTags: rec.topicTags || [],
      styleTags: rec.styleTags || [],
      confidence: rec.confidence == null ? 0.5 : rec.confidence,
    };
  }
  function angleSummary(text, topicTags) {
    const base = compact(text, 120);
    const tags = (topicTags || []).slice(0, 3);
    return tags.length ? `${base} [${tags.join(', ')}]` : base;
  }
  async function collectByIndex(storeName, indexName, query, { direction = 'prev', limit = 50, filter } = {}) {
    const db = await root.Dumly.db.open();
    return new Promise((resolve, reject) => {
      const out = [];
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const req = query == null
        ? index.openCursor(undefined, direction)
        : index.openCursor(query, direction);
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor || out.length >= limit) {
          resolve(out);
          return;
        }
        const value = cursor.value;
        if (!filter || filter(value)) out.push(value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }
  async function deleteWhereByIndex(storeName, indexName, filter) {
    const db = await root.Dumly.db.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).index(indexName).openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return;
        if (filter(cursor.value)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }
  function modeMatches(rec, mode) { return modeAliases(mode).includes(rec.mode); }

  async function saveCandidate(input) {
    const now = Date.now();
    const topicTags = input.topicTags || [];
    const text = input.text || input.suggestionText || '';
    const rec = {
      id: uuid(),
      sessionId: input.sessionId,
      mode: input.mode,
      text: truncate(text, 2000),
      suggestionText: truncate(text, 2000),
      angleSummary: input.angleSummary || angleSummary(text, topicTags),
      structure: input.structure || '',
      tone: input.tone,
      attemptNumber: input.attemptNumber,
      status: input.status,
      memoryIdsUsed: input.memoryIdsUsed || [],
      negativeMemoryIdsUsed: input.negativeMemoryIdsUsed || [],
      accepted: !!input.accepted,
      rejected: !!input.rejected,
      sourceTextHash: input.sourceTextHash,
      createdAt: now,
      expiresAt: now + LIMITS.suggestionCandidateRetentionHours * HOUR,
    };
    await root.Dumly.db.put('suggestionCandidates', rec);
    return rec;
  }

  async function markCandidate(id, status) {
    const rec = await root.Dumly.db.get('suggestionCandidates', id);
    if (!rec) return;
    rec.status = status;
    if (status === 'used' || status === 'copied') rec.accepted = true;
    if (status === 'rejected') rec.rejected = true;
    await root.Dumly.db.put('suggestionCandidates', rec);
  }

  async function findDuplicate(input, meta) {
    if (input.candidateId) {
      const byCandidate = await root.Dumly.db.getAllByIndex('acceptedMemories', 'candidateId', input.candidateId, 1);
      if (byCandidate.length) return byCandidate[0];
    }
    if (meta.normalizedAcceptedText) {
      const exact = await root.Dumly.db.getAllByIndex(
        'acceptedMemories', 'normalizedAcceptedText', meta.normalizedAcceptedText, 1
      );
      if (exact.length) return exact[0];
    }
    if (meta.sourceTextHash) {
      const sameSource = await root.Dumly.db.getAllByIndex('acceptedMemories', 'sourceTextHash', meta.sourceTextHash, 25);
      const hit = sameSource.find((m) => {
        const old = normalizeText(getAcceptedText(m));
        return old === meta.normalizedAcceptedText
          || root.Dumly.similarity?.jaccardSimilarity?.(old, meta.normalizedAcceptedText) >= 0.85;
      });
      if (hit) return hit;
    }
    if (meta.userAngle && meta.topicTags.length) {
      const topicMatches = await root.Dumly.db.getAllByIndex('acceptedMemories', 'topicTags', meta.topicTags[0], 25);
      const inputTopics = new Set(meta.topicTags);
      const hit = topicMatches.find((m) => {
        const topics = new Set(m.topicTags || []);
        let overlap = 0;
        for (const t of inputTopics) if (topics.has(t)) overlap++;
        return modeMatches(m, input.mode) && (m.userAngle || '') === meta.userAngle && overlap > 0;
      });
      if (hit) return hit;
    }
    return null;
  }

  async function bumpAcceptedMemory(id, { helpful = 0, unhelpful = 0, use = 0 } = {}) {
    const rec = await root.Dumly.db.get('acceptedMemories', id);
    if (!rec) return;
    const next = normalizeAcceptedRecord(rec);
    next.helpfulCount += helpful;
    next.unhelpfulCount += unhelpful;
    next.useCount += use;
    if (use || helpful) next.lastUsedAt = Date.now();
    if (helpful) next.confidence = Math.min(1, (next.confidence || 0.5) + 0.03);
    if (unhelpful) next.confidence = Math.max(0.1, (next.confidence || 0.5) - 0.01);
    next.updatedAt = Date.now();
    await root.Dumly.db.put('acceptedMemories', next);
    return next;
  }

  async function markMemoriesHelpful(ids) {
    for (const id of uniq(ids)) await bumpAcceptedMemory(id, { helpful: 1, use: 1 });
  }

  async function markMemoriesUnhelpful(ids) {
    for (const id of uniq(ids)) await bumpAcceptedMemory(id, { unhelpful: 1 });
  }

  async function saveAccepted(input) {
    const now = Date.now();
    const meta = buildMemoryMetadata({
      ...input,
      sourcePostText: input.sourcePostText,
      acceptedText: input.acceptedText || input.finalUserText,
      generatedText: input.generatedText || input.originalSuggestionText,
      edited: input.edited || input.wasEdited,
      keywords: input.keywords,
    });
    const duplicateBeforeTx = await findDuplicate(input, meta);

    return root.Dumly.db.runInTx('acceptedMemories', 'readwrite', async (store) => {
      function req(r) {
        return new Promise((resolve, reject) => {
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      }

      let existingList = [];
      if (input.candidateId) existingList = await req(store.index('candidateId').getAll(input.candidateId, 1));
      let duplicate = existingList[0] || duplicateBeforeTx;

      if (duplicate) {
        const rec = normalizeAcceptedRecord(duplicate);
        if (rank(input.acceptedVia) > rank(rec.acceptedVia)) {
          rec.acceptedVia = input.acceptedVia;
        }
        rec.useCount = (rec.useCount || 1) + 1;
        rec.lastUsedAt = now;
        rec.updatedAt = now;
        rec.confidence = Math.min(1, (rec.confidence || 0.5) + 0.03);
        rec.topicTags = mergeTags(rec.topicTags, meta.topicTags);
        rec.styleTags = mergeTags(rec.styleTags, meta.styleTags);
        rec.toneTags = mergeTags(rec.toneTags, input.toneTags || []);
        if (input.wasEdited) rec.wasEdited = true;
        if (input.edited) rec.edited = true;
        if (input.finalUserText) {
          rec.finalUserText = truncate(input.finalUserText, LIMITS.maxFinalUserTextChars);
          rec.acceptedText = rec.finalUserText;
        }
        await req(store.put(rec));
        return rec;
      }

      const rec = {
        id: uuid(),
        platform: 'x',
        mode: input.mode,
        candidateId: input.candidateId,
        sessionId: input.sessionId,
        sourcePostId: input.sourcePostId,
        sourcePostText: truncate(input.sourcePostText, LIMITS.maxSourcePostChars),
        sourceAuthor: input.sourceAuthor || '',
        sourceAuthorHandle: input.sourceAuthorHandle || input.sourcePostAuthorHandle,
        sourcePostAuthorHandle: input.sourcePostAuthorHandle,
        sourcePostUrl: input.sourcePostUrl,
        sourceTextHash: meta.sourceTextHash,
        sourceSummary: meta.sourceSummary,
        originalSuggestionText: truncate(input.originalSuggestionText, LIMITS.maxOriginalSuggestionChars),
        generatedText: truncate(input.generatedText || input.originalSuggestionText, LIMITS.maxOriginalSuggestionChars),
        finalUserText: truncate(input.finalUserText, LIMITS.maxFinalUserTextChars),
        acceptedText: truncate(input.acceptedText || input.finalUserText, LIMITS.maxFinalUserTextChars),
        acceptedVia: input.acceptedVia,
        wasEdited: !!input.wasEdited,
        edited: !!(input.edited || input.wasEdited),
        editDistance: input.editDistance || 0,
        userAngle: meta.userAngle,
        topicTags: meta.topicTags,
        styleTags: meta.styleTags,
        toneTags: input.toneTags || [],
        memoryKind: meta.memoryKind,
        normalizedAcceptedText: meta.normalizedAcceptedText,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
        useCount: input.useCount || 1,
        confidence: input.confidence == null ? 0.5 : input.confidence,
        helpfulCount: input.helpfulCount || 0,
        unhelpfulCount: input.unhelpfulCount || 0,
        pinned: false,
        distilledIntoTraitIds: [],
      };
      await req(store.put(rec));
      return rec;
    });
  }

  async function updateAccepted(id, patch) {
    const rec = await root.Dumly.db.get('acceptedMemories', id);
    if (!rec) return;
    if (patch.finalUserText != null) {
      rec.finalUserText = truncate(patch.finalUserText, LIMITS.maxFinalUserTextChars);
    }
    if (patch.wasEdited != null) rec.wasEdited = patch.wasEdited;
    if (patch.edited != null) rec.edited = patch.edited;
    if (patch.acceptedVia && rank(patch.acceptedVia) >= rank(rec.acceptedVia)) {
      rec.acceptedVia = patch.acceptedVia;
    }
    rec.updatedAt = Date.now();
    await root.Dumly.db.put('acceptedMemories', rec);
    return rec;
  }

  async function saveNegative(input) {
    const now = Date.now();
    const rec = {
      id: uuid(),
      platform: 'x',
      mode: input.mode,
      sourceAuthor: input.sourceAuthor || '',
      sourceAuthorHandle: input.sourceAuthorHandle || input.sourcePostAuthorHandle || '',
      sourceTextHash: input.sourceTextHash || hashText(input.sourcePostText),
      sourcePostText: truncate(input.sourcePostText, LIMITS.maxSourcePostChars),
      rejectedText: truncate(input.rejectedText, LIMITS.maxRejectedTextChars),
      reason: input.reason || 'other',
      scope: input.scope || 'topic',
      topicTags: input.topicTags || [],
      styleTags: input.styleTags || [],
      confidence: input.confidence == null ? 0.5 : input.confidence,
      createdAt: now,
      expiresAt: now + LIMITS.negativeMemoryTTLDays * DAY,
    };
    await root.Dumly.db.put('negativeMemories', rec);
    return rec;
  }

  async function saveInsertionRecord(input) {
    const rec = {
      id: uuid(),
      sessionId: input.sessionId,
      candidateId: input.candidateId,
      insertedText: input.insertedText,
      insertedAt: Date.now(),
    };
    await root.Dumly.db.put('insertionRecords', rec);
    return rec;
  }

  async function listActiveNegatives(mode, limit = 20) {
    const all = await getRecentNegativeMemories({ mode, limit });
    return all;
  }

  async function getRecentAcceptedMemories({ mode, limit = 80 } = {}) {
    const out = await collectByIndex('acceptedMemories', 'createdAt', null, {
      direction: 'prev', limit: limit * 4,
      filter: (m) => !mode || modeMatches(m, mode),
    });
    return out.slice(0, limit).map(normalizeAcceptedRecord);
  }

  async function getAcceptedMemoriesByAuthor({ authorHandle, mode, limit = 30 } = {}) {
    if (!authorHandle) return [];
    const modern = await collectByIndex('acceptedMemories', 'sourceAuthorHandle', authorHandle, {
      direction: 'prev', limit: limit * 3,
      filter: (m) => !mode || modeMatches(m, mode),
    });
    const legacy = await collectByIndex('acceptedMemories', 'sourcePostAuthorHandle', authorHandle, {
      direction: 'prev', limit: limit * 3,
      filter: (m) => !mode || modeMatches(m, mode),
    });
    const byId = new Map();
    for (const row of [...modern, ...legacy]) byId.set(row.id, normalizeAcceptedRecord(row));
    return Array.from(byId.values()).slice(0, limit);
  }

  async function getPinnedAcceptedMemories({ mode, limit = 30 } = {}) {
    const out = await collectByIndex('acceptedMemories', 'createdAt', null, {
      direction: 'prev', limit: limit * 20,
      filter: (m) => !!m.pinned && (!mode || modeMatches(m, mode)),
    });
    return out.slice(0, limit).map(normalizeAcceptedRecord);
  }

  async function getAcceptedMemoriesByTopicTags({ topicTags, mode, limit = 80 } = {}) {
    const byId = new Map();
    for (const tag of (topicTags || []).slice(0, 8)) {
      const rows = await collectByIndex('acceptedMemories', 'topicTags', tag, {
        direction: 'prev', limit: Math.ceil(limit / 2),
        filter: (m) => !mode || modeMatches(m, mode),
      });
      for (const row of rows) byId.set(row.id, normalizeAcceptedRecord(row));
      if (byId.size >= limit) break;
    }
    return Array.from(byId.values()).slice(0, limit);
  }

  async function getRecentEditedAcceptedMemories({ mode, limit = 30 } = {}) {
    const edited = await collectByIndex('acceptedMemories', 'lastUsedAt', null, {
      direction: 'prev', limit: limit * 20,
      filter: (m) => (m.edited || m.wasEdited) && (!mode || modeMatches(m, mode)),
    });
    const byId = new Map();
    for (const row of edited) byId.set(row.id, normalizeAcceptedRecord(row));
    return Array.from(byId.values())
      .sort((a, b) => (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt))
      .slice(0, limit);
  }

  async function getHighHelpfulnessMemories({ mode, limit = 30 } = {}) {
    const rows = await collectByIndex('acceptedMemories', 'useCount', null, {
      direction: 'prev', limit: limit * 5,
      filter: (m) => !mode || modeMatches(m, mode),
    });
    return rows.map(normalizeAcceptedRecord)
      .sort((a, b) =>
        ((b.helpfulCount || 0) + helpfulness(b) + (b.confidence || 0.5))
        - ((a.helpfulCount || 0) + helpfulness(a) + (a.confidence || 0.5)))
      .slice(0, limit);
  }

  async function getRecentNegativeMemories({ mode, topicTags, authorHandle, limit = 20 } = {}) {
    const now = Date.now();
    const topicSet = new Set(topicTags || []);
    const rows = await collectByIndex('negativeMemories', 'createdAt', null, {
      direction: 'prev', limit: limit * 6,
      filter: (n) => {
        if (n.expiresAt <= now) return false;
        if (mode && !modeMatches(n, mode)) return false;
        if (authorHandle && (n.scope === 'author' || n.sourceAuthorHandle) && getAuthorHandle(n) === authorHandle) return true;
        if (topicSet.size && (n.topicTags || []).some((t) => topicSet.has(t))) return true;
        return !topicSet.size && !authorHandle;
      },
    });
    return rows.slice(0, limit).map(normalizeNegativeRecord);
  }

  async function getSessionCandidates({ sessionId, limit = 30 } = {}) {
    if (!sessionId) return [];
    const rows = await collectByIndex('suggestionCandidates', 'sessionId', sessionId, {
      direction: 'prev', limit,
    });
    return rows
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, limit);
  }

  async function listAcceptedPage({ offset = 0, pageSize = 40, mode, pinned, topicTag, sort = 'newest' } = {}) {
    const limit = offset + pageSize;
    const filter = (m) => {
      if (mode && !modeMatches(m, mode)) return false;
      if (pinned != null && !!m.pinned !== !!pinned) return false;
      if (topicTag && !(m.topicTags || []).includes(topicTag)) return false;
      return true;
    };
    let indexName = 'createdAt';
    let direction = sort === 'oldest' ? 'next' : 'prev';
    if (sort === 'most-used') indexName = 'useCount';
    const rows = await collectByIndex('acceptedMemories', indexName, null, {
      direction, limit: limit + 1, filter,
    });
    return {
      items: rows.slice(offset, offset + pageSize).map(normalizeAcceptedRecord),
      hasMore: rows.length > limit,
    };
  }

  async function listNegativePage({ offset = 0, pageSize = 40, mode, topicTag, sort = 'newest' } = {}) {
    const limit = offset + pageSize;
    const filter = (n) => {
      if (mode && !modeMatches(n, mode)) return false;
      if (topicTag && !(n.topicTags || []).includes(topicTag)) return false;
      return true;
    };
    const rows = await collectByIndex('negativeMemories', 'createdAt', null, {
      direction: sort === 'oldest' ? 'next' : 'prev', limit: limit + 1, filter,
    });
    return {
      items: rows.slice(offset, offset + pageSize).map(normalizeNegativeRecord),
      hasMore: rows.length > limit,
    };
  }

  const DAY_MS = 24 * 60 * 60 * 1000;

  function retentionScore(m) {
    if (m.pinned) return Number.POSITIVE_INFINITY;
    const s = root.Dumly.scoring;
    const strength = ACCEPTANCE_STRENGTH[m.acceptedVia] ?? 1.0;
    const rareTopic = (m.topicTags || []).length ? 1.05 : 1.0;
    return s.recency(m.createdAt)
      * s.usageBoost(m)
      * strength
      * s.editBoost(m)
      * (m.confidence == null ? 0.5 : m.confidence)
      * (0.75 + helpfulness(m) * 0.5)
      * rareTopic;
  }

  async function runCleanup() {
    const now = Date.now();

    await deleteWhereByIndex('suggestionCandidates', 'expiresAt', (c) => c.expiresAt < now);
    await deleteWhereByIndex('negativeMemories', 'expiresAt', (n) => n.expiresAt < now);

    const sessionCutoff = now - LIMITS.sessionTTLHours * 60 * 60 * 1000;
    await deleteWhereByIndex('generationSessions', 'updatedAt', (s) => s.updatedAt < sessionCutoff);

    const insCutoff = now - LIMITS.insertionRecordTTLDays * DAY_MS;
    await deleteWhereByIndex('insertionRecords', 'insertedAt', (r) => r.insertedAt < insCutoff);

    const acceptedCount = await root.Dumly.db.count('acceptedMemories');
    const nonPinned = acceptedCount > LIMITS.acceptedMax
      ? await collectByIndex('acceptedMemories', 'createdAt', null, {
          direction: 'next',
          limit: acceptedCount,
          filter: (a) => !a.pinned,
        })
      : [];
    if (nonPinned.length > LIMITS.acceptedMax) {
      const needsGone = nonPinned.length - LIMITS.acceptedTargetAfterCleanup;
      const sorted = nonPinned
        .map((m) => ({ m, s: retentionScore(m) }))
        .sort((a, b) => a.s - b.s);
      for (let i = 0; i < needsGone; i++) {
        await root.Dumly.db.del('acceptedMemories', sorted[i].m.id);
      }
    }

    const negCount = await root.Dumly.db.count('negativeMemories');
    const negsAfter = negCount > LIMITS.negativeMax
      ? await collectByIndex('negativeMemories', 'createdAt', null, { direction: 'next', limit: negCount })
      : [];
    if (negsAfter.length > LIMITS.negativeMax) {
      const sortedNegs = [...negsAfter].sort((a, b) => a.createdAt - b.createdAt);
      const over = negsAfter.length - LIMITS.negativeMax;
      for (let i = 0; i < over; i++) {
        await root.Dumly.db.del('negativeMemories', sortedNegs[i].id);
      }
    }
  }

  async function clearAll() {
    const db = await root.Dumly.db.open();
    const names = ['acceptedMemories', 'negativeMemories', 'generationSessions',
                   'suggestionCandidates', 'insertionRecords'];
    for (const name of names) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        const req = tx.objectStore(name).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  }

  root.Dumly.repo = {
    LIMITS,
    ACCEPTANCE_STRENGTH,
    buildMemoryMetadata,
    normalizeAcceptedRecord,
    normalizeNegativeRecord,
    normalizeText,
    hashText,
    saveCandidate,
    markCandidate,
    markMemoriesHelpful,
    markMemoriesUnhelpful,
    bumpAcceptedMemory,
    saveAccepted,
    updateAccepted,
    saveNegative,
    saveInsertionRecord,
    listActiveNegatives,
    getRecentAcceptedMemories,
    getAcceptedMemoriesByAuthor,
    getPinnedAcceptedMemories,
    getAcceptedMemoriesByTopicTags,
    getRecentEditedAcceptedMemories,
    getHighHelpfulnessMemories,
    getRecentNegativeMemories,
    getSessionCandidates,
    listAcceptedPage,
    listNegativePage,
    runCleanup,
    retentionScore,
    clearAll,
  };
})();
