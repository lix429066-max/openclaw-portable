import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface SessionSnapshot {
  sessionKey: string;
  agentId: string;
  createdAt: number;
  lastActiveAt: number;
  modelPrimary: string;
  totalTurns: number;
  totalTokens: number;
  compactCount: number;
  state: "active" | "idle" | "archived";
  title?: string;
  transitions: StateTransition[];
}

interface StateTransition {
  from: string;
  to: string;
  reason: string;
  timestamp: number;
}

// OpenCode title.txt rules — for auto-generated session titles
function generateSessionTitle(firstMessage: string): string {
  const cleaned = firstMessage
    .replace(/^[@#]\S+\s*/, "")  // remove @file references
    .replace(/[^\w\s\u4e00-\u9fff-]/g, " ")  // keep words + CJK
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 6);
  let title = words.join(" ");
  if (title.length > 50) title = title.slice(0, 47) + "...";
  return title || "New session";
}

interface SessionForkOptions {
  sourceSessionKey: string;
  targetSessionKey: string;
  copyMessages: number;
  keepContextFiles: boolean;
}

const sessionSnapshots = new Map<string, SessionSnapshot>();

export function createSessionOptimizer(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  function snapshotSession(
    sessionKey: string,
    details: Partial<SessionSnapshot>,
  ): SessionSnapshot {
    const existing = sessionSnapshots.get(sessionKey);
    const snapshot: SessionSnapshot = {
      sessionKey,
      agentId: details.agentId || "main",
      createdAt: details.createdAt || Date.now(),
      lastActiveAt: details.lastActiveAt || Date.now(),
      modelPrimary: details.modelPrimary || "unknown",
      totalTurns: details.totalTurns || (existing?.totalTurns ?? 0),
      totalTokens: details.totalTokens || (existing?.totalTokens ?? 0),
      compactCount: details.compactCount || (existing?.compactCount ?? 0),
      state: details.state || "active",
    transitions: existing?.transitions ?? [],
    };
    sessionSnapshots.set(sessionKey, snapshot);
    return snapshot;
  }

  function recordTransition(
    sessionKey: string,
    from: string,
    to: string,
    reason: string,
  ) {
    const snapshot = sessionSnapshots.get(sessionKey);
    if (!snapshot) return;
    snapshot.transitions.push({ from, to, reason, timestamp: Date.now() });
    if (snapshot.transitions.length > 50) {
      snapshot.transitions.shift();
    }
  }

  function getSessionSnapshot(sessionKey: string): SessionSnapshot | undefined {
    return sessionSnapshots.get(sessionKey);
  }

  function listActiveSessions(): SessionSnapshot[] {
    return Array.from(sessionSnapshots.values())
      .filter((s) => s.state === "active")
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  function markSessionIdle(sessionKey: string) {
    const snapshot = sessionSnapshots.get(sessionKey);
    if (snapshot) {
      snapshot.state = "idle";
      sessionSnapshots.set(sessionKey, snapshot);
    }
  }

  function buildSessionResumePrompt(sessionKey: string): string {
    const snapshot = getSessionSnapshot(sessionKey);
    if (!snapshot) return "";

    return [
      `[Resuming session: ${snapshot.sessionKey}]`,
      `Agent: ${snapshot.agentId}`,
      `Model: ${snapshot.modelPrimary}`,
      `Previous turns: ${snapshot.totalTurns}, tokens: ~${snapshot.totalTokens}`,
      `Compactions: ${snapshot.compactCount}`,
      `Last active: ${new Date(snapshot.lastActiveAt).toISOString()}`,
    ].join("\n");
  }

  function getSessionStats(): { active: number; idle: number; total: number } {
    const all = Array.from(sessionSnapshots.values());
    return {
      active: all.filter((s) => s.state === "active").length,
      idle: all.filter((s) => s.state === "idle").length,
      total: all.length,
    };
  }

  api.registerHook("session_start", async (ctx)=> {
    const sessionKey = (ctx as { sessionKey?: string }).sessionKey || "agent:main:main";

    snapshotSession(sessionKey, {
      lastActiveAt: Date.now(),
      state: "active",
    });

    api.logger.debug(`[cc-optimize] Session snapshot: ${sessionKey}`);

    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        ccSessionStats: getSessionStats(),
      },
    };
  }, { name: "cc-optimize:session-snapshot:start" });

  api.registerHook("before_tool_call", async (ctx)=> {
    const sessionKey = (ctx as { sessionKey?: string }).sessionKey || "";
    if (sessionKey) {
      const snapshot = sessionSnapshots.get(sessionKey);
      if (snapshot) {
        snapshot.lastActiveAt = Date.now();
        sessionSnapshots.set(sessionKey, snapshot);
      }
    }
    return ctx;
  }, { name: "cc-optimize:session-snapshot:tool" });

  return {
    snapshotSession,
    getSessionSnapshot,
    listActiveSessions,
    markSessionIdle,
    buildSessionResumePrompt,
    getSessionStats,
    recordTransition,
  };
}
