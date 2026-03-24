# AI 提示词：复现 knowledge-sweet 工作区

目标是让 AI 按步骤在一台新机器上复现 `knowledge-sweet` 工作区，并且尽量减少模糊判断。

---

## 可直接复制的提示词

```text
你现在要帮我复现一个名为 knowledge-sweet 的 OpenClaw 工作区。

这是一个知识库工作区，核心目标是：
1. 让飞书群消息进入 main；
2. 让 knowledge-sweet 的 dispatcher 脚本正常运行；
3. 按既有知识库规则落库；
4. 可选同步到 Obsidian。

你必须严格遵循下面的执行要求。

【一、执行原则】
1. 不要先给我泛泛建议，直接开始检查和落地。
2. 先检查现有文件和目录，再决定如何改。
3. 不要擅自覆盖我已有的 openclaw.json；必须在理解现有结构后做最小改动。
4. 不要把我的旧群、旧 workspace、旧机器人配置弄坏。
5. 如果存在旧配置，优先并入，而不是重建。
6. 每完成一步，都要告诉我：
   - 你检查了什么
   - 你改了哪些文件
   - 下一步做什么
7. 如果发现某一步缺参数，先明确指出缺什么，不要自己编造。

【二、目标参数】
请使用下面这些参数：

- OpenClaw 根目录：<YOUR_OPENCLAW_HOME>
- knowledge-sweet 工作区：<YOUR_OPENCLAW_HOME>/workspace/knowledge-sweet
- 飞书群 ID：<YOUR_GROUP_ID>
- 飞书 appId：<APP_ID>
- 飞书 appSecret：<APP_SECRET>
- 主机器人显示名：<DISPLAY_NAME_MAIN>
- 可选 Obsidian 目录：<YOUR_OBSIDIAN_VAULT>

【三、输入材料】
我会给你一份“knowledge-sweet 脱敏复现包”。
你要使用其中这些文件：

1. configs/openclaw.knowledge-sweet.template.json
2. configs/DISPATCHER_CONFIG.template.json
3. scripts/dispatch-daemon.mjs
4. scripts/enqueue-dispatch.mjs
5. scripts/start-dispatcher.sh
6. scripts/stop-dispatcher.sh
7. scripts/sync-to-obsidian.sh
8. scripts/ai.openclaw.knowledge-sweet-obsidian-sync.plist
9. docs/ 下的说明文件
10. 根目录的部署说明和分发规则文件

【三点五、学习顺序】
在开始改文件前，你必须按下面顺序学习材料，并先给出学习总结：

1. README.md
2. FEISHU_CONFIG_README.md
3. OpenClaw-Windows-安装教程.md
4. 文档关系与高频问题说明.md
5. 部署说明-knowledge-sweet.md
6. 分发规则-knowledge-sweet.md
7. 详细使用教程.md
8. docs/CONFIG.md
9. docs/SKILL.md
10. docs/TEAM_CONTEXT.md
11. configs/openclaw.knowledge-sweet.template.json
12. configs/DISPATCHER_CONFIG.template.json
13. scripts/dispatch-daemon.mjs
14. scripts/enqueue-dispatch.mjs
15. scripts/start-dispatcher.sh
16. scripts/sync-to-obsidian.sh

学习完成后，必须先输出：
- 当前部署结构摘要
- 当前分发规则摘要
- 机器人资料盘点结果
- 机器人映射表
- 必须替换的占位符列表
- 将被修改的目标文件列表

【四、你必须按这个顺序执行】

第一步：盘点现状
- 检查是否已有 <YOUR_OPENCLAW_HOME>/workspace/knowledge-sweet
- 检查是否已有 openclaw.json
- 检查是否已有 main agent
- 检查是否已有飞书账号配置
- 检查是否已有与 knowledge-sweet 冲突的群配置
- 把检查结果先告诉我

第二步：盘点机器人资料并建立映射表
- 检查目标环境里已有的飞书机器人显示名
- 检查它们对应的 appId / appSecret
- 检查它们在 openclaw.json 中对应的 accountId
- 检查是否已有 agentId 与这些账号绑定
- 检查目标群当前挂在哪个账号下面
- 如存在 `映射表示例模板.md`，优先按该模板输出
- 输出一张映射表，格式至少包含：
  - 角色职责
  - 飞书显示名
  - accountId
  - agentId
  - 目标群
- 在这一步完成前，不要替换模板，不要写入 openclaw.json

第三步：建立或补齐工作区
- 如果 knowledge-sweet 工作区不存在，则创建
- 如果存在，则只补缺的文件，不要覆盖运行态文件
- 把模板文件放到合适位置
- 同时阅读“部署说明-knowledge-sweet.md”和“分发规则-knowledge-sweet.md”，按其中原则落地
- 明确告诉我哪些文件是模板，哪些文件是运行文件

第四步：替换占位符
- 替换 openclaw 模板中的：
  - <DISPLAY_NAME_MAIN>
  - <APP_ID>
  - <APP_SECRET>
  - <YOUR_GROUP_ID>
- 替换 dispatcher 模板中的：
  - <YOUR_GROUP_ID>
- 如果启用 Obsidian，同步替换：
  - <YOUR_OPENCLAW_HOME>
  - <YOUR_OBSIDIAN_VAULT>
- 替换完成后，告诉我每个文件替换了什么

第五步：并入 openclaw.json
- 不要粗暴覆盖
- 必须先读取现有 openclaw.json
- 然后以最小修改方式并入：
  - agents.list 中 main 的相关配置
  - bindings
  - channels.feishu.accounts
  - groups
- 如果已有 main，就复用已有 main，不要重复造一个
- 如果已有飞书账号，就判断是复用还是新增 accountId 更稳
- 改完后，告诉我最终的 accountId、binding 和 group 路由关系

第六步：落地 dispatcher
- 把以下文件落到 knowledge-sweet 工作区：
  - dispatch-daemon.mjs
  - enqueue-dispatch.mjs
  - start-dispatcher.sh
  - stop-dispatcher.sh
  - DISPATCHER_CONFIG.json
- 说明每个文件的职责

第七步：可选落地 Obsidian 同步
- 如果我提供了 <YOUR_OBSIDIAN_VAULT>，就继续配置
- 把 sync-to-obsidian.sh 放到 workspace
- 把 plist 放到 launchd 目录
- 如果系统需要，还要告诉我 plist 应复制到哪里
- 但不要在没有必要时删旧的同步任务

第八步：启动与验证
- 启动 dispatcher
- 如有需要，重启或热加载 gateway
- 然后做最小验收：
  1. 群能否接入
  2. main 能否响应
  3. dispatcher 是否在跑
  4. 如启用 Obsidian，同步是否成功
- 不要只说“应该可以”，要给出你实际检查了哪些文件或状态

【五、输出格式要求】
你每一轮输出都必须按下面格式：

1. 当前阶段
2. 你检查到的现状
3. 你将要修改的文件
4. 你已经完成的修改
5. 当前还缺什么
6. 下一步动作

【六、禁止事项】
1. 不要擅自删除旧 workspace
2. 不要擅自删除旧群配置
3. 不要把 knowledge-sweet 和其他工作区混在一起
4. 不要输出“请你手动看看”这种笼统建议，除非确实必须人工补参数
5. 不要用模糊词，如“大概、可能、差不多”
6. 不要在没有验证前说“已成功”

【七、验收标准】
只有同时满足下面条件，才算复现成功：
1. openclaw.json 中存在 knowledge-sweet 所需的飞书群配置
2. knowledge-sweet 工作区关键脚本已落地
3. dispatcher 已启动或具备可启动状态
4. main 在目标群可接入
5. 如启用 Obsidian，同步链路已完成配置

现在开始执行。第一步先盘点现状，然后再继续。
```

---

## 这份提示词为什么这样写

这份提示词故意做了 4 个限制：

1. 强制 AI 先检查现状
避免它一上来乱覆盖已有配置。

2. 强制 AI 按顺序执行
避免它跳过关键步骤，比如先改脚本却没改 `openclaw.json`。

3. 强制 AI 报告具体文件
这样你能知道它到底改了哪里，而不是只说“我帮你配置好了”。

4. 强制 AI 做最小验收
避免它只完成文件复制，却没验证群接入和 dispatcher 状态。

## 推荐追加约束

如果目标机器上已经有别的 OpenClaw 群在跑，可额外补充一句：

```text
注意：这是在已有 OpenClaw 环境上增量接入 knowledge-sweet，不能破坏已有群、已有 agent、已有 workspace。
```
