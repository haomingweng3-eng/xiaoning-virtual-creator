# Final Delivery Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a reproducible 24-hour MVP with an IP virtual creator UI, evidence-backed real-product commerce, automated visual QA, complete documentation, and a local Git commit.

**Architecture:** Preserve the existing React/Express conversation and provider boundaries. Add one deterministic ProductInsights module between provider results and the orchestrator response, replace human media with a project-local IP asset, and add browser-driven QA as a separate delivery workflow.

**Tech Stack:** React 18, Vite 5, Node.js, Express, Vitest, OpenAI-compatible tool calling, Shopify Global Catalog, Tavily, browser automation.

**Spec:** `docs/superpowers/specs/2026-09-02-final-delivery-sprint-design.md`

## Global Constraints

- Do not add databases, login, payment, Live2D, TTS, lip sync, WebRTC, 3D, or a new UI framework.
- No mock, hardcoded, or LLM-invented products.
- Negative emotion and non-CURATE interactions always return zero products.
- Every rendered selling point must retain provider evidence.
- Keep sessionId isolation, currentTopic, memory relevance gating, and pendingProduct lifecycle intact.
- Validate 1440, 1024, 768, and 390 widths.

---

### Task 1: IP Virtual Host asset and creator config

**Files:**
- Create: `client/public/assets/xiaoning-main.png`
- Modify: `server/src/creatorConfig.js`
- Modify: `client/src/App.jsx`
- Test: `server/test/session.test.js`
- Test: `client/src/App.test.jsx`

**Interfaces:**
- Produces `creatorConfig.avatarStage.media.src === '/assets/xiaoning-main.png'` and a non-human fallback contract.

- [ ] Write tests asserting no runtime config references `avatar-main.mp4` or `creator-host.png` and all stage modes can use the IP asset.
- [ ] Run the focused tests and confirm they fail because the old human media is still configured.
- [ ] Generate and inspect the original IP asset, save it under `client/public/assets/`.
- [ ] Update config and AvatarStage to image-first IP rendering with `idle/listening/thinking/warm/happy/curate` state classes.
- [ ] Run focused tests and confirm they pass.

### Task 2: Evidence-backed ProductInsights

**Files:**
- Create: `server/src/productInsights.js`
- Modify: `server/src/shopifyCatalog.js`
- Modify: `server/src/productSearch.js`
- Modify: `server/src/orchestrator.js`
- Create: `server/test/productInsights.test.js`
- Modify: `server/test/orchestrator.test.js`
- Modify: `server/test/shopifyCatalog.test.js`

**Interfaces:**
- Produces `buildProductInsights(product, context)` and `rankInsightfulProducts(products, context, limit)`.
- A returned product includes `{ productInsights: { productId, sellingPoints, suitableFor, personalizedReason, tradeoff, confidence } }`.

- [ ] Write failing tests for evidence-only selling points, unsupported claim deletion, personalized reasons, product differentiation, confidence, deduplication, currency preservation, and no fake experience.
- [ ] Run focused tests and verify expected failures.
- [ ] Preserve raw provider evidence fields without inventing values.
- [ ] Implement deterministic evidence extraction and context matching; drop products with no usable insight when stronger alternatives exist.
- [ ] Integrate enrichment after real provider search and before creator reply generation.
- [ ] Run focused and full server tests.

### Task 3: Final responsive creator UI and Product Shelf

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/index.css`
- Modify: `client/src/App.test.jsx`

**Interfaces:**
- Consumes `product.productInsights` and valid `currency`.
- Produces compact `AvatarStage`, recent interactions, deterministic 720ms shelf transition, evidence-backed cards, and responsive layouts.

- [ ] Add failing component tests for IP media, state copy, max four recent interactions, hidden shelf outside valid CURATE products, evidence badges, personalized reason, tradeoff, currency formatting, and responsive semantic hooks.
- [ ] Run focused client tests and verify failures.
- [ ] Refactor AvatarStage and stage composition without introducing a Chat Panel.
- [ ] Render up to three evidence-backed cards and format money with `Intl.NumberFormat`; unknown currency shows “查看实时价格”.
- [ ] Implement desktop/tablet/mobile CSS at 1440/1024/768/390 and reduced motion.
- [ ] Run client tests and production build.

### Task 4: Golden tests and Visual QA

**Files:**
- Create: `scripts/golden-conversation.mjs`
- Create: `scripts/visual-qa.mjs`
- Modify: `package.json`
- Create at runtime: `artifacts/visual-qa/report.html`

**Interfaces:**
- Produces `npm run qa:golden` and `npm run qa:visual`.
- Visual report records input, interaction mode, emotion, currentTopic, commerce/provider/products, and PASS/FAIL.

- [ ] Add scripts that use fresh session IDs and real `/api/chat` calls; never inject products.
- [ ] Implement all 10 Golden cases, including topic switch and evidence checks.
- [ ] Implement nine screenshot cases and report generation against the real running app.
- [ ] Run the scripts; record external-service failures as real FAIL/blockers rather than substituting mock data.
- [ ] Inspect screenshots in the in-app browser at 1440/1024/768/390 and perform one bounded CSS refinement based on observed evidence.

### Task 5: Delivery documentation and hygiene

**Files:**
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `README.md`
- Create: `docs/final-report.md`
- Create: `docs/delivery-outline.md`
- Delete only after import scan: stale PDD/SerpAPI/manual test files and unused mock product data.

**Interfaces:**
- Produces accurate setup, architecture, test, screenshot, limitation, and troubleshooting documentation.

- [ ] Scan imports before removing stale files; preserve any referenced production code.
- [ ] Make environment documentation match actual `process.env` usage without exposing values.
- [ ] Rewrite README with demo screenshots, Mermaid architecture, exact commands, provider truth, and known limitations.
- [ ] Write the required problem/solution final report and 18-section delivery outline with screenshot and source-file mapping.
- [ ] Confirm docs contain no fake GitHub URL or nonexistent feature claims.

### Task 6: Git and final verification

**Files:**
- Create: `.git/` repository metadata through `git init`

**Interfaces:**
- Produces branch name, `Final MVP` commit hash, and truthful remote/auth status.

- [ ] Run `npm test` and confirm zero failures.
- [ ] Run `npm run build` and confirm exit 0.
- [ ] Run `npm run qa:visual` and inspect `artifacts/visual-qa/report.html` plus all final screenshots.
- [ ] Run secret/name scans and ensure `.env`, `node_modules`, and generated sensitive data are ignored.
- [ ] Initialize Git, add scoped delivery files, and commit `Final MVP` only after verification.
- [ ] Report branch, commit hash, missing `gh`/remote status, real blockers, and all artifact paths.
