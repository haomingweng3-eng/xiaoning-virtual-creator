import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { analyzeTranscript } from '../server/src/conversationNaturalness.js';

const API_URL = process.env.QA_API_URL || 'http://localhost:3001/api/chat';
const OUTPUT_DIR = new URL('../artifacts/naturalness-qa/', import.meta.url);
const CUSTOMER_SERVICE = /您好|请问|很高兴为您服务|有什么可以帮|有什么可以帮助|我理解你的感受/;
const ROTE_AGREEMENT = /^(对对对|确实|完全理解|你说得很有道理)/;

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

async function runSequence(messages) {
  const sessionId = randomUUID();
  const turns = [];
  const results = [];
  for (const message of messages) {
    turns.push({ role: 'user', content: message });
    const result = await chat(sessionId, message);
    turns.push({
      role: 'assistant',
      content: result.reply,
      topic: result.currentTopic,
      flow: result.conversationFlow,
      interaction: result.interaction,
    });
    results.push(result);
  }
  return { sessionId, turns, results };
}

function assertion(label, pass) {
  return { label, pass: Boolean(pass) };
}

async function run() {
  const cases = [];

  const completion = await runSequence(['今天项目终于做完了。']);
  cases.push({
    name: 'CASE 1 · completion can stop naturally',
    assertions: [
      assertion('not customer service', !CUSTOMER_SERVICE.test(completion.results[0].reply)),
      assertion('no forced question', !/[？?]\s*$/.test(completion.results[0].reply)),
    ],
    turns: completion.turns,
  });

  const tired = await runSequence(['最近好累。', '事情有点堆在一起。', '今天先不想解释了。']);
  const tiredMetrics = analyzeTranscript(tired.turns);
  cases.push({
    name: 'CASE 2 · tired conversation is not an interview',
    assertions: [
      assertion('no customer-service phrase', tiredMetrics.customerServiceTurns === 0),
      assertion('no consecutive interview questions', tiredMetrics.consecutiveQuestionPairs === 0),
    ],
    metrics: tiredMetrics,
    turns: tired.turns,
  });

  const topicSwitch = await runSequence([
    '最近开始跑步了。',
    '不过这两天其实也没怎么跑。',
    '算了，不聊跑步了，我想换个手机。',
  ]);
  const switchResult = topicSwitch.results.at(-1);
  cases.push({
    name: 'CASE 3 · running switches to phone',
    assertions: [
      assertion('topic is phone', /手机|iPhone/i.test(switchResult.currentTopic || '')),
      assertion('flow is SHIFT', switchResult.conversationFlow === 'SHIFT'),
      assertion('final reply does not pull old gear context back', !/耳机|跑鞋|运动装备|之前.*跑步/.test(switchResult.reply || '')),
    ],
    turns: topicSwitch.turns,
  });

  const airpods = await runSequence(['我觉得 AirPods 挺好的。']);
  cases.push({
    name: 'CASE 4 · creator can hold an opinion',
    assertions: [
      assertion('not rote agreement', !ROTE_AGREEMENT.test(airpods.results[0].reply || '')),
      assertion('not customer service', !CUSTOMER_SERVICE.test(airpods.results[0].reply || '')),
    ],
    turns: airpods.turns,
  });

  const tenMessages = [
    '今天项目终于做完了。',
    '现在脑子还有点空。',
    '我准备出去吃点东西。',
    '想吃点热的。',
    '我觉得拉面不错。',
    '对了，最近开始跑步了。',
    '不过这两天其实也没怎么跑。',
    '算了，不聊跑步了，我想换个手机。',
    '我觉得 iPhone17 挺好。',
    '但如果只是为了拍照升级，好像也没必要。',
  ];
  const longConversation = await runSequence(tenMessages);
  const metrics = analyzeTranscript(longConversation.turns);
  const phoneReplies = longConversation.results.slice(8).map((item) => item.reply).join('\n');
  cases.push({
    name: 'CASE 5 · ten-turn natural conversation',
    assertions: [
      assertion('question ratio <= 40%', metrics.questionRatio <= 0.4),
      assertion('at most one consecutive-question pair', metrics.consecutiveQuestionPairs <= 1),
      assertion('repeated user expressions <= 1', metrics.repeatedUserExpressions <= 1),
      assertion('no customer-service phrases', metrics.customerServiceTurns === 0),
      assertion('topic changes at least twice', metrics.topicTransitions >= 2),
      assertion('phone section does not recall running', !/跑步/.test(phoneReplies)),
    ],
    metrics,
    turns: longConversation.turns,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl: API_URL,
    cases: cases.map((item) => ({
      ...item,
      status: item.assertions.every((value) => value.pass) ? 'PASS' : 'FAIL',
    })),
  };
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(new URL('report.json', OUTPUT_DIR), JSON.stringify(report, null, 2));
  const transcript = longConversation.turns.map((turn) => turn.role === 'user'
    ? `**用户：** ${turn.content}`
    : `**小柠：** ${turn.content}\n\n> topic: ${turn.topic || '-'} · flow: ${turn.flow || '-'} · interaction: ${turn.interaction || '-'}`)
    .join('\n\n');
  await writeFile(new URL('transcript.md', OUTPUT_DIR), `# 10 轮真实聊天 Transcript\n\n${transcript}\n`);

  for (const item of report.cases) {
    console.log(`${item.status} ${item.name}`);
    for (const failed of item.assertions.filter((value) => !value.pass)) console.log(`  FAIL: ${failed.label}`);
  }
  console.log(`Metrics: ${JSON.stringify(metrics)}`);
  const failures = report.cases.filter((item) => item.status === 'FAIL');
  console.log(`Naturalness summary: ${report.cases.length - failures.length}/${report.cases.length} PASS`);
  if (failures.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(`Naturalness QA failed: ${error.message}`);
  process.exitCode = 1;
});
