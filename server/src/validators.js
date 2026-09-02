const CUSTOMER_SERVICE_WORDS = ['您好', '请问', '很高兴为您服务', '有什么可以帮您'];
const PRICE_PATTERN = /\d+(?:\.\d+)?\s*(?:元|块)/;
const LINK_PATTERN = /https?:\/\/|链接/;
const PRODUCT_RECOMMENDATION_PATTERN = /(?:推荐|建议你买|可以买|入手).{0,16}(?:鼠标|耳机|杯子|衣服|键盘|手机|电脑|包|鞋|口红|护肤品|香水|商品|这款)/;
const NON_CURATE_COMMERCE_SUGGESTION_PATTERN = /(?:可以试试|换一副|买一副|买一款|入手|推荐|看看下面|骨传导|耳挂式|运动耳机|硅胶套)/;
const INVENTED_EXPERIENCE_PATTERN = /我(?:自己)?(?:后来|之前|平时)?(?:穿过|买过|亲测|买了|用过|用了(?:一段时间|三个月|很久)?)/;
const LEAKED_META_INSTRUCTION_PATTERN = /顺着.{0,24}话题|给一个.{0,20}(?:建议|观点)|不刻意(?:推|追问)|接住.{0,20}就好/u;

export function validateReply({
  reply,
  searchCalled = false,
  negativeEmotion = false,
  disallowProductDetails = false,
  disallowCommerceSuggestions = false,
  disallowQuestion = false,
  maxQuestions = Infinity,
  maxChars = Infinity,
  previousReply = '',
}) {
  const text = String(reply || '');
  const reasons = [];
  if (negativeEmotion && searchCalled) reasons.push('negative-emotion-search');
  if (!searchCalled && (PRICE_PATTERN.test(text) || LINK_PATTERN.test(text) || PRODUCT_RECOMMENDATION_PATTERN.test(text))) {
    reasons.push('unauthorized-product-content');
  }
  if (disallowProductDetails && (PRICE_PATTERN.test(text) || LINK_PATTERN.test(text))) {
    reasons.push('product-details-in-reply');
  }
  if (disallowCommerceSuggestions && NON_CURATE_COMMERCE_SUGGESTION_PATTERN.test(text)) {
    reasons.push('non-curate-commerce-suggestion');
  }
  if (INVENTED_EXPERIENCE_PATTERN.test(text)) reasons.push('invented-first-person-experience');
  if (CUSTOMER_SERVICE_WORDS.some((word) => text.includes(word))) reasons.push('customer-service-tone');
  if (disallowQuestion && /[？?]/u.test(text)) reasons.push('interview-question-streak');
  if ((text.match(/[？?]/gu) || []).length > maxQuestions) reasons.push('too-many-questions');
  if ([...text].length > maxChars) reasons.push('reply-too-long');
  if (LEAKED_META_INSTRUCTION_PATTERN.test(text)) reasons.push('leaked-meta-instruction');
  if (String(previousReply).trim() && text.trim() === String(previousReply).trim()) reasons.push('duplicate-previous-reply');
  if (!text.trim()) reasons.push('empty-reply');
  return { valid: reasons.length === 0, reasons };
}
