import { analyzeConversation } from './conversationAnalysis.js';
import { addRecentTopic, appendTurn, mergePreferences, mergeUserFacts } from './session.js';
import { buildMessages, CREATOR_REPLY_TOOL, FORCE_COMPANION } from './prompts.js';
import { validateReply } from './validators.js';
import { findProductCategory } from './intent.js';
import { rankInsightfulProducts } from './productInsights.js';

const NO_TRUSTED_PRODUCT_REPLY = '我刚看了一圈，但没找到足够靠谱的具体款，先不乱推给你。';

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
  const category = findProductCategory(message) || findProductCategory(analysis.topic) || session.pendingProduct || analysis.topic || message;
  return {
    query: [category, ...(analysis.requirements || [])].filter(Boolean).join(' '),
    category,
    requirements: analysis.requirements || [],
    max_price: analysis.max_price,
    min_price: analysis.min_price,
  };
}

async function generateCreatorReply({ complete, session, message, analysis, products = [] }) {
  const extra = products.length
    ? `系统已经找到 ${products.length} 个真实商品。不要在文字里复述标题、价格或链接，直接表达你的取舍，商品会单独显示。`
    : '';
  const call = await complete({
    messages: buildMessages(session, message, extra, analysis.interaction_mode),
    tools: [CREATOR_REPLY_TOOL],
    toolChoice: FORCE_COMPANION,
  });
  const args = parseToolCall(call, 'creator_reply');
  const segments = normalizeSegments(args);
  if (!segments.length) return null;
  const safeSegments = segments.map((segment) => ({ ...segment, content: sanitizeCreatorContent(segment.content) }));
  const reply = joinSegments(safeSegments);
  const validation = validateReply({
    reply,
    searchCalled: products.length > 0,
    negativeEmotion: analysis.emotion_intensity >= 5 && ['sad', 'angry', 'anxious', 'tired'].includes(analysis.emotion),
    disallowProductDetails: products.length > 0,
    disallowCommerceSuggestions: analysis.interaction_mode !== 'CURATE',
  });
  return validation.valid ? { segments: safeSegments, reply, preferences_update: args.preferences_update || {} } : null;
}

export function createChatOrchestrator({ complete, search }) {
  return async function chat(message, session) {
    const { analysis } = await analyzeConversation({ complete, session, message });
    const mentionedCategory = findProductCategory(message);
    const currentTopic = mentionedCategory || String(analysis.topic || '').trim() || session.currentTopic || null;
    session.currentTopic = currentTopic;
    mergeUserFacts(session, analysis.explicit_facts, message);
    addRecentTopic(session, currentTopic);

    let products = [];
    if (analysis.interaction_mode === 'CURATE') {
      const searchResult = await search(buildProductIntent(message, analysis, session));
      if (searchResult.unavailable || searchResult.products.length === 0) {
        const segments = [{ type: 'text', content: NO_TRUSTED_PRODUCT_REPLY }];
        appendTurn(session, message, NO_TRUSTED_PRODUCT_REPLY);
        session.pendingProduct = null;
        return { interaction: 'CURATE', segments, reply: NO_TRUSTED_PRODUCT_REPLY, products: [], analysis };
      }
      products = rankInsightfulProducts(searchResult.products, {
        message,
        topic: analysis.topic,
        requirements: analysis.requirements || [],
        maxPrice: analysis.max_price,
      });
      if (!products.length) {
        const segments = [{ type: 'text', content: NO_TRUSTED_PRODUCT_REPLY }];
        appendTurn(session, message, NO_TRUSTED_PRODUCT_REPLY);
        session.pendingProduct = null;
        return { interaction: 'CURATE', segments, reply: NO_TRUSTED_PRODUCT_REPLY, products: [], analysis };
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
          ? '你前面提过的那件事，终于告一段落了。先让自己松一口气。'
          : '这个我先不急着替你下结论，慢慢聊就好。';
      creatorReply = { segments: [{ type: 'text', content: fallback }], reply: fallback, preferences_update: {} };
    }

    mergePreferences(session, creatorReply.preferences_update);
    appendTurn(session, message, creatorReply.reply);
    if (analysis.interaction_mode === 'REACT') {
      session.pendingProduct = null;
    } else if (mentionedCategory || findProductCategory(analysis.topic)) {
      // 记住明确说出的品类，但不因此触发搜索；下一轮仍需用户确认或满足 readiness 门槛。
      session.pendingProduct = mentionedCategory || findProductCategory(analysis.topic);
    }
    return { interaction: analysis.interaction_mode, segments: creatorReply.segments, reply: creatorReply.reply, products, analysis };
  };
}

export function getSessionState(session) {
  return {
    openingMessage: session.openingMessage,
    todayNote: session.todayNote,
    recentTopics: session.recentTopics,
    currentTopic: session.currentTopic || null,
    creatorContent: session.creatorContent,
    creatorConfig: session.creatorConfig,
    hasGreeted: session.hasGreeted,
  };
}

export { NO_TRUSTED_PRODUCT_REPLY };
