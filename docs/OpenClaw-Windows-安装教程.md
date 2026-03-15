# OpenClaw Windows 安装教程（国内网络优化版）

本教程介绍如何在 Windows 上安装 OpenClaw 并连接飞书机器人，包含国内网络访问优化方案。

---

## 前置要求

- Windows 10/11 (建议使用 WSL2 以获得最佳体验)
- Node.js 22.x 或更高版本
- 飞书企业账号（用于创建应用）

> ⚠️ **重要提示**：OpenClaw 官方推荐使用 WSL2 运行，因为某些功能在原生 Windows 上可能受限。

---

## 方法一：使用 WSL2（推荐）

### 1. 启用 WSL2

以管理员身份打开 PowerShell，执行：

```powershell
wsl --install
```

重启电脑后，WSL2 会自动安装 Ubuntu。

### 2. 安装 Node.js

在 WSL2 终端中：

```bash
# 安装 nvm（Node 版本管理器）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 重启终端后安装 Node.js 22
nvm install 22
nvm use 22

# 验证安装
node --version
```

### 3. 安装 OpenClaw

```bash
# 方法 A：使用 npm（推荐国内用户）
npm install -g openclaw@latest --registry=https://registry.npmmirror.com

# 或使用 pnpm
pnpm add -g openclaw@latest --registry=https://registry.npmmirror.com
```

### 4. 开始配置

```bash
# 启动引导向导（推荐）
openclaw onboard

# 或手动添加飞书频道
openclaw channels add
```

---

## 方法二：原生 Windows（PowerShell）

> ⚠️ 注意：部分功能可能受限，建议优先使用 WSL2。

### 1. 安装 Node.js

下载并安装 [Node.js 22.x LTS](https://nodejs.org/)（建议使用 nvm-windows 管理版本）。

```powershell
# 安装 nvm-windows
winget install CoreyButler.NVMforWindows

# 安装 Node.js 22
nvm install 22
nvm use 22
```

### 2. 配置国内 npm 镜像

```powershell
# 设置 npm 镜像
npm config set registry https://registry.npmmirror.com

# 验证
npm config get registry
```

### 3. 安装 OpenClaw

```powershell
npm install -g openclaw@latest
```

### 4. 启动服务

```powershell
# 启动 Gateway
openclaw gateway

# 或使用 PowerShell 保持后台运行
Start-Process -FilePath "openclaw" -ArgumentList "gateway" -WindowStyle Hidden
```

---

## 飞书机器人配置教程

### 第一步：创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/app)
2. 点击「创建企业应用」
3. 填写应用名称和描述，上传图标
4. 点击「创建」

> Public repository note: screenshots from the original local guide are omitted in this sanitized edition.


### 第二步：获取凭证

1. 进入应用后，点击「凭证与基础信息」
2. 复制 **App ID**（格式：`cli_xxx`）
3. 复制 **App Secret**（妥善保管，不要泄露）

> Public repository note: screenshots are omitted in this sanitized edition.


### 第三步：配置权限

1. 进入「权限管理」
2. 点击「批量导入」，粘贴以下权限配置：

```json
{
  "scopes": {
    "tenant": [
      "contact:contact.base:readonly",
      "docx:document:readonly",
      "im:chat:read",
      "im:chat:update",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly",
      "im:message.pins:read",
      "im:message.pins:write_only",
      "im:message.reactions:read",
      "im:message.reactions:write_only",
      "im:message:readonly",
      "im:message:recall",
      "im:message:send_as_bot",
      "im:message:send_multi_users",
      "im:message:send_sys_msg",
      "im:message:update",
      "im:resource",
      "application:application:self_manage",
      "cardkit:card:write",
      "cardkit:card:read"
    ],
    "user": [
      "contact:user.employee_id:readonly",
      "offline_access","base:app:copy",
      "base:field:create",
      "base:field:delete",
      "base:field:read",
      "base:field:update",
      "base:record:create",
      "base:record:delete",
      "base:record:retrieve",
      "base:record:update",
      "base:table:create",
      "base:table:delete",
      "base:table:read",
      "base:table:update",
      "base:view:read",
      "base:view:write_only",
      "base:app:create",
      "base:app:update",
      "base:app:read",
      "sheets:spreadsheet.meta:read",
      "sheets:spreadsheet:read",
      "sheets:spreadsheet:create",
      "sheets:spreadsheet:write_only",
      "docs:document:export",
      "docs:document.media:upload",
      "board:whiteboard:node:create",
      "board:whiteboard:node:read",
      "calendar:calendar:read",
      "calendar:calendar.event:create",
      "calendar:calendar.event:delete",
      "calendar:calendar.event:read",
      "calendar:calendar.event:reply",
      "calendar:calendar.event:update",
      "calendar:calendar.free_busy:read",
      "contact:contact.base:readonly",
      "contact:user.base:readonly",
      "contact:user:search",
      "docs:document.comment:create",
      "docs:document.comment:read",
      "docs:document.comment:update",
      "docs:document.media:download",
      "docs:document:copy",
      "docx:document:create",
      "docx:document:readonly",
      "docx:document:write_only",
      "drive:drive.metadata:readonly",
      "drive:file:download",
      "drive:file:upload",
      "im:chat.members:read",
      "im:chat:read",
      "im:message",
      "im:message.group_msg:get_as_user",
      "im:message.p2p_msg:get_as_user",
      "im:message:readonly",
      "search:docs:read",
      "search:message",
      "space:document:delete",
      "space:document:move",
      "space:document:retrieve",
      "task:comment:read",
      "task:comment:write",
      "task:task:read",
      "task:task:write",
      "task:task:writeonly",
      "task:tasklist:read",
      "task:tasklist:write",
      "wiki:node:copy",
      "wiki:node:create",
      "wiki:node:move",
      "wiki:node:read",
      "wiki:node:retrieve",
      "wiki:space:read",
      "wiki:space:retrieve",
      "wiki:space:write_only"
    ]
  }
}
```

> Public repository note: screenshots are omitted in this sanitized edition.


### 第四步：启用机器人能力

1. 进入「应用能力」>「Bot」
2. 开启「机器人能力」
3. 设置机器人名称

### 第五步：配置事件订阅

1. 进入「事件与回调」
2. 选择「使用长连接接收事件（WebSocket）」
3. 添加事件：`im.message.receive_v1`
4. `im.message`
5. `chat:created`
6. `chat:member.bot_added`
7. 点击「保存」

> ⚠️ **重要**：保存前请确保 Gateway 正在运行！

> Public repository note: screenshots are omitted in this sanitized edition.


> Public repository note: screenshots are omitted in this sanitized edition.


### 第六步：发布应用

1. 进入「版本管理与发布」
2. 创建新版本
3. 提交发布（企业应用通常自动审批）

---

## OpenClaw 飞书配置

### 方法 A：使用向导（推荐）

```bash
openclaw channels add
```

选择「Feishu」，输入 App ID 和 App Secret。

> Public repository note: screenshots are omitted in this sanitized edition.


> Public repository note: screenshots are omitted in this sanitized edition.


> Public repository note: screenshots are omitted in this sanitized edition.


> Public repository note: screenshots are omitted in this sanitized edition.


### 方法 B：手动配置

编辑配置文件 `~/.openclaw/openclaw.json`：

```json
{
  "channels": {
    "feishu": {
      "enabled": true,
      "dmPolicy": "pairing",
      "accounts": {
        "main": {
          "appId": "<APP_ID>",
          "appSecret": "<APP_SECRET>",
          "botName": "我的AI助手"
        }
      }
    }
  }
}
```

### 方法 C：环境变量

```bash
export FEISHU_APP_ID="<APP_ID>"
export FEISHU_APP_SECRET="<APP_SECRET>"
```

---







## 启动与测试

### 1. 启动 Gateway

```bash
# 前台运行
openclaw gateway

# 或后台运行
openclaw gateway &
```

### 2. 查看状态

```bash
openclaw gateway status
```

确认输出包含 `RPC probe: ok` 和 `Listening: 127.0.0.1:18789`

> Public repository note: screenshots are omitted in this sanitized edition.


### 3. 重启 Gateway 使配置生效

```bash
openclaw gateway restart
```

> Public repository note: screenshots are omitted in this sanitized edition.


### 4. 测试飞书连接

1. 打开飞书
2. 搜索你的机器人
3. 发送一条消息

> Public repository note: screenshots are omitted in this sanitized edition.


### 5. 批准配对

机器人会回复配对码，执行：

```bash
openclaw pairing approve feishu <配对码>
```

> Public repository note: screenshots are omitted in this sanitized edition.


配对成功后，即可正常对话！

> Public repository note: screenshots are omitted in this sanitized edition.


---



## 飞书多机器人绑定不同Agent | OpenClaw 教程

```

	
1️⃣ 创建两个Agent
	
openclaw agents add claw1
openclaw agents add claw2
	
2️⃣ 飞书上创建两个机器人
	
生成两套 App ID 和 App Secret，配置到 openclaw.json
"channels": {
"feishu": {
"enabled": true,
"accounts" : {
"claw1": {
"appId": "<APP_ID>",
"appSecret": "<APP_SECRET>"
},
"claw2" : {
"appId": "<APP_ID>",
"appSecret": "<APP_SECRET>"
}
},
"domain": "feishu",
"groupPolicy": "open",
"dmPolicy": "open",
"requireMention": false
},
3️⃣ 配置bindings绑定
	
通过 bindings 将 agent 和机器人 account 一一绑定
"bindings": [
{
"agentId": "claw1",
"match": {
"channel": "feishu",
"accountId": "claw1"
}
},
{
"agentId": "claw2",
"match": {
"channel": "feishu",
"accountId": "claw2"
}
}
],

```



## 常见问题

### Q: npm 安装失败怎么办？

A: 使用国内镜像：
```bash
npm install -g openclaw@latest --registry=https://registry.npmmirror.com
```

### Q: 飞书事件订阅保存失败？

A: 确保 Gateway 正在运行后再保存事件订阅配置。

### Q: 机器人不回复消息？

A: 检查以下内容：
- 应用是否已发布
- 事件订阅是否包含 `im.message.receive_v1`
- Gateway 是否正在运行
- 查看日志：`openclaw logs --follow`

### Q: Windows 下如何后台运行？

A: 使用 PowerShell：
```powershell
Start-Process -FilePath "openclaw" -ArgumentList "gateway" -WindowStyle Hidden
```

或使用 NSSM、PM2 等服务管理工具。

### 常见问题补充（来自知乎教程）

> Public repository note: screenshots are omitted in this sanitized edition.


| 问题 | 解决方案 |
|------|----------|
| 添加频道时提示 `spawn EINVAL` | 在 cmd 中运行（非 PowerShell）；或降级 Node.js 到 18.x LTS |
| 机器人回复 `API rate limit reached` | 等待 15-30 分钟自动恢复 |
| 长连接状态显示"未连接" | 检查 Gateway 状态，确认防火墙未阻止端口 |
| Gateway 重启超时，端口被占用 | 先停止服务，再手动终止占用进程 |

---

## 相关命令速查

| 命令 | 说明 |
|------|------|
| `openclaw gateway` | 启动 Gateway |
| `openclaw gateway status` | 查看状态 |
| `openclaw gateway stop` | 停止 |
| `openclaw gateway restart` | 重启 |
| `openclaw logs --follow` | 查看日志 |
| `openclaw pairing list feishu` | 查看配对请求 |
| `openclaw pairing approve feishu <码>` | 批准配对 |

---

## 下一步

- 配置更多功能：https://docs.openclaw.ai
- 安装更多技能：https://clawhub.com
- 加入社区：https://discord.com/invite/clawd
