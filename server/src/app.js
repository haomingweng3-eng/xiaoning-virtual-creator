import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSession } from './session.js';
import { getSessionState } from './orchestrator.js';
import { FileStore } from './fileStore.js';

export function createApp({ chat, store = null, filePath = fileURLToPath(new URL('../data/conversations.json', import.meta.url)) } = {}) {
  const app = express();
  const sessions = new Map();
  const fileStore = store || new FileStore(filePath);
  for (const record of fileStore.records.values()) sessions.set(record.conversationId, record.session);
  app.use(cors());
  app.use(express.json());

  function getSessionId(rawSessionId) {
    const value = typeof rawSessionId === 'string' ? rawSessionId.trim() : '';
    return value && value.length <= 128 ? value : randomUUID();
  }

  function getSession(rawSessionId, visitorId = null) {
    const conversationId = getSessionId(rawSessionId);
    if (!sessions.has(conversationId)) {
      const createdAt = new Date().toISOString();
      sessions.set(conversationId, createSession({ visitorId, conversationId, createdAt }));
    }
    return { conversationId, session: sessions.get(conversationId) };
  }

  function persist(conversationId, session) {
    session.updatedAt = new Date().toISOString();
    fileStore.save({ conversationId, visitorId: session.visitorId, createdAt: session.createdAt, updatedAt: session.updatedAt, session });
  }

  app.locals.sessions = sessions;

  app.get('/api/health', (_request, response) => response.json({ ok: true }));

  // 获取 Creator Home 内容和当前会话上下文
  app.get('/api/conversations', (request, response) => response.json({ conversations: fileStore.list(request.query.visitorId) }));

  app.post('/api/conversations', (request, response) => {
    const visitorId = typeof request.body?.visitorId === 'string' ? request.body.visitorId.trim() : '';
    const conversationId = randomUUID();
    const createdAt = new Date().toISOString();
    const session = createSession({ visitorId, conversationId, createdAt });
    sessions.set(conversationId, session);
    persist(conversationId, session);
    return response.status(201).json({ conversationId, visitorId, ...getSessionState(session), history: session.history });
  });

  app.delete('/api/conversations/:conversationId', (request, response) => {
    const conversationId = request.params.conversationId;
    const session = sessions.get(conversationId);
    if (!session || (request.query.visitorId && session.visitorId !== request.query.visitorId)) return response.sendStatus(404);
    sessions.delete(conversationId);
    fileStore.delete(conversationId);
    return response.json({ ok: true, conversationId });
  });

  app.get('/api/session', (request, response) => {
    const { conversationId, session } = getSession(request.query.conversationId || request.query.sessionId, request.query.visitorId || null);
    const state = getSessionState(session);
    return response.json({ ...state, conversationId, sessionId: conversationId, visitorId: session.visitorId, history: session.history });
  });

  app.post('/api/chat', async (request, response) => {
    const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
    if (!message) return response.status(400).json({ reply: '先和我说点什么吧～', products: [] });
    const visitorId = typeof request.body?.visitorId === 'string' ? request.body.visitorId.trim() : '';
    const { conversationId, session } = getSession(request.body?.conversationId || request.body?.sessionId, visitorId);
    if (!session.visitorId) session.visitorId = visitorId;
    try {
      const result = await chat(message, session);
      session.hasGreeted = true;
      persist(conversationId, session);
      return response.json({
        sessionId: conversationId,
        conversationId,
        visitorId: session.visitorId,
        interaction: result.interaction,
        conversationFlow: result.conversationFlow,
        segments: result.segments,
        reply: result.reply,
        products: result.products,
        currentTopic: session.currentTopic,
        analysis: {
          interaction_mode: result.analysis?.interaction_mode,
          emotion: result.analysis?.emotion,
          shopping_intent: result.analysis?.shopping_intent,
          topic: session.currentTopic || result.analysis?.topic,
        },
      });
    } catch (err) {
      console.error('Chat error:', err);
      return response.status(503).json({
        reply: '我这会儿有点走神，晚点再来找我聊聊好吗？',
        products: [],
      });
    }
  });

  return app;
}
