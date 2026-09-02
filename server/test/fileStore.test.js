import { describe, expect, test } from 'vitest';
import { FileStore } from '../src/fileStore.js';

describe('persistent memory filtering', () => {
  test('keeps preferences and constraints but excludes one-off commands', () => {
    const store = new FileStore();
    store.saveMemory('visitor-a', [
      '我不喜欢入耳式耳机',
      '跑步的时候耳机老往下掉',
      '直接推荐',
      '给我链接',
      '我需要MacBook',
      '今天项目终于做完了',
    ]);

    expect(store.getMemory('visitor-a')).toEqual([
      '我不喜欢入耳式耳机',
      '跑步的时候耳机老往下掉',
    ]);
    expect(store.listMemory('visitor-a').map(({ text }) => text)).toEqual([
      '我不喜欢入耳式耳机',
      '跑步的时候耳机老往下掉',
    ]);
  });
});
