# 小柠 Creator Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小柠从“聊天机器人 + 商品列表”改造成有 Creator identity、短节奏、真实关系边界和可信商品门槛的 Lifestyle Virtual Creator MVP。

**Architecture:** 保留现有 React + Vite、Express、内存 session 和 Tavily 链路。后端用 `ConversationAnalysis` 产出语义信号，再由确定性 policy 只做安全约束；商品数据进入独立 `cleanShoppingResults` Gate 后才返回前端。前端保持 `/api/chat` 兼容，使用 Creator profile、presence、conversation stream 和 editorial product tile 组织体验。

**Tech Stack:** Node.js 18+、Express、OpenAI tool calling、Tavily Search API、React 18、Vite、Tailwind CSS、Vitest、Testing Library、Supertest。

**Spec:** `docs/superpowers/specs/2026-09-01-xiaoning-creator-experience-redesign-design.md`

## Global Constraints

- 本轮不新增 MCP、数据库、登录、Vector DB、LangGraph、LangChain、Redis、语音、3D Avatar 或复杂动画。
- 继续沿用现有 Express/React 架构、内存 session 和 Tavily 搜索链路，不删除现有聊天和商品搜索能力。
- 默认回复为 1–3 个自然 message segments，多数情况下约 15–100 中文字；禁止用字符串截断制造短回复；用户明确要求详细说明时允许更长。
- 没有可靠 `createdAt` 时不显示“认识第 N 天”；只显示“刚认识”或真实的“聊过 N 次”。
- `ConversationAnalysis + deterministic policy` 共同决定 Commerce：`none`/`latent` 禁止搜索；`implicit` 只有 `recommendation_readiness >= 0.65` 且已有明确 need/category 才允许进入自然推荐判断；`explicit` 允许搜索。
- 明显文章、攻略、排行榜、搜索页，或无法较高可信判断为具体商品的结果必须过滤；0 个可信商品是合法结果。
- 商品最多返回 3 个；canonical URL 和 normalized title 去重；不得显示 `¥0`；不得伪造图片或虚构第一人称体验。
- API 响应继续保持 `{ reply, products }`，允许保留已有 `analysis` 字段。

---

### Task 1: Conversation Policy 与 Persona 约束

**Files:**
- Modify: `server/src/intent.js`
- Modify: `server/src/conversationAnalysis.js`
- Modify: `server/src/prompts.js`
- Modify: `server/src/orchestrator.js`
- Modify: `server/src/session.js`
- Test: `server/test/intent.test.js`
- Test: `server/test/orchestrator.test.js`
- Test: `server/test/session.test.js`

**Interfaces:**
- `classifyMessageFallback(message, context)` 继续返回 `{ scene, allowSearch, inheritedProduct? }`，但“最近想买个鼠标”必须返回 `weak-shopping`。
- 新增 `applyConversationPolicy(analysis, message, context)`，返回标准化 analysis；它只约束模型结果，不负责替代语义分析。
- `createSession()` 的 `relationship` 只包含可真实支持的 `interactionCount` 与 `intimacy`；不新增伪造的 `createdAt`。

- [ ] **Step 1: 写失败测试，固定语义 policy。**

```js
test('keeps implicit shopping below readiness threshold out of commerce', () => {
  const result = applyConversationPolicy({
    shopping_intent: 'implicit', recommendation_readiness: 0.64,
    topic: '鞋', response_mode: 'RECOMMEND', user_need: 'recommendation',
  }, '感觉少点什么', { pendingProduct: '鞋' });
  expect(result.response_mode).toBe('EXPLORE');
});

test('allows implicit shopping only with readiness and a known need', () => {
  const result = applyConversationPolicy({
    shopping_intent: 'implicit', recommendation_readiness: 0.65,
    topic: '鞋', response_mode: 'RECOMMEND', user_need: 'recommendation',
  }, '感觉少点什么', { pendingProduct: '鞋' });
  expect(result.response_mode).toBe('RECOMMEND');
});

test('negative emotion always wins over shopping analysis', () => {
  const result = applyConversationPolicy({
    emotion: 'sad', emotion_intensity: 8, shopping_intent: 'explicit',
    recommendation_readiness: 1, response_mode: 'RECOMMEND', topic: '鼠标',
  }, '今天被老板说了一顿，顺便推荐个鼠标', {});
  expect(result.response_mode).toBe('ACCOMPANY');
  expect(result.shopping_intent).toBe('none');
});
```

- [ ] **Step 2: 运行相关测试确认失败。**

Run: `export PATH="/Users/mima0000/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" && npm run test --prefix server -- --run server/test/intent.test.js server/test/orchestrator.test.js`

Expected: FAIL because `applyConversationPolicy` is absent and the existing fallback classifies `想买` as strong shopping.

- [ ] **Step 3: 实现最小 policy 和 session 状态修正。**

实现要点：

```js
export function applyConversationPolicy(analysis, message, context = {}) {
  const fallback = classifyMessageFallback(message, context);
  const next = { ...analysis };
  if (fallback.scene === 'negative') {
    return { ...next, response_mode: 'ACCOMPANY', shopping_intent: 'none', recommendation_readiness: 0 };
  }
  const explicit = fallback.scene === 'shopping';
  const implicitReady = next.shopping_intent === 'implicit'
    && Number(next.recommendation_readiness) >= 0.65
    && Boolean(context.pendingProduct || next.topic || next.occasion || next.requirements?.length);
  if (next.shopping_intent === 'none' || next.shopping_intent === 'latent') {
    return { ...next, response_mode: next.response_mode === 'ACCOMPANY' ? 'ACCOMPANY' : 'EXPLORE' };
  }
  if (next.shopping_intent === 'implicit' && !implicitReady) {
    return { ...next, response_mode: 'EXPLORE' };
  }
  if (next.shopping_intent === 'explicit' && explicit) return { ...next, response_mode: 'RECOMMEND' };
  if (next.shopping_intent === 'implicit' && implicitReady) return { ...next, response_mode: 'RECOMMEND' };
  return { ...next, response_mode: 'EXPLORE' };
}
```

移除 `想买` 作为强动作词；把潜在商品记录到 `pendingProduct`，让后续确认承接。关系标签数据只使用 `interactionCount`，不推导天数。

- [ ] **Step 4: 收紧 Persona prompt 和分析归一化。**

在 `CHARACTER_BIBLE` 中加入：刚认识阶段不得主动使用亲昵称呼；不得猜测用户性别等个人属性；不得声称穿过、买过、亲测或长期使用；只允许表达审美偏好。将语气约束改成“默认 1–3 段、约 15–100 字、由自然停顿控制，不做字符串截断”，并明确允许回应-only/观点-only/一个问题/两条短消息感。将 `recommendation_readiness` 说明统一为 0–1 语义，兼容旧的 0–10 输入时归一化为小数。

- [ ] **Step 5: 运行 server policy 测试并修正所有相关断言。**

Run: `export PATH="/Users/mima0000/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" && npm run test --prefix server`

Expected: policy、negative emotion、weak intent、relationship 相关测试 PASS；未修改商品 Gate 的失败测试可暂时保留到 Task 2。

---

### Task 2: Product Rendering Gate 与 Tavily 兼容清洗

**Files:**
- Modify: `server/src/productSearch.js`
- Modify: `server/src/orchestrator.js`
- Modify: `server/src/validators.js`
- Test: `server/test/productSearch.test.js`
- Test: `server/test/validators.test.js`

**Interfaces:**
- `cleanShoppingResults(payload, { minPrice = 0, maxPrice = Infinity, limit = 3 } = {})` 返回 `Product[]`。
- `Product` 为 `{ title, price: number|null, image: string, url, highlight, source, imageFallback }`。
- `searchProducts(args, options)` 继续返回 `{ products, unavailable }`，且所有 products 都已通过 `cleanShoppingResults`。

- [ ] **Step 1: 写失败测试覆盖信任门槛。**

```js
test('filters article pages, invalid urls, empty titles, and duplicates', () => {
  const results = cleanShoppingResults({ results: [
    { title: '鼠标购买攻略', url: 'https://example.com/article/mouse', content: '攻略' },
    { title: '', url: 'https://item.taobao.com/item.htm?id=1' },
    { title: '静音无线鼠标', url: 'https://item.taobao.com/item.htm?id=1&utm_source=x', content: '¥89' },
    { title: '静音  无线 鼠标', url: 'https://item.taobao.com/item.htm?id=2', content: '¥99' },
    { title: '排行榜', url: 'https://item.taobao.com/list?id=3', content: '¥29' },
  ]}, { minPrice: 50, maxPrice: 100 });
  expect(results).toHaveLength(1);
  expect(results[0].price).toBe(89);
});

test('keeps a credible product with a price and image fallback', () => {
  const [product] = cleanShoppingResults({ results: [
    { title: '简约帆布包', url: 'https://detail.tmall.com/item.htm?id=9', content: '精选', image: '' },
  ]});
  expect(product.price).toBeNull();
  expect(product.imageFallback).toBe(true);
});

test('never returns more than three credible products', () => {
  const results = cleanShoppingResults({ results: [1, 2, 3, 4].map((id) => ({
    title: `商品${id}`, url: `https://item.taobao.com/item.htm?id=${id}`, content: '¥10',
  }))});
  expect(results).toHaveLength(3);
});
```

- [ ] **Step 2: 运行商品测试确认当前实现失败。**

Run: `export PATH="/Users/mima0000/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" && npm run test --prefix server -- --run server/test/productSearch.test.js server/test/validators.test.js`

Expected: FAIL because `cleanShoppingResults` is absent and current fallback会放入非详情页、0 价格以及重复结果。

- [ ] **Step 3: 实现清洗函数和 Tavily 字段适配。**

实现 `canonicalizeUrl`：只接收 `http:`/`https:`，移除 hash 与 `utm_*`/`spm`/`ref` 等追踪参数；实现 `normalizeTitle`：统一大小写、空白和标点。只过滤明显文章/攻略/排行榜/资讯/搜索/列表语义，无法判断为具体商品的页面直接丢弃；不为凑数量扩展到普通内容页。价格解析失败或小于等于 0 时设为 `null`，图片缺失时返回空字符串与 `imageFallback: true`。来源使用 URL hostname。

`searchProducts` 从 `options.apiKey ?? process.env.TAVILY_API_KEY` 取 key；删除代码中的默认 key；使用注入的 `fetchImpl` 便于测试；调用 Tavily 后把 `data.results` 送入 Gate，返回最多 3 个。

- [ ] **Step 4: 加强回复校验与推荐结果空态。**

让 `validateReply` 拦截无搜索时的商品建议、数字价格、链接和客服腔；有搜索时仍禁止把价格/链接塞入 `reply`。编排器在 Gate 返回空数组时输出：`我刚看了一圈，但没找到我觉得足够靠谱的具体款，先不乱推给你。`，不让模型生成商品。

- [ ] **Step 5: 运行商品与后端全部测试。**

Run: `export PATH="/Users/mima0000/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" && npm run test --prefix server`

Expected: 所有已更新的 Gate、价格、空态、去重和回复校验测试 PASS。

---

### Task 3: Orchestrator 路由与 API 兼容

**Files:**
- Modify: `server/src/orchestrator.js`
- Modify: `server/src/conversationAnalysis.js`
- Modify: `server/src/app.js`
- Test: `server/test/orchestrator.test.js`
- Test: `server/test/chat.test.js`

**Interfaces:**
- `createChatOrchestrator({ complete, search })` 仍返回 `chat(message, session)`。
- `chat()` 返回 `{ reply, products, analysis }`；`products` 只来自搜索 Gate。
- `GET /api/session` 返回 `{ openingMessage, relationship, hasGreeted }`，relationship 不包含无来源天数。

- [ ] **Step 1: 写场景路由测试。**

补充 A–F 对应的可注入测试：负面情绪不调用 search；“明天第一次和喜欢的人出去”只生成陪伴/探索；“白衬衫牛仔裤”允许 SHARE 观点但不搜索；“感觉少点什么”记录 pendingProduct 且不搜索；下一轮明确“那你帮我看看有什么合适的”才调用 search；搜索返回空或 Gate 全过滤时返回合法空态。

- [ ] **Step 2: 实现 analysis → policy → route 数据流。**

在 `chat()` 中先 `analyzeConversation`，再调用 `applyConversationPolicy`；不要用关键词结果直接替代 LLM 分析。policy 只负责禁用不被允许的 mode/tool。RECOMMEND 进入搜索判断时，保留现有 semantic tool call；只有 semantic call 选择 `search_products` 才真正调用 Tavily。ACCOMPANY/EXPLORE/SHARE 始终只能开放 `companion_reply`。

- [ ] **Step 3: 处理短节奏和安全重试。**

生成 prompt 约束但不对字符串做截断；保留最多一次无效回复重试和安全陪伴 fallback。若 `reply` 中包含多个自然段，保留原始换行交给前端分段渲染。

- [ ] **Step 4: 运行后端全部测试并修正统一响应。**

Run: `export PATH="/Users/mima0000/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" && npm run test --prefix server`

Expected: `/api/chat`、路由、空态、关系状态和安全校验测试 PASS。

---

### Task 4: Creator Profile、Presence 与 Conversation Stream UI

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/index.css`
- Modify: `client/src/App.test.jsx`

**Interfaces:**
- 保留 `App({ sendChat, getSessionState })` 注入接口，方便测试。
- 前端 message 结构继续为 `{ role, text, products }`；assistant `text` 使用空行拆成 1–3 个视觉 segments，不改变 API。
- `ProductCard` 对 `price === null` 显示“查看实时价格”，对 `imageFallback` 显示“图片暂缺 / 实时信息”，不显示 Emoji 主图。

- [ ] **Step 1: 先写失败的 UI 验收测试。**

```jsx
test('shows creator identity without chatbot status language', async () => {
  render(<App getSessionState={vi.fn().mockResolvedValue({
    openingMessage: '今天刚整理完一些喜欢的东西。',
    relationship: { interactionCount: 0 },
  })} sendChat={vi.fn()} />);
  expect(await screen.findByText('Lifestyle / Daily Finds')).toBeInTheDocument();
  expect(screen.getByText('最近喜欢简单、舒服、不过度的东西。')).toBeInTheDocument();
  expect(screen.queryByText('在线')).not.toBeInTheDocument();
  expect(screen.queryByText(/认识第/)).not.toBeInTheDocument();
});

test('renders assistant paragraphs as natural segments and product fallbacks safely', async () => {
  const sendChat = vi.fn().mockResolvedValue({
    reply: '白衬衫牛仔裤其实不差。\n\n第一次见面我反而觉得干净一点更舒服。',
    products: [{ title: '简约帆布包', price: null, image: '', imageFallback: true,
      url: 'https://detail.tmall.com/item.htm?id=1' }],
  });
  render(<App sendChat={sendChat} />);
  await userEvent.type(screen.getByPlaceholderText('和小柠说点什么…'), '感觉少点什么');
  await userEvent.click(screen.getByRole('button', { name: '发出去' }));
  expect(await screen.findByText('第一次见面我反而觉得干净一点更舒服。')).toBeInTheDocument();
  expect(screen.getByText('查看实时价格')).toBeInTheDocument();
  expect(screen.getByText(/图片暂缺/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行前端测试确认旧 UI 断言与新目标不一致。**

Run: `export PATH="/Users/mima0000/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" && npm run test --prefix client`

Expected: 旧的客服式快捷按钮、在线状态和 Emoji 头像相关断言需要更新。

- [ ] **Step 3: 实现 Creator Header。**

在 `App.jsx` 拆出 `CreatorHeader`：使用临时 CSS avatar mark（不投入真实头像系统），显示小柠、`Lifestyle / Daily Finds`、签名、`刚认识` 或 `聊过 N 次`。relationship 只读取 `interactionCount`；没有 `createdAt` 时绝不显示天数。去掉 online dot、AI、助手、客服状态文案。

- [ ] **Step 4: 实现 Creator Presence 与 Starters。**

拆出 `CreatorPresence`，将开场消息和 4 个自然 starters 放进 editorial entry。starter 使用轻量文本入口而非高对比功能按钮；点击仍调用 `submitMessage`，首条发送后隐藏 entry。

- [ ] **Step 5: 实现 Conversation Stream 和 Message rhythm。**

拆出 `ConversationStream`、`CreatorMessage`、`UserMessage`。Creator 消息使用名字/轻标签/自然文本块；按空行拆成视觉 segments，不增加延迟或复杂消息服务。用户消息使用轻量 pill/card，避免左右巨大气泡。加载态保持克制的 typing dots，不显示“正在帮你找好物”式客服任务文案。

- [ ] **Step 6: 实现 ProductCard trust presentation。**

商品卡只渲染后端返回的数据；真实图片失败后使用低对比 fallback；正价格显示价格，其他情况显示“查看实时价格”；展示来源和基于 `product.reason`/当前上下文的简短推荐理由（没有来源就不编体验）。删除购物袋 Emoji、大阴影和“为您找到以下商品”等文案。

- [ ] **Step 7: 更新 CSS，完成 Desktop/Mobile 基础布局。**

使用暖中性色、衬线/无衬线层级、宽松 whitespace 和细边框。Desktop 使用宽内容区与窄阅读 column 的 editorial hierarchy；Mobile 在 320px–430px 保持 header、presence、stream、composer 不溢出。禁止大渐变、霓虹、玻璃拟态、夸张动画和大量阴影。

- [ ] **Step 8: 运行前端测试和生产构建。**

Run: `export PATH="/Users/mima0000/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" && npm run test --prefix client && npm run build --prefix client`

Expected: 前端测试和 Vite build PASS。

---

### Task 5: 浏览器真实场景验收、视觉 refinement 与报告

**Files:**
- Modify: `README.md`
- Create: `Creator Experience Redesign Report.md`
- Create: `artifacts/screenshots/creator-home-desktop.png`
- Create: `artifacts/screenshots/accompany-desktop.png`
- Create: `artifacts/screenshots/conversation-desktop.png`
- Create: `artifacts/screenshots/recommend-before-desktop.png`
- Create: `artifacts/screenshots/product-results-desktop.png`
- Create: `artifacts/screenshots/no-trusted-product-desktop.png`
- Create: `artifacts/screenshots/creator-mobile.png`

**Interfaces:**
- 真实开发地址为 `http://localhost:5173/`；浏览器使用现有 in-app browser tab。
- 报告必须记录原页面机器人感来源、每个主要区域变化、Desktop/Mobile 实际表现、无可信商品空态和仍未解决的问题。

- [ ] **Step 1: 运行全量自动化验证。**

Run: `export PATH="/Users/mima0000/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH" && npm test && npm run build`

Expected: server tests、client tests、client production build 全部 PASS。

- [ ] **Step 2: 浏览器先验收 Creator Header 和 Conversation Starters。**

在 Desktop viewport 观察首屏：确认没有在线绿点、AI/助手标签、Emoji 头像、RPG 数值；确认签名与真实关系信息有层级，Starters 像 conversation prompts 而不是菜单。保存首页截图。

- [ ] **Step 3: 验收 Conversation Stream、User Message、Creator Message。**

依次跑 Scenario B–E：

```text
今天被老板说了一顿
明天第一次和喜欢的人出去
我准备白衬衫牛仔裤
感觉少点什么
```

确认小柠先陪伴，再表达场景判断和 taste，不猜性别、不主动亲密、不每轮追问、不长篇建议、不搜索商品。保存陪伴截图、连续 3–5 轮截图和推荐触发前截图。

- [ ] **Step 4: 验收 Commerce 与 Product Card。**

发送：`那你帮我看看有什么合适的`。确认只有在 policy + semantic search 都允许时才出现商品；每张卡满足 URL/title、非文章页、无 ¥0、去重、最多 3 张、缺图 fallback 克制。保存商品出现截图；用无可信结果 fixture/搜索失败路径保存空态截图。

- [ ] **Step 5: 切换 Mobile viewport 验收同一套区域。**

使用约 390×844 以及必要的 320px 宽度检查：Header 不挤压、Creator Presence 不横向溢出、用户/小柠消息节奏自然、composer 可用、商品卡不破坏阅读宽度。保存 Mobile 截图。

- [ ] **Step 6: 基于浏览器视觉结果至少做一轮自主 refinement。**

如果页面仍明显像 ChatGPT、微信机器人、客服系统或 AI Assistant，优先调整 typography、留白、内容层级、气泡比例、starter 形式和商品卡密度；不通过增加装饰解决。重新跑 Desktop/Mobile 浏览器验收并更新截图。

- [ ] **Step 7: 写报告并停止。**

报告包含 7 个截图链接、A–F 场景结果、测试结果、原页面问题、实际改动、Desktop/Mobile 表现和仍未解决的问题。完成后停止开发，等待 Review。

---

## Plan Self-Review

- **Spec coverage:** UI identity、presence、stream、reply rhythm、relationship truth、ConversationAnalysis policy、Commerce routing、Product Gate、0 结果、Tavily key、7 类截图和自主 refinement 均有对应任务。
- **Placeholder scan:** 计划没有 `TBD`、`TODO` 或未定义接口；所有函数名、字段名和命令与现有项目/规格一致。
- **Type consistency:** `applyConversationPolicy` 在 Task 1 定义并在 Task 3 使用；`cleanShoppingResults` 在 Task 2 定义并由 `searchProducts`/`ProductCard` 消费；API 始终保留 `reply/products/analysis`。
- **Scope check:** 没有引入新的基础设施或后续阶段能力；截图与报告仅服务于本轮 UI 验收。
