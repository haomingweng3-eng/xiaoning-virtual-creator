import { describe, expect, test } from 'vitest';
import { validateReply } from '../src/validators.js';

describe('validateReply', () => {
  test.each([
    '这款鼠标只要99元，很适合你',
    '链接是 https://item.taobao.com/123',
    '我推荐你买这款无线鼠标',
  ])('blocks product information when search was not called: %s', (reply) => {
    expect(validateReply({ reply, searchCalled: false, negativeEmotion: false }).valid).toBe(false);
  });

  test('blocks any search in a negative emotion scene', () => {
    expect(validateReply({ reply: '抱抱你', searchCalled: true, negativeEmotion: true }).valid).toBe(false);
  });

  test('blocks product details from the final shopping companion copy', () => {
    expect(validateReply({
      reply: '第一款89元，链接 https://item.taobao.com/1',
      searchCalled: true,
      disallowProductDetails: true,
    }).valid).toBe(false);
  });

  test('blocks customer-service phrasing', () => {
    expect(validateReply({ reply: '您好，请问有什么可以帮您？', searchCalled: false }).valid).toBe(false);
  });

  test.each(['我穿过这件', '我买过这个', '我亲测很好用', '我用了三个月'])('blocks invented first-person experience: %s', (reply) => {
    expect(validateReply({ reply, searchCalled: true }).valid).toBe(false);
  });

  test('blocks an invented personal purchase phrased as a recent choice', () => {
    expect(validateReply({ reply: '我自己后来买了 AirPods，通勤听播客很方便。' }).valid).toBe(false);
  });

  test('blocks repeating the immediately previous creator reply', () => {
    expect(validateReply({
      reply: '这个我先不急着替你下结论，慢慢聊就好。',
      previousReply: '这个我先不急着替你下结论，慢慢聊就好。',
    })).toEqual({ valid: false, reasons: ['duplicate-previous-reply'] });
  });

  test('allows a short natural companion response', () => {
    expect(validateReply({ reply: '听起来今天真的挺累的，先缓一缓呀。', searchCalled: false }).valid).toBe(true);
  });

  test('blocks another question when the recent replies already form an interview streak', () => {
    expect(validateReply({ reply: '那你现在是什么感觉？', disallowQuestion: true })).toEqual({
      valid: false,
      reasons: ['interview-question-streak'],
    });
  });

  test('allows a concise independent opinion without forced agreement', () => {
    expect(validateReply({ reply: 'AirPods 是方便，但如果跑步容易松，我不会只因为它热门就选它。' }).valid).toBe(true);
  });

  test('blocks leaked writing instructions from creator-facing segments', () => {
    expect(validateReply({ reply: '顺着外出用餐的话题，给一个具体建议，不刻意推选项。' })).toEqual({
      valid: false,
      reasons: ['leaked-meta-instruction'],
    });
  });

  test('blocks multiple questions inside one natural reply', () => {
    expect(validateReply({ reply: '你现在用哪台？用了多久了？', maxQuestions: 1 })).toEqual({
      valid: false,
      reasons: ['too-many-questions'],
    });
  });
});
