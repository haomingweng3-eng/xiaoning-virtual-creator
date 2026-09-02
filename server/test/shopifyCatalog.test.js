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
    })]);
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
