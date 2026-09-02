# Conversation Naturalness & Prompt Compression Design

## Goal

让小柠在连续聊天中更像有观点、懂得停顿和转场的 Lifestyle Virtual Creator，同时将确定性业务约束从 LLM Prompt 移回代码，减少每轮重复上下文。

## Baseline

- `CHARACTER_BIBLE`：1,702 字符。
- 典型 Reply system prompt：2,037 字符。
- 典型 Analysis system prompt：1,926 字符。
- 每轮两次调用合计约 3,963 个 system prompt 字符。
- 重复规则集中在客服腔、追问、虚构经历、Fact/Inference 和 Commerce 权限。

## Architecture

`interaction_mode` 与 `conversation_flow` 是两个独立维度：

- `interaction_mode` 保留 REACT / SHARE / ASK / CALLBACK / CURATE，决定情绪和 Commerce 业务边界。
- `conversation_flow` 使用 CONTINUE / EXPAND / SHARE / SHIFT / CALLBACK，只决定本轮如何推进。

ConversationAnalysis 提供语义候选，`applyConversationPolicy` 保留现有 Commerce 约束，新的 `applyConversationFlowPolicy` 使用显式转场词、topic change、连续问句和 topic turn count 修正节奏。Provider、Product Gate 和 ProductInsights 不变。

## Prompt Layers

### Character Core

控制在 300–500 个中文字符，只描述身份、审美、消费观、独立观点、诚实边界和非恋爱式陪伴。删除 Session、Memory、Product Gate 等实现规则。

### Conversation Style

控制在 200–350 个中文字符。默认短回复；不机械复述；不强迫提问或给方案；允许观点、停顿和自然结束；避免客服固定句；连续追问后主动停下来。

### Dynamic Context

Reply 调用仅注入：

- current topic；
- 最近最多 6 条相关消息；
- 最多 3 条 relevant facts/preferences；
- 最多 1 条相关 creator opinion；
- 当前 ConversationAnalysis；
- CURATE 时的商品 evidence 摘要。

Analysis 调用使用独立的紧凑分析指令，不注入 Character Core、Conversation Style 或全部 Creator Content。

## Flow Policy

1. 明确转场词（对了、另外、说起来、算了、不聊、换个话题）或商品类别变化：`SHIFT`。
2. 当前 interaction 已由相关事实确定为 CALLBACK：`CALLBACK`。
3. 最近两个 assistant reply 都以问号结束：下一轮禁止主动追问，模型给出的 CONTINUE/EXPAND 改为 SHARE；只有 CURATE 缺必要商品条件时保留 ASK。
4. 同一 topic 连续 3 轮且没有显式新信息时，CONTINUE 改为 EXPAND；如果存在相关 creator opinion，优先 SHARE。
5. 其他情况接受模型候选；无效值回退到 CONTINUE。
6. 话题切换立即更新 currentTopic，并重置 topic turn count。Memory 仍由现有 relevance gate 决定，不因 flow 重新注入。

Session 新增最小节奏状态：

```js
{
  conversationFlow: 'CONTINUE',
  topicTurnCount: 0
}
```

连续问句数量直接从已保存 history 推导，不额外持久化重复状态。

## Reply Generation

`buildMessages` 接收完整 analysis，而不是只有 response mode。Dynamic Context 用结构化短段落表达，不重复自然语言禁令。Creator reply tool 保持 1–3 segments。

生成后继续使用现有 `validateReply` 阻止客服表达、未授权 Commerce、虚构体验和商品详情。新增自然度校验只处理明显采访式结尾：当历史已有连续两个问句时，含非必要问句的生成结果判定失败并重试一次。

## Topic Lifecycle

- `previousTopic !== nextTopic` 时重置为 1。
- 相同 topic 时递增，最大值 3。
- 明确转场词优先于 stale currentTopic。
- “算了，不聊跑步了，我想换个手机”必须切为手机，清除跑步相关 pending context，并且本轮不召回跑步 history。
- 不主动生成完全无关 topic；SHIFT 只能采用用户新 topic 或相邻 creator opinion。

## Testing

- Prompt compression：用构建后的 system message 验证字符预算和上下文上限。
- Flow policy：完成项目可自然结束；连续两个问句后禁止第三次追问；明确转场变 SHIFT；同 topic 不永久 CONTINUE。
- Topic isolation：跑步切手机后不注入跑步；原有 iPhone / running regression 保持通过。
- Persona：AirPods 场景允许不同意见，不要求附和。
- Naturalness QA：真实连续 10 轮，记录 transcript、问号比例、连续追问、用户原句重复、客服表达、topic 和 flow 变化。
- Final regression：`npm test`、`npm run build`、`npm run qa:golden`、`npm run qa:visual`。

## Scope

修改 `server/src/prompts.js`、`server/src/conversationAnalysis.js`、`server/src/orchestrator.js`、`server/src/session.js` 及对应测试；新增自然度 QA 脚本和报告。不会修改 Commerce Provider、Product Gate、ProductInsights、前端信息架构或增加依赖。
