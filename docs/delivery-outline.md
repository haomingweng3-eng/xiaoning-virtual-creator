# 最终提交文档大纲

> 用于整理“需求 & 产品 & 实现截图 & GitHub 链接”的最终提交材料。最终筛选截图位于 `artifacts/release-screenshots/`；GitHub 地址只能在真实 push 后填写。

## 1. 项目背景

- **写什么**：24 小时 Vibe Coding 笔试；目标是情感陪伴 + 智能带货的虚拟达人，要求真实可运行、真实数据、可复现。
- **截图**：`artifacts/visual-qa/01-home.png`
- **代码**：`README.md`

## 2. 需求理解

- **写什么**：用户第一眼看到虚拟达人，第二眼知道可以互动，第三眼理解她能基于需求挑真实商品；不是客服/ChatGPT/商城。
- **截图**：`01-home.png`、`02-emotional.png`、`06-curate.png`
- **代码**：`client/src/App.jsx`

## 3. 需求拆解

- **写什么**：Chat、Companion、Creator、Context、Commerce、Trust、Responsive、Reproducible 八个模块及验收边界。
- **截图**：Visual QA `report.html` 首页。
- **代码**：`docs/superpowers/specs/2026-09-02-final-delivery-sprint-design.md`

## 4. 产品方案

- **写什么**：IP Virtual Host + Recent Interactions + Composer + CURATE-only Product Shelf；完整 history 放 drawer。
- **截图**：`01-home.png`、`04-normal-chat.png`
- **代码**：`client/src/App.jsx`、`client/src/index.css`

## 5. 用户流程

- **写什么**：进入首页 → 分享近况 → 情绪/场景互动 → 潜在需求不搜索 → 明确请求进入 CURATE → 观点先出现 → 720ms 后 Shelf。
- **截图**：`05-pre-commerce.png`、`06-curate.png`
- **代码**：`server/src/conversationAnalysis.js`、`client/src/App.jsx`

## 6. 虚拟达人设计

- **写什么**：原创小柠 IP、轻量直播空间、idle/listening/thinking/warm/happy/curate 状态，CSS breathing，不伪造口型。
- **截图**：`01-home.png`、`03-positive.png`
- **代码**：`client/public/assets/xiaoning-main.png`、`server/src/creatorConfig.js`

## 7. 情感陪伴设计

- **写什么**：情绪识别、REACT/SHARE、自然短段落、负面情绪禁止带货、无恋爱亲密度。
- **截图**：`02-emotional.png`
- **代码**：`server/src/prompts.js`、`server/src/conversationAnalysis.js`、`server/src/validators.js`

## 8. 智能带货设计

- **写什么**：ConversationAnalysis + deterministic policy；latent 禁止、implicit 需 readiness 与明确 need、explicit 允许 CURATE；0 商品合法。
- **截图**：`05-pre-commerce.png`、`06-curate.png`
- **代码**：`server/src/conversationAnalysis.js`、`server/src/orchestrator.js`

## 9. 技术架构

- **写什么**：React → API → Session Isolation → Analysis → Policy → LLM → Provider → Gate → Evidence → Insights → UI；放 README Mermaid 图。
- **截图**：README 架构图导出或文档截图。
- **代码**：`README.md`、`server/src/index.js`

## 10. 真实数据方案

- **写什么**：Shopify Global Catalog 优先，Tavily fallback，具体商品 URL 与去重 gate，缺失字段不造假。
- **截图**：`06-curate.png`
- **代码**：`server/src/shopifyCatalog.js`、`server/src/productSearch.js`

## 11. 核心实现

- **写什么**：Session Map、currentTopic/pendingProduct、relevance gating、ProductInsights、currency formatting、720ms transition。
- **截图**：`07-topic-switch.png`、`09-product-detail.png`
- **代码**：`server/src/app.js`、`server/src/prompts.js`、`server/src/productInsights.js`、`client/src/App.jsx`

## 12. 测试与质量保障

- **写什么**：Unit/integration、10 个真实 Golden cases、9 个真实 browser cases、build 与 secret scan。
- **截图**：`artifacts/visual-qa/report.html`
- **代码**：`server/test/`、`client/src/App.test.jsx`、`scripts/golden-conversation.mjs`、`scripts/visual-qa.mjs`

## 13. 产品截图

- **写什么**：按 idle、情绪、正向、普通聊天、推荐前、CURATE、Topic Switch、Mobile、Evidence detail 排列。
- **截图**：`artifacts/visual-qa/01-home.png` 至 `09-product-detail.png`
- **代码**：无；引用自动生成产物。

## 14. 开发问题

- **写什么**：电商 API 权限、Tavily 非 Catalog、商品幻觉、Chatbot 感、恋爱偏移、事实推断、Memory 污染、真人海报、Visual QA 假 mobile。
- **截图**：可放修复后的 `07-topic-switch.png` 和 `09-product-detail.png`。
- **代码**：`docs/final-report.md`

## 15. 解决思路

- **写什么**：Provider 解耦、Product Gate、Evidence-backed Insights、Interaction modes、Fact Boundary、SessionId + relevance、IP Host、真实 viewport。
- **截图**：`02-emotional.png`、`06-curate.png`、`08-mobile.png`
- **代码**：同第 14 节对应模块。

## 16. 技术取舍

- **写什么**：为什么不用 Live2D/LiveTalking/Wav2Lip/TTS/WebRTC/数据库；24 小时内优先产品逻辑、可信数据和复现稳定性。
- **截图**：`01-home.png`
- **代码**：`README.md`、`docs/final-report.md`

## 17. 已知限制

- **写什么**：内存 Session、重启丢会话、无登录/数据库/支付、非实时数字人、外部字段不完整、0 商品合法、外部服务依赖。
- **截图**：无可信商品时可补充一次真实 0 商品截图；不得使用 mock。
- **代码**：`README.md`

## 18. GitHub 地址

- **写什么**：只填写真实创建并 push 成功的仓库 URL；当前本机无 `gh` 命令且无 remote，不能伪造。
- **截图**：GitHub 仓库首页与 commit 页面（push 后由提交者补）。
- **代码**：GitHub `main` 分支当前最终提交 `14aa70c docs: document DeepSeek runtime`。
- **GitHub URL**：<https://github.com/haomingweng3-eng/xiaoning-virtual-creator>
