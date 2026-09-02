# Final MVP 开发问题与解决思路

## 1. 最终产品

小柠是 Lifestyle Virtual Creator：第一层是 IP 虚拟达人存在感，第二层是自然互动与非恋爱化情绪陪伴，第三层是在明确需求下用真实商品证据完成带货。产品不是 AI 女友、客服、ChatGPT clone 或商城搜索页。

## 2. 传统电商 API 接入受阻

开发中尝试过 SerpAPI 与拼多多开放平台。SerpAPI 受手机验证阻塞；PDD 需要 pid、权限与审核，无法在 24 小时内形成稳定复现链路。旧手工测试脚本还曾遗留真实 key，最终交付前已删除并完成 secret scan。

解决方案是解耦 `Commerce Provider`：`server/src/shopifyCatalog.js` 使用 Shopify Global Catalog；`server/src/productSearch.js` 在 Shopify 空结果或不可用时降级 Tavily。Orchestrator 只依赖统一的 `{ products, unavailable }`，不与某个商家 API 绑定。

## 3. Tavily 是 Web Search，不是 Catalog

真实 Tavily 结果可能是百科、文章、攻略、排行榜、搜索页，或缺价格、缺图片。直接渲染会把页面变成不可信的“搜索结果”。

解决方案是 Product Rendering Gate：过滤内容页词汇和路径、要求 HTTP 具体商品 URL、URL canonicalization、标题/URL 去重，并保留缺失字段为 `null`。0 个可信商品是合法结果，不为凑 2–3 张卡片降低标准。

## 4. 商品幻觉与 Product Evidence

LLM 可能根据标题自行补出续航、防水等级、重量、芯片、降噪效果，或者说“小柠亲测/买过”。这会破坏带货可信度。

解决方案：

- Provider normalization 保留 title、description、productType、vendor、tags、options、variants、metadata、price/currency。
- `server/src/productInsights.js` 以确定性规则提取 selling points，每一条都带 `evidence`。
- 未被 evidence 支持的参数不进入 UI。
- personalized reason 只组合“用户当前明确需求 + 商品真实证据”。
- `validateReply` 阻止虚构亲测和非 CURATE 商品内容。
- 同屏商品证据侧重点相同会去重；差异不足时少展示。

真实样例（2026-09-02 Golden Test）：

```text
Raw Product Evidence
title: OpenRun
description: Lightweight, waterproof wireless headphones ... open-ear ... during workouts.
price: USD 129.95

ProductInsights
- 运动场景
  evidence: description 中明确包含 workouts
- 开放式聆听
  evidence: description 中明确包含 open-ear
- 轻量取向
  evidence: description 中明确包含 Lightweight

Personalized Reason
你现在找的是跑步场景，商品资料也明确把运动列为使用方向，所以我把它留下来比较。
```

## 5. Chatbot 感

最初形态是“用户一句、AI 一句”的聊天页面，后来真人大图又变成“Chatbot + Avatar 海报”，人物和互动仍然割裂。

解决方案是 Virtual Creator interaction model：`REACT / SHARE / ASK / CALLBACK / CURATE` 控制互动目的；主页面只保留最近 2–4 条 interaction，完整历史进入 secondary drawer；Composer、topic、状态与人物处于一个 AvatarStage。商品是主播观点的辅助层，只在 CURATE 后延迟 720ms 出现。

## 6. 静态真人图诡异

真人图占 70–80vh 时像巨型海报，压迫且与界面割裂。

解决方案是原创 `xiaoning-main.png` IP Virtual Host：Desktop 约 39% 舞台宽度，人物与当前互动共享同一直播空间；390px 时人物区域不超过 35vh。状态通过文字、暖色 tone 与 `scale(1) → scale(1.008)` CSS breathing 表达，不伪造口型。

## 7. 过度亲密与恋爱偏移

情感陪伴容易被误做成恋爱剧情。模型也可能把“和喜欢的人出去”直接称为约会，甚至推断对方喜欢用户。

解决方案是明确情感陪伴边界：情绪理解 + 连续上下文 + 自然互动，不做亲密度或关系进度。`userFacts` 只保存用户明确说过且能在原消息中核对的事实；回复 sanitizer 不允许自动改写成约会或恋爱结论。Golden CASE 9 验证无约会标签和互相喜欢推断。

## 8. Memory 污染

真实浏览器曾出现“想看看 iPhone17”却继续显示跑步耳机话题。根因包括全局 Session、Header 读取 stale recent topic、pendingProduct 生命周期和无相关性地注入全部 Memory。

解决方案：

- `Map<sessionId, Session>` 隔离 history、facts、preferences、topics、pendingProduct。
- Header 只读取 `currentTopic`。
- 新对话生成新的 UUID，并清空前端历史。
- Memory relevance 使用受控语义词并优先匹配用户原话，不再用任意中文 2–4 字片段。
- pendingProduct 只保存明确商品品类；类别切换时替换。
- Topic Switch 真实序列“跑步 → 耳机 → iPhone → 工作 → 再回耳机”通过，最终召回跑步/耳机而不带入 iPhone。

## 9. 商品价格与缺图

早期 UI 会显示 `169.99`，用户无法知道币种；缺图时又会形成巨大空卡片。

解决方案：只有 price 和有效 ISO currency 同时存在才用 `Intl.NumberFormat` 渲染；未知币种显示“查看实时价格”。图片缺失不造假 URL，使用低视觉重量 fallback，并在文档诚实说明外部数据限制。

## 10. 测试与 Visual QA 问题

只跑单元测试不能证明真实 LLM、Provider、响应式和视觉层级。Visual QA 初版还出现两个脚本 bug：路径空格被写成 `%20` 目录、`viewportSize` 不是 Playwright context 参数，导致“mobile 截图”实际上仍为 desktop。

解决方案：`fileURLToPath` 处理带空格路径；使用 `browser.newContext({ viewport })`；PNG 像素尺寸实际验证为 1440、1024、768、390。最终 Visual QA 报告记录业务元数据，不只保存图片。

## 11. 时间约束与工程取舍

没有实现 Live2D、LiveTalking、Wav2Lip、MuseTalk、实时 TTS/WebRTC 数字人、登录、数据库和支付。它们会把 24 小时 MVP 的主要风险从产品可信度转移到模型部署、实时媒体和基础设施。当前选择原创 IP + CSS 状态、内存 Session、真实 LLM、真实商品 Provider 和 evidence-backed commerce，更稳定，也更容易复现与解释。

## 12. 验收结果

- `npm test`：Server 55 tests + Client 11 tests，全部通过。
- `npm run build`：Vite production build。
- `npm run qa:golden`：10/10 real LLM cases PASS。
- `npm run qa:visual`：9/9 browser cases PASS，覆盖 1440/1024/768/390。
- Shopify：Golden CASE 5/10 实际返回真实商品。
- Tavily：作为真实 fallback 保留；本次成功路径由 Shopify 命中，因此没有伪造 Tavily 商品。

## 13. 已知限制

- Session 在内存中，服务重启会丢失。
- 无登录、数据库、支付闭环。
- 不是实时 Live2D 或口型同步数字人。
- 商品字段依赖外部 Provider，可能缺价格、图片或 evidence。
- 外部 LLM/Provider 网络与额度会影响结果。
- 无可信商品时系统会返回 0 个商品。
