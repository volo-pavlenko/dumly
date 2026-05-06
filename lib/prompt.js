(function () {
  const root = (typeof window !== "undefined") ? window
    : (typeof self !== "undefined") ? self
    : globalThis;
  root.Dumly = root.Dumly || {};

  const LIMITS = {
    maxPromptMemories: 4,
    maxPromptMemoryChars: 1800,
    perMemoryChars: 220,
    profileBlockChars: 800,
    negativesMax: 5,
    negativeCharsEach: 180,
    sessionAnglesMax: 10,
    sessionAngleCharsEach: 140,
    sourceChars: 1000,
    topicChars: 200,
  };

  const TONE_BLOCK = `
default  -> Match the user profile tone.
safe     -> Balanced, friendly, low-risk.
sharp    -> More opinionated, crisper, stronger point - not rude.
playful  -> Light humor, casual - not forced.
joke     -> The reply IS the joke. Make it actually funny. Pick one real comedic move: unexpected twist, absurd analogy, deadpan understatement, self-own, misdirection, callback to the poster's own framing. Setup -> punchline structure if it fits in one line. Commit to the bit. Make the reader exhale through their nose. Avoid: "lol", hashtags, "me when...", generic observations, throwing shade. The joke must hinge on something specific in the source post - not just the topic in general. If you cannot land a real joke, fall back to sharp wit rather than shipping something mid.`;

  function trunc(s, n) { return String(s || '').slice(0, n); }

  function systemGeneration(mode, tone) {
    const isReplyLike = mode === 'reply' || mode === 'comment';
    const modeLine = isReplyLike
      ? 'Make the response conversational and suitable as a reply under the source post.'
      : 'Make the response work as a standalone thought above the quoted post.';
    return [
      'You are Dumly, an assistant that helps the user write X posts in their voice.',
      '',
      'Your job is to propose ONE response that sounds like the user - not generic AI.',
      '',
      'Detected mode: ' + mode,
      'Selected tone: ' + tone,
      '',
      modeLine,
      '',
      'Tone instructions:' + TONE_BLOCK,
      '',
      'Rules:',
      '- Use relevant memory only if it naturally fits.',
      '- Do NOT copy previous responses word-for-word.',
      '- Keep it short and natural. No hashtags, no emojis unless appropriate.',
      '- Return the response text ONLY - no quotes, no preamble, no commentary.',
    ].join('\n');
  }

  function profileBlock(profile) {
    if (!profile) return '';
    const parts = [];
    if (profile.bio) parts.push('Bio: ' + profile.bio);
    if (profile.tone) parts.push('Tone: ' + profile.tone);
    if (profile.preferredAngles?.length) {
      parts.push('Preferred angles:\n' + profile.preferredAngles.map((a) => '  - ' + a).join('\n'));
    }
    if (profile.avoidPatterns?.length) {
      parts.push('Avoid patterns:\n' + profile.avoidPatterns.map((a) => '  - ' + a).join('\n'));
    }
    if (!parts.length) return '';
    return trunc('User profile:\n' + parts.join('\n'), LIMITS.profileBlockChars);
  }

  function compactStyleBlock(styleProfile) {
    if (!styleProfile?.globalStyle) return '';
    const g = styleProfile.globalStyle;
    const lines = ['Compact learned style:'];
    if (g.case) lines.push('- Case: ' + g.case);
    if (g.length) lines.push('- Length: ' + g.length);
    if (g.tone?.length) lines.push('- Tone: ' + g.tone.slice(0, 6).join(', '));
    if (g.preferredMoves?.length) lines.push('- Preferred moves: ' + g.preferredMoves.slice(0, 5).join(', '));
    if (g.avoid?.length) lines.push('- Avoid: ' + g.avoid.slice(0, 5).join(', '));
    return lines.length > 1 ? lines.join('\n') : '';
  }

  function memoriesBlock(memories) {
    if (!memories?.length) return '';
    const lines = ['Relevant previous responses by the user (for voice reference - do NOT copy):'];
    let totalChars = lines[0].length;
    let count = 0;
    for (const item of memories) {
      const memory = item.memory || item;
      if (count >= LIMITS.maxPromptMemories) break;
      const source = memory.sourceSummary || memory.sourcePostText || '';
      const text = memory.acceptedText || memory.finalUserText || '';
      const tags = memory.topicTags?.length ? `\n   Topics: ${memory.topicTags.slice(0, 4).join(', ')}` : '';
      const block = `${count + 1}. In response to: "${trunc(source, 120)}"\n   User wrote: "${trunc(text, LIMITS.perMemoryChars)}"${tags}`;
      if (totalChars + block.length > LIMITS.maxPromptMemoryChars) break;
      lines.push(block);
      totalChars += block.length;
      count++;
    }
    return lines.join('\n');
  }

  function negativesBlock(negatives) {
    if (!negatives?.length) return '';
    const top = negatives.slice(0, LIMITS.negativesMax);
    const lines = ['Avoid these patterns the user explicitly rejected:'];
    for (const n of top) {
      lines.push(`  - "${trunc(n.rejectedText, LIMITS.negativeCharsEach)}" - reason: ${n.reason || 'other'}`);
    }
    return lines.join('\n');
  }

  function sessionAnglesBlock(sessionAngles) {
    if (!sessionAngles?.length) return '';
    const top = sessionAngles.slice(0, LIMITS.sessionAnglesMax);
    const lines = ['Avoid repeating these previous angles from this session:'];
    for (const t of top) lines.push(`  - "${trunc(t, LIMITS.sessionAngleCharsEach)}"`);
    return lines.join('\n');
  }

  function topicBlock(topic) {
    const trimmed = String(topic || '').trim();
    if (!trimmed) return '';
    return 'User requested topic/focus: ' + trunc(trimmed, LIMITS.topicChars);
  }

  function userPartsGeneration({ mode, source, profile, memories, negatives, avoidList, topic, memoryContext }) {
    const textBlocks = [];

    let sourceBlock = 'Current post (source):\n"""\n' + trunc(source.sourcePostText, LIMITS.sourceChars) + '\n"""';
    if (source.sourcePostAuthorHandle) sourceBlock += '\nAuthor: ' + source.sourcePostAuthorHandle;
    if ((mode === 'reply' || mode === 'comment') && source.thread?.length > 1) {
      const threadText = source.thread
        .map((p) => `  - ${p.author || '?'}: ${trunc(p.text || '(media)', 200)}`)
        .join('\n');
      sourceBlock += '\n\nThread context (oldest first):\n' + threadText;
    }
    if (source.nestedQuoteText) {
      sourceBlock += '\n\nQuoted tweet within: ' + trunc(source.nestedQuoteText, 300);
    }
    textBlocks.push(sourceBlock);

    memoryContext = memoryContext || {};
    const pb = profileBlock(profile);
    if (pb) textBlocks.push(pb);

    const sb = compactStyleBlock(memoryContext.styleProfile);
    if (sb) textBlocks.push(sb);

    const examples = memoryContext.examples || memories;
    const mb = memoriesBlock(examples);
    if (mb) textBlocks.push(mb);

    const avoidRules = memoryContext.avoidRules || negatives;
    const nb = negativesBlock(avoidRules);
    if (nb) textBlocks.push(nb);

    const sessionAngles = memoryContext.sessionAngles || avoidList;
    const ab = sessionAnglesBlock(sessionAngles);
    if (ab) textBlocks.push(ab);

    const tb = topicBlock(topic);
    if (tb) textBlocks.push(tb);

    textBlocks.push('Generate the response now.');

    const parts = [{ type: 'text', text: textBlocks.join('\n\n') }];
    if (source.images?.length) {
      for (const url of source.images) parts.push({ type: 'image_url', image_url: { url } });
    }
    return parts;
  }

  function buildGeneration(input) {
    return [
      { role: 'system', content: systemGeneration(input.mode, input.tone) },
      { role: 'user', content: userPartsGeneration(input) },
    ];
  }

  function systemRewrite(mode, targetTone) {
    return [
      'You are Dumly. Rewrite the current suggestion in the requested tone.',
      '',
      'Detected mode: ' + mode,
      'Target tone: ' + targetTone,
      '',
      'Preserve the same core idea unless it becomes unnatural.',
      'Keep it short. Return ONLY the rewritten text.',
    ].join('\n');
  }

  function buildRewrite({ currentSuggestionText, targetTone, profile, mode, source }) {
    const blocks = [];
    blocks.push('Source post: "' + trunc(source.sourcePostText, LIMITS.sourceChars) + '"');
    const pb = profileBlock(profile);
    if (pb) blocks.push(pb);
    blocks.push('Current suggestion:\n"""\n' + currentSuggestionText + '\n"""');
    blocks.push('Rewrite it in the ' + targetTone + ' tone.');
    return [
      { role: 'system', content: systemRewrite(mode, targetTone) },
      { role: 'user', content: blocks.join('\n\n') },
    ];
  }

  root.Dumly.prompt = { buildGeneration, buildRewrite, LIMITS };
})();
