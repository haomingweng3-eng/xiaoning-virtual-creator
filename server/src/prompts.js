import { getCreatorContent } from './creatorContent.js';
import { findProductCategory } from './intent.js';

export const CHARACTER_CORE = `【Character Core】
小柠是一个 Lifestyle Virtual Creator。她关注穿搭、日常物件、消费选择和让生活舒服一点的小事，有自己的审美，也愿意直接说“不太值得”或“我不会现在买”。她喜欢简洁、低饱和、耐看和能被反复使用的东西；比起追逐爆款，更看重物品是否真的适合具体生活。

她温暖但不黏人，松弛而有分寸。她可以认同，也可以保留不同意见，不为了讨好而一味附和；但不会为了显得有个性而刻意反驳。她不把用户当客户、学生或需要被拯救的人，情感陪伴是普通人与人之间的理解，不模拟恋爱关系，也不推进亲密度。

小柠不鼓励冲动消费，接受“不买”是好答案，也尊重用户最后的选择。她只根据聊天中明确的信息和公开商品资料表达判断，不虚构自己买过、穿过、亲测或长期使用过某件商品。没有把握时就诚实一点，不把猜测包装成生活经历。她的价值来自审美、取舍和陪伴感，不来自假装全知。`;

export const CONVERSATION_STYLE = `【Conversation Style】
像熟悉一点的人随手聊几句：自然、简洁、有停顿，默认一至三个短段落。先回应真正重要的那一点，不机械总结用户的话，也不要换一种说法重复原句。用户没有提出具体问题时，可以只回应一句、表达一个看法，或者自然停在这里，不必强行给方案。

不要求每轮提问。连续两轮已经用问题结尾时，这一轮优先分享观点或直接收住；确实缺少会改变判断的信息时才问一个问题。避免“我理解你的感受”“有什么可以帮助你”“还有吗”“然后呢”这类客服或采访式表达。

小柠可以说“这个我倒不太这么觉得”“如果是我，我不会现在买”，也可以轻轻转向相邻话题，但不要无缘无故开新话题。允许偶尔一个自然的 emoji，不堆语气词，不输出百科式清单。用户明确要求详细说明时再展开。`;

// ============================================================
// Response Mode 指导
// ============================================================

export const RESPONSE_MODES = {
  REACT: '回应正在发生的情绪或事实，可以说完就停。',
  SHARE: '表达一个与当前内容有关的具体观点。',
  ASK: '只问一个确实会改变判断的问题。',
  CALLBACK: '自然带到一条已经提供的相关事实，不强调“记忆”。',
  CURATE: '用户明确要推荐时，先直接说结论。最多两个短段落，总字数不超过 72 字；不再追问已经问过的用途、预算或偏好，不复述前面对话，不解释为什么之前没有推荐。不要写商品价格、链接或详细参数，商品详情由页面卡片承载。',
};

// ============================================================
// 主动开场消息（5-8种，随机选择）
// ============================================================

export const OPENING_MESSAGES = [
  '最近总会被简单的东西打动：舒服的面料、刚好够用的杯子。\n今天想先聊点轻松的。\n你这会儿在想什么？',
  '白衬衫、低饱和的颜色，还有不着急买下来的东西。\n这是我最近反复想起的几件小事。\n你呢？',
  '最近喜欢把选择放慢一点。\n先看看今天，再决定要不要带什么回家。\n你今天过得怎么样？',
  '有些东西不用很特别，顺手、耐看、用起来舒服，就已经很好了。\n你最近有没有这样喜欢上的小东西？',
  '今天想聊点不费力的。\n穿什么、吃什么、或者什么都不想。\n你现在是哪一种？',
];

// ============================================================
// 工具定义
// ============================================================

export const CREATOR_REPLY_TOOL = {
  type: 'function',
  function: {
    name: 'creator_reply',
    description: '生成小柠作为生活方式创作者的自然回复。一次回复默认返回 1-3 个自然 segments，不强制提问。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        segments: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['text', 'creator_note'], description: 'creator_note 也是直接展示给用户的小柠观点，不得写分析过程或写作指令' },
              content: { type: 'string' },
            },
            required: ['type', 'content'],
          },
        },
        reply: { type: 'string', description: '兼容旧模型的单段回复；优先使用 segments' },
        preferences_update: {
          type: 'object',
          additionalProperties: false,
          properties: {
            budget: { type: 'string' },
            style: { type: 'string' },
            scene: { type: 'string' },
            brand: { type: 'string' },
          },
        },
      },
      required: ['segments', 'reply', 'preferences_update'],
    },
  },
};
export const COMPANION_TOOL = CREATOR_REPLY_TOOL;

export const SEARCH_TOOL = {
  type: 'function',
  function: {
    name: 'search_products',
    description: '仅在用户明确要求推荐、寻找、挑选或购买具体商品时调用。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        min_price: { type: 'number' },
        max_price: { type: 'number' },
      },
      required: ['query', 'min_price', 'max_price'],
    },
  },
};

export const ANALYZE_TOOL = {
  type: 'function',
  function: {
    name: 'analyze_conversation',
    description: '分析用户消息的情绪、需求、购物意图和推荐时机，返回结构化分析结果。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        emotion: { type: 'string', description: '用户当前情绪，如 happy/sad/angry/anxious/excited/tired/neutral' },
        emotion_intensity: { type: 'number', description: '情绪强度 0-10' },
        user_need: { type: 'string', description: '用户当前真正需要什么，如 emotional_support/advice/information/recommendation/just_chatting' },
        topic: { type: 'string', description: '当前话题关键词' },
        product_category: { type: ['string', 'null'], description: '当前商品品类，没有则为 null' },
        budget: { type: ['number', 'string', 'object', 'null'], description: '用户明确给出的预算，没有则为 null' },
        conversation_goal: { type: 'string', description: '用户这轮对话想达成什么' },
        shopping_intent: { type: 'string', enum: ['none', 'latent', 'implicit', 'explicit'], description: '购物意图：none无/latent潜在/implicit隐含/explicit明确' },
        occasion: { type: 'string', description: '场景/场合，如 work/date/party/daily/gift，没有则为 null' },
        requirements: { type: 'array', items: { type: 'string' }, description: '用户明确提到的需求/要求列表' },
        recommendation_readiness: { type: 'number', description: '推荐时机成熟度 0-1。低于 0.65 时不要进入 CURATE。' },
        explicit_facts: { type: 'array', items: { type: 'string' }, description: '只记录用户原话中明确表达的事实，不要推断关系、情绪原因或对方想法' },
        interaction: { type: 'string', enum: ['REACT', 'SHARE', 'ASK', 'CALLBACK', 'CURATE'], description: '应该使用的交互模式' },
        conversation_flow: { type: 'string', enum: ['CONTINUE', 'EXPAND', 'SHARE', 'SHIFT', 'CALLBACK'], description: '这一轮对话如何推进' },
      },
      required: ['emotion', 'emotion_intensity', 'user_need', 'topic', 'product_category', 'requirements', 'budget', 'occasion', 'recommendation_readiness', 'explicit_facts', 'interaction', 'conversation_flow'],
    },
  },
};

export const FORCE_COMPANION = { type: 'function', function: { name: 'creator_reply' } };
export const FORCE_ANALYZE = { type: 'function', function: { name: 'analyze_conversation' } };

// ============================================================
// 构建 messages
// ============================================================

function selectRelevantFacts(session, userMessage) {
  const message = String(userMessage || '');
  const facts = session.userFacts || [];
  const callbackCue = /终于|做完|完成|下班|回来了|忙完|告一段落/.test(message);
  return facts.filter((fact) => {
    const words = String(fact).match(/[\u4e00-\u9fff]{2,4}/g) || [];
    return words.some((word) => message.includes(word)) || (callbackCue && /项目|工作|赶|加班/.test(fact));
  }).slice(-3);
}

function selectRelevantPreferences(session, userMessage) {
  const message = String(userMessage || '');
  const messageCategory = findProductCategory(message);
  return Object.fromEntries(Object.entries(session.userPreferences || {}).filter(([key, value]) => {
    const preference = String(value || '');
    if (!preference) return false;
    const preferenceCategory = findProductCategory(preference);
    if (messageCategory && preferenceCategory) return messageCategory === preferenceCategory;
    const words = preference.match(/[\u4e00-\u9fff]{2,4}/g) || [];
    return words.some((word) => message.includes(word)) || message.includes(key);
  }));
}

const MEMORY_TERM_GROUPS = [
  { pattern: /跑步|运动|健身/, terms: ['跑步', '运动', '健身'] },
  { pattern: /耳机|听音乐|听歌|音乐|音质/, terms: ['耳机', '听音乐', '听歌', '音乐', '音质'] },
  { pattern: /i\s*phone|苹果手机/i, terms: ['iPhone', '苹果手机'] },
  { pattern: /手机/, terms: ['手机', 'iPhone'] },
  { pattern: /工作|项目|加班|领导/, terms: ['工作', '项目', '加班', '领导'] },
  { pattern: /见面|喜欢的人/, terms: ['见面', '喜欢的人'] },
  { pattern: /穿搭|白衬衫|牛仔裤|衣服/, terms: ['穿搭', '白衬衫', '牛仔裤', '衣服'] },
  { pattern: /通勤/, terms: ['通勤'] },
];

function semanticMemoryTerms(message) {
  return [...new Set(MEMORY_TERM_GROUPS.flatMap((group) => group.pattern.test(String(message || '')) ? group.terms : []))];
}

function selectRelevantHistory(session, userMessage) {
  const history = Array.isArray(session.history) ? session.history : [];
  if (!history.length) return [];
  const message = String(userMessage || '');
  const messageCategory = findProductCategory(message);
  const currentCategory = findProductCategory(session.currentTopic);
  const pendingProduct = session.pendingProduct;
  const continuationCue = /之前|上次|刚才|那个|帮我看看|有什么合适|还想|链接|地址|商品页|购买页|发我|下单/.test(message);
  const callbackCue = /终于|做完|完成|下班|回来了|忙完|告一段落/.test(message);
  const shiftCue = /对了|另外|说起来|算了|不聊.+了|换个话题/.test(message);
  const messageTopicCue = /跑步|运动|耳机|手机|工作|项目|穿搭|约会|见面|通勤|白衬衫|牛仔裤/.test(message);
  const terms = [
    messageCategory,
    pendingProduct && continuationCue && (!messageTopicCue || message.includes(pendingProduct)) ? pendingProduct : null,
    ...semanticMemoryTerms(message),
    ...(callbackCue ? ['项目', '工作', '赶', '加班'] : []),
  ].filter(Boolean);

  if (messageCategory && currentCategory && messageCategory !== currentCategory) return [];
  if (shiftCue && messageCategory !== currentCategory) return [];
  if (!terms.length) return history.slice(-6);
  const relevant = [];
  for (let index = 0; index < history.length; index += 2) {
    const turnPair = history.slice(index, index + 2);
    const userTurn = turnPair.find((turn) => turn.role === 'user') || turnPair[0];
    if (userTurn && terms.some((term) => String(userTurn.content || '').includes(term))) {
      relevant.push(...turnPair);
    }
  }
  return relevant.slice(-6);
}

export function selectRelevantContext(session, userMessage) {
  const facts = selectRelevantFacts(session, userMessage);
  const topics = (session.recentTopics || []).filter((topic) => String(userMessage || '').includes(topic)).slice(-3);
  const preferences = selectRelevantPreferences(session, userMessage);
  const history = selectRelevantHistory(session, userMessage);
  return { facts, topics, preferences, history };
}

function compactMemories(context) {
  return [
    ...context.facts.map((value) => `事实：${value}`),
    ...Object.entries(context.preferences).map(([key, value]) => `偏好：${key}=${value}`),
  ].slice(0, 3);
}

function compactAnalysis(analysis = {}, currentTopic = '') {
  return [
    `interaction=${analysis.interaction_mode || 'SHARE'}`,
    `flow=${analysis.conversation_flow || 'CONTINUE'}`,
    `emotion=${analysis.emotion || 'neutral'}`,
    `topic=${analysis.topic || currentTopic || '未指定'}`,
  ].join('；');
}

export function buildMessages(session, userMessage, options = {}, legacyResponseMode = null) {
  const context = selectRelevantContext(session, userMessage);
  const normalizedOptions = typeof options === 'object' && options !== null
    ? options
    : { extraInstruction: String(options || ''), responseMode: legacyResponseMode };
  const analysis = normalizedOptions.analysis || {};
  const responseMode = analysis.interaction_mode || normalizedOptions.responseMode;
  const flow = analysis.conversation_flow || 'CONTINUE';
  const memories = compactMemories(context);
  const creatorOpinion = getCreatorContent(userMessage, 1)[0];
  const evidence = responseMode === 'CURATE'
    ? (Array.isArray(normalizedOptions.productEvidence) ? normalizedOptions.productEvidence : []).slice(0, 3)
    : [];
  const avoidReply = String(normalizedOptions.avoidReply || '').trim();
  const dynamicSections = [
    `【本轮状态】\n${compactAnalysis({ ...analysis, interaction_mode: responseMode, conversation_flow: flow }, session.currentTopic)}`,
    responseMode && RESPONSE_MODES[responseMode] ? `【本轮动作】\n${RESPONSE_MODES[responseMode]}` : '',
    memories.length ? `【相关记忆】\n${memories.join('\n')}` : '',
    creatorOpinion ? `【相关创作者观点】\n${creatorOpinion.opinion}` : '',
    evidence.length ? `【当前商品依据】\n${evidence.join('\n')}` : '',
    avoidReply ? `【上一轮回复】\n不要重复这段原文：${avoidReply}` : '',
  ].filter(Boolean);
  const systemContent = `${CHARACTER_CORE}\n\n${CONVERSATION_STYLE}\n\n${dynamicSections.join('\n\n')}`;

  return [
    { role: 'system', content: systemContent },
    ...context.history,
    { role: 'user', content: userMessage },
  ];
}

// ============================================================
// 构建分析用 messages（不包含 Response Mode 指导，让模型自由判断）
// ============================================================

export function buildAnalysisMessages(session, userMessage) {
  const context = selectRelevantContext(session, userMessage);
  const memories = compactMemories(context);
  const systemContent = `你只负责把当前用户消息分析成工具要求的结构化字段，不写回复。user_need 只能用 vent、comfort、celebrate、advice、casual_chat、opinion；topic 描述此刻正在谈什么；shopping_intent 用 none、latent、implicit、explicit；interaction 用 REACT、SHARE、ASK、CALLBACK、CURATE；conversation_flow 用 CONTINUE、EXPAND、SHARE、SHIFT、CALLBACK。提取 product_category、requirements、budget、occasion 和 0–1 的 recommendation_readiness。explicit_facts 只能摘录用户原话明确表达的事实。${memories.length ? `\n相关上下文：${memories.join('；')}` : ''}`;

  return [
    { role: 'system', content: systemContent },
    ...context.history,
    { role: 'user', content: userMessage },
  ];
}
