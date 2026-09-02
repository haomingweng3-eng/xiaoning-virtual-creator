const VISITOR_STORAGE_KEY = 'xiaoning.visitorId';
const CONVERSATION_STORAGE_KEY = 'xiaoning.conversationId';

export function createSessionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getClientSessionId() {
  try {
    const existing = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // sessionStorage may be unavailable in a restricted browser context.
  }
  const sessionId = createSessionId();
  try { window.localStorage.setItem(CONVERSATION_STORAGE_KEY, sessionId); } catch {
    // Keep the in-memory id when storage is unavailable.
  }
  return sessionId;
}

export function getVisitorId() {
  try {
    const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing) return existing;
  } catch {}
  const visitorId = createSessionId();
  try { window.localStorage.setItem(VISITOR_STORAGE_KEY, visitorId); } catch {}
  return visitorId;
}

export async function sendChat(message, sessionId = getClientSessionId()) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorId: getVisitorId(), conversationId: sessionId, message }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.reply || '消息发送失败');
  }
  return data;
}

export async function getSessionState(sessionId = getClientSessionId()) {
  const response = await fetch(`/api/session?conversationId=${encodeURIComponent(sessionId)}&visitorId=${encodeURIComponent(getVisitorId())}`);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error('获取会话状态失败');
  }
  return data;
}

export async function listConversations() {
  const response = await fetch(`/api/conversations?visitorId=${encodeURIComponent(getVisitorId())}`);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error('获取会话列表失败');
  return data.conversations || [];
}

export async function createConversation() {
  const response = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId: getVisitorId() }) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error('创建会话失败');
  try { window.localStorage.setItem(CONVERSATION_STORAGE_KEY, data.conversationId); } catch {}
  return data;
}

export async function deleteConversation(conversationId) {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}?visitorId=${encodeURIComponent(getVisitorId())}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('删除会话失败');
  return response.json();
}
