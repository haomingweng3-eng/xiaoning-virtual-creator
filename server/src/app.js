import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSession } from './session.js';
import { getSessionState } from './orchestrator.js';
import { FileStore } from './fileStore.js';

export function createApp({ chat, store = null, filePath = null } = {}) {
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

  app.get('/api/memory', (request, response) => response.json({ memory: fileStore.listMemory(request.query.visitorId).map(({ text }) => ({ text, type: /预算|元|以内/.test(text) ? '预算' : /跑步|穿搭|健身|通勤/.test(text) ? '兴趣' : '偏好' })) }));

  app.delete('/api/memory', (request, response) => { fileStore.clearMemory(request.query.visitorId); return response.json({ ok: true }); });
  app.delete('/api/memory/:text', (request, response) => { const removed = fileStore.deleteMemory(request.query.visitorId, decodeURIComponent(request.params.text)); return removed ? response.json({ ok: true }) : response.sendStatus(404); });

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
    if (session.visitorId) session.userFacts = [...new Set([...(fileStore.getMemory(session.visitorId) || []), ...(session.userFacts || [])])];
    try {
      const result = await chat(message, session);
      session.hasGreeted = true;
      persist(conversationId, session);
      fileStore.saveMemory(session.visitorId, session.userFacts, conversationId);
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
          interaction: result.analysis?.interaction_mode,
          emotion: result.analysis?.emotion,
          emotion_intensity: result.analysis?.emotion_intensity,
          user_need: result.analysis?.user_need,
          shopping_intent: result.analysis?.shopping_intent,
          topic: session.currentTopic || result.analysis?.topic,
          product_category: result.analysis?.product_category,
          requirements: result.analysis?.requirements || [],
          budget: result.analysis?.budget ?? null,
          occasion: result.analysis?.occasion ?? null,
          recommendation_readiness: result.analysis?.recommendation_readiness ?? 0,
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
