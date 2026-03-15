#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const knowledgeDir = path.dirname(__filename);
const workspaceDir = path.dirname(knowledgeDir);
const rootDir = path.dirname(workspaceDir);
const openclawBin = resolveOpenclawBin();
const feishuTenantTokenCache = new Map();

const args = parseArgs(process.argv.slice(2));
const runtimePaths = resolveRuntimePaths(args);
const dispatcherConfig = loadDispatcherConfig(runtimePaths);

ensureFile(runtimePaths.queuePath, "");
ensureJsonFile(runtimePaths.statePath, { processed: {} });
ensureFile(runtimePaths.handoffLogPath, "# HANDOFF_LOG.md\n\n");
ensureFile(runtimePaths.sharedMemoryPath, "# SHARED_MEMORY.md\n\n");
ensureJsonFile(runtimePaths.activeContextPath, { activeTaskId: "", tasks: {} });

if (args.help) {
  printHelp();
  process.exit(0);
}

log(`dispatcher booting (queue=${runtimePaths.queuePath})`);

if (args.once) {
  await processQueueOnce();
  process.exit(0);
}

const timer = setInterval(() => {
  processQueueOnce().catch((error) => {
    log(`queue processing failed: ${formatError(error)}`);
  });
}, dispatcherConfig.pollIntervalMs);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  clearInterval(timer);
  log("dispatcher stopped");
  process.exit(0);
}

async function processQueueOnce() {
  const state = loadState(runtimePaths.statePath);
  const activeContext = loadActiveContext(runtimePaths.activeContextPath);
  const entries = loadQueueEntries(runtimePaths.queuePath);
  const openclawConfig = loadOpenclawConfig();
  const accountMap = resolveAgentAccountMap(openclawConfig);
  const accountCredentialsMap = resolveFeishuAccountCredentialsMap(openclawConfig);
  const identityMap = resolveAgentIdentityMap(openclawConfig);
  const botDirectory = resolveBotDirectory({ openclawConfig, accountMap, identityMap });
  let mutated = false;
  let activeContextMutated = false;

  for (const entry of entries) {
    const entryId = normalizeEntryId(entry);
    if (state.processed[entryId]) continue;
    if (!isDispatchable(entry)) continue;

    const result = await processEntry(entry, state, activeContext, {
      openclawConfig,
      accountMap,
      accountCredentialsMap,
      identityMap,
      botDirectory
    });
    state.processed[entryId] = {
      processedAt: new Date().toISOString(),
      ok: result.ok,
      title: entry.title ?? "",
      tasks: result.tasks
    };
    mutated = true;
    activeContextMutated = activeContextMutated || result.activeContextMutated === true;
  }

  const seededWatches = seedProgressWatchesFromActiveContext(state, activeContext, {
    accountMap,
    identityMap,
    botDirectory
  });
  mutated = mutated || seededWatches;
  const watchMutated = await processPendingProgressWatches(state, activeContext, {
    accountMap,
    accountCredentialsMap,
    identityMap,
    botDirectory
  });
  mutated = mutated || watchMutated;
  activeContextMutated = activeContextMutated || watchMutated;

  if (activeContextMutated) {
    saveJson(runtimePaths.activeContextPath, activeContext);
  }

  if (mutated) {
    trimProcessedMap(state.processed, 500);
    trimProgressWatches(state.progressWatches, 500);
    saveJson(runtimePaths.statePath, state);
  }
}

async function processEntry(entry, state, activeContext, resolvedMaps) {
  const tasks = normalizeTasks(entry);
  if (tasks.length === 0) {
    log(`skip ${normalizeEntryId(entry)}: no tasks`);
    return { ok: false, tasks: [] };
  }

  const { accountMap, accountCredentialsMap, identityMap, botDirectory } = resolvedMaps;
  const groupId = firstNonEmpty(normalizeGroupId(entry.groupId), dispatcherConfig.defaultGroupId);

  if (!groupId) {
    throw new Error(`missing groupId for ${normalizeEntryId(entry)}`);
  }

  const processedTasks = [];
  let activeContextMutated = false;

  for (const task of tasks) {
    const agentId = normalizeAgentId(task.agentId);
    if (!agentId) throw new Error(`dispatch task missing agentId in ${normalizeEntryId(entry)}`);

    const accountId = firstNonEmpty(readNonEmpty(task.accountId), accountMap[agentId]);
    if (!accountId) throw new Error(`no feishu account binding found for agent ${agentId}`);
    const sourceAgentId = firstNonEmpty(normalizeAgentId(entry.sourceAgentId), dispatcherConfig.sourceAgentId);
    const sourceAccountId = firstNonEmpty(readNonEmpty(task.sourceAccountId), readNonEmpty(entry.sourceAccountId), accountMap[sourceAgentId]);

    const taskGroupId = firstNonEmpty(normalizeGroupId(task.groupId), groupId);
    const taskId = firstNonEmpty(readNonEmpty(task.taskId), readNonEmpty(entry.taskId), normalizeEntryId(entry));
    const sessionKey = firstNonEmpty(readNonEmpty(task.sessionKey), `agent:${agentId}:feishu:group:${taskGroupId}`);
    const message = buildDispatchMessage(entry, task, taskGroupId);
    const params = {
      agentId,
      sessionKey,
      message,
      deliver: task.deliver !== false,
      channel: dispatcherConfig.channel,
      accountId,
      to: `chat:${taskGroupId}`,
      idempotencyKey: `dispatch-${normalizeEntryId(entry)}-${agentId}-${crypto.randomUUID()}`,
      label: `dispatch:${normalizeEntryId(entry)}:${agentId}`
    };

    if (args.dryRun) {
      log(`dry-run dispatch ${normalizeEntryId(entry)} -> ${agentId} (${sessionKey})`);
      processedTasks.push({ agentId, sessionKey, runId: "dry-run" });
      continue;
    }

    let runId = "relay-only";
    if (dispatcherConfig.dispatchMode === "relay_only") {
      if (!sourceAccountId) {
        throw new Error(`no source account binding found for agent ${sourceAgentId}`);
      }
      await sendPublicRelay({
        entry,
        task,
        taskGroupId,
        sourceAgentId,
        sourceAccountId,
        botDirectory,
        identityMap,
        accountCredentialsMap
      });
    } else {
      if (shouldSendPublicRelay(entry, task, dispatcherConfig) && sourceAccountId) {
        try {
          await sendPublicRelay({
            entry,
            task,
            taskGroupId,
            sourceAgentId,
            sourceAccountId,
            botDirectory,
            identityMap,
            accountCredentialsMap
          });
        } catch (error) {
          log(`public relay failed ${normalizeEntryId(entry)} -> ${agentId}: ${formatError(error)}`);
        }
      }

      const response = await runAgentTurn(params, {
        timeoutSeconds: dispatcherConfig.agentTimeoutSeconds
      });
      runId = typeof response?.runId === "string" && response.runId ? response.runId : "unknown";
    }

    processedTasks.push({ agentId, sessionKey, runId });
    log(`dispatched ${normalizeEntryId(entry)} -> ${agentId} (runId=${runId})`);

    const watchMutated = registerProgressWatch(state, activeContext, {
      entry,
      task,
      taskId,
      agentId,
      taskGroupId,
      sourceAgentId,
      sourceAccountId,
      accountMap,
      identityMap,
      botDirectory
    });
    activeContextMutated = activeContextMutated || watchMutated;

    if (dispatcherConfig.logToHandoff) {
      appendHandoffLog(entry, agentId, task, runId);
    }
  }

  return { ok: true, tasks: processedTasks, activeContextMutated };
}

function buildDispatchMessage(entry, task, groupId) {
  const mergedConstraints = mergeStringLists(entry.constraints, task.constraints);
  const mergedPaths = mergeStringLists(
    entry.contextPaths,
    task.contextPaths,
    runtimePaths.activeContextPath,
    runtimePaths.sharedMemoryPath,
    runtimePaths.handoffLogPath
  );
  const lines = [
    '# Task Packet From ${SOURCE_AGENT_NAME}',
    "",
    `dispatchId: ${normalizeEntryId(entry)}`,
    `title: ${entry.title ?? "未命名任务"}`,
    `groupId: ${groupId}`,
    `sourceAgent: ${entry.sourceAgentId ?? dispatcherConfig.sourceAgentId}`,
    "",
    "## Your Assignment",
    task.brief ?? "",
    "",
    task.output ? "## Expected Output" : "",
    task.output ?? "",
    mergedConstraints.length > 0 ? "## Constraints" : "",
    ...mergedConstraints.map((value) => `- ${value}`),
    mergedPaths.length > 0 ? "## Shared Context Paths" : "",
    ...mergedPaths.map((value) => `- ${value}`),
    entry.summary ? "## Shared Summary" : "",
    entry.summary ?? "",
    "",
    "## Working Rules",
    "- Speak in the current Feishu group as your own role.",
    "- Do only your assigned part; do not re-plan the whole project.",
    "- If key information is missing, ask the smallest useful clarifying question or state clear assumptions.",
    `- Reuse shared memory under ${runtimePaths.runtimeDir} when relevant; do not write into other agents' private MEMORY.md files.`,
    `- When the task materially changes status, add a short handoff note into ${runtimePaths.handoffLogPath}.`,
    ""
  ].filter((line) => line !== "");

  return lines.join("\n");
}

function appendHandoffLog(entry, agentId, task, runId) {
  const stamp = formatLocalStamp(new Date());
  const summary = truncateOneLine(task.brief ?? entry.title ?? "dispatch");
  const line = `- ${stamp} | dispatcher → ${agentId} | ${summary} | runId=${runId}\n`;
  fs.appendFileSync(runtimePaths.handoffLogPath, line, "utf8");
}

async function sendPublicRelay({
  entry,
  task,
  taskGroupId,
  sourceAgentId,
  sourceAccountId,
  botDirectory,
  identityMap,
  accountCredentialsMap
}) {
  const targetAgentId = normalizeAgentId(task.agentId);
  const target = botDirectory[targetAgentId];
  if (!target?.openId) {
    log(`skip public relay for ${normalizeEntryId(entry)} -> ${targetAgentId}: missing bot open_id`);
    return;
  }

  const sourceName = identityMap[sourceAgentId]?.name ?? sourceAgentId;
  const targetName = target.name ?? identityMap[targetAgentId]?.name ?? targetAgentId;
  const title = entry.title ?? "未命名任务";
  const assignment = truncateBlock(task.brief ?? entry.title ?? "接手任务", 10, 140);
  const expectedOutput = truncateBlock(task.output ?? "", 6, 140);
  const constraints = mergeStringLists(entry.constraints, task.constraints);
  const contextPaths = mergeStringLists(entry.contextPaths, task.contextPaths).slice(0, 5);
  const message = [
    `【自动交接】${sourceName} 交给 <at user_id="${target.openId}">${targetName}</at>`,
    `任务标题：${title}`,
    "",
    "请由被点名机器人直接接手，首条回复必须给出实质进展，不要只回复“开始接管”。",
    "",
    "【你的任务】",
    assignment,
    expectedOutput ? "" : "",
    expectedOutput ? "【预期交付】" : "",
    expectedOutput || "",
    constraints.length > 0 ? "" : "",
    constraints.length > 0 ? "【约束】" : "",
    ...constraints.map((value) => `- ${value}`),
    contextPaths.length > 0 ? "" : "",
    contextPaths.length > 0 ? "【共享上下文】" : "",
    ...contextPaths.map((value) => `- ${value}`),
    `taskId: ${entry.taskId ?? normalizeEntryId(entry)}`
  ].filter(Boolean).join("\n");

  await sendChannelMessage({
    accountCredentialsMap,
    accountId: sourceAccountId,
    target: taskGroupId,
    message
  });
  log(`public relay sent ${normalizeEntryId(entry)}: ${sourceAgentId} -> ${targetAgentId}`);
}

async function sendChannelMessage({ accountCredentialsMap, accountId, target, message }) {
  if (dispatcherConfig.channel !== "feishu") {
    const result = await runCommand(openclawBin, [
      "message",
      "send",
      "--channel",
      dispatcherConfig.channel,
      "--account",
      accountId,
      "--target",
      target,
      "--message",
      message,
      "--json"
    ], { cwd: rootDir });

    const stdout = result.stdout.trim();
    if (!stdout) return {};
    try {
      return JSON.parse(stdout);
    } catch {
      return {};
    }
  }

  const creds = accountCredentialsMap[accountId];
  if (!creds?.appId || !creds?.appSecret) {
    throw new Error(`missing feishu credentials for account ${accountId}`);
  }

  const tenantAccessToken = await getFeishuTenantAccessToken(creds);
  const response = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      receive_id: target,
      msg_type: "post",
      content: buildFeishuPostContent(message)
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.code) {
    throw new Error(payload?.msg || payload?.message || `feishu send failed (${response.status})`);
  }
  return payload?.data ?? payload ?? {};
}

function buildFeishuPostContent(text) {
  return JSON.stringify({
    zh_cn: {
      content: [[{ tag: "md", text }]]
    }
  });
}

async function getFeishuTenantAccessToken(creds) {
  const cacheKey = `${creds.appId}:${creds.appSecret}`;
  const cached = feishuTenantTokenCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      app_id: creds.appId,
      app_secret: creds.appSecret
    })
  });
  const payload = await response.json().catch(() => ({}));
  const token = payload?.tenant_access_token;
  if (!response.ok || !token) {
    throw new Error(payload?.msg || payload?.message || `feishu tenant token failed (${response.status})`);
  }

  const expiresInMs = Math.max(60_000, Number(payload?.expire ?? payload?.expires_in ?? 7200) * 1000);
  feishuTenantTokenCache.set(cacheKey, {
    token,
    expiresAt: now + expiresInMs
  });
  return token;
}

async function runAgentTurn(params, options) {
  const commandArgs = [
    "agent",
    "--agent",
    params.agentId,
    "--channel",
    params.channel,
    "--message",
    params.message,
    "--deliver",
    "--reply-channel",
    params.channel,
    "--reply-account",
    params.accountId,
    "--reply-to",
    params.to,
    "--json",
    "--timeout",
    String(Math.max(1, options.timeoutSeconds ?? 180))
  ];

  const result = await runCommand(openclawBin, commandArgs, { cwd: rootDir });
  const stdout = result.stdout.trim();
  if (!stdout) return {};

  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`gateway response was not valid JSON: ${stdout}`);
  }
}

function runCommand(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? rootDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });
}

function resolveOpenclawBin() {
  const candidates = [
    process.env.OPENCLAW_BIN,
    path.join(process.env.HOME ?? "", ".npm-global/bin/openclaw"),
    "/opt/homebrew/bin/openclaw",
    "openclaw"
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "openclaw") return candidate;
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return "openclaw";
}

function loadDispatcherConfig(paths) {
  const fileConfig = readJson(paths.configPath, {});
  return {
    defaultGroupId: firstNonEmpty(normalizeGroupId(fileConfig.defaultGroupId), readGroupIdFromLegacyConfig()),
    channel: firstNonEmpty(readNonEmpty(fileConfig.channel), "feishu"),
    sourceAgentId: firstNonEmpty(normalizeAgentId(fileConfig.sourceAgentId), "main"),
    dispatchMode: firstNonEmpty(readNonEmpty(fileConfig.dispatchMode), "relay_only"),
    pollIntervalMs: readPositiveInt(fileConfig.pollIntervalMs, 2000),
    gatewayTimeoutMs: readPositiveInt(fileConfig.gatewayTimeoutMs, 15000),
    agentTimeoutSeconds: readPositiveInt(fileConfig.agentTimeoutSeconds, 180),
    logToHandoff: fileConfig.logToHandoff !== false,
    publicRelay: fileConfig.publicRelay !== false,
    botDirectoryPath: path.resolve(firstNonEmpty(fileConfig.botDirectoryPath, path.join(paths.runtimeDir, "BOT_DIRECTORY.json"))),
    progressFirstPingMs: readPositiveInt(fileConfig.progressFirstPingMs, 90_000),
    progressRepeatPingMs: readPositiveInt(fileConfig.progressRepeatPingMs, 180_000),
    progressMaxNotifications: readPositiveInt(fileConfig.progressMaxNotifications, 3)
  };
}

function resolveRuntimePaths(cliArgs) {
  const runtimeDir = path.resolve(firstNonEmpty(cliArgs.runtimeDir, knowledgeDir));
  return {
    runtimeDir,
    configPath: path.resolve(firstNonEmpty(cliArgs.configPath, path.join(runtimeDir, "DISPATCHER_CONFIG.json"))),
    queuePath: path.resolve(firstNonEmpty(cliArgs.queuePath, path.join(runtimeDir, "DISPATCH_QUEUE.jsonl"))),
    statePath: path.resolve(firstNonEmpty(cliArgs.statePath, path.join(runtimeDir, "DISPATCH_STATE.json"))),
    logPath: path.resolve(firstNonEmpty(cliArgs.logPath, path.join(runtimeDir, "DISPATCHER.log"))),
    handoffLogPath: path.resolve(path.join(runtimeDir, "HANDOFF_LOG.md")),
    sharedMemoryPath: path.resolve(path.join(runtimeDir, "SHARED_MEMORY.md")),
    activeContextPath: path.resolve(path.join(runtimeDir, "ACTIVE_CONTEXT.json"))
  };
}

function loadQueueEntries(queuePath) {
  const raw = fs.readFileSync(queuePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => parseQueueLine(line, index + 1))
    .filter(Boolean);
}

function parseQueueLine(line, lineNumber) {
  try {
    return JSON.parse(line);
  } catch (error) {
    log(`invalid queue line ${lineNumber}: ${formatError(error)}`);
    return null;
  }
}

function isDispatchable(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.approved === false) return false;
  if (typeof entry.status === "string") {
    const status = entry.status.trim().toLowerCase();
    if (status === "draft" || status === "waiting-approval" || status === "planned") return false;
  }
  return true;
}

function normalizeTasks(entry) {
  if (Array.isArray(entry.tasks)) return entry.tasks.filter((task) => task && typeof task === "object");
  if (entry.agentId || entry.targetAgentId) {
    return [{
      agentId: entry.agentId ?? entry.targetAgentId,
      brief: entry.brief,
      output: entry.output,
      constraints: entry.constraints,
      contextPaths: entry.contextPaths,
      groupId: entry.groupId,
      deliver: entry.deliver
    }];
  }
  return [];
}

function loadState(statePath) {
  const raw = readJson(statePath, { processed: {}, progressWatches: {} });
  return {
    processed: raw?.processed && typeof raw.processed === "object" ? raw.processed : {},
    progressWatches: raw?.progressWatches && typeof raw.progressWatches === "object" ? raw.progressWatches : {}
  };
}

function loadActiveContext(activeContextPath) {
  const raw = readJson(activeContextPath, { activeTaskId: "", tasks: {} });
  return {
    activeTaskId: readNonEmpty(raw?.activeTaskId),
    tasks: raw?.tasks && typeof raw.tasks === "object" ? raw.tasks : {}
  };
}

function saveJson(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function ensureFile(filePath, initialValue) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, initialValue, "utf8");
  }
}

function ensureJsonFile(filePath, initialValue) {
  if (!fs.existsSync(filePath)) {
    saveJson(filePath, initialValue);
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function loadOpenclawConfig() {
  return JSON.parse(fs.readFileSync(path.join(rootDir, "openclaw.json"), "utf8"));
}

function resolveAgentAccountMap(openclawConfig) {
  const out = {};
  const bindings = Array.isArray(openclawConfig.bindings) ? openclawConfig.bindings : [];

  for (const binding of bindings) {
    if (!binding || typeof binding !== "object") continue;
    const agentId = normalizeAgentId(binding.agentId);
    const match = binding.match;
    if (!agentId || !match || typeof match !== "object") continue;
    if (match.channel !== "feishu") continue;
    const accountId = readNonEmpty(match.accountId);
    if (accountId) out[agentId] = accountId;
  }

  return out;
}

function resolveFeishuAccountCredentialsMap(openclawConfig) {
  const feishuConfig = openclawConfig?.channels?.feishu ?? {};
  const accounts = feishuConfig.accounts ?? {};
  const baseAppId = readNonEmpty(feishuConfig.appId);
  const baseAppSecret = readNonEmpty(feishuConfig.appSecret);
  const out = {};

  for (const [accountId, accountConfig] of Object.entries(accounts)) {
    if (!accountConfig || typeof accountConfig !== "object") continue;
    out[accountId] = {
      appId: readNonEmpty(accountConfig.appId) || baseAppId,
      appSecret: readNonEmpty(accountConfig.appSecret) || baseAppSecret
    };
  }

  return out;
}

function resolveAgentIdentityMap(openclawConfig) {
  const out = {};
  const agents = Array.isArray(openclawConfig?.agents?.list) ? openclawConfig.agents.list : [];
  for (const agent of agents) {
    const agentId = normalizeAgentId(agent?.id || agent?.name);
    if (!agentId) continue;
    out[agentId] = {
      name: readNonEmpty(agent?.identity?.name) || readNonEmpty(agent?.name) || agentId
    };
  }
  return out;
}

function resolveBotDirectory({ openclawConfig, accountMap, identityMap }) {
  const configEntries = readJson(dispatcherConfig.botDirectoryPath, {});
  const out = {};

  for (const [agentIdRaw, accountId] of Object.entries(accountMap)) {
    const agentId = normalizeAgentId(agentIdRaw);
    if (!agentId) continue;
    const configured = configEntries[agentId] && typeof configEntries[agentId] === "object" ? configEntries[agentId] : {};
    out[agentId] = {
      agentId,
      accountId,
      name: readNonEmpty(configured.name) || identityMap[agentId]?.name || agentId,
      openId: readNonEmpty(configured.openId) || resolveBotOpenIdFromLogs(accountId)
    };
  }

  return out;
}

function resolveBotOpenIdFromLogs(accountId) {
  const logPath = path.join(rootDir, "logs", "gateway.log");
  try {
    const raw = fs.readFileSync(logPath, "utf8");
    const pattern = new RegExp(`feishu\\[${escapeRegExp(accountId)}\\]: bot open_id resolved: (ou_[a-z0-9]+)`, "ig");
    let match;
    let last = "";
    while ((match = pattern.exec(raw)) !== null) {
      last = match[1];
    }
    return last;
  } catch {
    return "";
  }
}

function resolveGatewayToken(openclawConfig) {
  const auth = openclawConfig.gateway?.auth;
  if (!auth || typeof auth !== "object") return "";
  if (auth.mode !== "token") return "";
  return readNonEmpty(auth.token) ?? "";
}

function readGroupIdFromLegacyConfig() {
  const legacyPath = path.join(knowledgeDir, "CONFIG.md");
  try {
    const raw = fs.readFileSync(legacyPath, "utf8");
    const match = raw.match(/\boc_[a-z0-9]+\b/i);
    return match ? match[0] : "";
  } catch {
    return "";
  }
}

function mergeStringLists(...values) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : [])
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function normalizeEntryId(entry) {
  const raw = readNonEmpty(entry.id);
  if (raw) return raw;
  return crypto.createHash("sha1").update(JSON.stringify(entry)).digest("hex").slice(0, 16);
}

function normalizeGroupId(value) {
  const text = readNonEmpty(value);
  if (!text) return "";
  const match = text.match(/\boc_[a-z0-9]+\b/i);
  return match ? match[0] : text;
}

function normalizeAgentId(value) {
  const text = readNonEmpty(value);
  return text ? text.toLowerCase() : "";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readNonEmpty(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed || "";
}

function readPositiveInt(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.round(value);
}

function trimProcessedMap(processed, maxEntries) {
  const entries = Object.entries(processed);
  if (entries.length <= maxEntries) return;
  entries
    .sort((left, right) => String(left[1]?.processedAt ?? "").localeCompare(String(right[1]?.processedAt ?? "")))
    .slice(0, entries.length - maxEntries)
    .forEach(([key]) => {
      delete processed[key];
    });
}

function trimProgressWatches(progressWatches, maxEntries) {
  const entries = Object.entries(progressWatches);
  if (entries.length <= maxEntries) return;
  entries
    .sort((left, right) => String(left[1]?.updatedAt ?? left[1]?.dispatchedAt ?? "").localeCompare(String(right[1]?.updatedAt ?? right[1]?.dispatchedAt ?? "")))
    .slice(0, entries.length - maxEntries)
    .forEach(([key]) => {
      delete progressWatches[key];
    });
}

function registerProgressWatch(state, activeContext, params) {
  const watchId = `${params.taskId}:${params.agentId}`;
  const now = new Date().toISOString();
  state.progressWatches[watchId] = {
    watchId,
    entryId: normalizeEntryId(params.entry),
    taskId: params.taskId,
    title: params.entry.title ?? "未命名任务",
    agentId: params.agentId,
    agentName: params.botDirectory[params.agentId]?.name ?? params.identityMap[params.agentId]?.name ?? params.agentId,
    agentOpenId: params.botDirectory[params.agentId]?.openId ?? "",
    groupId: params.taskGroupId,
    sourceAgentId: params.sourceAgentId,
    sourceAgentName: params.identityMap[params.sourceAgentId]?.name ?? params.sourceAgentId,
    sourceAccountId: params.sourceAccountId,
    brief: truncateOneLine(params.task.brief ?? params.entry.title ?? "dispatch"),
    dispatchedAt: now,
    updatedAt: now,
    lastNotifiedAt: "",
    notificationCount: 0,
    maxNotifications: dispatcherConfig.progressMaxNotifications,
    status: "awaiting_response"
  };

  const taskRecord = activeContext.tasks?.[params.taskId];
  if (!taskRecord || typeof taskRecord !== "object") return false;
  activeContext.tasks[params.taskId] = {
    ...taskRecord,
    status: "awaiting_response",
    lastAgent: params.sourceAgentId,
    nextAgent: params.agentId,
    updatedAt: now,
    monitor: {
      waitingFor: params.agentId,
      watchId,
      lastRelayAt: now
    }
  };
  activeContext.activeTaskId = params.taskId;
  return true;
}

async function processPendingProgressWatches(state, activeContext, resolvedMaps) {
  const progressWatches = state.progressWatches ?? {};
  const watchEntries = Object.entries(progressWatches);
  if (watchEntries.length === 0) return false;

  const { accountCredentialsMap, botDirectory } = resolvedMaps;
  const now = Date.now();
  let mutated = false;

  for (const [watchId, watch] of watchEntries) {
    if (!watch || typeof watch !== "object") {
      delete progressWatches[watchId];
      mutated = true;
      continue;
    }

    const taskRecord = activeContext.tasks?.[watch.taskId];
    const taskStatus = normalizeTaskStatus(taskRecord?.status);
    const taskUpdatedAtMs = parseIsoTime(taskRecord?.updatedAt);
    const dispatchedAtMs = parseIsoTime(watch.dispatchedAt);
    const lastNotifiedAtMs = parseIsoTime(watch.lastNotifiedAt);
    const progressed = hasTaskProgressed(taskRecord, watch);
    const terminal = isTerminalTaskStatus(taskStatus);

    if (terminal || progressed) {
      delete progressWatches[watchId];
      mutated = true;
      continue;
    }

    const firstDelayMs = dispatcherConfig.progressFirstPingMs;
    const repeatDelayMs = dispatcherConfig.progressRepeatPingMs;
    const dueAtMs = watch.notificationCount > 0 && lastNotifiedAtMs > 0
      ? lastNotifiedAtMs + repeatDelayMs
      : dispatchedAtMs + firstDelayMs;
    const withinLimit = Number(watch.notificationCount ?? 0) < Number(watch.maxNotifications ?? dispatcherConfig.progressMaxNotifications);
    if (!withinLimit || !Number.isFinite(dueAtMs) || now < dueAtMs) {
      continue;
    }

    const message = buildProgressHeartbeatMessage({
      watch,
      taskRecord,
      target: botDirectory[watch.agentId]
    });
    try {
      await sendChannelMessage({
        accountCredentialsMap,
        accountId: watch.sourceAccountId,
        target: watch.groupId,
        message
      });
      progressWatches[watchId] = {
        ...watch,
        lastNotifiedAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        notificationCount: Number(watch.notificationCount ?? 0) + 1
      };
      log(`progress heartbeat sent ${watch.taskId} -> ${watch.agentId} (#${progressWatches[watchId].notificationCount})`);
      mutated = true;
    } catch (error) {
      log(`progress heartbeat failed ${watch.taskId} -> ${watch.agentId}: ${formatError(error)}`);
    }
  }

  trimProgressWatches(progressWatches, 500);
  return mutated;
}

function seedProgressWatchesFromActiveContext(state, activeContext, resolvedMaps) {
  const tasks = activeContext?.tasks && typeof activeContext.tasks === "object" ? activeContext.tasks : {};
  let mutated = false;

  for (const [taskId, taskRecord] of Object.entries(tasks)) {
    if (!taskRecord || typeof taskRecord !== "object") continue;
    const status = normalizeTaskStatus(taskRecord.status);
    if (!["queued", "awaiting_response"].includes(status)) continue;
    const agentId = normalizeAgentId(taskRecord.nextAgent);
    const sourceAgentId = normalizeAgentId(taskRecord.lastAgent || taskRecord.owner || dispatcherConfig.sourceAgentId);
    if (!agentId || !sourceAgentId) continue;
    const watchId = `${taskId}:${agentId}`;
    if (state.progressWatches?.[watchId]) continue;

    const groupId = firstNonEmpty(
      normalizeGroupId(taskRecord.groupId),
      dispatcherConfig.defaultGroupId
    );
    const sourceAccountId = resolvedMaps.accountMap[sourceAgentId];
    if (!groupId || !sourceAccountId) continue;

    state.progressWatches[watchId] = {
      watchId,
      entryId: readNonEmpty(taskRecord.entryId) || taskId,
      taskId,
      title: readNonEmpty(taskRecord.title) || "未命名任务",
      agentId,
      agentName: resolvedMaps.botDirectory[agentId]?.name ?? resolvedMaps.identityMap[agentId]?.name ?? agentId,
      agentOpenId: resolvedMaps.botDirectory[agentId]?.openId ?? "",
      groupId,
      sourceAgentId,
      sourceAgentName: resolvedMaps.identityMap[sourceAgentId]?.name ?? sourceAgentId,
      sourceAccountId,
      brief: truncateOneLine(taskRecord.route?.[taskRecord.route.length - 1]?.brief ?? taskRecord.title ?? "dispatch"),
      dispatchedAt: readNonEmpty(taskRecord.updatedAt) || new Date().toISOString(),
      updatedAt: readNonEmpty(taskRecord.updatedAt) || new Date().toISOString(),
      lastNotifiedAt: "",
      notificationCount: 0,
      maxNotifications: dispatcherConfig.progressMaxNotifications,
      status: "awaiting_response"
    };
    mutated = true;
  }

  return mutated;
}

function buildProgressHeartbeatMessage({ watch, taskRecord, target }) {
  const targetName = target?.name ?? watch.agentName ?? watch.agentId;
  const targetAt = target?.openId ? `<at user_id="${target.openId}">${targetName}</at>` : targetName;
  const currentStatus = normalizeTaskStatus(taskRecord?.status) || "awaiting_response";
  const lines = [
    `【进度提示】${watch.sourceAgentName ?? "<DISPLAY_NAME_MAIN>"} 跟进 ${targetAt}`,
    `任务标题：${watch.title ?? "未命名任务"}`,
    `当前状态：${currentStatus}`,
    `当前环节：${watch.brief}`,
    "",
    "该环节仍在执行中。",
    "请直接回复当前已完成的第一轮实质内容；若仍需继续处理，请明确说明还在做什么、下一条将交付什么。"
  ];
  return lines.join("\n");
}

function normalizeTaskStatus(value) {
  return readNonEmpty(value).toLowerCase();
}

function isTerminalTaskStatus(status) {
  return ["done", "completed", "complete", "failed", "error", "blocked", "cancelled", "canceled"].includes(status);
}

function hasTaskProgressed(taskRecord, watch) {
  if (!taskRecord || typeof taskRecord !== "object") return false;
  const lastAgent = normalizeAgentId(taskRecord.lastAgent);
  const nextAgent = normalizeAgentId(taskRecord.nextAgent);
  const sourceAgentId = normalizeAgentId(watch.sourceAgentId);
  const targetAgentId = normalizeAgentId(watch.agentId);
  const taskUpdatedAtMs = parseIsoTime(taskRecord.updatedAt);
  const dispatchedAtMs = parseIsoTime(watch.dispatchedAt);

  if (taskUpdatedAtMs > dispatchedAtMs && lastAgent && lastAgent !== sourceAgentId) return true;
  if (taskUpdatedAtMs > dispatchedAtMs && nextAgent && nextAgent !== targetAgentId) return true;
  return false;
}

function parseIsoTime(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function shouldSendPublicRelay(entry, task, config) {
  if (config.publicRelay === false) return false;
  if (entry.publicRelay === false) return false;
  if (task.publicRelay === false) return false;
  return true;
}

function truncateOneLine(value) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= 80) return text;
  return `${text.slice(0, 77)}...`;
}

function truncateBlock(value, maxLines = 8, maxLineLength = 120) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .slice(0, maxLines)
    .map((line) => truncateOneLine(String(line).slice(0, maxLineLength)))
    .join("\n");
}

function formatLocalStamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(runtimePaths.logPath, line, "utf8");
  if (args.verbose || args.once || args.dryRun) {
    process.stdout.write(line);
  }
}

function parseArgs(argv) {
  const out = {
    once: false,
    dryRun: false,
    verbose: false,
    help: false,
    runtimeDir: "",
    configPath: "",
    queuePath: "",
    statePath: "",
    logPath: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--once") out.once = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--verbose") out.verbose = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--runtime-dir") out.runtimeDir = argv[++index] ?? "";
    else if (arg === "--config") out.configPath = argv[++index] ?? "";
    else if (arg === "--queue") out.queuePath = argv[++index] ?? "";
    else if (arg === "--state") out.statePath = argv[++index] ?? "";
    else if (arg === "--log") out.logPath = argv[++index] ?? "";
  }

  return out;
}

function printHelp() {
  console.log(`dispatch-daemon.mjs

Options:
  --once       Process queue once and exit
  --dry-run    Parse queue and print planned dispatches without calling Gateway
  --verbose    Print log lines to stdout
  --runtime-dir Override runtime directory for queue/context files
  --config     Override DISPATCHER_CONFIG.json path
  --queue      Override DISPATCH_QUEUE.jsonl path
  --state      Override DISPATCH_STATE.json path
  --log        Override DISPATCHER.log path
`);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
