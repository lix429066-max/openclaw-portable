import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface HookTask {
  name: string;
  priority: number;
  task: () => Promise<void>;
}

const hookTasks: HookTask[] = [];

export function createParallelHookRunner(
  api: OpenClawPluginApi,
  _config: { parallelHooks: boolean },
) {
  const runInParallel = async (tasks: HookTask[]): Promise<{ name: string; ok: boolean; durationMs: number; error?: string }[]> => {
    const startTime = Date.now();
    const sorted = [...tasks].sort((a, b) => b.priority - a.priority);

    const results = await Promise.allSettled(
      sorted.map(async (task) => {
        const taskStart = Date.now();
        try {
          await task.task();
          return { name: task.name, ok: true, durationMs: Date.now() - taskStart };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { name: task.name, ok: false, durationMs: Date.now() - taskStart, error: msg };
        }
      }),
    );

    const totalMs = Date.now() - startTime;
    const outcomes = results.map((r) =>
      r.status === "fulfilled" ? r.value : { name: "unknown", ok: false, durationMs: 0, error: String(r.reason) },
    );

    api.logger.info(
      `[cc-optimize] Parallel hooks completed: ${outcomes.filter((o) => o.ok).length}/${outcomes.length} OK in ${totalMs}ms`,
    );

    for (const outcome of outcomes) {
      if (!outcome.ok) {
        api.logger.warn(`[cc-optimize] Hook "${outcome.name}" failed: ${outcome.error}`);
      } else {
        api.logger.debug(`[cc-optimize] Hook "${outcome.name}" OK (${outcome.durationMs}ms)`);
      }
    }

    return outcomes;
  };

  const registerHook = (name: string, priority: number, task: () => Promise<void>) => {
    hookTasks.push({ name, priority, task });
  };

  api.registerHook("session_start", async (_ctx) => {
    if (hookTasks.length === 0) return _ctx;

    api.logger.info(`[cc-optimize] Running ${hookTasks.length} hooks in parallel...`);
    const results = await runInParallel(hookTasks);

    return {
      ..._ctx,
      metadata: {
        ..._ctx.metadata,
        ccParallelHooks: results,
        ccUserContext: hookState.get("userContext")?.toString().slice(0, 200),
        ccGitBranch: hookState.get("gitBranch"),
        ccSystemInfo: hookState.get("systemInfo"),
      },
    };
  }, { name: "cc-optimize:parallel-session-start" });

  type HookState = Map<string, unknown>;
  const hookState: HookState = new Map();

  registerHook("prefetch-user-context", 10, async () => {
    const home = process.env.USERPROFILE || process.env.HOME || "~";
    const userPath = `${home}/.openclaw/workspace/USER.md`;
    try {
      const { existsSync, readFileSync } = await import("node:fs");
      if (existsSync(userPath)) {
        const content = readFileSync(userPath, "utf8");
        hookState.set("userContext", content.slice(0, 2000));
        api.logger.debug(`[cc-optimize] User context prefetched (${content.length} chars)`);
      }
    } catch {
      api.logger.debug("[cc-optimize] User context unavailable");
    }
  });

  registerHook("prefetch-git-context", 8, async () => {
    const cwd = process.cwd();
    try {
      const { existsSync, readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const headPath = join(cwd, ".git", "HEAD");
      if (existsSync(headPath)) {
        const head = readFileSync(headPath, "utf8").trim();
        const branch = head.startsWith("ref: refs/heads/") ? head.slice(16) : head.slice(0, 8);
        hookState.set("gitBranch", branch);
        api.logger.debug(`[cc-optimize] Git context prefetched: branch=${branch}`);
      }
    } catch {
      api.logger.debug("[cc-optimize] Git context unavailable");
    }
  });

  registerHook("prefetch-system-info", 5, async () => {
    const info = {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cwd: process.cwd(),
    };
    hookState.set("systemInfo", info);
    api.logger.debug(`[cc-optimize] System info prefetched: ${info.platform}/${info.arch}`);
  });

  return {
    runInParallel,
    registerHook,
    hookState,
  };
}