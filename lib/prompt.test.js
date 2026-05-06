import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
  globalThis.window = globalThis;
  await import('./prompt.js');
});

const emptyProfile = { bio: '', tone: '', preferredAngles: [], avoidPatterns: [] };

describe('buildGeneration', () => {
  it('emits correct mode label and tone block', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const msgs = buildGeneration({
      mode: 'reply', tone: 'sharp',
      source: { sourcePostText: 'Hello world', sourcePostAuthorHandle: '@a', thread: [] },
      profile: emptyProfile, memories: [], negatives: [], avoidList: [],
    });
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toContain('Detected mode: reply');
    expect(msgs[0].content).toContain('Selected tone: sharp');
    expect(msgs[0].content).toContain('conversational and suitable as a reply');
  });

  it('includes joke tone instruction in system prompt', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const msgs = buildGeneration({
      mode: 'reply', tone: 'joke',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '', thread: [] },
      profile: emptyProfile, memories: [], negatives: [], avoidList: [],
    });
    expect(msgs[0].content).toContain('Selected tone: joke');
    expect(msgs[0].content.toLowerCase()).toContain('joke');
    expect(msgs[0].content.toLowerCase()).toContain('actually funny');
  });

  it('omits profile block when profile is empty', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const msgs = buildGeneration({
      mode: 'quote', tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '', thread: [] },
      profile: emptyProfile, memories: [], negatives: [], avoidList: [],
    });
    const text = msgs[1].content.map((p) => p.text || '').join('\n');
    expect(text).not.toContain('User profile:');
  });

  it('caps memories at maxPromptMemories', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const many = Array.from({ length: 20 }, (_, i) => ({
      memory: { sourcePostText: 'src' + i, finalUserText: 'user' + i, mode: 'reply' },
    }));
    const msgs = buildGeneration({
      mode: 'reply', tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '', thread: [] },
      profile: emptyProfile, memories: many, negatives: [], avoidList: [],
    });
    const text = msgs[1].content.map((p) => p.text || '').join('\n');
    const matches = text.match(/User wrote:/g) || [];
    expect(matches.length).toBeLessThanOrEqual(10);
  });

  it('passes quote images through as image_url parts', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const msgs = buildGeneration({
      mode: 'quote', tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '@x',
                images: ['https://img/1.jpg', 'https://img/2.jpg'] },
      profile: emptyProfile, memories: [], negatives: [], avoidList: [],
    });
    const imgs = msgs[1].content.filter((p) => p.type === 'image_url');
    expect(imgs).toHaveLength(2);
  });

  it('does not change the prompt when topic is empty or missing', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const baseInput = {
      mode: 'reply', tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '', thread: [] },
      profile: emptyProfile, memories: [], negatives: [], avoidList: [],
    };
    const missing = buildGeneration(baseInput);
    const empty = buildGeneration({ ...baseInput, topic: '   ' });
    expect(empty).toEqual(missing);
  });

  it('includes a non-empty topic in the generation prompt', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const msgs = buildGeneration({
      mode: 'reply', tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '', thread: [] },
      profile: emptyProfile, memories: [], negatives: [], avoidList: [],
      topic: 'the launch pricing',
    });
    const text = msgs[1].content.map((p) => p.text || '').join('\n');
    expect(text).toContain('User requested topic/focus: the launch pricing');
  });

  it('truncates long topic instructions', () => {
    const { buildGeneration, LIMITS } = window.Dumly.prompt;
    const topic = 'a'.repeat(LIMITS.topicChars + 20);
    const msgs = buildGeneration({
      mode: 'reply', tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '', thread: [] },
      profile: emptyProfile, memories: [], negatives: [], avoidList: [],
      topic,
    });
    const text = msgs[1].content.map((p) => p.text || '').join('\n');
    expect(text).toContain('User requested topic/focus: ' + 'a'.repeat(LIMITS.topicChars));
    expect(text).not.toContain('a'.repeat(LIMITS.topicChars + 1));
  });

  it('builds compact memory context in the right order and caps sections', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const msgs = buildGeneration({
      mode: 'reply',
      tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '', thread: [] },
      profile: emptyProfile,
      memoryContext: {
        styleProfile: { globalStyle: { case: 'mostly_lowercase', length: 'short', tone: ['practical'] } },
        examples: Array.from({ length: 8 }, (_, i) => ({
          sourceSummary: 'source ' + i,
          acceptedText: 'accepted ' + i,
          topicTags: ['tag' + i],
        })),
        avoidRules: Array.from({ length: 8 }, (_, i) => ({
          rejectedText: 'bad ' + i,
          reason: 'wrong_tone',
        })),
        sessionAngles: Array.from({ length: 12 }, (_, i) => 'angle ' + i),
      },
    });
    const text = msgs[1].content.map((p) => p.text || '').join('\n');
    expect(text.indexOf('Compact learned style:')).toBeLessThan(text.indexOf('Relevant previous responses'));
    expect(text.indexOf('Relevant previous responses')).toBeLessThan(text.indexOf('Avoid these patterns'));
    expect(text.indexOf('Avoid these patterns')).toBeLessThan(text.indexOf('Avoid repeating these previous angles'));
    expect((text.match(/User wrote:/g) || []).length).toBeLessThanOrEqual(4);
    expect((text.match(/reason:/g) || []).length).toBeLessThanOrEqual(5);
    expect((text.match(/angle /g) || []).length).toBeLessThanOrEqual(10);
  });

  it('handles empty memory context gracefully', () => {
    const { buildGeneration } = window.Dumly.prompt;
    const msgs = buildGeneration({
      mode: 'reply', tone: 'default',
      source: { sourcePostText: 'S', sourcePostAuthorHandle: '', thread: [] },
      profile: emptyProfile,
      memoryContext: { examples: [], avoidRules: [], sessionAngles: [] },
    });
    const text = msgs[1].content.map((p) => p.text || '').join('\n');
    expect(text).toContain('Generate the response now.');
    expect(text).not.toContain('Relevant previous responses');
  });
});

describe('buildRewrite', () => {
  it('includes current suggestion and target tone', () => {
    const { buildRewrite } = window.Dumly.prompt;
    const msgs = buildRewrite({
      currentSuggestionText: 'Hi there',
      targetTone: 'playful',
      profile: emptyProfile,
      mode: 'reply',
      source: { sourcePostText: 'S' },
    });
    expect(msgs[0].content).toContain('Target tone: playful');
    expect(msgs[1].content).toContain('Hi there');
  });
});
