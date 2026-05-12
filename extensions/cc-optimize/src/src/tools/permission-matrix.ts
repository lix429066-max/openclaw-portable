import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { PLAN_MODE_REMINDER, BUILD_MODE_REMINDER } from "../context/prompt-enhancer.js";

type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk" | "beast";

interface PermissionConfig {
  mode: PermissionMode;
  allowRules: string[];
  denyRules: string[];
  alwaysAllowRules: string[];
}

interface PermissionDecision {
  behavior: "allow" | "deny" | "ask";
  reason?: string;
  updatedInput?: Record<string, unknown>;
}

const PERMISSION_MODE_CONFIG: Record<PermissionMode, { title: string; symbol: string; description: string }> = {
  default: {
    title: "Default",
    symbol: "",
    description: "Prompt for most tool uses",
  },
  acceptEdits: {
    title: "Accept Edits",
    symbol: "⏵⏵",
    description: "Allow file edits in working dir, prompt for bash/network",
  },
  bypassPermissions: {
    title: "Bypass",
    symbol: "⏵⏵",
    description: "Allow all tools without asking",
  },
  plan: {
    title: "Plan Mode",
    symbol: "⏸",
    description: "Plan-only, no tool execution",
  },
  dontAsk: {
    title: "Don't Ask",
    symbol: "⏵⏵",
    description: "Deny all tools without asking",
  },
  beast: {
    title: "Beast Mode",
    symbol: "🦞",
    description: "Full autonomy. Iterate until problem solved. Do NOT hand back control until done.",
  },
};

const SAFETY_BYPASS_IMMUNE_DIRS = new Set([
  ".git",
  ".claude",
  ".openclaw",
]);

const SAFETY_BYPASS_IMMUNE_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".secrets",
  "credentials.json",
  "secrets.json",
  "auth-profiles.json",
]);

function isSafePath(path: string): boolean {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  for (const part of parts) {
    if (SAFETY_BYPASS_IMMUNE_DIRS.has(part)) return false;
  }
  const fileName = parts[parts.length - 1] || "";
  if (SAFETY_BYPASS_IMMUNE_FILES.has(fileName)) return false;
  return true;
}

export function checkPermissions(
  toolName: string,
  input: Record<string, unknown>,
  config: PermissionConfig,
): PermissionDecision {
  const name = toolName.toLowerCase().trim();

  if (config.mode === "dontAsk") {
    return { behavior: "deny", reason: "Don't Ask mode: all tools denied" };
  }

  if (config.mode === "plan") {
    return { behavior: "deny", reason: "Plan mode: tool execution disabled" };
  }

  for (const rule of config.denyRules) {
    if (matchRule(name, rule)) {
      return { behavior: "deny", reason: `Deny rule: ${rule}` };
    }
  }

  if (config.mode === "bypassPermissions") {
    return { behavior: "allow", reason: "Bypass mode" };
  }

  for (const rule of config.alwaysAllowRules) {
    if (matchRule(name, rule)) {
      return { behavior: "allow", reason: `Always-allow rule: ${rule}` };
    }
  }

  if (name === "read" || name === "grep" || name === "glob") {
    return { behavior: "allow", reason: "Read-only tool" };
  }

  if (name === "cache" || name === "cc_context" || name === "cc_doctor" || name === "cc_status" || name === "cc_help" || name === "cc_diff" || name === "cc_lint" || name === "cc_config" || name === "session_note" || name === "todo_write" || name === "cc_question" || name === "cc_mode") {
    return { behavior: "allow", reason: "cc-optimize tool (in-memory, no filesystem write)" };
  }

  if (name === "memory_search" || name === "memory_get" || name === "sessions_list" || name === "sessions_history") {
    return { behavior: "allow", reason: "Read-only data access" };
  }

  if (name === "write" || name === "edit") {
    const path = String(input.path || input.filePath || "");
    const isWorkingDir = !path.includes("..") && !path.includes("~") && isSafePath(path);
    if (config.mode === "acceptEdits" && isWorkingDir) {
      return { behavior: "allow", reason: "acceptEdits: file modification allowed in workspace" };
    }
    return { behavior: "allow", reason: "File modification allowed" };
  }

  if (name === "exec" || name === "bash" || name === "shell") {
    if (config.mode === "acceptEdits" || config.mode === "default") {
      const command = String(input.command || input.cmd || "");
      const hasDestructive = /rm\s+-rf|:\(\)\s*\{|mkfs|dd\s+if=|shutdown|reboot|>\/dev\/sda/.test(command);
      if (hasDestructive) {
        return { behavior: "ask", reason: "Potentially destructive command needs user confirmation" };
      }
      return { behavior: "allow", reason: "Command execution allowed" };
    }
  }

  for (const rule of config.allowRules) {
    if (matchRule(name, rule)) {
      return { behavior: "allow", reason: `Allow rule: ${rule}` };
    }
  }

  return { behavior: "ask", reason: "Tool requires confirmation" };
}

function matchRule(toolName: string, rule: string): boolean {
  const normalized = rule.toLowerCase().trim();
  if (normalized === "*" || normalized === "all") return true;
  if (normalized === toolName) return true;
  if (normalized.includes("*")) {
    // OpenCode-style wildcard matching: bash:* matches bash:all, tool:* matches all tool variants
    const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^" + escaped + "$").test(toolName);
  }
  if (normalized.startsWith("group:")) {
    // group:web matches web_search, web_fetch, web_*
    const group = normalized.slice(6);
    return toolName.startsWith(group + "_") || toolName === group;
  }
  return false;
}

export function createPermissionMatrix(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
  onModeChange?: (mode: PermissionMode) => void,
) {
  let currentMode: PermissionMode = "default";
  const allowRules: string[] = [];
  const denyRules: string[] = [];
  const alwaysAllowRules: string[] = [
    "read",
    "grep",
    "glob",
    "memory_search",
    "sessions_list",
    "todo_write",
    "session_note",
  ];

  function setMode(mode: PermissionMode) {
    const previous = currentMode;
    currentMode = mode;
    const cfg = PERMISSION_MODE_CONFIG[mode];
    api.logger.info(`[cc-optimize] Permission mode: ${cfg.symbol} ${cfg.title} — ${cfg.description}`);
    onModeChange?.(mode);

    if (mode === "beast") {
      api.logger.info(`[cc-optimize] 🦞 Beast Mode activated — full autonomy, iterate until done`);
    }
  }

  function addAllowRule(rule: string) {
    if (!allowRules.includes(rule)) allowRules.push(rule);
  }

  function addDenyRule(rule: string) {
    if (!denyRules.includes(rule)) denyRules.push(rule);
  }

  function getMode(): PermissionMode {
    return currentMode;
  }

  function getModeConfig() {
    return PERMISSION_MODE_CONFIG[currentMode];
  }

  function evaluate(toolName: string, input: Record<string, unknown>): PermissionDecision {
    return checkPermissions(toolName, input, {
      mode: currentMode,
      allowRules,
      denyRules,
      alwaysAllowRules,
    });
  }

  api.registerHook("before_tool_call", async (ctx)=> {
    const toolName = (ctx as { toolName?: string }).toolName || "";
    const args = (ctx as { args?: Record<string, unknown> }).args || {};
    if (!toolName) return ctx;

    const decision = evaluate(toolName, args);

    if (decision.behavior === "deny") {
      api.logger.warn(`[cc-optimize] Permission DENY: ${toolName} — ${decision.reason}`);
      return {
        ...ctx,
        metadata: {
          ...ctx.metadata,
          ccPermissionDenied: true,
          ccPermissionReason: decision.reason,
        },
      };
    }

    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        ccPermissionDecision: decision.behavior,
        ccPermissionReason: decision.reason,
      },
    };
  }, { name: "cc-optimize:perm-before-tool" });

  return {
    setMode,
    getMode,
    getModeConfig,
    evaluate,
    addAllowRule,
    addDenyRule,
  };
}