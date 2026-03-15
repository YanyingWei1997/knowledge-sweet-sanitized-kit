# OpenClaw 飞书多机器人配置指南

> 通俗易懂版 - 把读者当小白

---

## 目录

1. [先理解概念](#1-先理解概念)
2. [配置文件在哪里](#2-配置文件在哪里)
3. [配置项详解](#3-配置项详解)
4. [完整流程示例](#4-完整流程示例)
5. [常见修改场景](#5-常见修改场景)

---

## 1. 先理解概念

### 1.1 你想要什么？

你想在飞书群里创建多个机器人，每个机器人有不同的"大脑"（模型），一起帮你完成任务。

```
飞书群聊
├── 机器人 A（指挥）→ 思考任务、分配工作
└── 机器人 B（推理）→ 执行具体推理任务
```

### 1.2 实现这个需求需要三步

| 步骤 | 做什么 | 类比 |
|------|--------|------|
| **第一步** | 去飞书开放平台创建机器人 | 办理身份证 |
| **第二步** | 在 OpenClaw 配置里填入机器人信息 | 登记身份证信息 |
| **第三步** | 把机器人绑定到不同的 Agent | 分配工作岗位 |

---

## 2. 配置文件在哪里

**文件路径：**

```
~/.openclaw/openclaw.json
```

**怎么找到它：**

1. 打开 Finder（访达）
2. 按 `Cmd + Shift + G`
3. 输入 `~/.openclaw/`
4. 找到 `openclaw.json` 文件

**怎么修改它：**

- 用 VS Code 或任何文本编辑器打开
- 修改后保存即可
- 重启 OpenClaw 服务使配置生效

---

## 3. 配置项详解

### 3.1 整体结构概览

```json
{
  "models": { ... },      // 第1节：有哪些模型可用
  "agents": { ... },     // 第2节：有哪些 Agent（工人）
  "channels": { ... },   // 第3节：飞书账号信息
  "bindings": { ... },   // 第4节：谁对应谁
  "agentToAgent": { ... } // 第5节：Agent 之间怎么沟通
}
```

---

### 3.2 models - 有哪些模型可用

**位置：** 第 24-130 行

**什么意思：**

这里定义了你有哪些"大脑"可以用。就像手机里安装了多个 AI App。

**示例配置：**

| 模型名称 | 提供商 | 特点 |
|---------|--------|------|
| MiniMax-M2.5 | MiniMax | 主力模型，适合对话 |
| MiniMax-M2.1 | MiniMax | 轻量模型 |
| DeepSeek-R1 | DeepSeek | 推理模型，适合复杂逻辑 |

**对应关系：**

```
模型 ID（全称）                    简短写法
─────────────────────────────────────────────
minimax-cn/MiniMax-M2.5        →  Minimax
deepseek/deepseek-ai/DeepSeek-R1 →  DeepSeek-R1
```

---

### 3.3 agents - 有哪些 Agent

**位置：** 第 131-186 行

**什么意思：**

这里定义了你的"工人"。每个 Agent 有：
- `id`：工人工号（内部用）
- `name`：名字（显示用）
- `model`：用什么大脑
- `identity`：机器人的身份标识

**示例配置：**

```json
"list": [
  {
    "id": "main",           // 工号：main
    // 没写 model，用默认的
  },
  {
    "id": "recruiter",       // 工号：recruiter
    "name": "recruiter",
    "model": "minimax-cn/MiniMax-M2.5",  // 用 MiniMax 大脑
    "identity": {
      "name": "招聘专员（飒姐）",  // 名字
      "emoji": "💼"               // 图标
    }
  },
  {
    "id": "deepseek",        // 工号：deepseek
    "name": "deepseek",
    "model": "deepseek/deepseek-ai/DeepSeek-R1",  // 用 DeepSeek 大脑
    "identity": {
      "name": "DeepSeek",
      "emoji": "🧠"
    }
  }
]
```

**大白话：**

```
Agent 列表：
├── main     （默认 Agent，没设身份）
├── recruiter（招聘专员，用 MiniMax）
└── deepseek （推理助手，用 DeepSeek）
```

---

### 3.4 channels - 飞书账号信息

**位置：** 第 237-258 行

**什么意思：**

这里登记你在飞书创建的机器人"身份证"信息。

```json
"channels": {
  "feishu": {                    // 飞书平台
    "accounts": {                // 账号列表
      "claw1": {                 // 账号名（你起的）
        "appId": "cli_a93b...",  // 飞书给的 ID
        "appSecret": "H7CF..."   // 飞书的密码
      },
      "claw2": {
        "appId": "cli_a938...",
        "appSecret": "NV7M..."
      }
    }
  }
}
```

**大白话：**

```
飞书账号登记：
├── claw1 → appId: cli_a93b... （第1个机器人）
└── claw2 → appId: cli_a938... （第2个机器人）
```

---

### 3.5 bindings - 绑定关系（最重要！）

**位置：** 第 191-206 行

**什么意思：**

这里是**把飞书账号和 Agent 配对**的核心配置！

```
bindings 的逻辑：
飞书账号 claw1 收到的消息 → 交给 Agent main 处理
飞书账号 claw2 收到的消息 → 交给 Agent deepseek 处理
```

**示例配置：**

```json
"bindings": [
  {
    "agentId": "main",           // ← Agent 的工号
    "match": {
      "channel": "feishu",       // ← 平台类型（固定写 feishu）
      "accountId": "claw1"       // ← 飞书账号名
    }
  },
  {
    "agentId": "deepseek",
    "match": {
      "channel": "feishu",
      "accountId": "claw2"
    }
  }
]
```

**完整流程图：**

```
用户 在飞书群里 发消息
    │
    ▼
    claw1（第1个机器人）收到消息
    │
    ▼
    OpenClaw 查找 bindings：accountId = "claw1" 对应 agentId = "main"
    │
    ▼
    main Agent（MiniMax）处理消息，返回回复
    │
    ▼
    claw1 把回复发到群里
```

---

### 3.6 agentToAgent - Agent 之间的沟通

**位置：** 第 296-325 行

**什么意思：**

当 main Agent 收到一个复杂任务时，它可以"叫"deepseek 来帮忙。

**示例配置：**

```json
"agentToAgent": {
  "global": {
    "timeout": 60000,     // 等待回复最多 60 秒
    "logLevel": "info",
    "retryAttempts": 2    // 失败重试 2 次
  },
  "agents": {
    "main": {
      "enabled": true,                // 开启通信
      "allowedAgents": ["recruiter", "deepseek"],  // 可以叫谁
      "triggerKeywords": [],          // 什么词触发（空=都触发）
      "forwardMessages": true,         // 把群消息转发给其他 Agent
      "receiveReplies": true           // 接收其他 Agent 的回复
    },
    "deepseek": {
      "enabled": true,
      "allowedAgents": ["main", "recruiter"],
      "triggerKeywords": [],
      "forwardMessages": true,
      "receiveReplies": true
    }
  }
}
```

---

## 4. 完整流程示例

### 场景：群里有两个机器人协同工作

**群成员：**
- 你
- claw1（指挥机器人）
- claw2（推理机器人）

**你说：** "帮我算一下 123 * 456 的结果"

**处理流程：**

```
1. 消息发送到群里
   │
   ▼
2. claw1（账号）收到消息
   │
   ▼
3. OpenClaw 查找 bindings：
   accountId="claw1" → agentId="main"
   │
   ▼
4. main Agent（MiniMax）处理：
   "这是一个乘法题，比较简单，
    但为了演示，我让 deepseek 算一下"
   │
   ▼
5. main 通过 agentToAgent 调用 deepseek：
   "请计算 123 * 456"
   │
   ▼
6. deepseek Agent（DeepSeek-R1）计算：
   "56088"
   │
   ▼
7. deepseek 返回结果给 main
   │
   ▼
8. main 把结果发给你：
   "123 × 456 = 56088"
   │
   ▼
9. claw1 把回复发到群里
```

---

## 5. 常见修改场景

### 场景 1：增加第 3 个飞书机器人

**需求：** 再添加一个 Claude 模型的机器人

**步骤：**

**第 1 步：去飞书开放平台**
- 创建一个新应用
- 启用机器人功能
- 获取 `appId` 和 `appSecret`

**第 2 步：配置 openclaw.json**

① 在 `channels.feishu.accounts` 添加新账号：
```json
"claw3": {
  "appId": "cli_新申请的ID",
  "appSecret": "新申请的密码"
}
```

② 在 `agents.list` 添加新 Agent：
```json
{
  "id": "claude",
  "model": "claude/claude-3-opus",  // 用的模型
  "identity": {
    "name": "Claude",
    "emoji": "🤖"
  }
}
```

③ 在 `bindings` 绑定账号：
```json
{
  "agentId": "claude",
  "match": {
    "channel": "feishu",
    "accountId": "claw3"
  }
}
```

④ 在 `agentToAgent.agents` 添加配置：
```json
"claude": {
  "enabled": true,
  "allowedAgents": ["main", "deepseek"],
  "triggerKeywords": [],
  "forwardMessages": true,
  "receiveReplies": true
}
```

---

### 场景 2：改变 Agent 用的模型

**需求：** 让 main Agent 改用 DeepSeek

**步骤：**

修改 `agents.list` 中 main 的 model：
```json
{
  "id": "main",
  "model": "deepseek/deepseek-ai/DeepSeek-R1"  // 改成这个
}
```

---

### 场景 3：改变飞书账号绑定

**需求：** 让 claw2 绑定到 main，而不是 deepseek

**步骤：**

修改 `bindings`：
```json
{
  "agentId": "main",         // 改成 main
  "match": {
    "channel": "feishu",
    "accountId": "claw2"    // 用 claw2
  }
}
```

---

### 场景 4：修改 Agent 名字

**需求：** 把 deepseek 改成"推理大师"

**步骤：**

修改 `agents.list`：
```json
{
  "id": "deepseek",
  "identity": {
    "name": "推理大师",      // 改成这个
    "emoji": "🧠"
  }
}
```

---

## 快速参考表

| 你想做什么 | 去哪里改 | 改什么字段 |
|-----------|---------|-----------|
| 添加新飞书机器人 | `channels` | 加 `accountId` |
| 绑定账号到 Agent | `bindings` | 改 `agentId` 或 `accountId` |
| 改变 Agent 用的模型 | `agents.list` | 改 `model` |
| 改 Agent 显示名字 | `agents.list` | 改 `identity.name` |
| 开启 Agent 互相聊天 | `agentToAgent` | 改 `enabled` 为 `true` |

---

## 注意事项

1. **JSON 格式要正确**：修改后确保语法正确（引号、逗号）
2. **重启生效**：修改配置后需要重启 OpenClaw
3. **模型要已在 models 中定义**：使用的模型必须在 `models.providers` 中配置
4. **accountId 要匹配**：`bindings` 中的 `accountId` 必须在 `channels.accounts` 中存在

---

## 示例配置总结

```
飞书账号           →      Agent         →      模型
────────────────────────────────────────────────────
claw1 (第1个机器人) → main (指挥)     → MiniMax M2.5
claw2 (第2个机器人) → deepseek (推理) → DeepSeek-R1
```

以上为通用示例，可按自身环境替换。
