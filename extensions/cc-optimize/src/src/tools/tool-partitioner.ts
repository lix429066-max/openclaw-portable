import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  id: string;
}

interface ToolDef {
  name: string;
  isConcurrencySafe: (input: Record<string, unknown>) => boolean;
  isReadOnly?: boolean;
}

interface Batch {
  isConcurrencySafe: boolean;
  calls: ToolCall[];
}

const DEFAULT_MAX_CONCURRENCY = 10;

const CONCURRENCY_SAFE_TOOLS = new Set([
  "read",
  "grep",
  "glob",
  "web_search",
  "web_fetch",
  "x_search",
  "memory_search",
  "memory_get",
  "sessions_list",
  "sessions_history",
  "status",
  "agents_list",
  // LCM tools (lossless context management — all read-only)
  "lcm_grep",
  "lcm_describe",
  "lcm_expand",
  // cc-optimize diagnostic tools (read-only)
  "cc_context",
  "cc_doctor",
  "cc_status",
  "cc_help",
  "cc_config",
  "cc_diff",
  "cc_lint",
]);

const DESTRUCTIVE_PATTERNS = new Set([
  "rm ",
  "rmdir",
  "del ",
  "delete",
  "drop table",
  "truncate",
  "format ",
  "mkfs",
  "dd if=",
  "shutdown",
  "reboot",
  ":(){ :|:& };:",
]);

function isExecCommandDestructive(input: Record<string, unknown>): boolean {
  const command = String(input.command || input.cmd || "");
  const lower = command.toLowerCase();
  return Array.from(DESTRUCTIVE_PATTERNS).some((p) => lower.includes(p));
}

function isWriteOverwrite(input: Record<string, unknown>): boolean {
  const path = String(input.path || input.filePath || "");
  return !!path;
}

export function isToolConcurrencySafe(toolName: string, input: Record<string, unknown>): boolean {
  const name = toolName.toLowerCase().trim();

  if (CONCURRENCY_SAFE_TOOLS.has(name)) return true;

  if (name === "exec" || name === "bash" || name === "shell") {
    return !isExecCommandDestructive(input);
  }

  if (name === "write") {
    return false;
  }

  if (name === "edit") {
    return false;
  }

  return false;
}

export function partitionToolCalls(
  toolCalls: ToolCall[],
  maxConcurrency: number = DEFAULT_MAX_CONCURRENCY,
): Batch[] {
  if (toolCalls.length === 0) return [];

  const batches: Batch[] = [];

  for (const call of toolCalls) {
    const isSafe = isToolConcurrencySafe(call.name, call.input);
    const lastBatch = batches[batches.length - 1];

    if (isSafe && lastBatch?.isConcurrencySafe) {
      lastBatch.calls.push(call);
    } else {
      batches.push({ isConcurrencySafe: isSafe, calls: [call] });
    }
  }

  for (const batch of batches) {
    if (batch.isConcurrencySafe && batch.calls.length > maxConcurrency) {
      const original = [...batch.calls];
      batch.calls = original.slice(0, maxConcurrency);
      batches.splice(batches.indexOf(batch) + 1, 0, ...chunkArray(original.slice(maxConcurrency), maxConcurrency).map(calls => ({
        isConcurrencySafe: true,
        calls,
      })));
    }
  }

  return batches;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function createToolPartitioner(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  let maxConcurrency = DEFAULT_MAX_CONCURRENCY;

  function setMaxConcurrency(n: number) {
    maxConcurrency = Math.max(1, Math.min(20, n));
  }

  api.registerHook("before_tool_call", async (ctx)=> {
    const toolName = (ctx as { toolName?: string }).toolName || "";
    const args = (ctx as { args?: Record<string, unknown> }).args || {};

    if (toolName) {
      const isSafe = isToolConcurrencySafe(toolName, args);
      api.logger.debug(
        `[cc-optimize] Tool partition: ${toolName} → ${isSafe ? "concurrencySafe" : "serial"}`,
      );

      return {
        ...ctx,
        metadata: {
          ...ctx.metadata,
          ccConcurrencySafe: isSafe,
          ccMaxConcurrency: maxConcurrency,
        },
      };
    }
    return ctx;
  }, { name: "cc-optimize:partition-before-tool" });

  return {
    partitionToolCalls,
    isToolConcurrencySafe,
    setMaxConcurrency,
    getMaxConcurrency: () => maxConcurrency,
  };
}