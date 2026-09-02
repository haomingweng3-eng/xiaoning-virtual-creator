import { ANALYZE_TOOL, FORCE_ANALYZE, buildAnalysisMessages } from './prompts.js';
import { classifyMessageFallback } from './intent.js';

const MODES = ['REACT', 'SHARE', 'ASK', 'CALLBACK', 'CURATE'];

function parseToolCall(call, expectedName) {
  if (!call || call.function?.name !== expectedName) return null;
  try { return JSON.parse(call.function.arguments || '{}'); } catch { return null; }
}

function normalizeAnalysis(raw) {
  const rawReadiness = Number(raw.recommendation_readiness);
  const recommendationReadiness = rawReadiness > 1 ? rawReadiness / 10 : rawReadiness;
  const requestedMode = raw.interaction_mode || raw.response_mode;
  return {
    emotion: String(raw.emotion || 'neutral'),
    emotion_intensity: Math.min(10, Math.max(0, Number(raw.emotion_intensity) || 0)),
    user_need: String(raw.user_need || 'just_chatting'),
    topic: String(raw.topic || ''),
    conversation_goal: String(raw.conversation_goal || ''),
    shopping_intent: ['none', 'latent', 'implicit', 'explicit'].includes(raw.shopping_intent) ? raw.shopping_intent : 'none',
    occasion: raw.occasion ? String(raw.occasion) : null,
    requirements: Array.isArray(raw.requirements) ? raw.requirements.map(String).filter(Boolean) : [],
    recommendation_readiness: Math.min(1, Math.max(0, Number.isFinite(recommendationReadiness) ? recommendationReadiness : 0)),
    explicit_facts: Array.isArray(raw.explicit_facts) ? raw.explicit_facts.map(String).filter(Boolean) : [],
    interaction_mode: MODES.includes(requestedMode) ? requestedMode : 'SHARE',
  };
}

export function applyConversationPolicy(analysis, message, context = {}) {
  const fallback = classifyMessageFallback(message, context);
  const next = { ...analysis };
  const negative = fallback.scene === 'negative'
    || (next.emotion_intensity >= 0.5 && ['sad', 'angry', 'anxious', 'tired'].includes(next.emotion));
  if (negative) return { ...next, interaction_mode: 'REACT', shopping_intent: 'none', recommendation_readiness: 0 };
  if (fallback.scene === 'commerce-exit') {
    return { ...next, interaction_mode: 'REACT', shopping_intent: 'none', recommendation_readiness: 0 };
  }

  const callbackCue = /终于|做完|完成|忙完|下班|告一段落/.test(String(message || ''));
  const hasRelatedCallbackFact = (context.userFacts || []).some((fact) => /项目|工作|赶|加班/.test(String(fact || '')));
  if (callbackCue && hasRelatedCallbackFact) {
    return { ...next, interaction_mode: 'CALLBACK', shopping_intent: 'none', recommendation_readiness: 0 };
  }

  const explicitRequest = fallback.scene === 'shopping';
  const hasKnownNeed = Boolean(context.pendingProduct);
  const explicitConfirmation = explicitRequest && hasKnownNeed;
  const implicitReady = next.shopping_intent === 'implicit' && next.recommendation_readiness >= 0.65 && hasKnownNeed;

  if (explicitRequest || explicitConfirmation) {
    return {
      ...next,
      shopping_intent: 'explicit',
      interaction_mode: 'CURATE',
      recommendation_readiness: 1,
      topic: next.topic || context.pendingProduct || '',
    };
  }
  if (next.shopping_intent === 'implicit' && implicitReady) {
    return { ...next, interaction_mode: 'CURATE', recommendation_readiness: Math.max(next.recommendation_readiness, 0.65) };
  }
  if (next.shopping_intent !== 'none') return { ...next, interaction_mode: next.interaction_mode === 'ASK' ? 'ASK' : 'SHARE' };
  if (next.interaction_mode === 'CURATE') return { ...next, interaction_mode: 'SHARE' };
  return next;
}

function fallbackToAnalysis(message, context = {}) {
  const fallback = classifyMessageFallback(message, context);
  const hasNegative = fallback.scene === 'negative';
  const isStrongShopping = fallback.scene === 'shopping';
  const isWeakShopping = fallback.scene === 'weak-shopping';
  return normalizeAnalysis({
    emotion: hasNegative ? 'sad' : 'neutral',
    emotion_intensity: hasNegative ? 6 : 2,
    user_need: hasNegative ? 'emotional_support' : isStrongShopping ? 'recommendation' : isWeakShopping ? 'information' : 'just_chatting',
    topic: fallback.product || '',
    conversation_goal: isStrongShopping ? 'find_product' : 'chat',
    shopping_intent: isStrongShopping ? 'explicit' : isWeakShopping ? 'latent' : 'none',
    recommendation_readiness: isStrongShopping ? 1 : isWeakShopping ? 0.3 : 0,
    explicit_facts: [],
    interaction_mode: hasNegative ? 'REACT' : isStrongShopping ? 'CURATE' : 'SHARE',
  });
}

export async function analyzeConversation({ complete, session, message }) {
  try {
    const call = await complete({ messages: buildAnalysisMessages(session, message), tools: [ANALYZE_TOOL], toolChoice: FORCE_ANALYZE });
    const raw = parseToolCall(call, 'analyze_conversation');
    if (raw) return { analysis: applyConversationPolicy(normalizeAnalysis(raw), message, { pendingProduct: session.pendingProduct, userFacts: session.userFacts }), source: 'llm' };
  } catch (err) {
    console.warn('LLM 对话分析失败，使用 fallback:', err.message);
  }
  const fallback = fallbackToAnalysis(message, { pendingProduct: session.pendingProduct });
  return { analysis: applyConversationPolicy(fallback, message, { pendingProduct: session.pendingProduct, userFacts: session.userFacts }), source: 'fallback' };
}
