# Conversation Management Delivery Report

## 1. 修改文件

- `server/src/fileStore.js`：JSON FileStore，启动加载、保存、列表、删除。
- `server/src/session.js`：为会话增加 `visitorId`、`conversationId`、`createdAt`、`updatedAt`。
- `server/src/app.js`：新增会话管理 API，并在聊天后持久化。
- `client/src/api.js`：访客/会话 ID 存储及会话管理请求。
- `client/src/App.jsx`：会话列表、新建、切换、删除、刷新恢复 history。
- `client/src/index.css`：会话列表的轻量样式。
- `server/test/conversationManagement.test.js`：最小管理与重启 Smoke Test。

## 2. Conversation 数据结构

```js
{
  visitorId: 'persistent visitor id',
  conversationId: 'unique conversation id',
  createdAt: 'ISO timestamp',
  updatedAt: 'ISO timestamp',
  history: [{ role: 'user' | 'assistant', content: '...' }],
  userPreferences: {},
  userFacts: [],
  recentTopics: [],
  currentTopic: null,
  pendingProduct: null,
  conversationFlow: 'CONTINUE',
  topicTurnCount: 0
}
```

长期 Memory 现在在 FileStore 的 `memories[visitorId]` 中独立保存；Conversation 的 `history`、当前话题和 pendingProduct 仍独立保存。每轮仅由现有 relevance gating 召回相关事实。前端提供“小柠记住的”入口，可删除单条或清空全部。

## 3. FileStore 结构

默认文件为 `server/data/conversations.json`，该目录已加入 `.gitignore`。文件内容是 conversation record 数组：

```json
[
  {
    "conversationId": "...",
    "visitorId": "...",
    "createdAt": "...",
    "updatedAt": "...",
    "session": { "history": [], "userFacts": [], "userPreferences": {} }
  }
]
```

服务启动时一次性加载到内存 Map；每次新建、聊天、删除后写回文件。因此不需要数据库，进程重启后仍能恢复已保存会话。

## 4. visitorId / conversationId 生命周期

- `visitorId`：浏览器首次访问生成，存入 `localStorage`；新建对话和所有请求复用，不随新对话改变。
- `conversationId`：每个对话独立生成；当前 ID 存入 `localStorage`，刷新后通过 `/api/session` 恢复。
- 新对话：POST `/api/conversations`，生成全新的 conversationId，并清空当前前端消息视图。
- 切换：前端请求目标 conversationId 的 session，加载该会话 history。
- 删除：DELETE `/api/conversations/:conversationId`，服务端校验 visitorId 后删除 FileStore record。

兼容旧客户端的 `sessionId` 字段仍可作为 conversationId 使用。

## 5. Smoke Test 结果

| 场景 | 结果 | 验证 |
| --- | --- | --- |
| A. Conversation A 发消息后刷新恢复 | PASS | `/api/session` 返回 A 的 history |
| B. Conversation B 与 A 隔离 | PASS | B 初始为空，且访客列表只看自己的对话 |
| C. 切回 A | PASS | A history 原样恢复 |
| D. 删除 B | PASS | B 从列表消失，A 不受影响 |
| E. Server restart | PASS | 新建 app/重新加载同一 FileStore 后 A 仍存在 |
| F. 新对话 visitorId 不变 | PASS | visitorId 相同，conversationId 不同 |

自动化定向测试：`server/test/conversationManagement.test.js` 2/2 PASS。

## 6. 当前已知问题

- FileStore 是 JSON 文件存储，没有多进程锁；当前适合单实例运行，不适合多实例并发部署。
- Session history 仍受现有最大长度限制；长期 Memory 仍属于服务端内存/文件中的 session 数据。
- Memory 管理目前是轻量 Drawer，不包含编辑、分类管理或复杂检索。
- 本轮按要求未运行完整 Golden QA、Visual QA 或长时间真实 LLM 测试。
