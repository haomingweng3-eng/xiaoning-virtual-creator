# Context Isolation Fix Report

## 1. 真实根因

这次污染是多个状态边界叠加，不是单一 hardcode：

1. **H：singleton server session 是 P0 根因。** 原 \`server/src/app.js\` 在 \`createApp()\` 中只创建一个 \`const session = createSession()\`，所有请求共用 history、recentTopics、userPreferences、userFacts、pendingProduct。
2. **C + G：Header 取错 recent topic。** \`addRecentTopic()\` 把新话题追加到数组末尾，但前端使用 \`recentTopics[0]\`，因此拿到最早旧话题。server 原来也没有 currentTopic。
3. **F：完整 history 直接进入 Prompt。** \`buildMessages()\` 和 \`buildAnalysisMessages()\` 都把 \`...session.history\` 发给模型，旧跑步对话因此可被错误回忆。
4. **B：creatorContent fallback 放大联想。** 无匹配时默认前三条包含固定“跑步”观点，虽然它是 Creator 内容，不是用户事实，但会污染无关 iPhone prompt。
5. **D：所有 preferences 无条件注入。**
6. **E：iPhone17 未被识别为商品品类，旧 pendingProduct 可能继续存在。**

因此选项结论是：**H 为主根因；C、F、B、D、E 是附加泄漏点；G 是前端放大器；A 不是本次运行时根因。**

## 2. 修复前后 Session

修复前是单个闭包级 session：

\`const session = createSession()\`

修复后是 app 实例内的：

\`Map<sessionId, Session>\`

客户端首次使用 \`crypto.randomUUID()\` 生成 sessionId，通过 \`sessionStorage\` 保持当前 tab；请求携带：

- \`GET /api/session?sessionId=...\`
- \`POST /api/chat { sessionId, message }\`

“新对话”生成新的 sessionId，清空前端 history，并由后端 Map 自动创建干净 session。不增加数据库。

## 3. 干净初始化

新 session 明确初始化：

- history = []
- userPreferences = {}
- userFacts = []
- recentTopics = []
- pendingProduct = null
- currentTopic = null

creatorContent / todayNote 仍属于 Creator 自己的观点库，不作为用户历史或用户事实。

## 4. Memory relevance gating

Prompt 现在分别筛选：

- userFacts：当前消息有词项关联的明确事实。
- userPreferences：当前消息有词项或品类关联的偏好。
- recentTopics：当前消息明确提到的话题。
- history：与当前品类、pendingProduct、当前 topic 片段或 callback 语义相关的完整 user/assistant turn pair。

所以“想看看iPhone17”不会携带跑步 history、跑步 fact、跑步 preference 或跑步 Creator fallback。输入“之前那个跑步耳机呢？”时，相关 history 会重新召回。

## 5. currentTopic 生命周期

- 当前消息明确品类优先：iPhone17 → iPhone 17，手机 → 手机。
- 否则使用本轮 analysis topic。
- analysis topic 为空时才保留上一轮 currentTopic。
- Header 只读取 currentTopic，不再读取 recentTopics[0]。
- 不明确时显示“陪你聊聊”。

## 6. pendingProduct 生命周期

- 只保存明确品类：耳机、手机、iPhone 17。
- 跑步、约会、情绪、工作等普通话题不写入。
- 品类切换时 replace：耳机 → iPhone 17。
- REACT 会清空 pendingProduct。
- 用户事实真实存在，不代表它永远与下一轮商品需求相关。

## 7. 5 个隔离测试结果

\`server/test/contextIsolation.test.js\` 已通过：

1. Session A “最近开始跑步”→“耳机老往下掉”：PASS，A 保留跑步和耳机上下文。
2. 新 Session B 只输入“想看看iPhone17”：PASS，初始状态干净，回复无跑步、耳机、之前、上次、你最近。
3. Session A 继续“那你帮我看看耳机”：PASS，可使用 A 的耳机上下文并调用 Provider。
4. Session A 输入“对了，我想换个手机”：PASS，currentTopic / pendingProduct 替换为手机。
5. Session A 输入“不过跑步的时候我还想听音乐”：PASS，重新允许召回跑步和耳机掉落事实。

## 8. Session B 实际完整回复

真实浏览器输入：

想看看iPhone17

实际回复：

哎，iPhone 17 确实挺让人心动的，尤其如果拍照和续航有升级的话。不过我觉得关键还是先想清楚：你现在这台手机到底哪里让你不满意？

如果只是单纯想换新，其实可以等等看真实用户的反馈，尤其是续航和信号这种日常体验，光看发布会参数是看不出来的。

页面 Header：陪你聊聊 · iPhone 17。

## 9. 浏览器证据

- [Session A 跑步耳机连续对话](</Users/mima0000/Desktop/vibe coding/artifacts/context-isolation/session-a-running-earbuds.png>)
- [Session B iPhone17 隔离截图](</Users/mima0000/Desktop/vibe coding/artifacts/context-isolation/session-b-iphone17-final.png>)

最终真实页面检查：

- forbidden terms：0
- Header 不再显示“跑步耳机掉落问题”
- Product Shelf：隐藏
- 新对话后显示“留一句话，慢慢聊”
- 页面可以正常发送消息

## 10. 修改文件

server：

- \`server/src/app.js\`
- \`server/src/session.js\`
- \`server/src/orchestrator.js\`
- \`server/src/prompts.js\`
- \`server/src/intent.js\`
- \`server/src/creatorContent.js\`

client：

- \`client/src/api.js\`
- \`client/src/App.jsx\`
- \`client/src/index.css\`

tests：

- \`server/test/chat.test.js\`
- \`server/test/orchestrator.test.js\`
- \`server/test/contextIsolation.test.js\`
- \`client/src/App.test.jsx\`

本轮没有继续做 UI 美化、虚拟人动画或商品卖点开发。

## 11. 最终验证

- Server：55 tests passed
- Client：11 tests passed
- Production build：passed
- 真实浏览器 Session A / B：passed
