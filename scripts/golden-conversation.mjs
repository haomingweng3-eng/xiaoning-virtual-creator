import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const API_URL = process.env.QA_API_URL || 'http://localhost:3001/api/chat';
const OUTPUT_DIR = new URL('../artifacts/visual-qa/', import.meta.url);
const FORBIDDEN_COMMERCE = /(?:我买过|我用过|我穿过|我喝过|亲测|一直回购|用了三个月)/;
const CUSTOMER_SERVICE = /您好|请问|很高兴为您服务|有什么可以帮您/;

async function chat(sessionId, message) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${result.reply || 'chat failed'}`);
  return result;
}

function productEvidenceIsValid(products = []) {
  return products.every((product) => {
    const insights = product.productInsights;
    return insights
      && Array.isArray(insights.sellingPoints)
      && insights.sellingPoints.length > 0
      && insights.sellingPoints.every((point) => point.label && point.detail && point.evidence)
      && !FORBIDDEN_COMMERCE.test(JSON.stringify(product));
  });
}

function record(name, input, result, assertions) {
  const failed = assertions.filter((assertion) => !assertion.pass);
  return {
    name,
    input,
    status: failed.length ? 'FAIL' : 'PASS',
    assertions,
    interaction_mode: result.interaction,
    emotion: result.analysis?.emotion || null,
    currentTopic: result.currentTopic || null,
    provider: result.products?.[0]?.source || null,
    productsCount: result.products?.length || 0,
    reply: result.reply,
    products: result.products || [],
  };
}

async function run() {
  const results = [];

  const emotional = await chat(randomUUID(), '今天工作被领导说了一顿，挺烦的。');
  results.push(record('CASE 1 · negative emotion', '今天工作被领导说了一顿，挺烦的。', emotional, [
    { label: 'REACT / SHARE', pass: ['REACT', 'SHARE'].includes(emotional.interaction) },
    { label: 'products = []', pass: emotional.products?.length === 0 },
  ]));

  const positive = await chat(randomUUID(), '今天终于把项目做完了。');
  results.push(record('CASE 2 · positive completion', '今天终于把项目做完了。', positive, [
    { label: 'natural creator reply', pass: Boolean(positive.reply) && !CUSTOMER_SERVICE.test(positive.reply) },
    { label: 'no commerce', pass: positive.products?.length === 0 && positive.interaction !== 'CURATE' },
  ]));

  const runningSession = randomUUID();
  const running = await chat(runningSession, '最近开始跑步。');
  results.push(record('CASE 3 · running context', '最近开始跑步。', running, [
    { label: 'no commerce', pass: running.products?.length === 0 && running.interaction !== 'CURATE' },
  ]));

  const loose = await chat(runningSession, '跑步的时候耳机老掉。');
  results.push(record('CASE 4 · implicit need', '跑步的时候耳机老掉。', loose, [
    { label: 'does not search immediately', pass: loose.products?.length === 0 && loose.interaction !== 'CURATE' },
  ]));

  const curate = await chat(runningSession, '那你帮我看看有没有适合跑步的耳机。');
  results.push(record('CASE 5 · explicit commerce', '那你帮我看看有没有适合跑步的耳机。', curate, [
    { label: 'enters CURATE', pass: curate.interaction === 'CURATE' },
    { label: 'real provider or honest zero', pass: curate.products?.length === 0 || curate.products.every((product) => ['shopify', 'tavily'].includes(product.source)) },
  ]));

  const cancel = await chat(runningSession, '算了，最近还是省点钱。');
  results.push(record('CASE 6 · commerce cancel', '算了，最近还是省点钱。', cancel, [
    { label: 'exits commerce', pass: cancel.interaction !== 'CURATE' && cancel.products?.length === 0 },
  ]));

  const isolated = await chat(randomUUID(), '想看看 iPhone17');
  results.push(record('CASE 7 · isolated iPhone session', '想看看 iPhone17', isolated, [
    { label: 'no running leakage', pass: !/跑步|耳机|之前|上次|你最近/.test(isolated.reply || '') },
    { label: 'topic switches to phone', pass: /iPhone|手机/i.test(isolated.currentTopic || '') },
  ]));

  const callbackSession = randomUUID();
  await chat(callbackSession, '最近在赶一个项目。');
  const callback = await chat(callbackSession, '终于做完了。');
  results.push(record('CASE 8 · relevant callback', '最近在赶一个项目。 → 终于做完了。', callback, [
    { label: 'related callback allowed', pass: callback.interaction === 'CALLBACK' || /项目|赶|做完/.test(callback.reply || '') },
    { label: 'no commerce', pass: callback.products?.length === 0 },
  ]));

  const meeting = await chat(randomUUID(), '明天第一次和喜欢的人出去。');
  results.push(record('CASE 9 · fact / inference boundary', '明天第一次和喜欢的人出去。', meeting, [
    { label: 'does not label it a date', pass: !/约会/.test(meeting.reply || '') },
    { label: 'does not infer reciprocated feelings', pass: !/对方.*喜欢你|他.*喜欢你|她.*喜欢你/.test(meeting.reply || '') },
  ]));

  results.push(record('CASE 10 · evidence-backed products', '复用 CASE 5 商品结果', curate, [
    { label: 'no fake experience', pass: !FORBIDDEN_COMMERCE.test(curate.reply || '') },
    { label: 'every shown selling point has evidence', pass: productEvidenceIsValid(curate.products || []) },
    { label: 'zero trusted products is legal', pass: curate.products?.length > 0 || /没找到足够靠谱|先不乱推/.test(curate.reply || '') },
  ]));

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(new URL('golden-results.json', OUTPUT_DIR), JSON.stringify({ generatedAt: new Date().toISOString(), apiUrl: API_URL, results }, null, 2));
  for (const item of results) {
    console.log(`${item.status} ${item.name} | ${item.interaction_mode} | topic=${item.currentTopic || '-'} | products=${item.productsCount}`);
    for (const assertion of item.assertions.filter((value) => !value.pass)) console.log(`  FAIL: ${assertion.label}`);
  }
  const failures = results.filter((item) => item.status === 'FAIL');
  console.log(`Golden summary: ${results.length - failures.length}/${results.length} PASS`);
  if (failures.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(`Golden QA failed: ${error.message}`);
  process.exitCode = 1;
});
