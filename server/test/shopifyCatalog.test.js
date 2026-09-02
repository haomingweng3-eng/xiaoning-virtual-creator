import { describe, expect, test, vi } from 'vitest';
import { searchShopifyCatalog, normalizeShopifyProducts } from '../src/shopifyCatalog.js';

const shopifyResponse = {
  result: {
    structuredContent: {
      products: [{
        id: 'gid://shopify/Product/1',
        title: 'Lightweight Running Headphones',
        description: { plain: 'Open fit running headphones' },
        media: [{ url: 'https://cdn.example/headphones.jpg', alt_text: 'headphones' }],
        variants: [{
          id: 'gid://shopify/ProductVariant/1',
          price: { amount: 4999, currency: 'USD' },
          availability: { available: true },
          product_url: 'https://merchant.example/products/headphones',
          checkout_url: 'https://merchant.example/checkout/headphones',
        }],
        merchant: { name: 'Example Merchant' },
        productType: 'Headphones',
        vendor: 'AeroRun',
        tags: ['running', 'open-ear'],
        options: [{ name: 'Color', values: ['Black', 'Sage'] }],
      }],
    },
  },
};

describe('Shopify Global Catalog provider', () => {
  test('normalizes UCP catalog products without inventing missing fields', () => {
    expect(normalizeShopifyProducts(shopifyResponse)).toEqual([expect.objectContaining({
      id: 'gid://shopify/Product/1',
      title: 'Lightweight Running Headphones',
      description: 'Open fit running headphones',
      price: 49.99,
      currency: 'USD',
      imageUrl: 'https://cdn.example/headphones.jpg',
      merchant: 'Example Merchant',
      productUrl: 'https://merchant.example/products/headphones',
      checkoutUrl: 'https://merchant.example/checkout/headphones',
      source: 'shopify',
      productType: 'Headphones',
      vendor: 'AeroRun',
      tags: ['running', 'open-ear'],
      options: [{ name: 'Color', values: ['Black', 'Sage'] }],
      variants: [expect.objectContaining({ id: 'gid://shopify/ProductVariant/1', available: true })],
      brand: 'AeroRun',
      model: 'Lightweight Running Headphones',
      variantLabel: null,
      specifications: [{ label: '颜色', value: 'Black / Sage', evidence: 'provider.options.Color' }],
    })]);
  });

  test('extracts model and version from provider titles without inventing device specs', () => {
    const products = normalizeShopifyProducts({ products: [
      { id: 'xiaomi-17-pro-max', title: 'Xiaomi 17 Pro Max Chinese Version', productUrl: 'https://example.com/xiaomi', variants: [{ id: 'xiaomi-v1' }] },
      { id: 'iphone-17', title: 'iPhone 17 (Unlocked)', productUrl: 'https://example.com/iphone', variants: [{ id: 'iphone-v1' }] },
    ] });
    expect(products[0]).toEqual(expect.objectContaining({ brand: 'Xiaomi', model: '17 Pro Max', variantLabel: 'Chinese Version', specifications: [{ label: '版本', value: 'Chinese Version', evidence: 'provider.title' }] }));
    expect(products[1]).toEqual(expect.objectContaining({ brand: 'Apple', model: 'iPhone 17', variantLabel: 'Unlocked', specifications: [{ label: '版本', value: 'Unlocked', evidence: 'provider.title' }] }));
    expect(JSON.stringify(products)).not.toMatch(/128GB|256GB|黑色|5G|A19/);
  });

  test('prefers a concrete selected variant over all option values', () => {
    const [product] = normalizeShopifyProducts({ products: [{
      id: 'iphone-options', title: 'iPhone 17', productUrl: 'https://example.com/iphone-options',
      options: [{ name: 'Storage', values: ['128GB', '256GB', '512GB'] }, { name: 'Color', values: ['Black', 'Silver'] }],
      variants: [{ id: 'variant-256-black', title: '256GB / Black', selectedOptions: [{ name: 'Storage', value: '256GB' }, { name: 'Color', value: 'Black' }] }],
    }] });
    expect(product.variantLabel).toBe('256GB · Black');
    expect(product.specifications).toEqual([
      { label: '存储容量', value: '256GB', evidence: 'provider.variants[0].selectedOptions.Storage' },
      { label: '颜色', value: 'Black', evidence: 'provider.variants[0].selectedOptions.Color' },
    ]);
  });

  test('calls tools/call with an agent profile and catalog search arguments', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => shopifyResponse });
    const result = await searchShopifyCatalog({ query: 'running headphones', category: '耳机', requirements: ['不容易掉'], max_price: 100 }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('search_catalog');
    expect(body.params.arguments.meta['ucp-agent'].profile).toContain('shopify.dev/ucp/agent-profiles');
    expect(body.params.arguments.catalog.query).toContain('running headphones');
    expect(result.products[0].source).toBe('shopify');
  });

  test('returns an unavailable result when the endpoint fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(searchShopifyCatalog({ query: 'coffee' }, { fetchImpl })).resolves.toEqual({ products: [], unavailable: true });
  });
});
