import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MEMORY_SIGNAL_PATTERN = /不喜欢|喜欢|偏好|预算|最近开始(?:跑步|运动|健身)|平时(?:喜欢|主要)穿|跑步(?:的时候)?耳机.*(?:掉|松)|耳机.*(?:掉|松)/u;
const MEMORY_COMMAND_PATTERN = /直接推荐|推荐|链接|地址|商品页|购买页|给我|我需要|想买|买(?:一个|一款|一台)|帮我|今天|今晚|我准备|推荐的东西|我直接/u;

export function isPersistentMemoryFact(value) {
  const text = String(value || '').trim();
  return Boolean(text) && MEMORY_SIGNAL_PATTERN.test(text) && !MEMORY_COMMAND_PATTERN.test(text);
}

// Small JSON FileStore for the MVP. It intentionally has no database dependency.
export class FileStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.records = new Map();
    this.memories = new Map();
    this.load();
  }

  load() {
    if (!this.filePath) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
      const records = Array.isArray(parsed) ? parsed : parsed?.conversations;
      for (const record of Array.isArray(records) ? records : []) {
        if (record?.conversationId && record?.session) this.records.set(record.conversationId, record);
      }
      for (const [visitorId, facts] of Object.entries(Array.isArray(parsed) ? {} : (parsed?.memories || {}))) {
        if (Array.isArray(facts)) this.memories.set(visitorId, facts.map((fact) => typeof fact === 'string' ? { text: fact, sourceConversationId: null, createdAt: null } : fact));
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn(`FileStore load skipped: ${error.message}`);
    }
  }

  save(record) {
    if (!record?.conversationId) return;
    this.records.set(record.conversationId, record);
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.flush();
  }

  saveMemory(visitorId, facts, sourceConversationId = null) {
    if (!visitorId) return;
    const existing = (this.memories.get(visitorId) || []).filter((fact) => isPersistentMemoryFact(fact.text));
    const durable = (facts || []).map(String).filter(isPersistentMemoryFact);
    const merged = [...existing, ...durable.map((text) => ({ text, sourceConversationId, createdAt: new Date().toISOString() }))];
    const byText = new Map(merged.map((fact) => [fact.text, fact]));
    this.memories.set(visitorId, [...byText.values()].slice(-16));
    this.flush();
  }

  getMemory(visitorId) { return (this.memories.get(visitorId) || []).filter((fact) => isPersistentMemoryFact(fact.text)).map((fact) => fact.text); }

  listMemory(visitorId) {
    return (this.memories.get(visitorId) || []).filter((fact) => isPersistentMemoryFact(fact.text)).map(({ text, ...fact }) => ({ text, ...fact }));
  }

  deleteMemory(visitorId, text) {
    const current = this.memories.get(visitorId) || [];
    const next = current.filter((fact) => fact.text !== text);
    this.memories.set(visitorId, next);
    this.flush();
    return next.length !== current.length;
  }

  clearMemory(visitorId) { this.memories.delete(visitorId); this.flush(); }

  flush() {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify({ conversations: [...this.records.values()], memories: Object.fromEntries(this.memories) }, null, 2));
  }

  delete(conversationId) {
    const removed = this.records.delete(conversationId);
    if (removed) {
      this.flush();
    }
    return removed;
  }

  list(visitorId) {
    return [...this.records.values()]
      .filter((record) => !visitorId || record.visitorId === visitorId)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(({ session, ...summary }) => ({
        conversationId: summary.conversationId,
        visitorId: summary.visitorId,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        title: summary.title || session.history?.find((turn) => turn.role === 'user')?.content?.slice(0, 32) || '新对话',
        messageCount: session.history?.length || 0,
        currentTopic: session.currentTopic || null,
      }));
  }
}
