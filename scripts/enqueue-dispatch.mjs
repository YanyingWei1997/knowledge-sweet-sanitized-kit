#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const knowledgeDir = path.dirname(__filename);

const args = parseArgs(process.argv.slice(2));
const runtimePaths = resolveRuntimePaths(args);

if (args.help) {
  printHelp();
  process.exit(0);
}

const config = readJson(runtimePaths.configPath, {});
const queuePath = runtimePaths.queuePath;
const taskBoardPath = runtimePaths.taskBoardPath;
const handoffLogPath = runtimePaths.handoffLogPath;
const decisionsPath = runtimePaths.decisionsPath;
const activeContextPath = runtimePaths.activeContextPath;
const sharedMemoryPath = runtimePaths.sharedMemoryPath;

ensureFile(queuePath, "# Append one JSON object per line.\n");
ensureFile(taskBoardPath, "# TASK_BOARD.md\n\n");
ensureFile(handoffLogPath, "# HANDOFF_LOG.md\n\n");
ensureFile(decisionsPath, "# DECISIONS.md\n\n");
ensureFile(sharedMemoryPath, "# SHARED_MEMORY.md\n\n");
ensureJsonFile(activeContextPath, {
  activeTaskId: "",
  tasks: {}
});

const title = requiredNonEmpty(args.title, "--title");
const agentId = requiredNonEmpty(args.agent, "--agent");
const brief = requiredNonEmpty(args.brief, "--brief");

const now = new Date();
const sourceAgentId = args.sourceAgentId || "main";
const taskId = args.taskId || `task-${formatCompact(now)}`;
const activeContext = readJson(activeContextPath, { activeTaskId: "", tasks: {} });
const currentTask = normalizeTask(activeContext.tasks?.[taskId], {
  taskId,
  title,
  maxSteps: readPositiveInt(args.maxSteps, 8),
  maxRevisitsPerAgent: readPositiveInt(args.maxRevisitsPerAgent, 2)
});

const nextRouteStep = currentTask.route.length + 1;
const nextRevisits = {
  ...currentTask.revisits,
  [agentId]: (currentTask.revisits[agentId] ?? 0) + 1
};

let effectiveAgentId = agentId;
let effectiveBrief = brief;
let rerouteReason = "";

if (nextRouteStep > currentTask.loopGuard.maxSteps || nextRevisits[agentId] > currentTask.loopGuard.maxRevisitsPerAgent) {
  effectiveAgentId = "main";
  rerouteReason = `loop-guard: steps=${nextRouteStep}, revisits(${agentId})=${nextRevisits[agentId]}`;
  effectiveBrief = `请接管并复核当前链路。原目标机器人=${agentId}；原因=${rerouteReason}；原任务=${brief}`;
  nextRevisits.main = (nextRevisits.main ?? 0) + 1;
}

const entry = {
  id: args.id || `dispatch-${formatCompact(now)}-${crypto.randomUUID().slice(0, 8)}`,
  createdAt: now.toISOString(),
  sourceAgentId,
  taskId,
  title,
  groupId: args.groupId || config.defaultGroupId,
  summary: args.summary || "",
  contextPaths: args.path,
  constraints: args.constraint,
  tasks: [
    {
      agentId: effectiveAgentId,
      brief: effectiveBrief,
      output: args.output || "",
      contextPaths: args.path,
      constraints: args.constraint
    }
  ]
};

fs.appendFileSync(queuePath, `${JSON.stringify(entry, null, 0)}\n`, "utf8");

const stamp = formatLocal(now);
const boardLine = `- [queued] ${stamp} | ${taskId} | ${title} | ${sourceAgentId} → ${effectiveAgentId} | ${truncateOneLine(effectiveBrief)}\n`;
const handoffLine = `- ${stamp} | ${sourceAgentId} → ${effectiveAgentId} | ${truncateOneLine(effectiveBrief)}${rerouteReason ? ` | ${rerouteReason}` : ""}\n`;
const memoryBlock = buildSharedMemoryBlock({
  stamp,
  taskId,
  title,
  sourceAgentId,
  effectiveAgentId,
  effectiveBrief,
  args,
  rerouteReason
});
fs.appendFileSync(taskBoardPath, boardLine, "utf8");
fs.appendFileSync(handoffLogPath, handoffLine, "utf8");
fs.appendFileSync(sharedMemoryPath, memoryBlock, "utf8");
for (const decision of args.decision) {
  fs.appendFileSync(decisionsPath, `- ${stamp} | ${taskId} | ${decision}\n`, "utf8");
}

const updatedTask = {
  taskId,
  title,
  status: effectiveAgentId === "main" && rerouteReason ? "rerouted_to_main" : "queued",
  owner: sourceAgentId,
  lastAgent: sourceAgentId,
  nextAgent: effectiveAgentId,
  updatedAt: now.toISOString(),
  summary: pickNonEmpty(args.summary, currentTask.summary),
  contextPaths: mergeUnique(currentTask.contextPaths, args.path),
  constraints: mergeUnique(currentTask.constraints, args.constraint),
  facts: mergeUnique(currentTask.facts, args.fact).slice(-8),
  decisions: mergeUnique(currentTask.decisions, args.decision).slice(-8),
  openQuestions: mergeUnique(currentTask.openQuestions, args.question).slice(-8),
  route: [
    ...currentTask.route,
    {
      step: nextRouteStep,
      at: now.toISOString(),
      from: sourceAgentId,
      to: effectiveAgentId,
      requestedTo: agentId,
      reason: args.reason || "",
      brief: truncateOneLine(effectiveBrief),
      rerouteReason
    }
  ].slice(-16),
  revisits: effectiveAgentId === agentId ? nextRevisits : {
    ...nextRevisits,
    [effectiveAgentId]: (nextRevisits[effectiveAgentId] ?? 0) + (effectiveAgentId === sourceAgentId ? 0 : 1)
  },
  loopGuard: {
    maxSteps: currentTask.loopGuard.maxSteps,
    maxRevisitsPerAgent: currentTask.loopGuard.maxRevisitsPerAgent
  }
};

activeContext.activeTaskId = taskId;
activeContext.tasks = trimTasksMap({
  ...(activeContext.tasks ?? {}),
  [taskId]: updatedTask
}, 20);
fs.writeFileSync(activeContextPath, `${JSON.stringify(activeContext, null, 2)}\n`, "utf8");

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      id: entry.id,
      taskId,
      agentId: effectiveAgentId,
      requestedAgentId: agentId,
      sourceAgentId,
      title,
      groupId: entry.groupId,
      queuePath,
      runtimeDir: runtimePaths.runtimeDir,
      rerouteReason
    },
    null,
    2
  )
);
process.stdout.write("\n");

function parseArgs(argv) {
  const out = {
    path: [],
    constraint: [],
    fact: [],
    decision: [],
    question: [],
    runtimeDir: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    switch (token) {
      case "--help":
      case "-h":
        out.help = true;
        break;
      case "--runtime-dir":
        out.runtimeDir = argv[++index];
        break;
      case "--id":
        out.id = argv[++index];
        break;
      case "--title":
        out.title = argv[++index];
        break;
      case "--agent":
        out.agent = argv[++index];
        break;
      case "--brief":
        out.brief = argv[++index];
        break;
      case "--output":
        out.output = argv[++index];
        break;
      case "--group-id":
        out.groupId = argv[++index];
        break;
      case "--summary":
        out.summary = argv[++index];
        break;
      case "--source-agent-id":
        out.sourceAgentId = argv[++index];
        break;
      case "--task-id":
        out.taskId = argv[++index];
        break;
      case "--reason":
        out.reason = argv[++index];
        break;
      case "--fact":
        out.fact.push(argv[++index]);
        break;
      case "--decision":
        out.decision.push(argv[++index]);
        break;
      case "--question":
        out.question.push(argv[++index]);
        break;
      case "--max-steps":
        out.maxSteps = Number(argv[++index]);
        break;
      case "--max-revisits":
        out.maxRevisitsPerAgent = Number(argv[++index]);
        break;
      case "--path":
        out.path.push(argv[++index]);
        break;
      case "--constraint":
        out.constraint.push(argv[++index]);
        break;
      default:
        throw new Error(`unknown argument: ${token}`);
    }
  }

  return out;
}

function printHelp() {
  console.log(`Usage:
  node knowledge-sweet/enqueue-dispatch.mjs \\
    --agent foam \\
    --title "评审 Prompt 逻辑复核" \\
    --brief "检查评分逻辑、权重、输出格式" \\
    --output "问题清单+修改建议" \\
    --path "knowledge-sweet/prompts/毕业论文主审评审Prompt.md"

Options:
  --runtime-dir <dir>    use a dedicated runtime directory for queue/context files
  --agent <id>            downstream agent id, e.g. candy / budding / foam / cheese
  --title <text>          dispatch title
  --brief <text>          task brief for the downstream agent
  --output <text>         expected output
  --group-id <chat_id>    override default group id
  --summary <text>        shared summary
  --path <file>           repeatable shared path
  --constraint <text>     repeatable constraint
  --fact <text>           repeatable task fact for shared context
  --decision <text>       repeatable decision note for shared context
  --question <text>       repeatable open question for shared context
  --task-id <id>          stable task id for multi-step relay
  --reason <text>         relay reason
  --max-steps <n>         loop guard max steps (default: 8)
  --max-revisits <n>      loop guard max revisits per agent (default: 2)
  --source-agent-id <id>  source agent id (default: main)
  --id <text>             custom dispatch id
  --help                  show this help
`);
}

function resolveRuntimePaths(cliArgs) {
  const runtimeDir = path.resolve(cliArgs.runtimeDir || knowledgeDir);
  return {
    runtimeDir,
    configPath: path.join(runtimeDir, "DISPATCHER_CONFIG.json"),
    queuePath: path.join(runtimeDir, "DISPATCH_QUEUE.jsonl"),
    taskBoardPath: path.join(runtimeDir, "TASK_BOARD.md"),
    handoffLogPath: path.join(runtimeDir, "HANDOFF_LOG.md"),
    decisionsPath: path.join(runtimeDir, "DECISIONS.md"),
    activeContextPath: path.join(runtimeDir, "ACTIVE_CONTEXT.json"),
    sharedMemoryPath: path.join(runtimeDir, "SHARED_MEMORY.md")
  };
}

function buildSharedMemoryBlock({ stamp, taskId, title, sourceAgentId, effectiveAgentId, effectiveBrief, args, rerouteReason }) {
  const lines = [
    `## ${stamp} | ${taskId}`,
    `- title: ${title}`,
    `- route: ${sourceAgentId} -> ${effectiveAgentId}`,
    `- brief: ${truncateOneLine(effectiveBrief)}`
  ];

  if (rerouteReason) lines.push(`- reroute: ${rerouteReason}`);
  if (args.summary) lines.push(`- summary: ${args.summary.trim()}`);

  const appendList = (label, values) => {
    if (!Array.isArray(values) || values.length === 0) return;
    lines.push(`- ${label}:`);
    values
      .map((value) => String(value).trim())
      .filter(Boolean)
      .forEach((value) => lines.push(`  - ${value}`));
  };

  appendList("context_paths", args.path);
  appendList("constraints", args.constraint);
  appendList("facts", args.fact);
  appendList("decisions", args.decision);
  appendList("open_questions", args.question);

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function requiredNonEmpty(value, label) {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`missing required argument ${label}`);
}

function ensureFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, fallback, "utf8");
  }
}

function ensureJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeTask(task, fallback) {
  const safe = task && typeof task === "object" ? task : {};
  return {
    taskId: safe.taskId || fallback.taskId,
    title: safe.title || fallback.title,
    status: safe.status || "queued",
    owner: safe.owner || "main",
    lastAgent: safe.lastAgent || "main",
    nextAgent: safe.nextAgent || "",
    updatedAt: safe.updatedAt || "",
    summary: typeof safe.summary === "string" ? safe.summary : "",
    contextPaths: Array.isArray(safe.contextPaths) ? safe.contextPaths : [],
    constraints: Array.isArray(safe.constraints) ? safe.constraints : [],
    facts: Array.isArray(safe.facts) ? safe.facts : [],
    decisions: Array.isArray(safe.decisions) ? safe.decisions : [],
    openQuestions: Array.isArray(safe.openQuestions) ? safe.openQuestions : [],
    route: Array.isArray(safe.route) ? safe.route : [],
    revisits: safe.revisits && typeof safe.revisits === "object" ? safe.revisits : {},
    loopGuard: {
      maxSteps: readPositiveInt(safe.loopGuard?.maxSteps, fallback.maxSteps),
      maxRevisitsPerAgent: readPositiveInt(safe.loopGuard?.maxRevisitsPerAgent, fallback.maxRevisitsPerAgent)
    }
  };
}

function readPositiveInt(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.round(value);
}

function mergeUnique(left, right) {
  const merged = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]
    .map((value) => String(value).trim())
    .filter(Boolean);
  return [...new Set(merged)];
}

function pickNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function trimTasksMap(tasks, maxEntries) {
  const entries = Object.entries(tasks ?? {});
  if (entries.length <= maxEntries) return tasks;
  const trimmed = {};
  entries
    .sort((left, right) => String(right[1]?.updatedAt ?? "").localeCompare(String(left[1]?.updatedAt ?? "")))
    .slice(0, maxEntries)
    .forEach(([key, value]) => {
      trimmed[key] = value;
    });
  return trimmed;
}

function truncateOneLine(value) {
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= 80) return text;
  return `${text.slice(0, 77)}...`;
}

function formatCompact(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}${second}`;
}

function formatLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}
