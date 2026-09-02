# Final Delivery Sprint Design

## Objective

在现有可运行的小柠 MVP 上完成最后交付：保留 Session Isolation、ConversationAnalysis、Interaction Policy 与真实商品 Provider，将失败的真人大图界面替换为中等视觉重量的 IP Virtual Host，并增加严格基于 Provider 字段的 Product Evidence / ProductInsights。最终交付必须可测试、可截图、可解释、可本地复现。

## Product boundary

- 小柠是 Lifestyle Virtual Creator，不是 AI 女友、客服、ChatGPT clone 或商品搜索页。
- 情绪陪伴只做情绪理解、连续上下文和自然互动；负面情绪禁止商品搜索。
- 商品仅在 `interaction === CURATE && products.length > 0` 时出现，来源只能是 Shopify Global Catalog 或 Tavily fallback。
- 不增加登录、数据库、支付、Live2D、TTS、口型、WebRTC、3D 或新框架。
- Session 继续以内存 `Map<sessionId, Session>` 隔离；事实、话题、偏好和 pendingProduct 继续经过 relevance gating。

## Architecture

1. `creatorConfig` 只暴露项目内 IP 角色资产，三个 stage mode 复用同一资产并用布局验证构图。
2. React 主界面由紧凑 Header、AvatarStage、最近 2–4 条互动、Composer、延迟出现的 Product Shelf 组成；完整历史留在 secondary drawer。
3. Provider normalization 保留 description、vendor/merchant、product type、tags/options/variants/metadata 等可用 evidence 字段，不补造缺失值。
4. `productInsights` 是纯确定性证据提取层：只从真实字段提取有原文 evidence 的 selling points；再用当前明确需求选择 personalizedReason 和可证实的 tradeoff。差异不足时减少商品数。
5. Orchestrator 在真实搜索后生成 ProductInsights，再把 evidence-backed products 返回前端；创作者回复继续由 LLM 生成，但禁止复述或发明参数与亲测。
6. Visual QA 使用真实前后端和独立 session，通过浏览器自动记录截图与 API 元数据，生成 `artifacts/visual-qa/report.html`。

## UI direction

- 暖灰绿、米白和低饱和橙；依靠字体、留白、层级和内容节奏，不用霓虹、玻璃拟态或大面积渐变。
- Desktop 的 IP 舞台约占主内容 34–38% 视觉重量，互动区与人物融合但不是传统左右 Chat Panel。
- Mobile 人物不超过约 38vh；互动与 Composer 顺序自然；商品纵向排列且无横向溢出。
- 状态仅使用文字、背景 tone 和 `scale(1) → scale(1.008)` 的 CSS breathing，不伪造口型。

## Trust model

- 每个 selling point 都包含 `label/detail/evidence`；没有 evidence 就不渲染。
- 禁止输出未被 Provider 支持的续航、防水、重量、材质、芯片、降噪、佩戴稳定与认证参数。
- 禁止“小柠买过/用过/亲测”等虚构体验。
- 价格必须由 `Intl.NumberFormat` 搭配有效 ISO currency 展示；币种未知则不展示裸数字。
- 无可信商品时返回 `[]` 和诚实说明，不为了凑卡片放宽 Product Gate。

## Verification

- Unit/integration: session isolation、topic switch、memory relevance、pendingProduct、事实/推断、情绪禁带货、commerce cancel、evidence、currency、dedup、gate、no fake experience、responsive component contracts。
- Real runs: 10 个 Golden Conversation cases，记录 interaction、emotion、topic、provider、products 和证据完整性。
- Browser: 1440、1024、768、390；首页、情绪、正向、普通聊天、推荐前、CURATE、topic switch、mobile、商品详情。
- Final commands: `npm test`, `npm run build`, `npm run qa:visual`。
