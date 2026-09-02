import { describe, expect, test } from 'vitest';
import { CREATOR_CONTENT, getCreatorContent } from '../src/creatorContent.js';

describe('creator content', () => {
  test('provides a stable set of creator opinions across lifestyle topics', () => {
    expect(CREATOR_CONTENT.length).toBeGreaterThanOrEqual(10);
    expect(CREATOR_CONTENT.every((item) => item.id && item.topic && item.opinion)).toBe(true);
  });

  test('selects relevant content without inventing product data', () => {
    const content = getCreatorContent('最近开始跑步了');
    expect(content.some((item) => item.topic.includes('跑步'))).toBe(true);
    expect(content.every((item) => !('price' in item) && !('url' in item))).toBe(true);
  });
});
