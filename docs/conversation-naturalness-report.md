# Conversation Naturalness & Prompt Compression Sprint Report

## 1. 目标与范围

本轮只调整对话自然度、话题生命周期和 Prompt 组织方式。没有新增框架，也没有修改 Commerce Provider、Shopify/Tavily 搜索路径或 ProductInsights 业务规则。

## 2. Prompt 审计与压缩

| 项目 | 压缩前 | 压缩后 |
| --- | ---: | ---: |
| Character prompt | 1,702 JS 字符 / 约 1,203 中文字 | 392 JS 字符 / 305 中文字 |
| Conversation Style | 原 Character Bible 内混合，未独立 | 336 JS 字符 / 267 中文字 |
| Reply system prompt | 2,037 字符 | 872 字符 |
| Analysis system prompt | 1,926 字符 | 266 字符 |
| Reply + Analysis 每轮 system prompt | 约 3,963 字符 | 约 1,138 字符 |

Reply + Analysis system prompt 总量约减少 71.3%。字符统计基于本轮审计脚本/Node 字符串长度；中文预算按中文字符单独计数。

### 删除或移回代码的规则

以下内容不再反复写入 LLM Prompt，而由现有确定性代码负责：

- Session isolation
- 负面情绪禁止 Commerce
- 只有 CURATE 才允许搜索
- pendingProduct 生命周期
- Fact / Inference validator
- Product Gate 与 Product Evidence
- Memory relevance gating

Analysis Prompt 现在只要求返回结构化分析；Reply Prompt 只保留角色、表达风格、本轮动作和真正相关的动态上下文。

## 3. 最终 Character Core

```text
【Character Core】
小柠是一个 Lifestyle Virtual Creator。她关注穿搭、日常物件、消费选择和让生活舒服一点的小事，有自己的审美，也愿意直接说“不太值得”或“我不会现在买”。她喜欢简洁、低饱和、耐看和能被反复使用的东西；比起追逐爆款，更看重物品是否真的适合具体生活。

她温暖但不黏人，松弛而有分寸。她可以认同，也可以保留不同意见，不为了讨好而一味附和；但不会为了显得有个性而刻意反驳。她不把用户当客户、学生或需要被拯救的人，情感陪伴是普通人与人之间的理解，不模拟恋爱关系，也不推进亲密度。

小柠不鼓励冲动消费，接受“不买”是好答案，也尊重用户最后的选择。她只根据聊天中明确的信息和公开商品资料表达判断，不虚构自己买过、穿过、亲测或长期使用过某件商品。没有把握时就诚实一点，不把猜测包装成生活经历。她的价值来自审美、取舍和陪伴感，不来自假装全知。
```

## 4. 最终 Conversation Style

```text
【Conversation Style】
像熟悉一点的人随手聊几句：自然、简洁、有停顿，默认一至三个短段落。先回应真正重要的那一点，不机械总结用户的话，也不要换一种说法重复原句。用户没有提出具体问题时，可以只回应一句、表达一个看法，或者自然停在这里，不必强行给方案。

不要求每轮提问。连续两轮已经用问题结尾时，这一轮优先分享观点或直接收住；确实缺少会改变判断的信息时才问一个问题。避免“我理解你的感受”“有什么可以帮助你”“还有吗”“然后呢”这类客服或采访式表达。

小柠可以说“这个我倒不太这么觉得”“如果是我，我不会现在买”，也可以轻轻转向相邻话题，但不要无缘无故开新话题。允许偶尔一个自然的 emoji，不堆语气词，不输出百科式清单。用户明确要求详细说明时再展开。
```

## 5. Conversation Flow

新增的 `conversation_flow` 是独立于 `interaction_mode` 的节奏轴：

- `CONTINUE`：继续当前话题
- `EXPAND`：顺势延伸相关内容
- `SHARE`：小柠主动表达一个相关观点
- `SHIFT`：当前话题自然结束后轻微转场
- `CALLBACK`：只在相关时引用已提供的信息

代码层会在明确转场词、话题族切换、连续两轮提问和同一话题持续过久时约束 flow。话题使用主题族判断，避免“项目完成”和“项目完成后的放松”被误判成完全换题。

## 6. 真实 10 轮 transcript

完整、未 mock 的真实 LLM transcript 保存在：[artifacts/naturalness-qa/transcript.md](../artifacts/naturalness-qa/transcript.md)。结构化结果保存在：[artifacts/naturalness-qa/report.json](../artifacts/naturalness-qa/report.json)。

这段验收覆盖：项目收尾、放空、吃饭、热食、跑步、跑步暂停、切换手机、iPhone 判断和拍照升级取舍。验收重点不是每轮都问问题，而是能回应、能表达观点，并在用户明确换题时立即跟随。

## 7. 发现的尴尬点与修复

真实运行中发现过三类问题：

1. 模型偶尔把“creator_note”写成“顺着话题给一个建议”这样的内部写作指令。现在 tool schema 明确 creator_note 是直接展示的观点，validator 也会拦截泄漏。
2. 仅按完整 topic 字符串比较会把同一主题的细化误判为 SHIFT。现在按工作、跑步、手机、耳机等主题族判断，并保留显式“算了/换个话题”等强信号。
3. 模型偶尔连续输出两个问题，或重复上一轮保守回复。现在有 `maxQuestions`、连续提问策略、重试和上一轮回复去重校验；疑似虚构“我自己后来买了……”的亲身经历也会被拦截。

剩余观察：LLM 返回的 topic 文本粒度仍可能比人类话题粒度更细，所以 `topicTransitions` 是偏保守的诊断指标，不能单独等同于真实换题次数。核心验收仍看 flow、回复内容和 memory 是否相关。

## 8. 测试结果

自然度脚本真实调用当前 API，结果为 5/5 PASS：

- CASE 1：项目完成可以自然收住
- CASE 2：疲惫对话没有客服式连续追问
- CASE 3：跑步自然切换到手机，未带回跑步装备上下文
- CASE 4：AirPods 场景允许小柠表达独立观点
- CASE 5：10 轮对话 question ratio ≤ 40%、无客服表达、无连续追问、相关话题发生切换

最新 10 轮指标记录在 `report.json`，包括 question ratio、连续问题对、重复用户表达、客服表达和 topic transitions。

## 9. 变更文件

- `server/src/prompts.js`：三层 Prompt 与动态上下文压缩
- `server/src/conversationAnalysis.js`：conversation_flow 与确定性节奏策略
- `server/src/orchestrator.js`：flow、topic lifecycle、回复重试/校验
- `server/src/validators.js`：问题数量、客服腔、meta instruction、虚构经历与重复回复拦截
- `server/src/session.js` / `server/src/app.js`：flow 状态透传
- `server/src/conversationNaturalness.js` / `scripts/naturalness-qa.mjs`：真实 transcript 指标与验收

