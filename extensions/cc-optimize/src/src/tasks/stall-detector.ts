import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface StallWatchState {
  taskId: string;
  command: string;
  stallCount: number;
  maxStallCount: number;
  lastOutputSize: number;
  checkIntervalMs: number;
  notified: boolean;
}

const STALL_CHECK_INTERVAL = 5000;
const STALL_THRESHOLD_COUNT = 9;
const ACTIVE_WATCHDOGS = new Map<string, StallWatchState>();

export function createStallDetector(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  let checkTimer: ReturnType<typeof setInterval> | null = null;

  function startWatchdog(taskId: string, command: string): void {
    if (ACTIVE_WATCHDOGS.has(taskId)) return;

    ACTIVE_WATCHDOGS.set(taskId, {
      taskId,
      command,
      stallCount: 0,
      maxStallCount: STALL_THRESHOLD_COUNT,
      lastOutputSize: 0,
      checkIntervalMs: STALL_CHECK_INTERVAL,
      notified: false,
    });

    api.logger.debug(`[cc-optimize] Stall watchdog started: ${taskId} — "${command.slice(0, 50)}"`);

    if (!checkTimer) {
      checkTimer = setInterval(runStallChecks, STALL_CHECK_INTERVAL);
    }
  }

  function stopWatchdog(taskId: string): void {
    ACTIVE_WATCHDOGS.delete(taskId);
    if (ACTIVE_WATCHDOGS.size === 0 && checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
  }

  function updateOutputSize(taskId: string, outputSize: number): void {
    const state = ACTIVE_WATCHDOGS.get(taskId);
    if (!state) return;

    if (outputSize > state.lastOutputSize) {
      state.stallCount = 0;
      state.notified = false;
    }
    state.lastOutputSize = outputSize;
  }

  function runStallChecks(): void {
    for (const [taskId, state] of ACTIVE_WATCHDOGS) {
      state.stallCount++;

      if (state.stallCount >= state.maxStallCount && !state.notified) {
        state.notified = true;
        const stallDuration = (state.stallCount * state.checkIntervalMs) / 1000;

        api.logger.warn(
          `[cc-optimize] TASK STALLED: ${taskId} — no output for ${stallDuration}s, command: "${state.command.slice(0, 60)}"`,
        );
      }
    }
  }

  function getStalledTasks(): string[] {
    return Array.from(ACTIVE_WATCHDOGS.values())
      .filter((s) => s.notified)
      .map((s) => s.taskId);
  }

  function getActiveCount(): number {
    return ACTIVE_WATCHDOGS.size;
  }

  api.registerHook("before_tool_call", async (ctx) => {
    const toolName = (ctx as { toolName?: string }).toolName?.toLowerCase() || "";
    if (toolName !== "exec" && toolName !== "bash" && toolName !== "shell") return ctx;

    const args = (ctx as { args?: Record<string, unknown> }).args || {};
    const command = String(args.command || args.cmd || "");
    const taskId = (ctx as { metadata?: { taskId?: string } }).metadata?.taskId ||
      `exec_${Date.now().toString(36)}`;

    startWatchdog(taskId, command);

    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        taskId,
      },
    };
  }, { name: "cc-optimize:stall-before-tool" });

  api.registerHook("after_tool_call", async (ctx) => {
    const toolName = (ctx as { toolName?: string }).toolName?.toLowerCase() || "";
    if (toolName !== "exec" && toolName !== "bash" && toolName !== "shell") return ctx;
    const taskId = (ctx as { metadata?: { taskId?: string } }).metadata?.taskId || "";
    if (taskId) {
      stopWatchdog(taskId);
    }
    return ctx;
  }, { name: "cc-optimize:stall-after-tool" });

  api.logger.info("[cc-optimize] Stall detector: 5s checks, 45s threshold before alert");

  return {
    startWatchdog,
    stopWatchdog,
    updateOutputSize,
    getStalledTasks,
    getActiveCount,
  };
}
