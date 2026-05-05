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
    expect(msgs[0].content).toMatch(/stay on-topic/i);
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
