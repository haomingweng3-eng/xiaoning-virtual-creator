# 小柠 Creator Experience Redesign 设计规格

## 目标与边界

把现有“聊天 + 商品搜索”页面调整为 Lifestyle Virtual Creator：用户先认识小柠、和她聊天、感受到她的审美和观点，只有明确提出购买需求时才自然进入商品推荐。

本轮只处理核心体验，不新增 MCP、数据库、登录、Vector DB、LangGraph、LangChain、Redis、语音、3D Avatar 或复杂动画。继续沿用现有 React + Vite、Express、内存会话和 Tavily 搜索链路；不删除现有聊天和商品搜索能力。

## 设计方向

采用在现有架构上小范围重构的方案：

- 页面改为 editorial creator profile + conversation stream，而不是传统聊天 Header。
- 继续保留 `ConversationAnalysis` 的 emotion、emotion_intensity、user_need、shopping_intent、occasion、recommendation_readiness、response_mode 等字段，但增加确定性路由约束，让它们真正影响行为。
- 商品搜索增加独立的 Product Rendering Gate；不可信结果宁可不展示。
- Tavily 仍是实时搜索源；移除硬编码 key，所有商品字段只来自搜索响应或安全 fallback 文案。

## 前端结构

### Creator Profile Header

顶部展示克制的头像图形、`小柠`、`Lifestyle / Daily Finds`、一句短签名和轻量关系信息（例如“刚认识”“聊过 7 次”）。没有可靠 `createdAt` 时不显示“认识第 N 天”。去掉在线绿点、AI、助手和状态型客服文案。头像使用非 Emoji 的抽象柠檬色几何/插画风占位，避免 Demo 感。

Desktop 使用宽松的双层布局：Creator identity 区域与 conversation column 有清晰层级；Mobile 折叠成紧凑但仍有签名的 profile band。页面底色使用温暖的中性浅色，强调 typography、留白和内容节奏，不使用大面积渐变、玻璃拟态、霓虹、夸张动画或大量阴影。

### Creator Conversation Stream

小柠消息使用头像 + 名字/轻标签 + 自然文本块；短消息不强制套完整白色气泡，段落之间保留呼吸感。用户消息使用轻量深色 pill/card，宽度和视觉重量低于传统客服气泡。开场消息属于 Creator Presence，不作为普通聊天记录重复显示。

回复中的空行在前端被视为 message segments，让模型的一次短回复可以呈现为 1–3 条有停顿的消息；不引入新的消息服务或持久化结构。

### Conversation Starters

首页在 Creator Presence 下展示 3–4 个 conversation starters，文案使用“最近有点累”“帮我看看明天怎么穿”“随便聊聊”“最近你喜欢什么？”等自然入口。它们视觉上是 editorial prompt/story entry，不是按钮式功能菜单；点击后仍调用原有 `/api/chat`。

### Product Card

商品卡使用克制的 editorial tile：图片区域保留真实图片；无可靠图片时显示低对比的“图片暂缺 / 实时信息” fallback，不使用购物袋 Emoji。有效价格用人民币展示；缺失或非正价格展示“查看实时价格”，绝不出现 `¥0`。最多展示 2–3 个不重复候选，并在卡片下方展示来自当前对话的简短推荐理由；没有可信商品时只展示自然拒绝乱推的文字。

## 对话行为

### Persona 与关系边界

小柠是有审美判断的 Virtual Creator，不冒充真实用户或虚构可验证的一手体验。允许“按我的审美我会选这个”“这个我其实不太建议”，禁止“我穿过”“我买过”“我亲测”“我用了三个月”等无来源第一人称经历。

刚认识时禁止主动使用“宝宝、宝贝、亲爱的”等称呼，也不猜测用户性别、年龄、职业、收入或恋爱状态。用户多次主动使用亲昵称呼且关系明显提升后，才允许有限度跟随语气。关系状态继续用现有轻量 interactionCount/intimacy，但不渲染 RPG 数值条。

### Reply rhythm

默认回复为 1–3 个自然段，通常约 15–100 个中文字符；不使用字符串截断制造短回复。除非用户明确要求详细解释，不输出长篇建议。四种模式的约束为：

- `ACCOMPANY`：先接住情绪，可只回应，不带商品。
- `EXPLORE`：了解必要上下文，可只分享观点，不默认搜索。
- `SHARE`：突出小柠自己的 taste/opinion，不为成交服务。
- `RECOMMEND`：仅在明确商品请求/确认后搜索，搜索后用当前对话上下文解释为什么适合；不复述商品详情、价格或链接到 `reply`。

允许回应-only、观点-only、回应 + 一个问题、两条短消息感四种节奏；不强制每轮追问。

### 确定性路由

保留 LLM ConversationAnalysis，但在编排层增加代码约束：

- 命中负面情绪时强制 `ACCOMPANY`，清除 shopping intent，永不搜索。
- 只有强购物动作 + 品类，或对上一轮潜在需求的明确确认，才允许 `RECOMMEND`。
- “最近想买个鼠标”等潜在需求记录 `pendingProduct`，不搜索；下一轮明确同意才可搜索。
- `ACCOMPANY`、`EXPLORE`、`SHARE` 默认只开放陪伴生成；只有 `RECOMMEND` 才开放商品搜索。

## Product Rendering Gate

新增纯函数清洗层（可由测试直接调用），至少执行：

1. 标题非空、URL 为合法 HTTP(S) URL。
2. 只接受明确的电商商品详情页，过滤文章、攻略、榜单、资讯、搜索/列表页。
3. 用 canonical URL（去 hash 和追踪参数）与 normalized title 去重。
4. 价格解析为正数时执行 min/max 过滤；缺失或非正价格转为 `null`，不能转为 0。
5. 可靠图片不存在时保留商品但标记 image fallback；不伪造图片 URL。
6. 最终最多输出 3 个候选；若清洗后为空，返回空数组并让编排层使用“没有找到足够靠谱具体款”的自然文案。

搜索源继续使用当前 Tavily；API key 仅从 `options.apiKey` 或 `process.env.TAVILY_API_KEY` 读取，不保留代码内默认密钥。

## 错误处理与兼容性

- `/api/chat` 响应继续保持 `{ reply, products }`，允许附带已有 analysis 字段。
- 搜索不可用、无可信结果和价格/图片缺失均不由模型补造商品。
- 商品推荐话术不使用客服模板，不包含未经搜索支持的商品详情。
- 现有聊天接口、会话记忆和新窗口商品链接保持可用。

## 测试与视觉验收

后端补充/更新测试覆盖：短回复约束提示、关系边界、负面情绪不搜索、潜在需求不搜索、明确确认才搜索、商品详情页过滤、价格为 null、无图 fallback、URL/title 去重和最多 3 个结果。

前端测试覆盖：Creator Header、Presence、Starters、用户/小柠消息节奏、商品 fallback、价格 fallback、去重结果和商品链接行为。

实现后必须启动真实开发页面，使用浏览器逐段检查 Creator Header、Conversation Stream、User Message、Creator Message、Conversation Starters、Product Card，并分别以 Desktop 和 Mobile viewport 验收。最终报告记录原页面的机器人感来源、各区域改动、两个 viewport 的实际表现和仍未解决的问题。

## 文件范围

- `client/src/App.jsx`
- `client/src/index.css`
- `client/src/App.test.jsx`
- `server/src/prompts.js`
- `server/src/intent.js`
- `server/src/conversationAnalysis.js`
- `server/src/orchestrator.js`
- `server/src/productSearch.js`
- `server/src/validators.js`
- `server/src/session.js`（仅在需要暴露轻量关系信息时）
- `server/test/*.test.js` 中与本轮行为直接相关的测试
- `README.md` 与最终 `Creator Experience Redesign Report`
