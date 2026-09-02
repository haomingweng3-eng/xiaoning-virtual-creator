// ============================================================
// 关键词意图识别 - 仅作为 LLM 分析失败时的 Fallback
// 不再作为核心 Conversation Brain
// ============================================================

const NEGATIVE_WORDS = ['难过', '委屈', '生气', '伤心', '郁闷', '烦躁', '失恋', '被骂', '累', '疲惫', '压力大', '焦虑', '紧张'];
const SHOPPING_ACTIONS = ['推荐', '帮我看看', '帮我找', '帮我选', '帮我挑', '搜索', '查找', '购买', '买一个', '买一款', '找一款', '选一款', '挑一款', '看看有没有'];
const PRODUCT_CATEGORIES = [
  'MacBook', '鼠标', '耳机', '杯子', '衣服', '键盘', '音箱', '手机', '电脑', '平板', '相机',
  '包', '鞋', '口红', '护肤品', '香水', '礼物', '零食', '咖啡', '台灯', '椅子',
  '项链', '手表', '配饰', '帽子', '围巾', '袜子', '睡衣', '毛巾', '枕头', '被子', '收纳',
];
const CONFIRMATIONS = ['好', '好呀', '可以', '需要', '要', '帮我看看', '麻烦你', '行', '嗯', '那你帮我'];
const COMMERCE_EXIT_WORDS = ['算了', '先不买', '不买了', '省点钱', '省钱', '不用看了', '不需要了'];
const COMMERCE_FOLLOW_UP_PATTERN = /链接|地址|商品页|购买页|发我|下单/u;
const EXPLICIT_RECOMMENDATION_PATTERN = /让我推荐|你推荐|推荐几个|推荐一下|帮我推荐|帮我挑|帮我选|直接推荐|直接给我推荐|有什么值得买|那你帮我看看/u;

function findIncluded(text, candidates) {
  return candidates.find((candidate) => text.includes(candidate));
}

// Fallback 分类函数
export function classifyMessageFallback(message, context = {}) {
  const text = String(message || '').trim();

  if (findIncluded(text, NEGATIVE_WORDS)) {
    return { scene: 'negative', allowSearch: false };
  }

  if (findIncluded(text, COMMERCE_EXIT_WORDS)) {
    return { scene: 'commerce-exit', allowSearch: false };
  }

  if (context.pendingProduct && (findIncluded(text, CONFIRMATIONS) || COMMERCE_FOLLOW_UP_PATTERN.test(text))) {
    return {
      scene: 'shopping',
      allowSearch: true,
      inheritedProduct: context.pendingProduct,
    };
  }

  const action = findIncluded(text, SHOPPING_ACTIONS);
  const product = findIncluded(text, PRODUCT_CATEGORIES);
  if (action && product) {
    return { scene: 'shopping', allowSearch: true };
  }
  if (product) {
    return { scene: 'weak-shopping', allowSearch: false };
  }
  return { scene: 'chat', allowSearch: false };
}

export function findProductCategory(message) {
  const text = String(message || '');
  if (/macbook|苹果本/i.test(text)) return 'MacBook';
  if (/i\s*phone\s*17/i.test(text) || /苹果\s*17/.test(text)) return 'iPhone 17';
  if (/笔记本|电脑/.test(text)) return '电脑';
  return findIncluded(text, PRODUCT_CATEGORIES) || null;
}

export function hasExplicitRecommendationRequest(message) {
  return EXPLICIT_RECOMMENDATION_PATTERN.test(String(message || ''));
}

export function hasCommerceFollowUpRequest(message) {
  return COMMERCE_FOLLOW_UP_PATTERN.test(String(message || ''));
}

// 保留旧名称以兼容现有测试
export const classifyMessage = classifyMessageFallback;
