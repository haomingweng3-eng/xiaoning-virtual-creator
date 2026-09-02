import { describe, expect, test } from 'vitest';
import { analyzeTranscript } from '../src/conversationNaturalness.js';

describe('conversation naturalness metrics', () => {
  test('counts question ratio and consecutive interview questions from real turns', () => {
    const result = analyzeTranscript([
      { role: 'user', content: '最近好累。' },
      { role: 'assistant', content: '是工作太多吗？', topic: '疲惫' },
      { role: 'user', content: '项目太多。' },
      { role: 'assistant', content: '最烦的是哪一件？', topic: '疲惫' },
    ]);
    expect(result).toMatchObject({
      assistantTurns: 2,
      questionTurns: 2,
      questionRatio: 1,
      consecutiveQuestionPairs: 1,
      repeatedUserExpressions: 0,
      customerServiceTurns: 0,
    });
  });

  test('detects customer-service language, repeated user wording, and topic transitions', () => {
    const result = analyzeTranscript([
      { role: 'user', content: '我觉得 AirPods 挺好的。' },
      { role: 'assistant', content: '我觉得AirPods挺好的，很高兴为您服务。', topic: '耳机' },
      { role: 'user', content: '对了，我想换个手机。' },
      { role: 'assistant', content: '手机可以单独聊。', topic: '手机' },
    ]);
    expect(result.customerServiceTurns).toBe(1);
    expect(result.repeatedUserExpressions).toBe(1);
    expect(result.topicTransitions).toBe(1);
  });
});
