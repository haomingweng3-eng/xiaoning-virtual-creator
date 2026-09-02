import { describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

function makeApp(filePath) {
  const chat = vi.fn(async (message, session) => {
    session.currentTopic = message;
    session.history.push({ role: 'user', content: message }, { role: 'assistant', content: `收到：${message}` });
    return { interaction: 'SHARE', conversationFlow: 'CONTINUE', segments: [{ type: 'text', content: `收到：${message}` }], reply: `收到：${message}`, products: [], analysis: { interaction_mode: 'SHARE' } };
  });
  return createApp({ chat, filePath });
}

describe('Conversation Management', () => {
  test('keeps visitor and conversations separate, persists, switches and deletes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'xiaoning-conversations-'));
    const filePath = join(directory, 'conversations.json');
    try {
      const app = makeApp(filePath);
      const visitorId = 'visitor-a';
      const visitorB = 'visitor-b';
      const a = await request(app).post('/api/conversations').send({ visitorId }).expect(201);
      const b = await request(app).post('/api/conversations').send({ visitorId }).expect(201);
      await request(app).post('/api/chat').send({ visitorId, conversationId: a.body.conversationId, message: 'A 的第一条消息' }).expect(200);
      const refreshedA = await request(app).get('/api/session').query({ visitorId, conversationId: a.body.conversationId }).expect(200);
      expect(refreshedA.body.history).toHaveLength(2);
      const list = await request(app).get('/api/conversations').query({ visitorId }).expect(200);
      expect(list.body.conversations.map((item) => item.conversationId)).toEqual(expect.arrayContaining([a.body.conversationId, b.body.conversationId]));
      const otherVisitorList = await request(app).get('/api/conversations').query({ visitorId: visitorB }).expect(200);
      expect(otherVisitorList.body.conversations).toEqual([]);
      await request(app).delete(`/api/conversations/${b.body.conversationId}`).query({ visitorId }).expect(200);
      expect((await request(app).get('/api/conversations').query({ visitorId })).body.conversations.map((item) => item.conversationId)).toEqual([a.body.conversationId]);
      const restarted = makeApp(filePath);
      const afterRestart = await request(restarted).get('/api/session').query({ visitorId, conversationId: a.body.conversationId }).expect(200);
      expect(afterRestart.body.history[0].content).toBe('A 的第一条消息');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test('new conversation changes conversationId but not visitorId', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'xiaoning-identities-'));
    try {
      const app = makeApp(join(directory, 'conversations.json'));
      const first = await request(app).post('/api/conversations').send({ visitorId: 'stable-visitor' });
      const second = await request(app).post('/api/conversations').send({ visitorId: 'stable-visitor' });
      expect(first.body.visitorId).toBe(second.body.visitorId);
      expect(first.body.conversationId).not.toBe(second.body.conversationId);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
