import { describe, expect, test } from 'vitest';
import { classifyMessage } from '../src/intent.js';

describe('classifyMessage', () => {
  test('negative emotion overrides an explicit shopping request', () => {
    expect(classifyMessage('今天被骂了好委屈，顺便推荐个鼠标')).toEqual({
      scene: 'negative',
      allowSearch: false,
    });
  });

  test('action plus product category is a strong shopping candidate', () => {
    expect(classifyMessage('推荐一款100元以内的无线鼠标')).toEqual({
      scene: 'shopping',
      allowSearch: true,
    });
  });

  test('wanting a product without asking for help stays weak intent', () => {
    expect(classifyMessage('最近想买个鼠标')).toEqual({
      scene: 'weak-shopping',
      allowSearch: false,
    });
  });

  test('confirmation after weak intent opens search permission', () => {
    expect(classifyMessage('好呀，帮我看看', { pendingProduct: '鼠标' })).toEqual({
      scene: 'shopping',
      allowSearch: true,
      inheritedProduct: '鼠标',
    });
  });
});
