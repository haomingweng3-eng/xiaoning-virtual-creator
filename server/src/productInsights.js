function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function addEvidence(list, field, value) {
  const text = clean(value);
  if (!text || list.some((item) => item.field === field && item.value === text)) return;
  list.push({ field, value: text });
}

function addStructuredEvidence(list, field, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' || typeof item === 'number') addEvidence(list, field, item);
      else if (item && typeof item === 'object') {
        const name = clean(item.name || item.title || item.key);
        const details = item.values || item.value || item.selectedOptions || item.options;
        if (Array.isArray(details)) {
          for (const detail of details) {
            const detailText = typeof detail === 'object'
              ? clean(`${detail.name || detail.key || ''}: ${detail.value || detail.name || ''}`)
              : clean(detail);
            addEvidence(list, field, name ? `${name}: ${detailText}` : detailText);
          }
        } else {
          addEvidence(list, field, name ? `${name}: ${clean(details)}` : JSON.stringify(item));
        }
      }
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue === null || nestedValue === undefined || typeof nestedValue === 'object') continue;
      addEvidence(list, field, `${key}: ${nestedValue}`);
    }
    return;
  }
  addEvidence(list, field, value);
}

export function buildProductEvidence(product = {}) {
  const evidence = [];
  for (const field of ['title', 'description', 'productType', 'vendor', 'merchant']) {
    addEvidence(evidence, field, product[field]);
  }
  for (const field of ['tags', 'options', 'variants', 'metadata']) {
    addStructuredEvidence(evidence, field, product[field]);
  }
  const price = Number(product.price);
  if (Number.isFinite(price) && price > 0 && clean(product.currency)) {
    addEvidence(evidence, 'price', `${clean(product.currency).toUpperCase()} ${price}`);
  }
  return evidence;
}

const POINT_RULES = [
  {
    label: '稳固佩戴',
    pattern: /secure(?:\s|-)?fit|secure ear|ear(?:\s|-)?hook|stay(?:s)? in place|稳固|固定|不易掉|耳挂|挂耳/i,
    detail: '商品资料明确提到稳固、固定或耳挂式佩戴设计。',
    suitableFor: '跑步和运动时更在意佩戴稳定的人',
  },
  {
    label: '运动场景',
    pattern: /running|sport|workout|fitness|运动|跑步|健身/i,
    detail: '商品资料把跑步或运动列为明确使用场景。',
    suitableFor: '跑步或日常运动',
  },
  {
    label: '开放式聆听',
    pattern: /open(?:\s|-)?ear|open fit|开放式|开放聆听/i,
    detail: '商品资料明确标注开放式佩戴或聆听结构。',
    suitableFor: '希望保留环境感知的人',
  },
  {
    label: '轻量取向',
    pattern: /lightweight|ultra(?:\s|-)?light|轻量|轻盈/i,
    detail: '商品资料明确使用轻量或轻盈描述。',
    suitableFor: '在意长时间佩戴负担的人',
  },
  {
    label: '降噪取向',
    pattern: /active noise cancellation|noise cancel(?:ling|ation)?|\banc\b|主动降噪|降噪/i,
    detail: '商品资料明确提到降噪能力。',
    suitableFor: '通勤时更在意环境噪声的人',
  },
  {
    label: '明确防水信息',
    pattern: /\bipx\d\b|water(?:\s|-)?resistant|waterproof|防水|防汗/i,
    detail: '商品资料提供了防水或防汗相关描述。',
    suitableFor: '会在运动或户外场景使用的人',
  },
  {
    label: '明确续航信息',
    pattern: /\d+(?:\.\d+)?\s*(?:hours?|hrs?|小时).*?(?:battery|playback|续航)|(?:battery|playback|续航).*?\d+(?:\.\d+)?\s*(?:hours?|hrs?|小时)/i,
    detail: '商品资料提供了可核对的续航时长。',
    suitableFor: '在意单次使用时长的人',
  },
  {
    label: '明确型号',
    pattern: /\b(?:iphone|galaxy|pixel|wf-|wh-|airpods|watch)\s*[a-z0-9-]+\b/i,
    detail: '商品标题给出了可核对的品牌系列或具体型号。',
    suitableFor: '已经锁定具体系列的人',
  },
  {
    label: '可选规格',
    pattern: /(?:color|size|颜色|尺寸|容量)\s*:/i,
    fields: ['options', 'variants'],
    detail: '商品资料列出了可选择的颜色、尺寸或容量规格。',
    suitableFor: '希望比较具体规格的人',
  },
];

function pointPriority(rule, contextText) {
  if (/跑步|运动|掉|松|running|sport/i.test(contextText) && /稳固|运动/.test(rule.label)) return 0;
  if (/通勤|地铁|噪|commute/i.test(contextText) && /降噪/.test(rule.label)) return 0;
  if (/手机|iphone|型号/i.test(contextText) && /型号/.test(rule.label)) return 0;
  return 1;
}

function findSellingPoints(evidence, contextText) {
  return POINT_RULES
    .map((rule) => {
      const match = evidence.find((item) => (!rule.fields || rule.fields.includes(item.field)) && rule.pattern.test(item.value));
      if (!match) return null;
      return {
        label: rule.label,
        detail: rule.detail,
        evidence: `${match.field}: ${match.value}`,
        suitableFor: rule.suitableFor,
        priority: pointPriority(rule, contextText),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3);
}

function personalizedReason(points, contextText) {
  const labels = new Set(points.map((point) => point.label));
  if (/跑步|运动|掉|松|running|sport/i.test(contextText) && labels.has('稳固佩戴')) {
    return '你刚说跑动时最烦的是容易松，这款资料明确提到稳固或耳挂式佩戴，和当前需求直接相关。';
  }
  if (/跑步|运动|running|sport/i.test(contextText) && labels.has('明确防水信息')) {
    return '你是在看跑步场景，这款除了运动定位，资料还明确提供了防水或防汗信息，因此和另一款的侧重点不同。';
  }
  if (/跑步|运动|running|sport/i.test(contextText) && labels.has('明确续航信息')) {
    return '你是在看跑步场景，这款资料还给出了可核对的续航信息，适合把单次使用时长一起纳入比较。';
  }
  if (/跑步|运动|running|sport/i.test(contextText) && labels.has('可选规格')) {
    return '你现在找的是跑步场景；这款资料明确列出运动定位和可选规格，适合先确认具体版本。';
  }
  if (/跑步|运动|running|sport/i.test(contextText) && labels.has('运动场景')) {
    return '你现在找的是跑步场景，商品资料也明确把运动列为使用方向，所以我把它留下来比较。';
  }
  if (/通勤|地铁|噪|commute/i.test(contextText) && labels.has('降噪取向')) {
    return '你更在意通勤环境，商品资料明确提到降噪，这一点和当前场景能对上。';
  }
  if (/手机|iphone|型号/i.test(contextText) && labels.has('明确型号')) {
    return '你正在看具体手机系列，这条结果的标题给出了可核对型号，先从明确款开始更稳妥。';
  }
  return points[0]
    ? `你当前在看这一类商品；我只保留了资料能直接支持的“${points[0].label}”，没有替它补参数。`
    : '';
}

function priceTradeoff(product, context = {}) {
  const price = Number(product.price);
  const maxPrice = Number(context.maxPrice ?? context.max_price);
  const currency = clean(product.currency).toUpperCase();
  if (Number.isFinite(price) && price > 0 && Number.isFinite(maxPrice) && maxPrice > 0 && price > maxPrice) {
    return `标价 ${currency ? `${currency} ` : ''}${price}，高于你给出的预算上限 ${maxPrice}；预算优先时我不会把它排在前面。`;
  }
  return null;
}

export function buildProductInsights(product = {}, context = {}) {
  const evidence = buildProductEvidence(product);
  const contextText = clean([context.message, context.topic, ...(context.requirements || [])].filter(Boolean).join(' '));
  const rawPoints = findSellingPoints(evidence, contextText);
  const sellingPoints = rawPoints.map(({ priority: _priority, suitableFor: _suitableFor, ...point }) => point);
  const suitableFor = [...new Set(rawPoints.map((point) => point.suitableFor).filter(Boolean))].slice(0, 3);
  const reason = personalizedReason(sellingPoints, contextText);
  const confidence = sellingPoints.length
    ? Math.min(0.95, 0.4 + sellingPoints.length * 0.12 + (reason ? 0.1 : 0) + Math.min(0.09, evidence.length * 0.01))
    : 0;
  return {
    productId: product.id || product.productUrl || null,
    sellingPoints,
    suitableFor,
    personalizedReason: reason,
    tradeoff: priceTradeoff(product, context),
    confidence: Number(confidence.toFixed(2)),
  };
}

export function rankInsightfulProducts(products = [], context = {}, limit = 3) {
  const selected = [];
  const signatures = new Set();
  for (const product of products) {
    const productInsights = buildProductInsights(product, context);
    if (!productInsights.sellingPoints.length || productInsights.confidence < 0.45) continue;
    const signature = productInsights.sellingPoints.map((point) => point.label).sort().join('|');
    if (!signature || signatures.has(signature)) continue;
    signatures.add(signature);
    selected.push({
      ...product,
      productInsights,
      reason: productInsights.personalizedReason,
      tradeoff: productInsights.tradeoff,
    });
    if (selected.length >= Math.min(3, Math.max(0, Number(limit) || 3))) break;
  }
  return selected;
}
