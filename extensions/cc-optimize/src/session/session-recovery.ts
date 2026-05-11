import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface SessionPointer {
  sessionId: string;
  sessionKey: string;
  agentId: string;
  model: string;
  startedAt: number;
  lastActiveAt: number;
  turnCount: number;
  tokenCount: number;
  compactCount: number;
  state: "active" | "crashed" | "recovered";
}

const POINTER_FILE = "session-pointer.json";

export function createSessionRecovery(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  let pointerPath = "";
  let activePointer: SessionPointer | null = null;

  function setPointerPath(basePath: string) {
    pointerPath = join(basePath, POINTER_FILE);
  }

  function writePointer(pointer: SessionPointer) {
    if (!pointerPath) return;
    try {
      writeFileSync(pointerPath, JSON.stringify(pointer, null, 2), "utf8");
    } catch (err) {
      api.logger.warn(`[cc-optimize] Failed to write session pointer: ${err instanceof Error ? err.message : err}`);
    }
  }

  function readPointer(): SessionPointer | null {
    if (!pointerPath || !existsSync(pointerPath)) return null;
    try {
      const raw = readFileSync(pointerPath, "utf8");
      return JSON.parse(raw) as SessionPointer;
    } catch {
      return null;
    }
  }

  function createSessionPointer(
    sessionKey: string,
    agentId: string,
    model: string,
  ): SessionPointer {
    const pointer: SessionPointer = {
      sessionId: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      sessionKey,
      agentId,
      model,
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
      turnCount: 0,
      tokenCount: 0,
      compactCount: 0,
      state: "active",
    };
    activePointer = pointer;
    writePointer(pointer);
    api.logger.info(`[cc-optimize] Session pointer created: ${pointer.sessionId}`);
    return pointer;
  }

  function updatePointer(updates: Partial<SessionPointer>) {
    if (!activePointer) return;
    activePointer = { ...activePointer, ...updates, lastActiveAt: Date.now() };
    writePointer(activePointer);
  }

  function markCrashed() {
    if (!activePointer) return;
    activePointer.state = "crashed";
    writePointer(activePointer);
  }

  function recoverPointer(): SessionPointer | null {
    const saved = readPointer();
    if (!saved) return null;

    if (saved.state === "active") {
      const idleTime = Date.now() - saved.lastActiveAt;
      if (idleTime > 300_000) {
        saved.state = "crashed";
      }
    }

    activePointer = saved;

    if (saved.state === "crashed") {
      api.logger.warn(
        `[cc-optimize] Recovered from crash: session=${saved.sessionId}, turns=${saved.turnCount}, tokens=${saved.tokenCount}`,
      );
      saved.state = "recovered";
      writePointer(saved);
      return saved;
    }

    return saved;
  }

  function getResumePrompt(): string {
    if (!activePointer || activePointer.state !== "recovered") return "";

    return [
      `[Session recovery: ${activePointer.sessionId}]`,
      `Agent: ${activePointer.agentId}`,
      `Model: ${activePointer.model}`,
      `Previous turns: ${activePointer.turnCount}, tokens: ~${activePointer.tokenCount}`,
      `Last active: ${new Date(activePointer.lastActiveAt).toISOString()}`,
      "The previous session was interrupted. Continuing from where we left off.",
    ].join("\n");
  }

  function clearPointer() {
    activePointer = null;
    if (pointerPath && existsSync(pointerPath)) {
      try {
        const { unlinkSync } = require("node:fs");
        unlinkSync(pointerPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  api.registerHook("session_start", async (ctx)=> {
    const sessionKey = (ctx as { sessionKey?: string }).sessionKey || "agent:main:main";
    const agentId = "main";

    setPointerPath(api.resolvePath("."));
    const recovered = recoverPointer();

    if (recovered) {
      api.logger.info(`[cc-optimize] Session recovery: ${recovered.sessionId} (${recovered.turnCount} turns)`);
    } else {
      createSessionPointer(sessionKey, agentId, "deepseek/deepseek-v4-pro");
    }

    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        ccSessionPointer: activePointer,
        ccRecoveryPrompt: recovered ? getResumePrompt() : "",
      },
    };
  }, { name: "cc-optimize:recovery-session:start" });

  api.registerHook("before_tool_call", async (ctx)=> {
    if (activePointer) {
      updatePointer({ turnCount: activePointer.turnCount + 1 });
    }
    return ctx;
  }, { name: "cc-optimize:recovery-session:tool" });

  return {
    createSessionPointer,
    updatePointer,
    recoverPointer,
    getResumePrompt,
    clearPointer,
    getActivePointer: () => activePointer,
  };
}