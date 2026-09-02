import {
  analyzeConversation,
  countConsecutiveAssistantQuestions,
  topicsAreRelated,
} from './conversationAnalysis.js';
import { addRecentTopic, appendTurn, cleanUserFacts, mergeDurableMemory, mergePreferences, mergeUserFacts } from './session.js';
import { buildMessages, CREATOR_REPLY_TOOL, FORCE_COMPANION } from './prompts.js';
import { validateReply } from './validators.js';
import { classifyMessageFallback, findProductCategory, hasCommerceFollowUpRequest } from './intent.js';
import { rankInsightfulProducts } from './productInsights.js';

const NO_TRUSTED_PRODUCT_REPLY = '我刚看了一圈，但没找到足够靠谱的具体款，先不乱推给你。';
const COMPACT_CURATE_FALLBACK = '我直接给你几款，具体资料我放在下面，你按场景和预算挑就好。';
const COMPACT_LINK_FALLBACK = '链接在下面的商品卡片里，点对应卡片就能打开。';

function parseToolCall(call, expectedName) {
  if (!call || call.function?.name !== expectedName) return null;
  try { return JSON.parse(call.function.arguments || '{}'); } catch { return null; }
}

function normalizeSegments(args) {
  const segments = Array.isArray(args?.segments)
    ? args.segments
      .filter((segment) => ['text', 'creator_note'].includes(segment?.type) && String(segment.content || '').trim())
      .map((segment) => ({ type: segment.type, content: String(segment.content).trim() }))
      .slice(0, 3)
    : [];
  if (segments.length) return segments;
  if (String(args?.reply || '').trim()) return [{ type: 'text', content: String(args.reply).trim() }];
  return [];
}

function joinSegments(segments) {
  return segments.map((segment) => segment.content).join('\n\n');
}

function sanitizeCreatorContent(content) {
  return String(content || '')
    .replace(/你的约会/g, '明天那次见面')
    .replace(/这次约会/g, '这次见面')
    .replace(/约会/g, '见面')
    .replace(/抱一下|拥抱一下/g, '陪你缓一会儿');
}

function buildProductIntent(message, analysis, session) {
  const category = analysis.product_category || findProductCategory(message) || findProductCategory(analysis.topic) || session.pendingProduct || analysis.topic || message;
  const budget = analysis.budget && typeof analysis.budget === 'object' ? analysis.budget : {};
  return {
    query: [category, ...(analysis.requirements || []), analysis.occasion].filter(Boolean).join(' '),
    category,
    requirements: analysis.requirements || [],
    budget: analysis.budget || null,
    occasion: analysis.occasion || null,
    max_price: analysis.max_price ?? budget.max_price,
    min_price: analysis.min_price ?? budget.min_price,
  };
}

function buildProductEvidenceLines(products) {
  return products.flatMap((product) => (product.productInsights?.sellingPoints || [])
    .filter((point) => point?.evidence)
    .map((point) => `${product.title}：${point.evidence}`))
    .slice(0, 3);
}

function filterAgainstExplicitPreferences(products, session) {
  const exclusions = (session.userFacts || [])
    .filter((fact) => /不喜欢|不要|不想要|避开/.test(String(fact)) && /入耳|耳塞|有线/.test(String(fact)))
    .map((fact) => /入耳|耳塞|有线/.exec(String(fact))?.[0])
    .filter(Boolean);
  if (!exclusions.length) return products;
  return products.filter((product) => !exclusions.some((term) => new RegExp(term, 'i').test(`${product.title} ${product.description || ''}`)));
}

async function generateCreatorReply({ complete, session, message, analysis, products = [] }) {
  const previousReply = [...(session.history || [])].reverse().find((turn) => turn.role === 'assistant')?.content || '';
  const call = await complete({
    messages: buildMessages(session, message, {
      analysis,
      productEvidence: buildProductEvidenceLines(products),
      avoidReply: previousReply,
    }),
    tools: [CREATOR_REPLY_TOOL],
    toolChoice: FORCE_COMPANION,
  });
  const args = parseToolCall(call, 'creator_reply');
  const segments = normalizeSegments(args);
  if (!segments.length) return null;
  const safeSegments = segments.map((segment) => ({ ...segment, content: sanitizeCreatorContent(segment.content) }));
  const reply = joinSegments(safeSegments);
  if (analysis.interaction_mode === 'CURATE' && /这个我先不急着替你下结论|慢慢聊就好/u.test(reply)) return null;
  const validation = validateReply({
    reply,
    searchCalled: products.length > 0,
    negativeEmotion: analysis.emotion_intensity >= 5 && ['sad', 'angry', 'anxious', 'tired'].includes(analysis.emotion),
    disallowProductDetails: products.length > 0,
    disallowCommerceSuggestions: analysis.interaction_mode !== 'CURATE',
    disallowQuestion: analysis.interaction_mode === 'CURATE'
      || (countConsecutiveAssistantQuestions(session.history) >= 2 && analysis.interaction_mode !== 'ASK'),
    maxQuestions: 1,
    maxChars: analysis.interaction_mode === 'CURATE' ? 72 : Infinity,
    previousReply,
  });
  return validation.valid ? { segments: safeSegments, reply, preferences_update: args.preferences_update || {} } : null;
}

export function createChatOrchestrator({ complete, search }) {
  return async function chat(message, session) {
    cleanUserFacts(session);
    const { analysis } = await analyzeConversation({ complete, session, message });
    if (classifyMessageFallback(message).scene === 'commerce-exit') session.pendingProduct = null;
    const previousTopic = session.currentTopic;
    const mentionedCategory = findProductCategory(message);
    const currentTopic = mentionedCategory || String(analysis.topic || '').trim() || session.currentTopic || null;
    session.currentTopic = currentTopic;
    session.topicTurnCount = previousTopic && topicsAreRelated(previousTopic, currentTopic)
      ? Math.min(3, Number(session.topicTurnCount || 0) + 1)
      : (currentTopic ? 1 : 0);
    session.conversationFlow = analysis.conversation_flow;
    mergeUserFacts(session, analysis.explicit_facts, message);
    mergeDurableMemory(session, message);
    addRecentTopic(session, currentTopic);

    let products = [];
    if (analysis.interaction_mode === 'CURATE') {
      const searchResult = await search(buildProductIntent(message, analysis, session));
      if (searchResult.unavailable || searchResult.products.length === 0) {
        const segments = [{ type: 'text', content: NO_TRUSTED_PRODUCT_REPLY }];
        appendTurn(session, message, NO_TRUSTED_PRODUCT_REPLY);
        session.pendingProduct = null;
        return { interaction: 'CURATE', conversationFlow: analysis.conversation_flow, segments, reply: NO_TRUSTED_PRODUCT_REPLY, products: [], analysis };
      }
      products = rankInsightfulProducts(filterAgainstExplicitPreferences(searchResult.products, session), {
        message,
        topic: analysis.topic,
        requirements: analysis.requirements || [],
        maxPrice: analysis.max_price,
      });
      if (!products.length) {
        const segments = [{ type: 'text', content: NO_TRUSTED_PRODUCT_REPLY }];
        appendTurn(session, message, NO_TRUSTED_PRODUCT_REPLY);
        session.pendingProduct = null;
        return { interaction: 'CURATE', conversationFlow: analysis.conversation_flow, segments, reply: NO_TRUSTED_PRODUCT_REPLY, products: [], analysis };
      }
    }

    let creatorReply = null;
    for (let attempt = 0; attempt < 2 && !creatorReply; attempt += 1) {
      creatorReply = await generateCreatorReply({ complete, session, message, analysis, products });
    }
    if (!creatorReply) {
      const fallback = analysis.interaction_mode === 'REACT'
        ? '听起来今天确实挺烦的，先不用急着把它想明白。'
        : analysis.interaction_mode === 'CALLBACK'
          ? `记得，你前面提过${session.userFacts.find((fact) => /喜欢|不喜欢|偏好|预算/.test(String(fact))) || '这个偏好'}。这次我会把它算进去。`
          : analysis.interaction_mode === 'CURATE'
            ? (hasCommerceFollowUpRequest(message) ? COMPACT_LINK_FALLBACK : COMPACT_CURATE_FALLBACK)
          : '这个我先不急着替你下结论，慢慢聊就好。';
      creatorReply = { segments: [{ type: 'text', content: fallback }], reply: fallback, preferences_update: {} };
    }

    mergePreferences(session, creatorReply.preferences_update);
    appendTurn(session, message, creatorReply.reply);
    if (analysis.interaction_mode === 'REACT') {
      session.pendingProduct = null;
    } else if (mentionedCategory || findProductCategory(analysis.topic) || findProductCategory(session.currentTopic)) {
      // 记住明确说出的品类，但不因此触发搜索；下一轮仍需用户确认或满足 readiness 门槛。
      session.pendingProduct = mentionedCategory || findProductCategory(analysis.topic);
    }
    return {
      interaction: analysis.interaction_mode,
      conversationFlow: analysis.conversation_flow,
      segments: creatorReply.segments,
      reply: creatorReply.reply,
      products,
      analysis,
    };
  };
}

export function getSessionState(session) {
  return {
    openingMessage: session.openingMessage,
    todayNote: session.todayNote,
    recentTopics: session.recentTopics,
    currentTopic: session.currentTopic || null,
    title: session.title || null,
    conversationFlow: session.conversationFlow,
    creatorContent: session.creatorContent,
    creatorConfig: session.creatorConfig,
    hasGreeted: session.hasGreeted,
  };
}

export { NO_TRUSTED_PRODUCT_REPLY };
