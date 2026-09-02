import { describe, expect, test, vi } from 'vitest';
import { cleanShoppingResults, searchProducts, searchWithFallback } from '../src/productSearch.js';

describe('Tavily Product Rendering Gate', () => {
  test('filters content pages, invalid urls, and duplicate products', () => {
    const results = cleanShoppingResults({ results: [
      { title: '跑步耳机购买攻略', url: 'https://example.com/article/headphones', content: '攻略' },
      { title: '轻量跑步耳机', url: 'https://shop.example/products/headphones?id=1&utm_source=x', content: '¥299' },
      { title: '轻量 跑步 耳机', url: 'https://shop.example/products/headphones?id=2', content: '¥399' },
    ]}, { maxPrice: 350 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ title: '轻量跑步耳机', price: 299, currency: null, source: 'tavily' });
  });

  test('keeps missing price and image as null, never zero or fake urls', () => {
    const [product] = cleanShoppingResults({ results: [{
      id: 'p1', title: '简约帆布包', url: 'https://shop.example/product/bag', content: '精选', image: '',
    }]});
    expect(product).toMatchObject({ price: null, imageUrl: null, productUrl: 'https://shop.example/product/bag' });
    expect(product.metadata).toEqual(expect.objectContaining({ sourceExcerpt: '精选' }));
  });

  test('never returns more than three trusted results', () => {
    const results = cleanShoppingResults({ results: [1, 2, 3, 4].map((id) => ({
      title: `商品${id}`, url: `https://shop.example/product/${id}`, content: '¥10',
    }))});
    expect(results).toHaveLength(3);
  });
});

describe('provider fallback', () => {
  test('uses Tavily only after Shopify is unavailable or empty', async () => {
    const shopifySearch = vi.fn().mockResolvedValue({ products: [], unavailable: false });
    const tavilySearch = vi.fn().mockResolvedValue({ products: [{ id: 't1' }], unavailable: false });
    await expect(searchWithFallback({ query: '耳机' }, { shopifySearch, tavilySearch })).resolves.toEqual({ products: [{ id: 't1' }], unavailable: false });
    expect(shopifySearch).toHaveBeenCalledTimes(1);
    expect(tavilySearch).toHaveBeenCalledTimes(1);
  });

  test('returns no products when Tavily key is missing', async () => {
    await expect(searchProducts({ query: '耳机' }, { apiKey: '' })).resolves.toEqual({ products: [], unavailable: true });
  });
});
