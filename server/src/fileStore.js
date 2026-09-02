import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
        if (Array.isArray(facts)) this.memories.set(visitorId, facts);
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

  saveMemory(visitorId, facts) {
    if (!visitorId) return;
    this.memories.set(visitorId, [...new Set((facts || []).map(String).filter(Boolean))].slice(-16));
    this.flush();
  }

  getMemory(visitorId) { return [...(this.memories.get(visitorId) || [])]; }

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
