import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const API_URL = process.env.QA_API_URL || 'http://localhost:3001/api/chat';
const OUT = new URL('../artifacts/companion-commerce-qa/', import.meta.url);

async function chat(visitorId, conversationId, message) {
  const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitorId, conversationId, message }), signal: AbortSignal.timeout(60_000) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.reply || `HTTP ${response.status}`);
  return body;
}

async function run() {
  const visitorId = randomUUID();
  const fresh = () => randomUUID();
  const cases = [];
  const runCase = async (name, messages, checks, conversationId = fresh()) => {
    const turns = [];
    for (const message of messages) {
      const result = await chat(visitorId, conversationId, message);
      turns.push({ user: message, assistant: result.reply, interaction: result.interaction, analysis: result.analysis, products: result.products || [] });
    }
    const passed = checks(turns);
    cases.push({ name, status: passed ? 'PASS' : 'FAIL', turns });
    return { conversationId, turns };
  };

  await runCase('1 negative companion', ['今天被老板说了一顿，挺烦的。'], (t) => t[0].interaction !== 'CURATE' && t[0].products.length === 0);
  await runCase('2 celebration companion', ['今天项目终于做完了。'], (t) => t[0].interaction !== 'CURATE' && t[0].products.length === 0);
  await runCase('3 running no commerce', ['最近开始跑步。'], (t) => t[0].interaction !== 'CURATE' && t[0].products.length === 0);
  const implicit = await runCase('4 implicit need waits', ['跑步的时候耳机老掉。'], (t) => t[0].interaction !== 'CURATE' && t[0].products.length === 0);
  const commerce = await runCase('5 explicit commerce', ['那你帮我看看适合跑步的耳机。'], (t) => t[0].interaction === 'CURATE' && t[0].products.every((p) => p.productInsights?.sellingPoints?.every((point) => point.evidence)), implicit.conversationId);
  await runCase('6 commerce cancel', ['算了，最近还是省点钱。'], (t) => t[0].interaction !== 'CURATE' && t[0].products.length === 0, commerce.conversationId);
  await runCase('7 independent opinion', ['我觉得这个 Sony 挺好的，你怎么看？'], (t) => t[0].interaction !== 'CURATE' && !/^对对对|^确实完全/.test(t[0].assistant));
  const callback = await runCase('8 cross-conversation relevant memory', ['我不喜欢入耳式耳机。'], (t) => t[0].products.length === 0);
  await runCase('8b new conversation callback', ['想买跑步耳机。'], (t) => t[0].products.every((p) => !/入耳/.test(p.title || '')), fresh());

  const evidence = commerce.turns.flatMap((turn) => turn.products.map((product) => ({ title: product.title, merchant: product.merchant, price: product.price, currency: product.currency, sellingPoints: product.productInsights?.sellingPoints || [], personalizedReason: product.productInsights?.personalizedReason || null, tradeoff: product.productInsights?.tradeoff || null })));
  const report = { generatedAt: new Date().toISOString(), apiUrl: API_URL, cases, productEvidence: evidence };
  await mkdir(OUT, { recursive: true });
  await writeFile(new URL('report.json', OUT), JSON.stringify(report, null, 2));
  await writeFile(new URL('transcript.md', OUT), cases.map((item) => `## ${item.status} ${item.name}\n\n${item.turns.map((turn) => `**用户：** ${turn.user}\n\n**小柠：** ${turn.assistant}\n\n> interaction: ${turn.interaction} · products: ${turn.products.length}`).join('\n\n')}`).join('\n\n'));
  for (const item of cases) console.log(`${item.status} ${item.name}`);
  console.log(`Companion QA: ${cases.filter((item) => item.status === 'PASS').length}/${cases.length} PASS`);
  if (cases.some((item) => item.status === 'FAIL')) process.exitCode = 1;
}

run().catch((error) => { console.error(`Companion Commerce QA failed: ${error.message}`); process.exitCode = 1; });
