# knowledge-sweet Sanitized Reproduction Kit

Sanitized templates, scripts, and documentation for reproducing the `knowledge-sweet` OpenClaw workspace, including Feishu/Lark group access, dispatcher setup, and optional Obsidian sync.

## Quick Start

Read in this order:

1. `10分钟复现清单.md`
2. `FEISHU_CONFIG_README.md`
3. `OpenClaw-Windows-安装教程.md`
4. `部署说明-knowledge-sweet.md`
5. `分发规则-knowledge-sweet.md`
6. `详细使用教程.md`
7. `AI提示词-复现knowledge-sweet.md`

## 中文说明

这份包只针对 `knowledge-sweet` 工作区。

目标是复现：

- 知识库分拣规则
- `knowledge-sweet` 的 dispatcher 脚本
- Obsidian 同步脚本
- 最小 `openclaw.json` 配置片段

## 目录

- 根目录教程
  - `FEISHU_CONFIG_README.md`
  - `OpenClaw-Windows-安装教程.md`
  - `10分钟复现清单.md`
  - `部署说明-knowledge-sweet.md`
  - `分发规则-knowledge-sweet.md`
  - `详细使用教程.md`
  - `AI提示词-复现knowledge-sweet.md`
  - `映射表示例模板.md`
- `configs/`
  - `openclaw.knowledge-sweet.template.json`
  - `DISPATCHER_CONFIG.template.json`
- `scripts/`
  - `dispatch-daemon.mjs`
  - `enqueue-dispatch.mjs`
  - `start-dispatcher.sh`
  - `stop-dispatcher.sh`
  - `sync-to-obsidian.sh`
  - `ai.openclaw.knowledge-sweet-obsidian-sync.plist`
- `docs/`
  - `CONFIG.md`
  - `SKILL.md`
  - `TEAM_CONTEXT.md`
  - `README.md`
  - `PROJECT_BOOTSTRAP_FLOW.md`
  - `TAG_WHITELIST.md`
  - `ACTIVE_CONTEXT_SPEC.md`

## 已脱敏内容

- 群 ID
- 机器本地绝对路径
- Obsidian 本地目录
- 飞书 `appId` / `appSecret`
- 任意 API Key

## 适用范围

这份包适合复现 `knowledge-sweet` 这套知识库工作区本身。

## 推荐阅读顺序

人工阅读建议按下面顺序进行：

1. `README.md`
2. `FEISHU_CONFIG_README.md`
3. `OpenClaw-Windows-安装教程.md`
4. `10分钟复现清单.md`
5. `部署说明-knowledge-sweet.md`
6. `分发规则-knowledge-sweet.md`
7. `详细使用教程.md`
8. `AI提示词-复现knowledge-sweet.md`

如果使用 AI 代为落地，建议先让 AI 学习：

1. `README.md`
2. `FEISHU_CONFIG_README.md`
3. `OpenClaw-Windows-安装教程.md`
4. `部署说明-knowledge-sweet.md`
5. `分发规则-knowledge-sweet.md`
6. `详细使用教程.md`
7. `configs/openclaw.knowledge-sweet.template.json`
8. `configs/DISPATCHER_CONFIG.template.json`
9. `scripts/dispatch-daemon.mjs`
10. `scripts/start-dispatcher.sh`
11. `scripts/sync-to-obsidian.sh`

## 机器人资料盘点与映射

在替换模板和并入配置之前，建议先盘点目标环境里已有的机器人资料，再做映射。

最少要盘点这些信息：

1. 飞书里的机器人显示名
2. 对应的 `appId` / `appSecret`
3. 在 `openclaw.json` 里对应的 `accountId`
4. 已有的 `agentId`
5. 目标群是否已经挂在某个账号下
6. 现有 `bindings` 是否已经占用了相关账号

盘点完成后，再建立一张最小映射表：

- 角色职责 -> 飞书显示名
- 飞书显示名 -> `accountId`
- `accountId` -> `agentId`
- `agentId` -> 实际目录或工作区

可直接使用：

- `映射表示例模板.md`

没有这一步，最容易出现的问题是：

1. 机器人显示名对上了，但 `accountId` 绑错
2. 群配置写进去了，但写到了错误账号
3. `main` 被重复创建，或覆盖了已有绑定

## 必须替换的占位符

- `<YOUR_OPENCLAW_HOME>`
- `<YOUR_GROUP_ID>`
- `<YOUR_OBSIDIAN_VAULT>`
- `<APP_ID>`
- `<APP_SECRET>`
- `<DISPLAY_NAME_MAIN>`
- `<DISPLAY_NAME_STRUCTURE>`
- `<DISPLAY_NAME_RESEARCH>`
- `<DISPLAY_NAME_REASONING>`
- `<DISPLAY_NAME_WRITING>`
- `<DISPLAY_NAME_PROOFREAD>`

## 机器人名字说明

- 这份包不要求沿用任何特定显示名。
- 可使用自定义飞书机器人名称，只要配置里的 `agentId`、绑定关系和目录映射保持一致即可。
- 模板中建议始终保留“职责名 + 占位符”的写法，不要把个人化昵称写进模板。

## Not Included in This Repo

- `ACTIVE_CONTEXT.json`
- `DISPATCH_QUEUE.jsonl`
- `DISPATCH_STATE.json`
- `HANDOFF_LOG.md`
- `SHARED_MEMORY.md`
- 任意 `*.log`

这些文件属于运行态，不属于模板，因此不在公开仓库中。
