import { describe, expect, test } from 'vitest';
import { appendTurn, cleanUserFacts, createSession, mergePreferences, mergeUserFacts, addRecentTopic } from '../src/session.js';

describe('session memory', () => {
  test('starts without intimacy or relationship progression state', () => {
    const session = createSession();
    expect(session.relationship).toBeUndefined();
    expect(session.intimacy).toBeUndefined();
    expect(session.userFacts).toEqual([]);
    expect(session.recentTopics).toEqual([]);
    expect(session.conversationFlow).toBe('CONTINUE');
    expect(session.topicTurnCount).toBe(0);
    expect(session.creatorConfig.avatarStage.media).toEqual({ type: 'image', src: '/assets/xiaoning-main.png' });
    expect(session.creatorConfig.avatarStage.fallbackImage).toBe('/assets/xiaoning-main.png');
    expect(JSON.stringify(session.creatorConfig)).not.toMatch(/avatar-main\.mp4|creator-host\.png/);
  });

  test('keeps eight complete user and assistant turns', () => {
    const session = createSession();
    for (let index = 1; index <= 10; index += 1) {
      appendTurn(session, `用户${index}`, `回复${index}`);
    }
    expect(session.history).toHaveLength(16);
    expect(session.history[0]).toEqual({ role: 'user', content: '用户3' });
    expect(session.history[1]).toEqual({ role: 'assistant', content: '回复3' });
  });

  test('merges only supported non-empty preference values', () => {
    const session = createSession();
    mergePreferences(session, { budget: '100元以内', style: '', unknown: '忽略' });
    expect(session.userPreferences).toEqual({ budget: '100元以内' });
  });

  test('stores explicit facts and recent topics without duplicate inference', () => {
    const session = createSession();
    mergeUserFacts(session, ['最近在赶一个项目。', '对方一定喜欢我']);
    addRecentTopic(session, '工作');
    addRecentTopic(session, '工作');
    expect(session.userFacts).toEqual(['最近在赶一个项目。']);
    expect(session.recentTopics).toEqual(['工作']);
  });

  test('removes recommendation commands from user facts before they become memory context', () => {
    const session = createSession();
    session.userFacts = ['我不喜欢入耳式耳机', '直接推荐', '给我链接', '我需要MacBook'];
    cleanUserFacts(session);
    expect(session.userFacts).toEqual(['我不喜欢入耳式耳机']);
  });
});
