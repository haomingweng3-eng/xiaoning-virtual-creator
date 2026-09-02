const SHOPIFY_GLOBAL_CATALOG_ENDPOINT = 'https://catalog.shopify.com/api/ucp/mcp';
const AGENT_PROFILE = 'https://shopify.dev/ucp/agent-profiles/examples/2026-04-08/valid-with-capabilities.json';
import { normalizeProductSpecifications } from './productSpecifications.js';

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? null;
}

function textValue(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return firstValue(value.plain, value.text, value.value, value.html);
  return null;
}

function priceValue(value) {
  const amount = Number(value?.amount ?? value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Number.isInteger(amount) ? amount / 100 : amount;
}

function compactVariant(variant = {}) {
  return {
    id: firstValue(variant.id, variant.sku),
    title: textValue(variant.title),
    available: variant.availability?.available !== false,
    selectedOptions: Array.isArray(variant.selectedOptions) ? variant.selectedOptions : undefined,
  };
}

function productArrays(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value.products)) found.push(...value.products);
  if (Array.isArray(value.items)) found.push(...value.items);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && child !== value) productArrays(child, found);
  }
  return found;
}

export function normalizeShopifyProducts(payload) {
  let root = payload;
  const text = payload?.result?.content?.find?.((item) => item.type === 'text')?.text;
  if (text) {
    try { root = { ...payload, parsedText: JSON.parse(text) }; } catch { /* structuredContent remains the source */ }
  }
  const candidates = productArrays(root);
  const seen = new Set();
  return candidates.map((product) => {
    const variant = (product.variants || product.offers || []).find((item) => item?.availability?.available !== false) || product.variants?.[0] || product.offers?.[0] || {};
    const media = product.media?.[0] || product.images?.[0] || {};
    const url = firstValue(product.productUrl, product.product_url, product.url, variant.productUrl, variant.product_url, variant.url);
    const id = firstValue(product.id, variant.id);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      title: textValue(product.title) || null,
      description: textValue(product.description) || null,
      price: priceValue(variant.price || product.price),
      currency: firstValue(variant.price?.currency, product.price?.currency),
      imageUrl: firstValue(media.url, media.src, media.image_url, product.imageUrl, product.image_url),
      merchant: textValue(product.merchant) || textValue(variant.merchant) || firstValue(product.merchant?.name, variant.merchant?.name),
      productUrl: url,
      checkoutUrl: firstValue(product.checkoutUrl, product.checkout_url, variant.checkoutUrl, variant.checkout_url),
      source: 'shopify',
      productType: textValue(product.productType) || textValue(product.product_type),
      vendor: textValue(product.vendor) || firstValue(product.vendor?.name),
      tags: Array.isArray(product.tags) ? product.tags.map(textValue).filter(Boolean) : [],
      options: Array.isArray(product.options) ? product.options : [],
      variants: Array.isArray(product.variants) ? product.variants.map(compactVariant) : [],
      metadata: product.metadata && typeof product.metadata === 'object' ? product.metadata : {},
      ...normalizeProductSpecifications(product, variant, Math.max(0, (product.variants || []).indexOf(variant))),
    };
  }).filter((product) => product?.title && (product.productUrl || product.checkoutUrl)).slice(0, 3);
}

export async function searchShopifyCatalog(intent, options = {}) {
  const query = String(intent?.query || intent?.category || '').trim();
  if (!query) return { products: [], unavailable: false };
  const fetchImpl = options.fetchImpl || fetch;
  const catalog = {
    query,
    context: {
      language: 'zh-CN',
      currency: 'CNY',
      intent: Array.isArray(intent.requirements) ? intent.requirements.join('，') : undefined,
    },
    filters: { available: true },
    pagination: { limit: 10 },
  };
  if (Number.isFinite(Number(intent.max_price)) && Number(intent.max_price) > 0) {
    catalog.filters.price = { max: Math.round(Number(intent.max_price) * 100) };
  }
  try {
    const response = await fetchImpl(SHOPIFY_GLOBAL_CATALOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: Date.now(),
        params: {
          name: 'search_catalog',
          arguments: {
            meta: { 'ucp-agent': { profile: AGENT_PROFILE } },
            catalog,
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`Shopify MCP error: ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || 'Shopify MCP error');
    return { products: normalizeShopifyProducts(payload), unavailable: false };
  } catch (error) {
    console.error('Shopify Global Catalog MCP 搜索失败:', error.message);
    return { products: [], unavailable: true };
  }
}

export { SHOPIFY_GLOBAL_CATALOG_ENDPOINT, AGENT_PROFILE };
