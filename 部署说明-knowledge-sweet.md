# knowledge-sweet 部署说明

这份文档解释的是：  
为什么 `knowledge-sweet` 要这样部署，以及最小可用的部署结构是什么。

## 一、最小目标

`knowledge-sweet` 的最小目标不是“多机器人群聊协作”，而是：

1. 飞书群消息能进入 `main`
2. `main` 能处理知识库类任务
3. `dispatcher` 能在需要时读取队列并做后台分发
4. 工作区内容能按约定落到 `knowledge-sweet/`
5. 如有需要，再同步到 Obsidian

## 二、最小部署结构

最小部署至少包含这几层：

### 1. OpenClaw 配置层

负责：

- 注册 `main`
- 绑定飞书账号
- 指定目标群

对应模板：

- `configs/openclaw.knowledge-sweet.template.json`

### 2. knowledge-sweet 工作区层

负责：

- 存放知识库
- 存放 dispatcher 脚本
- 存放共享上下文和运行态文件

关键位置：

```text
<YOUR_OPENCLAW_HOME>/workspace/knowledge-sweet/
```

### 3. dispatcher 层

负责：

- 轮询 `DISPATCH_QUEUE.jsonl`
- 把合法任务投递到对应 agent
- 记录分发状态
- 写入 `HANDOFF_LOG.md`

关键文件：

- `dispatch-daemon.mjs`
- `enqueue-dispatch.mjs`
- `DISPATCHER_CONFIG.json`

### 4. 可选同步层

负责：

- 把 `knowledge-sweet/知识库/` 同步到 Obsidian

关键文件：

- `sync-to-obsidian.sh`
- `ai.openclaw.knowledge-sweet-obsidian-sync.plist`

## 三、推荐部署顺序

建议严格按这个顺序做：

1. 先建 `knowledge-sweet` 工作区
2. 再放脚本和配置模板
3. 再并入 `openclaw.json`
4. 再启动 dispatcher
5. 最后才做 Obsidian 同步

原因很简单：

- 如果先做同步，但工作区和群接入没通，意义不大
- 如果先改群配置，但 dispatcher 没落地，后台链路是不完整的

## 四、群接入的最小原则

如果只复现 `knowledge-sweet`，推荐用最小接入方式：

1. 只绑定一个主账号
2. 只让 `main` 监听目标群
3. `groups.<YOUR_GROUP_ID>.requireMention` 先设为 `false`

这样做的好处是：

- 先把“能接入、能处理、能落库”跑通
- 避免一开始就上复杂的多机器人群路由

## 五、为什么还要保留 dispatcher

即使 `knowledge-sweet` 主要用于知识库工作，也仍然建议把 dispatcher 一起放进去。

原因：

1. 复现包要完整
2. 后续别人如果扩展成群协作，就不需要再重配一遍
3. dispatcher 本身也是这套工作区的一部分能力

但要注意：

- `knowledge-sweet` 的最小部署，不要求你一开始就高频使用 dispatcher
- 先把它部署好、能启动即可

## 六、共享记忆怎么理解

这里的“共享记忆”不是指每个 agent 的私有记忆互相直接读取。  
推荐理解为“共享文件层”。

最典型的共享文件是：

- `TEAM_CONTEXT.md`
- `HANDOFF_LOG.md`
- `ACTIVE_CONTEXT.json`
- `DECISIONS.md`

原则是：

1. 公共状态写共享层
2. 私有记忆留在各自 agent 的 private memory
3. 不要互相直接读写别的 agent 私有 `MEMORY.md`

## 七、部署时最容易配错的地方

### 1. `openclaw.json` 里群 ID 和 dispatcher 配置里的群 ID 不一致

现象：

- 群能收到消息
- 但 dispatcher 路由不对

### 2. 只复制了脚本，没有生成真实配置文件

现象：

- 有 `DISPATCHER_CONFIG.template.json`
- 但没有 `DISPATCHER_CONFIG.json`

### 3. 启动了 gateway，没启动 dispatcher

现象：

- `main` 能在群里说话
- 但队列和后台分发完全不动

### 4. 把运行态文件也一并分享

现象：

- 容易误以为这些日志和状态也要保留

正确做法是：

- 只分享模板、脚本、说明
- 不分享运行中的 `pid`、`queue`、`state`、`log`
