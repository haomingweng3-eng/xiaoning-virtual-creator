import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Small JSON FileStore for the MVP. It intentionally has no database dependency.
export class FileStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.records = new Map();
    this.load();
  }

  load() {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
      for (const record of Array.isArray(parsed) ? parsed : []) {
        if (record?.conversationId && record?.session) this.records.set(record.conversationId, record);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn(`FileStore load skipped: ${error.message}`);
    }
  }

  save(record) {
    if (!record?.conversationId) return;
    this.records.set(record.conversationId, record);
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify([...this.records.values()], null, 2));
  }

  delete(conversationId) {
    const removed = this.records.delete(conversationId);
    if (removed) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify([...this.records.values()], null, 2));
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
