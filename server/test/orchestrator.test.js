import { describe, expect, test, vi } from 'vitest';
import { createChatOrchestrator } from '../src/orchestrator.js';
import { applyConversationPolicy } from '../src/conversationAnalysis.js';
import { createSession } from '../src/session.js';
import { buildAnalysisMessages } from '../src/prompts.js';

function toolCall(name, args) {
  return { id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function analysisCall(overrides = {}) {
  return toolCall('analyze_conversation', {
    emotion: 'neutral', emotion_intensity: 0.2, user_need: 'just_chatting', topic: '',
    conversation_goal: 'chat', shopping_intent: 'none', occasion: null, requirements: [],
    recommendation_readiness: 0, explicit_facts: [], interaction_mode: 'SHARE', ...overrides,
  });
}

function creatorCall(text, overrides = {}) {
  return toolCall('creator_reply', {
    segments: [{ type: 'text', content: text }], reply: text, preferences_update: {}, ...overrides,
  });
}

describe('final interaction model', () => {
  test('does not inject unrelated history, facts, preferences, or creator opinions into a new product topic', () => {
    const session = createSession();
    session.currentTopic = '跑步耳机掉落问题';
    session.pendingProduct = '耳机';
    session.userFacts = ['我的耳机跑步时总掉'];
    session.userPreferences = { scene: '跑步' };
    session.recentTopics = ['跑步耳机掉落问题'];
    session.history = [
      { role: 'user', content: '最近开始跑步，耳机老往下掉。' },
      { role: 'assistant', content: '你最近在跑步。' },
    ];

    const messages = buildAnalysisMessages(session, '想看看iPhone17');
    const system = messages[0].content;
    expect(system).not.toContain('我的耳机跑步时总掉');
    expect(system).not.toContain('跑步');
    expect(messages.filter((message) => message.role !== 'system')).toEqual([{ role: 'user', content: '想看看iPhone17' }]);
  });

  test('recalls the running earbud history only when the new message is related', () => {
    const session = createSession();
    session.currentTopic = '跑步耳机';
    session.pendingProduct = '耳机';
    session.history = [
      { role: 'user', content: '最近开始跑步，耳机老往下掉。' },
      { role: 'assistant', content: '那确实会打断节奏。' },
    ];
    const messages = buildAnalysisMessages(session, '之前那个跑步耳机呢？');
    expect(messages).toEqual(expect.arrayContaining(session.history));
  });

  test('returns to running audio context without recalling intervening iPhone or work turns', () => {
    const session = createSession();
    session.currentTopic = '工作';
    session.pendingProduct = 'iPhone 17';
    session.history = [
      { role: 'user', content: '最近开始跑步。' },
      { role: 'assistant', content: '先慢慢跑起来。' },
      { role: 'user', content: '跑步的时候耳机老掉。' },
      { role: 'assistant', content: '耳机掉了确实打断节奏。' },
      { role: 'user', content: '想看看 iPhone17。' },
      { role: 'assistant', content: '手机可以单独聊。' },
      { role: 'user', content: '今天工作有点多。' },
      { role: 'assistant', content: '忙的时候先缓一缓。' },
    ];
    const messages = buildAnalysisMessages(session, '不过跑步的时候我还想听音乐。');
    const recalled = messages.filter((message) => message.role !== 'system' && message.content !== '不过跑步的时候我还想听音乐。');
    expect(recalled.map((message) => message.content).join(' ')).toContain('耳机老掉');
    expect(recalled.map((message) => message.content).join(' ')).not.toMatch(/iPhone|手机|工作/);
  });

  test('replaces stale current topic and pending product when the user switches to iPhone', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(analysisCall({ topic: '跑步耳机掉落问题', shopping_intent: 'none', interaction_mode: 'SHARE' }))
      .mockResolvedValueOnce(creatorCall('手机可以单独聊，不用沿着刚才的跑步场景。'));
    const session = createSession();
    session.currentTopic = '跑步耳机掉落问题';
    session.pendingProduct = '耳机';
    const chat = createChatOrchestrator({ complete, search: vi.fn() });

    await chat('对了，我想换个iPhone17', session);

    expect(session.currentTopic).toBe('iPhone 17');
    expect(session.pendingProduct).toBe('iPhone 17');
  });
  test('negative emotion always becomes REACT and never CURATE', () => {
    const result = applyConversationPolicy({ emotion: 'sad', emotion_intensity: 0.8, shopping_intent: 'explicit', recommendation_readiness: 1, interaction_mode: 'CURATE' }, '今天被老板说了一顿，顺便推荐个鼠标', {});
    expect(result.interaction_mode).toBe('REACT');
    expect(result.shopping_intent).toBe('none');
  });

  test('running and loose headphones remain SHARE, not commerce', () => {
    expect(applyConversationPolicy({ shopping_intent: 'none', interaction_mode: 'SHARE' }, '最近开始跑步了', {}).interaction_mode).toBe('SHARE');
    expect(applyConversationPolicy({ shopping_intent: 'implicit', recommendation_readiness: 0.8, topic: '耳机', interaction_mode: 'CURATE' }, '但是跑步的时候耳机老往下掉', {}).interaction_mode).toBe('SHARE');
  });

  test('commerce exit clears the pending recommendation and never searches', () => {
    const result = applyConversationPolicy({ shopping_intent: 'implicit', recommendation_readiness: 0.9, interaction_mode: 'CURATE' }, '算了，最近还是省点钱', { pendingProduct: '耳机' });
    expect(result.interaction_mode).toBe('REACT');
    expect(result.shopping_intent).toBe('none');
    expect(result.recommendation_readiness).toBe(0);
  });

  test('only a clear category request can become CURATE', () => {
    const result = applyConversationPolicy({ shopping_intent: 'explicit', topic: '耳机', interaction_mode: 'SHARE', recommendation_readiness: 1 }, '那你帮我看看有没有适合跑步的耳机', {});
    expect(result.interaction_mode).toBe('CURATE');
  });

  test('CURATE calls the injected real provider and returns mixed segments', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(analysisCall({ shopping_intent: 'explicit', topic: '跑步耳机', interaction_mode: 'CURATE', recommendation_readiness: 1 }))
      .mockResolvedValueOnce(creatorCall('我会先看轻一点、稳一点的。'));
    const products = [{ id: 'p1', title: 'Running Headphones', description: 'Secure ear hooks for running.', price: null, currency: 'USD', imageUrl: null, merchant: 'Shop', productUrl: 'https://shop.example/products/p1', checkoutUrl: null, source: 'shopify' }];
    const search = vi.fn().mockResolvedValue({ products, unavailable: false });
    const result = await createChatOrchestrator({ complete, search })('那你帮我看看有没有适合跑步的耳机', createSession());
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ category: '耳机' }));
    expect(result.interaction).toBe('CURATE');
    expect(result.segments).toEqual([{ type: 'text', content: '我会先看轻一点、稳一点的。' }]);
    expect(result.products[0].source).toBe('shopify');
    expect(result.products[0].productInsights).toEqual(expect.objectContaining({
      productId: 'p1',
      personalizedReason: expect.stringMatching(/跑步|松动|稳固/),
      confidence: expect.any(Number),
    }));
    expect(result.products[0].productInsights.sellingPoints.every((point) => point.evidence)).toBe(true);
  });

  test('empty commerce result stays honest and empty', async () => {
    const complete = vi.fn().mockResolvedValueOnce(analysisCall({ shopping_intent: 'explicit', topic: '耳机', interaction_mode: 'CURATE', recommendation_readiness: 1 }));
    const result = await createChatOrchestrator({ complete, search: vi.fn().mockResolvedValue({ products: [], unavailable: false }) })('推荐一款跑步耳机', createSession());
    expect(result.products).toEqual([]);
    expect(result.segments[0].content).toContain('没找到足够靠谱');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('explicit facts support a natural CALLBACK without inferred relationship', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(analysisCall({ topic: '项目', explicit_facts: ['最近在赶一个项目'] }))
      .mockResolvedValueOnce(creatorCall('先把今天过完就好。'))
      .mockResolvedValueOnce(analysisCall({ topic: '工作', interaction_mode: 'CALLBACK' }))
      .mockResolvedValueOnce(creatorCall('你之前不是一直在赶那个项目吗，今天终于做完了。'));
    const session = createSession();
    const chat = createChatOrchestrator({ complete, search: vi.fn() });
    await chat('最近在赶一个项目', session);
    const result = await chat('终于做完了', session);
    expect(result.interaction).toBe('CALLBACK');
    expect(complete.mock.calls[2][0].messages[0].content).toContain('最近在赶一个项目');
    expect(session.userFacts).not.toContain('对方喜欢我');
  });

  test('deterministic policy upgrades a completion cue to CALLBACK only with a related explicit fact', () => {
    const withFact = applyConversationPolicy(
      { emotion: 'relieved', emotion_intensity: 4, shopping_intent: 'none', interaction_mode: 'REACT' },
      '终于做完了。',
      { userFacts: ['最近在赶一个项目'] },
    );
    const withoutFact = applyConversationPolicy(
      { emotion: 'relieved', emotion_intensity: 4, shopping_intent: 'none', interaction_mode: 'REACT' },
      '终于做完了。',
      { userFacts: [] },
    );
    expect(withFact.interaction_mode).toBe('CALLBACK');
    expect(withoutFact.interaction_mode).toBe('REACT');
  });

  test('reply safety removes relationship assumptions from model wording', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(analysisCall({ topic: '见面' }))
      .mockResolvedValueOnce(creatorCall('明天好好享受你的约会，先抱一下。'));
    const result = await createChatOrchestrator({ complete, search: vi.fn() })('明天第一次和喜欢的人出去', createSession());
    expect(result.reply).toContain('明天那次见面');
    expect(result.reply).not.toContain('约会');
    expect(result.reply).not.toContain('抱一下');
  });

  test('a shopping confirmation can reuse only an existing explicit category', () => {
    const result = applyConversationPolicy({ shopping_intent: 'none', interaction_mode: 'SHARE', recommendation_readiness: 0 }, '那你帮我看看有什么合适的', { pendingProduct: '耳机' });
    expect(result.interaction_mode).toBe('CURATE');
    expect(result.topic).toBe('耳机');
  });

  test('an explicitly mentioned category becomes pending without searching immediately', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce(analysisCall({ topic: '耳机', shopping_intent: 'none', interaction_mode: 'SHARE' }))
      .mockResolvedValueOnce(creatorCall('耳机老往下掉确实会打断节奏。'))
      .mockResolvedValueOnce(analysisCall({ topic: '跑步', shopping_intent: 'none', interaction_mode: 'SHARE' }))
      .mockResolvedValueOnce(creatorCall('我帮你看几种更稳的。'));
    const search = vi.fn().mockResolvedValue({ products: [], unavailable: false });
    const session = createSession();
    const chat = createChatOrchestrator({ complete, search });
    await chat('但是跑步的时候耳机老往下掉', session);
    expect(session.pendingProduct).toBe('耳机');
    await chat('那你帮我看看有什么合适的', session);
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ category: '耳机' }));
  });
});
