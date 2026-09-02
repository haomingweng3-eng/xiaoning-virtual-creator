import { describe, expect, test } from 'vitest';
import { buildProductEvidence, buildProductInsights, rankInsightfulProducts } from '../src/productInsights.js';

const baseProduct = {
  id: 'headphones-1',
  title: 'AeroRun Open-Ear Sport Headphones',
  description: 'Lightweight open-ear headphones with secure ear hooks for running.',
  productType: 'Open-ear headphones',
  vendor: 'AeroRun',
  tags: ['sport', 'lightweight', 'secure fit'],
  options: [{ name: 'Color', values: ['Sage', 'Black'] }],
  variants: [{ title: 'Sage', available: true }],
  metadata: { sourceExcerpt: 'Secure ear hooks and open-ear listening.' },
  price: 79.99,
  currency: 'USD',
  merchant: 'AeroRun Store',
  productUrl: 'https://shop.example/products/aerorun',
  source: 'shopify',
};

describe('Product Evidence and ProductInsights', () => {
  test('keeps traceable provider fields as product evidence', () => {
    const evidence = buildProductEvidence(baseProduct);
    expect(evidence).toEqual(expect.arrayContaining([
      { field: 'description', value: 'Lightweight open-ear headphones with secure ear hooks for running.' },
      { field: 'tags', value: 'secure fit' },
      { field: 'price', value: 'USD 79.99' },
    ]));
  });

  test('creates selling points only when each point has direct evidence', () => {
    const insights = buildProductInsights(baseProduct, {
      message: '跑步的时候耳机老掉，帮我看看稳一点的',
      requirements: ['跑步', '不容易掉'],
    });
    expect(insights.productId).toBe('headphones-1');
    expect(insights.sellingPoints.length).toBeGreaterThan(0);
    expect(insights.sellingPoints.every((point) => point.label && point.detail && point.evidence)).toBe(true);
    expect(insights.sellingPoints.some((point) => /稳固|运动/.test(point.label))).toBe(true);
    expect(insights.personalizedReason).toMatch(/跑步|松动|稳固/);
    expect(insights.confidence).toBeGreaterThanOrEqual(0.6);
  });

  test('never invents unsupported specs or fake experience', () => {
    const insights = buildProductInsights({
      id: 'plain-1', title: 'Everyday Earbuds', description: 'Simple everyday earbuds.',
      merchant: 'Example', productUrl: 'https://shop.example/products/plain', source: 'tavily',
    }, { message: '想看看耳机' });
    const output = JSON.stringify(insights);
    expect(output).not.toMatch(/续航|防水|重量|芯片|认证|我买过|我用过|亲测/);
    expect(insights.sellingPoints.every((point) => point.evidence)).toBe(true);
  });

  test('uses a real over-budget price as the only tradeoff', () => {
    const insights = buildProductInsights(baseProduct, { message: '预算 50 美元以内', maxPrice: 50 });
    expect(insights.tradeoff).toMatch(/预算/);
    expect(insights.tradeoff).toContain('USD');
  });

  test('keeps fewer products when evidence does not differentiate them', () => {
    const products = [1, 2, 3].map((index) => ({
      ...baseProduct,
      id: `same-${index}`,
      title: `AeroRun Sport Headphones ${index}`,
      productUrl: `https://shop.example/products/${index}`,
    }));
    const ranked = rankInsightfulProducts(products, { message: '跑步耳机老掉', requirements: ['稳固'] }, 3);
    expect(ranked.length).toBeLessThan(3);
    expect(ranked[0].productInsights.sellingPoints.every((point) => point.evidence)).toBe(true);
  });

  test('uses each product unique evidence to avoid repeated personalized reasons', () => {
    const products = [
      { ...baseProduct, id: 'sport-options', description: 'Designed for running.', tags: ['sport'], metadata: {}, productUrl: 'https://shop.example/products/sport-options' },
      { ...baseProduct, id: 'sport-waterproof', description: 'Waterproof sport headphones for running.', tags: ['sport', 'waterproof'], options: [], metadata: {}, productUrl: 'https://shop.example/products/sport-waterproof' },
    ];
    const ranked = rankInsightfulProducts(products, { message: '帮我看看跑步耳机', requirements: ['跑步'] }, 3);
    expect(ranked).toHaveLength(2);
    expect(new Set(ranked.map((product) => product.productInsights.personalizedReason)).size).toBe(2);
    expect(ranked[1].productInsights.personalizedReason).toMatch(/防水|防汗/);
  });

  test('returns zero products when no trustworthy insight can be grounded', () => {
    const ranked = rankInsightfulProducts([{
      id: 'empty', title: 'Item 9283', description: '', merchant: 'Shop',
      productUrl: 'https://shop.example/products/9283', source: 'tavily',
    }], { message: '帮我看看' }, 3);
    expect(ranked).toEqual([]);
  });
});
