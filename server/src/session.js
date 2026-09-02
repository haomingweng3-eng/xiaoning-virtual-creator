import { OPENING_MESSAGES } from './prompts.js';
import { CREATOR_CONTENT } from './creatorContent.js';
import { CREATOR_CONFIG } from './creatorConfig.js';

const MAX_HISTORY_MESSAGES = 16;
const PREFERENCE_KEYS = ['budget', 'style', 'scene', 'brand'];
const MAX_FACTS = 8;
const MAX_TOPICS = 8;

export function createSession({ visitorId = null, conversationId = null, createdAt = new Date().toISOString() } = {}) {
  const openingMessage = OPENING_MESSAGES[Math.floor(Math.random() * OPENING_MESSAGES.length)];
  return {
    visitorId,
    conversationId,
    title: null,
    createdAt,
    updatedAt: createdAt,
    history: [],
    userPreferences: {},
    pendingProduct: null,
    userFacts: [],
    recentTopics: [],
    currentTopic: null,
    conversationFlow: 'CONTINUE',
    topicTurnCount: 0,
    openingMessage,
    todayNote: CREATOR_CONTENT[Math.floor(Math.random() * CREATOR_CONTENT.length)],
    creatorContent: CREATOR_CONTENT,
    creatorConfig: CREATOR_CONFIG,
    hasGreeted: false,
  };
}

export function appendTurn(session, userMessage, assistantReply) {
  session.history.push(
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantReply },
  );
  while (session.history.length > MAX_HISTORY_MESSAGES) {
    session.history.splice(0, 2);
  }
}

export function mergePreferences(session, update) {
  if (!update || typeof update !== 'object' || Array.isArray(update)) return;
  for (const key of PREFERENCE_KEYS) {
    const value = update[key];
    if (typeof value === 'string' && value.trim()) {
      session.userPreferences[key] = value.trim();
    }
  }
}

function normalizeFact(value) {
  return String(value || '').replace(/^用户(说|提到|表示|的事实是)?/u, '').trim();
}

function isSafeExplicitFact(value) {
  return value.length >= 4
    && value.length <= 120
    && !/(如果|假设|可能|也许|要是|的话)/u.test(value)
    && !/(直接推荐|推荐|链接|地址|给我|我需要|想买|买(?:一个|一款|一台)|帮我|下单)/u.test(value)
    && !/(对方|他|她|他们).*(喜欢|爱|在意)/u.test(value)
    && !/(恋爱了|约会|情侣|亲密度|一定会|肯定会)/u.test(value);
}

export function cleanUserFacts(session) {
  if (!session || !Array.isArray(session.userFacts)) return;
  session.userFacts = session.userFacts.filter((fact) => isSafeExplicitFact(String(fact || '').trim()));
}

export function mergeUserFacts(session, candidates, sourceMessage = '') {
  if (!Array.isArray(candidates)) return;
  const source = String(sourceMessage || '').replace(/[，。！？,.!?]/g, '');
  for (const candidate of candidates) {
    const fact = normalizeFact(candidate);
    if (!isSafeExplicitFact(fact)) continue;
    if (source && !source.includes(fact.replace(/[，。！？,.!?]/g, '')) && !fact.includes(source)) continue;
    if (!session.userFacts.includes(fact)) session.userFacts.push(fact);
  }
  session.userFacts = session.userFacts.slice(-MAX_FACTS);
}

export function mergeDurableMemory(session, sourceMessage = '') {
  const source = String(sourceMessage || '').trim();
  const durable = source.match(/(?:我(?:不喜欢|喜欢|偏好)[^。！？]{2,40}|预算[^。！？]{1,30}(?:以内|以下|左右)|最近开始(?:跑步|运动|健身)|平时(?:喜欢|主要)穿[^。！？]{2,30})/u)?.[0];
  if (durable && !session.userFacts.includes(durable)) session.userFacts.push(durable);
  session.userFacts = session.userFacts.slice(-MAX_FACTS);
}

export function addRecentTopic(session, topic) {
  const value = String(topic || '').trim();
  if (!value) return;
  session.recentTopics = [...session.recentTopics.filter((item) => item !== value), value].slice(-MAX_TOPICS);
}

// 兼容旧调用名，但只接受显式事实，不再写入关系状态。
export function mergeMemoryCandidates(session, candidates, sourceMessage = '') {
  mergeUserFacts(session, candidates, sourceMessage);
}
