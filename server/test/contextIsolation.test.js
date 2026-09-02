import { describe, expect, test } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createChatOrchestrator } from '../src/orchestrator.js';

function toolCall(name, args) {
  return { id: `call-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

function analysisFor(message) {
  if (message.includes('iPhone17')) return { topic: 'iPhone 17', interaction_mode: 'SHARE' };
  if (message.includes('换个手机')) return { topic: '手机', interaction_mode: 'SHARE' };
  if (message.includes('跑步的时候')) return { topic: '跑步', interaction_mode: 'SHARE' };
  if (message.includes('帮我看看耳机')) return { topic: '耳机', shopping_intent: 'explicit', should_recommend: true, recommendation_readiness: 1, interaction_mode: 'CURATE' };
  if (message.includes('耳机')) return { topic: '耳机', interaction_mode: 'SHARE', explicit_facts: ['耳机老往下掉'] };
  return { topic: '跑步', interaction_mode: 'SHARE', explicit_facts: ['最近开始跑步'] };
}

function replyFor(message) {
  if (message.includes('iPhone17')) return 'iPhone17 现在先看看你真正想换掉的地方。';
  if (message.includes('换个手机')) return '手机是新的当前话题，跑步先放一边。';
  if (message.includes('跑步的时候')) return '那跑步和听音乐又接上了，之前耳机容易掉这件事可以继续聊。';
  if (message.includes('帮我看看耳机')) return '我会沿着你刚才说的跑步场景挑几款。';
  if (message.includes('耳机')) return '耳机老往下掉确实会打断节奏。';
  return '先慢慢跑起来，别急着把装备配齐。';
}

function createDeterministicChat(search) {
  const complete = async (requestBody) => {
    const message = [...requestBody.messages].reverse().find((item) => item.role === 'user')?.content || '';
    const toolName = requestBody.tools[0].function.name;
    if (toolName === 'analyze_conversation') {
      return toolCall('analyze_conversation', {
        emotion: 'neutral', emotion_intensity: 0.2, user_need: 'just_chatting', conversation_goal: 'chat',
        shopping_intent: 'none', occasion: null, requirements: [], recommendation_readiness: 0,
        explicit_facts: [], interaction_mode: 'SHARE', ...analysisFor(message),
      });
    }
    const reply = replyFor(message);
    return toolCall('creator_reply', { segments: [{ type: 'text', content: reply }], reply, preferences_update: {} });
  };
  return createChatOrchestrator({ complete, search });
}

describe('Context Isolation', () => {
  test('passes the five required session isolation scenarios', async () => {
    const search = async () => ({ unavailable: false, products: [{
      id: 'earbud-1', title: 'Running Sport Headphones', description: 'Secure ear hooks for running.',
      price: 49, currency: 'USD', imageUrl: null, merchant: 'Provider',
      productUrl: 'https://provider.example/products/earbud-1', source: 'shopify',
    }] });
    const app = createApp({ chat: createDeterministicChat(search) });

    await request(app).post('/api/chat').send({ sessionId: 'session-a', message: '最近开始跑步。' }).expect(200);
    await request(app).post('/api/chat').send({ sessionId: 'session-a', message: '耳机老往下掉。' }).expect(200);
    const sessionAAfterTwoTurns = await request(app).get('/api/session').query({ sessionId: 'session-a' });
    expect(sessionAAfterTwoTurns.body.recentTopics).toEqual(['跑步', '耳机']);
    expect(sessionAAfterTwoTurns.body.currentTopic).toBe('耳机');

    const sessionB = await request(app).get('/api/session').query({ sessionId: 'session-b' });
    expect(sessionB.body.recentTopics).toEqual([]);
    expect(sessionB.body.currentTopic).toBeNull();
    const iPhoneReply = await request(app).post('/api/chat').send({ sessionId: 'session-b', message: '想看看iPhone17' }).expect(200);
    expect(iPhoneReply.body.currentTopic).toBe('iPhone 17');
    expect(iPhoneReply.body.reply).not.toMatch(/跑步|耳机|之前|上次|你最近/);

    const earbudReply = await request(app).post('/api/chat').send({ sessionId: 'session-a', message: '那你帮我看看耳机。' }).expect(200);
    expect(earbudReply.body.currentTopic).toBe('耳机');
    expect(earbudReply.body.products).toHaveLength(1);

    const phoneReply = await request(app).post('/api/chat').send({ sessionId: 'session-a', message: '对了，我想换个手机。' }).expect(200);
    expect(phoneReply.body.currentTopic).toBe('手机');
    expect(phoneReply.body.reply).not.toContain('跑步耳机');

    const runningAgainReply = await request(app).post('/api/chat').send({ sessionId: 'session-a', message: '不过跑步的时候我还想听音乐。' }).expect(200);
    expect(runningAgainReply.body.currentTopic).toBe('跑步');
    expect(runningAgainReply.body.reply).toContain('之前耳机容易掉');
  });
});
