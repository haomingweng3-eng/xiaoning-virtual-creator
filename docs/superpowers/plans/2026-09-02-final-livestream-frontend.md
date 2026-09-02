# Final Livestream Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有前端从“Avatar + Chat Panel”改造成以数字主播为首要视觉中心的 Interactive Virtual Livestream Room。

**Architecture:** 保留现有真实聊天、ConversationAnalysis、Interaction Mode、Memory、Shopify/Tavily、ProductInsights 后端边界。前端以一个统一的 `LivestreamRoom` 组合 `AvatarStage`、最近互动 Overlay、Composer 和条件渲染的 Product Shelf；用现有 response 的 `interaction`、`products` 和 session creator config 驱动视觉状态。

**Tech Stack:** React、Vite、现有 fetch API、CSS transform/opacity、Vitest/Testing Library、浏览器真实验收。

**Spec:** 已批准的 Open Source Reference Study 与用户提供的 Final Frontend Implementation 约束（本轮不修改后端核心业务）。

## Global Constraints

- 只修改 `client/src/App.jsx`、`client/src/index.css`、`client/src/App.test.jsx`，以及必要的 `client/public/assets/*` 和前端组件拆分文件。
- 不修改 `server/src/conversationAnalysis.js`、`orchestrator.js`、`intent.js`、`productSearch.js`、`shopifyCatalog.js`、`creatorContent.js`、`creatorConfig.js`。
- 首页第一视觉中心必须是 Digital Human Stage，不得保留右侧完整 Chat Panel、Magazine Hero、巨大 TODAY 或 Creator Blog。
- 主页面只显示最近 2–4 条互动；完整 history 通过 secondary drawer/sheet 查看。
- Product Shelf 仅在 `interaction = CURATE` 且 `products.length > 0` 时显示，并在主播回复后 600–900ms 出现。
- 不引入 Live2D、WebRTC、Wav2Lip、MuseTalk、动画框架或假商品/假试衣内容。
- 必须真实验收 1440px 和 390px，包含 idle、普通交流、陪伴、积极、潜在需求和 CURATE。

### Task 1: Define the new room behavior with failing tests

**Files:**
- Modify: `client/src/App.test.jsx`
- Test: `client/src/App.test.jsx`

**Interfaces:**
- `App` continues to accept injectable `sendChat` and `getSessionState`.
- Tests assert user-visible behavior, not implementation details.

- [ ] **Step 1: Write failing tests** for a unified stage without a right chat panel, recent interaction limit, loading status labels, hidden shelf before CURATE, delayed shelf after CURATE, and secondary history control.
- [ ] **Step 2: Run `npm test -- --run client/src/App.test.jsx`** and confirm the new assertions fail because the current page still uses the old layout/behavior.
- [ ] **Step 3: Keep the existing passing tests and make test fixtures cover real response fields (`interaction`, `products`, `segments`, `analysis`).

### Task 2: Recompose `App.jsx` around the livestream room

**Files:**
- Modify: `client/src/App.jsx`
- Optional create: `client/src/components/AvatarStage.jsx`, `StageOverlay.jsx`, `Composer.jsx`, `ProductShelf.jsx`

**Interfaces:**
- `AvatarStage` consumes creator config, `mode`, `mood`, `status`, `topic`, and media/fallback props.
- `StageOverlay` consumes at most the latest four messages and presents user messages lighter than creator replies.
- `Composer` consumes `input`, `loading`, `onSubmit`, and exposes `listening`/`thinking` copy.
- `ProductShelf` consumes only trusted product response data and returns `null` for an empty list.

- [ ] **Step 1: Implement the room shell** with Stage as the dominant surface, no permanent right-side conversation panel, and no magazine content.
- [ ] **Step 2: Move recent interactions into the Stage overlay** and add a low-emphasis “查看对话” control that opens a drawer/sheet with the complete existing history.
- [ ] **Step 3: Map request and interaction state** to `idle`, `listening`, `thinking`, `warm`, `happy`, and `curate`; use existing `interaction` and analysis emotion without random state changes.
- [ ] **Step 4: Add a present-mode Stage pick overlay** with only product title and one evidence-backed core judgment; leave detailed fields to Product Shelf.
- [ ] **Step 5: Add deterministic CURATE reveal** after the assistant response is committed, using a 600–900ms timer, cancelled on unmount or a new request.

### Task 3: Rebuild livestream visual hierarchy and responsive CSS

**Files:**
- Modify: `client/src/index.css`

**Interfaces:**
- Desktop Stage is approximately 70–82vh and visually dominates the page.
- Mobile Stage is approximately 55–65vh with no horizontal overflow.
- Motion uses only CSS transforms/opacity and is disabled under `prefers-reduced-motion`.

- [ ] **Step 1: Replace two-column Chat UI styling** with a full-bleed warm lifestyle stage, content-safe overlays, soft vignette/gradient layers, and no white image card border.
- [ ] **Step 2: Style overlay interactions, stage status, composer, drawer, and product shelf** so the host remains primary and product information is secondary.
- [ ] **Step 3: Add slow 6–10 second breathing/camera drift** with a small thinking amplitude increase and reduced-motion override.
- [ ] **Step 4: Add 1440px and 390px breakpoints** for stage height, typography, shelf stacking, and drawer behavior.

### Task 4: Browser visual QA and refinement

**Files:**
- Create: `artifacts/final-livestream/desktop-idle.png`, `desktop-companion.png`, `desktop-happy.png`, `desktop-before-curate.png`, `desktop-curate.png`, `mobile-normal.png`, `mobile-curate.png`
- Modify: `client/src/App.jsx` or `client/src/index.css` only if browser evidence identifies a visual issue.

**Interfaces:**
- Use the running local app and real backend/provider responses; no mock products.

- [ ] **Step 1: Verify 1440px idle and ordinary conversation**; confirm the first impression is a livestream room rather than a chat page.
- [ ] **Step 2: Verify companion and happy scenarios**; confirm Stage states become warm/happy and no shopping language appears.
- [ ] **Step 3: Verify latent running/headphone scenario**; confirm no Product Shelf before explicit recommendation request.
- [ ] **Step 4: Verify CURATE**; confirm present mode, delayed Shelf reveal, 2–3 real products, and no overlap with the host’s face.
- [ ] **Step 5: Verify 390px normal and CURATE**; confirm 55–65vh Stage, no horizontal scrolling, readable composer and shelf.
- [ ] **Step 6: Perform one autonomous visual refinement pass** based on screenshots before declaring completion.

### Task 5: Full verification and report

**Files:**
- Modify: `docs/Final MVP Implementation Report.md` or create: `docs/Final Livestream Frontend Report.md`

- [ ] **Step 1: Run client tests, server tests, and client production build.**
- [ ] **Step 2: Check modified-file scope and confirm no backend core files changed.**
- [ ] **Step 3: Record page architecture, state mapping, transition behavior, screenshots, and unresolved visual limitations.**
- [ ] **Step 4: Stop after the report; do not add unrelated features.**
