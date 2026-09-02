const ARTICLE_WORDS = [
  '文章', '攻略', '指南', '资讯', '新闻', '测评', '评测', '榜单', '排行榜', '十大',
  '推荐榜', '热销榜', '清单', '大全', '怎么选', '值得买', '知乎', '博客', 'blog',
  'article', 'news', 'guide', 'rank', 'list', 'search', 'query',
];
const TRACKING_PARAMS = /^(utm_|spm$|ref$|from$|source$|share_)/i;
const DETAIL_HINTS = [
  /(^|\.)item\./i, /(^|\.)detail\./i, /(^|\.)goods\./i,
  /\/item(?:\/|\.|$)/i, /\/product(?:\/|\.|$)/i, /\/goods(?:\/|\.|$)/i,
  /\/detail(?:\/|\.|$)/i, /[?&](?:id|sku|itemId)=/i,
];
import { normalizeProductSpecifications } from './productSpecifications.js';

function isHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function canonicalizeUrl(value) {
  if (!isHttpUrl(value)) return null;
  const url = new URL(String(value));
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

export function normalizeTitle(value) {
  return String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').trim();
}

function looksLikeContentPage(title, url) {
  const haystack = `${String(title || '')} ${String(url || '')}`.toLowerCase();
  return ARTICLE_WORDS.some((word) => haystack.includes(word.toLowerCase()))
    || /\/(?:search|list|category|topic|article|news|blog)(?:\/|\?|$)/i.test(String(url || ''));
}

function looksLikeProductDetail(url) {
  try {
    const parsed = new URL(url);
    return DETAIL_HINTS.some((pattern) => pattern.test(parsed.hostname) || pattern.test(parsed.pathname) || pattern.test(parsed.search));
  } catch {
    return false;
  }
}

function extractPrice(result) {
  const rawPrice = result?.price?.amount ?? result?.price;
  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice > 0) return rawPrice;
  const text = [rawPrice, result?.content, result?.snippet, result?.title].filter((value) => value !== undefined && value !== null).join(' ');
  for (const pattern of [/[¥￥]\s*(\d+(?:\.\d*)?)/, /(\d+(?:\.\d*)?)\s*(?:元|块)/, /(?:价格|售价)\s*[:：]?\s*(\d+(?:\.\d*)?)/]) {
    const price = Number(text.match(pattern)?.[1]);
    if (Number.isFinite(price) && price > 0 && price < 100000) return price;
  }
  return null;
}

function cleanDescription(text) {
  return String(text || '').replace(/\s+/g, ' ').replace(/已有\d+人评价/g, '').trim().slice(0, 120);
}

function normalizeProduct(result) {
  const productUrl = canonicalizeUrl(result?.url || result?.link);
  const title = String(result?.title || '').trim();
  if (!title || !productUrl || looksLikeContentPage(title, productUrl) || !looksLikeProductDetail(productUrl)) return null;
  const imageUrl = String(result?.image || result?.thumbnail || result?.image_url || '').trim();
  const normalized = {
    id: String(result?.id || productUrl),
    title,
    description: cleanDescription(result?.content || result?.snippet || result?.raw_content),
    price: extractPrice(result),
    currency: result?.currency || null,
    imageUrl: isHttpUrl(imageUrl) ? imageUrl : null,
    merchant: result?.merchant || result?.source || new URL(productUrl).hostname.replace(/^www\./i, ''),
    productUrl,
    checkoutUrl: null,
    source: 'tavily',
    productType: result?.productType || result?.product_type || null,
    vendor: result?.vendor || null,
    tags: Array.isArray(result?.tags) ? result.tags : [],
    options: Array.isArray(result?.options) ? result.options : [],
    variants: Array.isArray(result?.variants) ? result.variants : [],
    metadata: {
      sourceExcerpt: cleanDescription(result?.raw_content || result?.content || result?.snippet),
    },
  };
  return { ...normalized, ...normalizeProductSpecifications(normalized) };
}

export function cleanShoppingResults(payload, limits = {}) {
  const minPrice = Number.isFinite(Number(limits.minPrice)) ? Number(limits.minPrice) : 0;
  const maxPrice = Number.isFinite(Number(limits.maxPrice)) ? Number(limits.maxPrice) : Number.POSITIVE_INFINITY;
  const limit = Math.min(3, Math.max(0, Number(limits.limit) || 3));
  const seenUrls = new Set();
  const seenTitles = new Set();
  const products = [];
  for (const result of Array.isArray(payload?.results) ? payload.results : []) {
    const product = normalizeProduct(result);
    if (!product) continue;
    const title = normalizeTitle(product.title);
    if (seenUrls.has(product.productUrl) || (title && seenTitles.has(title))) continue;
    if (product.price !== null && (product.price < minPrice || product.price > maxPrice)) continue;
    seenUrls.add(product.productUrl);
    if (title) seenTitles.add(title);
    products.push(product);
    if (products.length >= limit) break;
  }
  return products;
}

export async function searchProducts(intent, options = {}) {
  const query = String(intent?.query || intent?.category || '').trim();
  if (!query) return { products: [], unavailable: false };
  const apiKey = options.apiKey ?? process.env.TAVILY_API_KEY;
  if (!apiKey) return { products: [], unavailable: true };
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const response = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query: `${query} 商品`, search_depth: 'basic', max_results: 20, include_answer: false }),
    });
    if (!response.ok) throw new Error(`Tavily API error: ${response.status}`);
    const data = await response.json();
    return {
      products: cleanShoppingResults(data, { minPrice: intent.min_price, maxPrice: intent.max_price, limit: 3 }),
      unavailable: false,
    };
  } catch (error) {
    console.error('Tavily 商品搜索失败:', error.message);
    return { products: [], unavailable: true };
  }
}

export async function searchWithFallback(intent, options = {}) {
  const shopifySearch = options.shopifySearch;
  const tavilySearch = options.tavilySearch || searchProducts;
  if (shopifySearch) {
    try {
      const primary = await shopifySearch({
        query: intent.query,
        category: intent.category,
        requirements: intent.requirements,
        max_price: intent.max_price,
      });
      if (!primary.unavailable && primary.products.length > 0) return primary;
    } catch (error) {
      console.warn('Shopify Catalog 不可用，降级 Tavily:', error.message);
    }
  }
  return tavilySearch(intent);
}
