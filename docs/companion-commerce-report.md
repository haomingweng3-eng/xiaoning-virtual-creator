# Emotional Companion & Intelligent Commerce Report

## 实现范围

本轮未修改 UI 架构、未引入框架或数据库，继续使用现有 Memory、Conversation、Shopify、Tavily 与 ProductInsights。

## Companion

- `ConversationAnalysis` 统一输出情绪、强度、用户需要、topic、购物意图、品类、需求、预算、场景、推荐成熟度和 interaction。
- LLM 负责语义分析，代码负责最终 Policy。
- `sad / stress / frustrated / angry / tired` 等明显负面情绪强制 `REACT`、禁止搜索、返回 0 商品。
- `CALLBACK` 只从相关 memory 召回；不相关 topic 不注入。
- 连续两轮问题后默认压制下一轮追问。
- 情绪、庆祝和普通聊天不会自动进入 Commerce。

## Commerce

Policy：

- `none` / `latent`：禁止搜索。
- `implicit`：默认不搜索；即使 readiness ≥ 0.75，也先用 `ASK` 征询，不直接搜索。
- `explicit`：进入 `CURATE`，依次走 ProductSearchIntent → Shopify → Tavily fallback → Product Gate → ProductInsights。
- “算了 / 不买了 / 最近还是省点钱”等取消表达会清空 `pendingProduct`，并返回 0 商品。

搜索 query 由 `product_category + requirements + occasion` 组成，避免只用宽泛品类。明确用户偏好会参与商品过滤，例如“不喜欢入耳式”不会保留入耳式结果。

每个商品最多保留 3 个 selling points；每个 selling point 都必须有真实 Provider evidence。没有 evidence 的商品不会进入展示列表。`personalizedReason` 同时引用用户需求和商品证据，`tradeoff` 在预算或场景存在冲突时提示取舍。

## QA 结果

真实调用本地 API、LLM 与当前商品 Provider 的 8 个场景全部通过：

1. 领导批评 → Companion / 0 products：PASS
2. 项目完成 → celebrate / 0 products：PASS
3. 开始跑步 → 不带货：PASS
4. 跑步耳机易掉 → implicit / 不立即搜索：PASS
5. 明确挑跑步耳机 → CURATE / 真实商品：PASS
6. 省钱取消 → 0 products / 清理 pendingProduct：PASS
7. Sony 观点 → 允许独立意见：PASS
8. 跨 Conversation 召回“不喜欢入耳式”并过滤不相关商品：PASS

完整实际 transcript：[artifacts/companion-commerce-qa/transcript.md](../artifacts/companion-commerce-qa/transcript.md)

结构化结果与商品 evidence：[artifacts/companion-commerce-qa/report.json](../artifacts/companion-commerce-qa/report.json)

最新 QA 结果：`Companion QA 9/9 PASS`（第 8 个跨会话场景拆成 8 与 8b 两个检查）。实际商品 evidence 数量：3。

## 真实商品 evidence 摘要

本次明确跑步耳机场景返回了 Shopify 商品，包括 `RunBuds™ Pro`、`GO Sport+ True Wireless Earbuds Graphite` 和 `soundcore Sport X20`。示例 evidence 来自 Provider 的 description/title，例如：

- `secure fit` / `secure fit, IP55 protection`
- `designed for active use`
- `noise cancellation`

系统没有从标题之外补造续航、重量、芯片或亲测体验。

## 已知限制

- 真实 LLM 仍可能返回较宽泛的 topic 或 occasion，代码 Policy 负责兜底，但不替代语义理解。
- FileStore 仍是 MVP JSON 文件；Memory 也受当前 FileStore 与服务生命周期约束。
- 本轮没有运行完整 Golden QA、Visual QA 或长时场景测试。
