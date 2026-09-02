# Conversation Naturalness & Prompt Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compress the two LLM prompt paths and add deterministic conversational pacing without changing Commerce Provider behavior.

**Architecture:** Keep `interaction_mode` as the business-policy axis and add `conversation_flow` as an independent pacing axis. Analysis proposes semantics; code validates flow, topic transition, question streak, context limits, and existing Commerce boundaries.

**Tech Stack:** Node.js, Express, OpenAI-compatible tool calls, Vitest, existing Playwright QA.

**Spec:** `docs/superpowers/specs/2026-09-02-conversation-naturalness-prompt-compression-design.md`

## Global Constraints

- Do not add a framework or dependency.
- Do not modify Shopify, Tavily, Product Gate, or ProductInsights.
- Keep session isolation, topic switch, pendingProduct, memory relevance, Golden QA, and Visual QA passing.
- Use TDD for every production behavior change.

---

### Task 1: Prompt compression contract

**Files:**
- Modify: `server/test/orchestrator.test.js`
- Modify: `server/src/prompts.js`

**Interfaces:**
- Produces: `CHARACTER_CORE`, `CONVERSATION_STYLE`, `buildMessages(session, userMessage, options)`, `buildAnalysisMessages(session, userMessage)`.

- [ ] Add failing tests that assert the reply system prompt contains compact identity/style layers, excludes implementation-rule prose, includes no more than six context messages and one creator opinion, and the analysis system prompt excludes the character layer.
  ```js
  const reply = buildMessages(session, '今天项目终于做完了', { analysis })[0].content;
  expect(reply.length).toBeLessThan(1400);
  expect(reply).not.toMatch(/Session isolation|Product Gate|只有 CURATE 允许商品搜索/);
  expect(buildMessages(session, '继续聊', { analysis })).toHaveLength(8);
  expect(buildAnalysisMessages(session, '继续聊')[0].content).not.toContain('Lifestyle Virtual Creator');
  ```
- [ ] Run `npm test --prefix server -- test/orchestrator.test.js` and confirm failures reference the missing exports or oversized prompt.
- [ ] Replace `CHARACTER_BIBLE` with `CHARACTER_CORE` and `CONVERSATION_STYLE`; build compact dynamic context and preserve the existing context relevance selectors.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Conversation flow policy

**Files:**
- Modify: `server/test/orchestrator.test.js`
- Modify: `server/test/session.test.js`
- Modify: `server/src/conversationAnalysis.js`
- Modify: `server/src/session.js`

**Interfaces:**
- Produces: `applyConversationFlowPolicy(analysis, message, session)`.
- Extends analysis with `conversation_flow`.

- [ ] Add failing tests for explicit SHIFT, CALLBACK, two-question suppression, and repeated-topic escape from CONTINUE.
  ```js
  expect(applyConversationFlowPolicy({ conversation_flow: 'CONTINUE', topic: '手机' }, '算了，不聊跑步了，我想换个手机', session)).toBe('SHIFT');
  expect(applyConversationFlowPolicy({ interaction_mode: 'CALLBACK', conversation_flow: 'CONTINUE' }, '终于做完了', session)).toBe('CALLBACK');
  expect(applyConversationFlowPolicy({ conversation_flow: 'CONTINUE' }, '最近好累', twoQuestionSession)).toBe('SHARE');
  expect(applyConversationFlowPolicy({ conversation_flow: 'CONTINUE' }, '最近还是跑步', repeatedTopicSession)).not.toBe('CONTINUE');
  ```
- [ ] Run focused tests and verify each fails because flow policy/state is absent.
- [ ] Add flow normalization, deterministic policy, `conversationFlow`, and `topicTurnCount`.
- [ ] Run focused tests and confirm all flow cases pass.

### Task 3: Orchestrator integration and naturalness validation

**Files:**
- Modify: `server/test/orchestrator.test.js`
- Modify: `server/test/validators.test.js`
- Modify: `server/src/orchestrator.js`
- Modify: `server/src/validators.js`

**Interfaces:**
- Consumes: normalized `analysis.conversation_flow`.
- Produces: response payload `conversationFlow` and question-streak-aware retry validation.

- [ ] Add failing tests proving project completion need not end in a question, a third consecutive interview question is rejected, AirPods can receive an independent opinion, and switching to phone clears running context.
  ```js
  expect(validateReply({ reply: '然后呢？', disallowQuestion: true }).valid).toBe(false);
  expect(result.conversationFlow).toBe('SHIFT');
  expect(session.currentTopic).toBe('手机');
  expect(complete.mock.calls.at(-1)[0].messages[0].content).not.toContain('跑步');
  ```
- [ ] Run focused tests and verify the missing behavior fails.
- [ ] Pass compact analysis and evidence options to `buildMessages`, update topic flow state, and extend reply validation with `disallowQuestion`.
- [ ] Run focused tests and confirm Commerce search assertions remain unchanged.

### Task 4: Naturalness QA

**Files:**
- Create: `server/src/conversationNaturalness.js`
- Create: `server/test/conversationNaturalness.test.js`
- Create: `scripts/naturalness-qa.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run qa:naturalness`.
- Writes: `artifacts/naturalness-qa/report.json` and `artifacts/naturalness-qa/transcript.md`.

- [ ] Add a failing unit test for `analyzeTranscript(turns)` using a literal six-turn transcript.
  ```js
  expect(analyzeTranscript([
    { role: 'user', content: '最近好累' },
    { role: 'assistant', content: '为什么？' },
    { role: 'user', content: '项目太多' },
    { role: 'assistant', content: '然后呢？' },
  ])).toMatchObject({ assistantTurns: 2, questionTurns: 2, consecutiveQuestionPairs: 1 });
  ```
- [ ] Implement metrics for question ratio, consecutive questions, user-expression repetition, customer-service phrases, topic transitions, and ten-turn transcript capture.
- [ ] Run `npm run qa:naturalness` against the real local API and record PASS/FAIL per criterion.

### Task 5: Final regression and report

**Files:**
- Create: `docs/conversation-naturalness-report.md`

**Interfaces:**
- Consumes all test and QA outputs.

- [ ] Measure before/after Character, Reply system, Analysis system, and per-turn system character counts.
- [ ] Run `npm test`, `npm run build`, `npm run qa:golden`, and `npm run qa:visual`.
- [ ] Write the final prompt text, removed rules, real transcript, awkward moments, metrics, and regression results without overstating failures.
