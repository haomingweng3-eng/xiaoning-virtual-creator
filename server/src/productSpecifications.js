function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function textValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return clean(value);
  if (value && typeof value === 'object') return clean(value.plain ?? value.text ?? value.value ?? value.label ?? '');
  return '';
}

const LABELS = [
  { pattern: /storage|capacity|容量|存储/i, label: '存储容量' },
  { pattern: /ram|memory|内存/i, label: '内存' },
  { pattern: /color|colour|颜色|色号/i, label: '颜色' },
  { pattern: /size|尺寸|大小/i, label: '尺寸' },
  { pattern: /version|版本/i, label: '版本' },
  { pattern: /network|carrier|sim|解锁|unlocked/i, label: '网络/解锁' },
  { pattern: /material|材质/i, label: '材质' },
];

function specificationLabel(name, values = []) {
  const value = clean(name);
  const valueText = (Array.isArray(values) ? values : [values]).map(textValue).join(' ');
  if (/size|尺寸/i.test(value) && /\b(?:\d+(?:\.\d+)?\s*(?:GB|TB)|\+)/i.test(valueText)) return '存储配置';
  return LABELS.find(({ pattern }) => pattern.test(value))?.label || value || '规格';
}

function optionEntries(options = []) {
  if (!Array.isArray(options)) return [];
  return options.map((option) => {
    const name = textValue(option?.name ?? option?.label ?? option?.key);
    const rawValues = option?.values ?? option?.value ?? option?.options;
    const values = Array.isArray(rawValues) ? rawValues.map(textValue).filter(Boolean) : [textValue(rawValues)].filter(Boolean);
    return { name, values };
  }).filter((option) => option.name && option.values.length);
}

function variantOptionEntries(variant, options) {
  const explicit = selectedOptionEntries(variant);
  if (explicit.length) return explicit;
  const variantTitle = textValue(variant?.title).toLowerCase();
  if (!variantTitle || /^(default|default title)$/i.test(variantTitle)) return [];
  return optionEntries(options).map((entry) => {
    const value = entry.values.find((candidate) => variantTitle.includes(candidate.toLowerCase()));
    return value ? { name: entry.name, values: [value] } : null;
  }).filter(Boolean);
}

function selectedOptionEntries(variant) {
  return optionEntries(variant?.selectedOptions || variant?.selected_options || []);
}

function addSpecification(list, labels, label, value, evidence) {
  const cleanValue = clean(value);
  if (!cleanValue || !evidence) return;
  const normalizedLabel = specificationLabel(label, cleanValue);
  if (!normalizedLabel || labels.has(normalizedLabel)) return;
  labels.add(normalizedLabel);
  list.push({ label: normalizedLabel, value: cleanValue, evidence });
}

function titleParts(title, vendor) {
  const rawTitle = clean(title);
  let base = rawTitle;
  const versions = [];
  const parenthetical = [...rawTitle.matchAll(/\(([^)]+)\)/g)].map((match) => clean(match[1]));
  for (const value of parenthetical) {
    if (/unlocked|version|国行|港版|美版|欧版|日版|global|中文/i.test(value)) versions.push(value);
  }
  base = base.replace(/\s*\([^)]*\)/g, '').trim();
  const suffix = base.match(/\b(?:Chinese|Global|US|UK|EU|Japan)\s+Version\b/iu);
  if (suffix) {
    versions.push(clean(suffix[0]));
    base = base.slice(0, suffix.index).trim();
  }
  const vendorName = textValue(vendor);
  const leadingBrand = rawTitle.match(/^(Apple|Xiaomi|Samsung|Google|Sony|JBL|Shokz|Bose|Nike|Adidas|soundcore|TREBLAB)\b/i)?.[1] || null;
  const brand = vendorName || (leadingBrand ? leadingBrand.replace(/^apple$/i, 'Apple') : (/^iPhone\b/i.test(rawTitle) ? 'Apple' : null));
  if (brand && new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i').test(base)) {
    base = base.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '').trim();
  }
  const modelBase = base.split(/\s*\|\s*/)[0].split(/\s+-\s+/)[0].trim();
  const modelTokens = modelBase.split(' ').filter(Boolean);
  const modelDigitIndex = modelTokens.findIndex((token) => /\d/.test(token));
  const suffixTokens = modelTokens.slice(modelDigitIndex + 1).filter((token) => /^(Pro|Max|Air|Plus|Ultra|Mini|SE|Fold|Flip|Note)$/i.test(token)).slice(0, 2);
  const model = modelDigitIndex >= 0
    ? [...modelTokens.slice(0, modelDigitIndex + 1), ...suffixTokens].join(' ')
    : modelBase;
  return { brand, model: model || null, version: [...new Set(versions)].join(' · ') || null };
}

function metadataEntries(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  return Object.entries(metadata)
    .filter(([key, value]) => value !== null && value !== undefined && typeof value !== 'object' && !/excerpt|description|source/i.test(key))
    .map(([key, value]) => ({ name: key, values: [textValue(value)] }))
    .filter((entry) => entry.values[0]);
}

function descriptionEntries(description) {
  const text = clean(description);
  const entries = [];
  const capacities = [...new Set(text.match(/\b\d+(?:\.\d+)?\s*(?:GB|TB)\b/gi) || [])];
  if (capacities.length) entries.push({ name: '存储容量', values: capacities.map((value) => clean(value)) });
  const sizes = [...new Set(text.match(/\b\d+(?:\.\d+)?\s*(?:英寸|inch|in)\b/gi) || [])];
  if (sizes.length) entries.push({ name: '尺寸', values: sizes.map((value) => clean(value)) });
  return entries;
}

export function normalizeProductSpecifications(product = {}, selectedVariant = null, selectedVariantIndex = 0) {
  const title = textValue(product.title);
  const { brand, model, version } = titleParts(title, product.vendor);
  const variants = Array.isArray(product.variants) ? product.variants : (Array.isArray(product.offers) ? product.offers : []);
  const variant = selectedVariant || variants.find((item) => item?.availability?.available !== false) || variants[0] || null;
  const explicitSelected = selectedOptionEntries(variant);
  const selected = variantOptionEntries(variant, product.options);
  const selectedEvidenceSource = explicitSelected.length ? `provider.variants[${selectedVariantIndex}].selectedOptions` : `provider.variants[${selectedVariantIndex}].title`;
  const selectedNames = new Set(selected.map((entry) => specificationLabel(entry.name)));
  const specifications = [];
  const labels = new Set();

  for (const entry of selected) {
    addSpecification(specifications, labels, entry.name, entry.values.join(' / '), `${selectedEvidenceSource}.${entry.name}`);
  }
  for (const entry of optionEntries(product.options)) {
    const label = specificationLabel(entry.name);
    if (!selectedNames.has(label)) addSpecification(specifications, labels, entry.name, entry.values.join(' / '), `provider.options.${entry.name}`);
  }
  if (version) addSpecification(specifications, labels, '版本', version, 'provider.title');
  for (const entry of metadataEntries(product.metadata)) addSpecification(specifications, labels, entry.name, entry.values.join(' / '), `provider.metadata.${entry.name}`);
  for (const entry of descriptionEntries(product.description)) addSpecification(specifications, labels, entry.name, entry.values.join(' / '), 'provider.description');

  const variantTitle = textValue(variant?.title);
  const variantLabel = selected.length
    ? selected.flatMap((entry) => entry.values).join(' · ')
    : version || (variantTitle && variantTitle !== title ? variantTitle : null);
  return { brand, model, variantLabel, specifications };
}
