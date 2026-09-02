const SESSION_STORAGE_KEY = 'xiaoning.sessionId';

export function createSessionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getClientSessionId() {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // sessionStorage may be unavailable in a restricted browser context.
  }
  const sessionId = createSessionId();
  try { window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId); } catch {
    // Keep the in-memory id when storage is unavailable.
  }
  return sessionId;
}

export async function sendChat(message, sessionId = getClientSessionId()) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.reply || '消息发送失败');
  }
  return data;
}

export async function getSessionState(sessionId = getClientSessionId()) {
  const response = await fetch(`/api/session?sessionId=${encodeURIComponent(sessionId)}`);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error('获取会话状态失败');
  }
  return data;
}
