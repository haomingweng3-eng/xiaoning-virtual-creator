# 小柠：情感陪伴与智能带货虚拟达人——项目报告

## 一、项目概述

小柠是一个在规定的 Vibe Coding 周期内完成的“情感陪伴 + 智能带货”虚拟达人。产品以原创 IP 虚拟达人为第一视觉中心，先理解用户的情绪和当前话题，再在用户明确需要挑选商品时调用真实商品 Provider。

## 二、需求拆解

- **聊天**：真实 DeepSeek `deepseek-chat` 对话，默认输出 1–3 个自然 message segments，通过 OpenAI-compatible SDK 接入。
- **情感陪伴**：理解正负面情绪，保留事实边界，不把普通陪伴写成恋爱关系。
- **虚拟达人**：原创 IP、AvatarStage、实时状态与最近互动共同构成直播间感。
- **智能带货**：语义分析与确定性规则共同决定是否进入 CURATE。
- **真实数据**：商品来自 Shopify Global Catalog，必要时使用 Tavily fallback；不使用 mock 商品。

## 三、产品方案

主界面采用“IP Virtual Host + Recent Interactions + Composer + CURATE-only Product Shelf”。完整聊天记录收进 secondary drawer，避免主页面退化成传统 Chat Panel。商品是主播观点的辅助信息，只在 `interaction_mode = CURATE` 且存在可信商品时展示。

## 四、核心用户流程

1. 用户进入小柠直播间，看到虚拟达人和轻量话题入口。
2. 用户分享近况，小柠根据情绪与语义选择 REACT、SHARE、ASK 或 CALLBACK。
3. 潜在需求只继续交流，不立即搜索商品。
4. 用户明确提出“帮我看看”后进入 CURATE。
5. 小柠先表达判断，前端等待 720ms，再展开真实 Product Shelf。
6. 没有可信商品时允许返回 0 张卡片，并明确说明不乱推。

## 五、技术架构

```text
React UI / AvatarStage
  → POST /api/chat + sessionId
  → Session Isolation
  → ConversationAnalysis
  → Deterministic Interaction Policy
  → DeepSeek `deepseek-chat`
  → Shopify Global Catalog
  → Tavily fallback
  → Product Rendering Gate
  → Product Evidence
  → ProductInsights
  → Creator Reply + Product Shelf
```

前端使用 React 18 + Vite，后端使用 Node.js + Express，运行态 Session 使用服务端内存 Map，并由 JSON FileStore 保存会话和 Memory，支持服务重启后恢复。

## 六、情感陪伴实现

### ConversationAnalysis

每轮输出 emotion、shopping intent、recommendation readiness、need/category 和 current topic。模型负责语义理解，确定性规则负责约束高风险行为。

### Interaction Model

`REACT / SHARE / ASK / CALLBACK / CURATE` 描述小柠这一轮的互动目的。负面情绪确定性禁止商品搜索；latent intent 禁止搜索；implicit intent 只有在 readiness 达标且已有明确 need/category 时才可能进入推荐判断。

### Fact / Inference

`userFacts` 只保存用户明确说过、能在原消息中核对的事实。系统不会把“第一次和喜欢的人出去”自动推断成约会，也不会推断双方关系。

### Memory relevance

历史、偏好和事实不会每轮全部注入 Prompt。相关性规则优先匹配用户原话和受控语义组；当前话题切换时更新 `currentTopic`，商品类别切换时替换 `pendingProduct`。新 Session 拥有完全独立的 history、facts、preferences、topics 和 pendingProduct。

## 七、智能带货实现

### Commerce Provider

Orchestrator 只依赖统一 Provider 返回结构，不与前端耦合。

### Shopify

`server/src/shopifyCatalog.js` 使用 Shopify Global Catalog，并保留 title、description、productType、vendor、tags、options、variants、metadata、price 和 currency。

### Tavily fallback

Shopify 空结果或不可用时调用 Tavily。Tavily 是网页搜索而非商品 Catalog，因此结果必须继续经过严格过滤。

### Product Gate

过滤文章、攻略、排行榜、搜索页、非具体商品 URL 和重复结果。无法较高可信判断为具体商品时不展示；0 个可信商品是合法结果。

### Product Evidence

所有可见卖点必须能追溯到 Provider 字段。未知币种不显示裸金额，缺失参数不会由 LLM 补齐。

### ProductInsights

`server/src/productInsights.js` 输出 selling points、suitableFor、personalizedReason、tradeoff、confidence，并为每条 selling point 保留 evidence。个性化理由只组合用户当前明确需求和商品真实证据。

真实链路示例：

```text
Raw evidence:
description = Lightweight, waterproof, open-ear, designed for workouts
price = USD 129.95

ProductInsights:
运动场景    ← workouts
开放式聆听  ← open-ear
轻量取向    ← Lightweight

Personalized reason:
用户当前明确寻找跑步场景耳机，商品资料也明确列出运动使用方向。
```

## 八、虚拟达人交互设计

原创 `xiaoning-main.png` 与最近互动共享同一个 AvatarStage。Desktop 中人物约占舞台 39%，390px Mobile 中人物区控制在约 35vh。状态包括 idle、listening、thinking、warm、happy、curate；人物只使用轻微 CSS breathing，不伪造口型或实时视频能力。

## 九、真实数据说明

- 对话使用真实 DeepSeek API，通过 OpenAI-compatible Chat Completions / Tool Calling 接入。
- 商品优先来自 Shopify Global Catalog。
- Shopify 不可用或无结果时使用 Tavily 实时搜索。
- QA 不注入 mock 商品。
- 外部 Provider 缺字段时保留为空，不生成虚假价格、图片或参数。
- 真实链路 Smoke：当前 DeepSeek + Shopify 场景返回真实商品并进入 CURATE。

## 十、测试与质量保障

- **Unit / Integration**：Server 13 files / 106 tests，Client 17 tests，全部通过。
- **Production Build**：Vite build exit 0。
- **Golden QA**：10/10，覆盖情绪、正向反馈、隐式需求、明确带货、取消带货、Session 隔离、Callback、事实边界和 Product Evidence。
- **Visual QA**：9/9，覆盖 1440、1024、768、390；所有截图来自真实浏览器和真实前后端。
- **Release screenshots**：`artifacts/release-screenshots/`。

## 十一、开发过程中遇到的问题与解决方案

1. **传统电商 API 权限受阻**：PDD 等平台需要审核和额外权限。通过 Provider 解耦，采用可运行的 Shopify Global Catalog，并保留 Tavily fallback。
2. **Tavily 不是 Catalog**：网页结果可能是文章或排行榜。增加 Product Rendering Gate，宁可返回 0 商品。
3. **商品幻觉**：LLM 容易根据标题补参数。增加确定性 Product Evidence / ProductInsights，每条卖点保留来源。
4. **Chatbot + Avatar 感**：传统左右聊天布局让人物像海报。改为 AvatarStage、最近互动和 CURATE-only Shelf。
5. **真人大图压迫**：替换为原创 IP，并降低人物视觉重量，保持舞台和对话一体。
6. **恋爱化推断**：加入 Fact / Inference 边界，禁止把模糊关系写成确定事实。
7. **Session 污染**：曾出现 iPhone 会话继续引用跑步耳机。改为 sessionId 隔离、currentTopic 生命周期、pendingProduct 替换与 Memory relevance gating。
8. **Visual QA 假 Mobile**：修复错误 viewport 参数，并实际校验 PNG 像素尺寸。
9. **带空格路径错误**：QA 脚本使用 `fileURLToPath`，避免生成错误的 `%20` 目录。

## 十二、技术取舍

工程实现优先保证对话边界、上下文可信度、真实商品链路和可复现 QA；当前使用轻量 AvatarStage、JSON FileStore 和外部 Provider，保持核心链路清晰并便于后续扩展。

## 十三、已知限制

- Session 运行态保存在内存，同时由 JSON FileStore 持久化，服务重启后可恢复。
- 无登录、持久化数据库、支付和下单闭环。
- 当前不是实时 Live2D、视频数字人或口型同步。
- 外部 LLM/Provider 受网络、额度和 API 可用性影响。
- 真实商品可能缺少价格、图片或足够 evidence。
- 无可信结果时系统会返回 0 个商品。

## 十四、GitHub

- 本地 branch：`main`
- Release commit：`14aa70c docs: document DeepSeek runtime`。
- Remote：`origin` → `https://github.com/haomingweng3-eng/xiaoning-virtual-creator.git`。
- GitHub：<https://github.com/haomingweng3-eng/xiaoning-virtual-creator>
