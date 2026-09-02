# 小柠虚拟达人 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可运行、真实数据驱动且具备代码级安全边界的情感陪伴与智能带货 MVP。

**Architecture:** Express 后端统一代理 OpenAI 与 SerpAPI，以确定性守门决定工具权限，以强制工具顺序完成带货链路；React 前端只消费统一聊天响应并展示消息与商品卡片。

**Tech Stack:** Node.js, Express, OpenAI SDK, React, Vite, Tailwind CSS, Vitest, Supertest, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-01-xiaoning-mvp-design.md`

## Global Constraints

- 商品数据只来自实时 SerpAPI，不允许 mock 商品兜底。
- 负面情绪场景不得调用商品搜索。
- 强购物场景必须先搜索，再生成最终回复。
- 会话只保留最近 8 个完整用户/助手轮次。
- 所有密钥从环境变量读取；`OPENAI_MODEL` 默认 `gpt-3.5-turbo`。

---

### Task 1: 后端守门与会话状态

**Files:** Create `server/package.json`, `server/src/intent.js`, `server/src/session.js`, `server/test/intent.test.js`, `server/test/session.test.js`

**Interfaces:** Produces `classifyMessage(message, context)`, `createSession()`, `appendTurn(session, user, assistant)`, `mergePreferences(session, update)`.

- [ ] 写意图优先级、强弱购物、确认续接和 8 轮成对截断的失败测试。
- [ ] 运行测试并确认因实现缺失而失败。
- [ ] 实现最小守门和会话逻辑。
- [ ] 运行测试并确认通过。

### Task 2: 商品搜索与安全校验

**Files:** Create `server/src/productSearch.js`, `server/src/validators.js`, `server/test/productSearch.test.js`, `server/test/validators.test.js`

**Interfaces:** Produces `searchProducts(args, options)`, `cleanShoppingResults(payload, limits)`, `validateReply(context)`.

- [ ] 写淘宝来源过滤、价格范围、空结果、越权商品、负面搜索和客服腔测试。
- [ ] 运行测试并确认失败。
- [ ] 实现 SerpAPI 请求、字段清洗和后置校验。
- [ ] 运行测试并确认通过。

### Task 3: OpenAI 编排与聊天接口

**Files:** Create `server/src/prompts.js`, `server/src/orchestrator.js`, `server/src/app.js`, `server/src/index.js`, `server/test/orchestrator.test.js`, `server/test/chat.test.js`

**Interfaces:** Consumes Tasks 1-2; produces `createChatOrchestrator(dependencies)` and Express `POST /api/chat`; response always `{ reply: string, products: Product[] }`.

- [ ] 写陪伴单工具、带货搜索优先、搜索失败降级、一次重试、安全兜底和统一响应测试。
- [ ] 运行测试并确认失败。
- [ ] 实现固定提示层、工具 schema、强制顺序和错误映射。
- [ ] 运行测试并确认通过。

### Task 4: React 聊天界面

**Files:** Create client Vite/Tailwind configuration and `client/src/App.jsx`, `client/src/api.js`, `client/src/index.css`, `client/src/App.test.jsx`.

**Interfaces:** Consumes `POST /api/chat`; renders messages, loading state, avatar state and product cards.

- [ ] 写三个快捷示例、普通/搜索加载文案、消息发送和商品新窗口链接测试。
- [ ] 运行测试并确认失败。
- [ ] 实现极简单页聊天界面。
- [ ] 运行测试并确认通过。

### Task 5: 项目配置、文档与端到端验证

**Files:** Create root `package.json`, `.env.example`, `.gitignore`, `README.md`.

- [ ] 配置一键安装、开发、构建和测试命令。
- [ ] 文档说明真实 API、淘宝来源过滤、环境变量和完整启动步骤。
- [ ] 运行全部测试与前端生产构建。
- [ ] 启动后端并验证健康接口，确认无密钥时返回安全错误而非技术栈信息。
