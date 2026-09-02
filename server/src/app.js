import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { createSession } from './session.js';
import { getSessionState } from './orchestrator.js';

export function createApp({ chat }) {
  const app = express();
  const sessions = new Map();
  app.use(cors());
  app.use(express.json());

  function getSessionId(rawSessionId) {
    const value = typeof rawSessionId === 'string' ? rawSessionId.trim() : '';
    return value && value.length <= 128 ? value : randomUUID();
  }

  function getSession(rawSessionId) {
    const sessionId = getSessionId(rawSessionId);
    if (!sessions.has(sessionId)) sessions.set(sessionId, createSession());
    return { sessionId, session: sessions.get(sessionId) };
  }

  app.locals.sessions = sessions;

  app.get('/api/health', (_request, response) => response.json({ ok: true }));

  // 获取 Creator Home 内容和当前会话上下文
  app.get('/api/session', (request, response) => {
    const { sessionId, session } = getSession(request.query.sessionId);
    const state = getSessionState(session);
    return response.json({ ...state, sessionId });
  });

  app.post('/api/chat', async (request, response) => {
    const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
    if (!message) return response.status(400).json({ reply: '先和我说点什么吧～', products: [] });
    const { sessionId, session } = getSession(request.body?.sessionId);
    try {
      const result = await chat(message, session);
      session.hasGreeted = true;
      return response.json({
        sessionId,
        interaction: result.interaction,
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
