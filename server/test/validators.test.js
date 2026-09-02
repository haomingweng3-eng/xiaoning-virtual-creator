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

  test('allows a short natural companion response', () => {
    expect(validateReply({ reply: '听起来今天真的挺累的，先缓一缓呀。', searchCalled: false }).valid).toBe(true);
  });
});
