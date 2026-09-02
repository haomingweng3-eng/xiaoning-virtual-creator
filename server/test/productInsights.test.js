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

  test('keeps specifications separate from selling points', () => {
    const product = {
      ...baseProduct,
      brand: 'AeroRun',
      model: 'Open-Ear Sport Headphones',
      variantLabel: 'Black',
      specifications: [{ label: '颜色', value: 'Black / Sage', evidence: 'provider.options.Color' }],
    };
    const insights = buildProductInsights(product, { message: '帮我看看跑步耳机' });
    expect(insights.sellingPoints.map((point) => point.label)).not.toEqual(expect.arrayContaining(['明确型号', '可选规格']));
    expect(insights.specifications).toEqual(product.specifications);
  });

  test('prioritizes products that have a real requested capacity', () => {
    const ranked = rankInsightfulProducts([
      { ...baseProduct, id: 'no-256', productUrl: 'https://shop.example/products/no-256', specifications: [{ label: '存储容量', value: '128GB', evidence: 'provider.options.Storage' }] },
      { ...baseProduct, id: 'has-256', productUrl: 'https://shop.example/products/has-256', specifications: [{ label: '存储容量', value: '256GB', evidence: 'provider.variants[0].selectedOptions.Storage' }] },
    ], { message: '我要 256GB 的' }, 3);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe('has-256');
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

  test('keeps real apparel products when fit and material are evidence-backed', () => {
    const ranked = rankInsightfulProducts([{
      id: 'hoodie-1', title: 'Signature Hoodie',
      description: 'A heavyweight, oversized hoodie crafted from Cloudtouch fleece for everyday comfort.',
      productUrl: 'https://shop.example/products/hoodie-1', source: 'shopify', price: 39, currency: 'USD',
    }], { message: '我想看看卫衣', topic: '卫衣' });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].productInsights.sellingPoints.map((point) => point.label)).toEqual(expect.arrayContaining(['宽松版型', '厚实面料']));
    expect(ranked[0].productInsights.sellingPoints.every((point) => point.evidence)).toBe(true);
  });

  test('keeps a real product even when no preset selling-point rule matches', () => {
    const ranked = rankInsightfulProducts([{
      id: 'power-bank-1', title: 'MagSafe Power Bank',
      description: 'A compact 10000mAh portable battery with USB-C charging.',
      productUrl: 'https://shop.example/products/power-bank-1', source: 'shopify', price: 49, currency: 'USD',
    }], { message: '我想看看小米的充电宝', topic: '充电宝' });

    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ title: 'MagSafe Power Bank', price: 49 });
    expect(ranked[0].productInsights.sellingPoints).toEqual([]);
  });

  test('returns zero products when no trustworthy insight can be grounded', () => {
    const ranked = rankInsightfulProducts([{
      id: 'empty', title: 'Item 9283', description: '', merchant: 'Shop',
      productUrl: 'https://shop.example/products/9283', source: 'tavily',
    }], { message: '帮我看看' }, 3);
    expect(ranked).toEqual([]);
  });
});
