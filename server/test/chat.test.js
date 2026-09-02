import { describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('POST /api/chat', () => {
  test('rejects empty messages with the unified response shape', async () => {
    const response = await request(createApp({ chat: vi.fn() })).post('/api/chat').send({ message: '   ' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ reply: '先和我说点什么吧～', products: [] });
  });

  test('returns only user-safe errors when OpenAI fails', async () => {
    const app = createApp({ chat: vi.fn().mockRejectedValue(new Error('secret stack detail')) });
    const response = await request(app).post('/api/chat').send({ message: '你好' });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ reply: '我这会儿有点走神，晚点再来找我聊聊好吗？', products: [] });
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  test('isolates session state by sessionId and returns a clean new session', async () => {
    const chat = vi.fn(async (message, session) => {
      session.currentTopic = message;
      session.recentTopics.push(message);
      return {
        interaction: 'SHARE',
        segments: [{ type: 'text', content: `收到：${message}` }],
        reply: `收到：${message}`,
        products: [],
        analysis: { interaction_mode: 'SHARE', emotion: 'neutral', shopping_intent: 'none' },
      };
    });
    const app = createApp({ chat });

    const sessionA = await request(app).get('/api/session').query({ sessionId: 'session-a' });
    const sessionB = await request(app).get('/api/session').query({ sessionId: 'session-b' });
    expect(sessionA.body.sessionId).toBe('session-a');
    expect(sessionB.body.sessionId).toBe('session-b');
    expect(sessionB.body.recentTopics).toEqual([]);
    expect(sessionB.body.currentTopic).toBeNull();

    await request(app).post('/api/chat').send({ sessionId: 'session-a', message: '跑步耳机' }).expect(200);
    const isolatedB = await request(app).get('/api/session').query({ sessionId: 'session-b' });
    expect(isolatedB.body.recentTopics).toEqual([]);
    expect(isolatedB.body.currentTopic).toBeNull();
  });
});
