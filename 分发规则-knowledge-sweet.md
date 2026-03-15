# knowledge-sweet 分发规则

这份文档只讲一件事：  
`knowledge-sweet` 里的任务是怎么从“写入队列”变成“被分发执行”的。

## 一、分发链路的最小理解

分发链路可以理解成 4 步：

1. 有人或某个 agent 生成任务
2. 任务被写入 `DISPATCH_QUEUE.jsonl`
3. `dispatch-daemon.mjs` 读取队列
4. 合法任务被投递，并在共享层留下痕迹

也就是说：

- `enqueue-dispatch.mjs` 负责“写任务”
- `dispatch-daemon.mjs` 负责“读任务并投递”

## 二、最关键的文件

### 1. `DISPATCH_QUEUE.jsonl`

作用：

- 存待处理任务

规则：

- 一行一个 JSON
- 不能写 Markdown 代码块
- 不能在 JSON 后面追加解释文字

### 2. `DISPATCH_STATE.json`

作用：

- 记录哪些任务处理过
- 避免重复分发

### 3. `HANDOFF_LOG.md`

作用：

- 记录谁把什么任务交给了谁

### 4. `DISPATCHER_CONFIG.json`

作用：

- 指定默认群
- 指定默认来源 agent
- 指定轮询间隔

## 三、推荐的最小任务结构

最小可用任务至少应包含：

```json
{
  "id": "dispatch-001",
  "createdAt": "2026-03-15T10:00:00+08:00",
  "sourceAgentId": "main",
  "title": "知识库归档任务",
  "tasks": [
    {
      "agentId": "main",
      "brief": "整理这段内容并写入正确目录"
    }
  ]
}
```

其中最关键的是：

- `id`
- `createdAt`
- `sourceAgentId`
- `title`
- `tasks`

而 `tasks` 里至少要有：

- `agentId`
- `brief`

## 四、什么情况下会分发

一条任务会被分发，通常要满足：

1. JSON 结构合法
2. 不是重复任务
3. 不是草稿状态
4. 有可识别的 `agentId`
5. 目标群可确定

如果 `groupId` 没写，dispatcher 会回退到：

- `DISPATCHER_CONFIG.json.defaultGroupId`

## 五、什么情况下不会分发

下面这些情况应视为“不应自动投递”：

1. `approved: false`
2. `status: "draft"`
3. `status: "waiting-approval"`
4. 缺少核心字段
5. 目标 agent 不存在

## 六、为什么要有“写队列”和“读队列”两层

因为这两层解决的是不同问题。

### 写队列层

关注的是：

- 任务被标准化
- 任务能留痕
- 任务可以排队

### 读队列层

关注的是：

- 后台守护运行
- 自动轮询
- 防止重复投递
- 记录状态

如果把这两层混在一起，后面排错会很困难。

## 七、分发与共享记忆的关系

`knowledge-sweet` 的分发规则，不是让每个 agent 直接互读私有记忆。  
而是要求它们把协作痕迹写到共享层。

最小共享层建议包括：

- `TEAM_CONTEXT.md`
- `ACTIVE_CONTEXT.json`
- `HANDOFF_LOG.md`
- `DECISIONS.md`

也就是说：

1. 分发负责把任务送出去
2. 共享层负责让后续处理者接得上

## 八、最小运行规则

最小规则版可直接按下面执行：

1. 只允许结构化任务入队
2. 只允许合法 JSONL
3. 只允许存在的 `agentId`
4. 默认回退到 `defaultGroupId`
5. 分发后必须留 `HANDOFF_LOG.md`
6. 不允许直接把别的 agent 的私有记忆当共享上下文

## 九、常见错误

### 1. 把自然语言直接写进 `DISPATCH_QUEUE.jsonl`

错误原因：

- dispatcher 读的是 JSONL，不是聊天记录

### 2. 只建了队列文件，但 dispatcher 没启动

错误现象：

- 队列里有任务
- 但没有任何实际分发

### 3. `groupId` 用了旧群

错误现象：

- 任务会跑到错误的群，或者根本不投递

### 4. 误以为“配置好了”就等于“服务在跑”

正确理解是：

- 文件存在不代表进程存在
- `dispatch-daemon.mjs` 真跑起来才算生效

## 十、复现时应强调的约束

如使用 AI 代做，建议加入以下约束：

1. 不要把自然语言直接写进 `DISPATCH_QUEUE.jsonl`
2. 要先生成 `DISPATCHER_CONFIG.json`
3. 要验证 dispatcher 进程是否真的启动
4. 要验证 `HANDOFF_LOG.md` 或 `DISPATCH_STATE.json` 是否变化

这样既能把文件摆上去，也能理解这套分发为什么能跑。
