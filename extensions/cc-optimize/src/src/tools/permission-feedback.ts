import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface FeedbackEntry {
  toolName: string;
  decision: "allow" | "deny" | "ask";
  userFeedback?: string;
  timestamp: number;
}

interface FeedbackStats {
  totalDecisions: number;
  allowCount: number;
  denyCount: number;
  withFeedback: number;
  commonPatterns: Record<string, number>;
}

const MAX_FEEDBACK_HISTORY = 50;

export function createPermissionFeedback(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  const history: FeedbackEntry[] = [];
  const stats: FeedbackStats = {
    totalDecisions: 0,
    allowCount: 0,
    denyCount: 0,
    withFeedback: 0,
    commonPatterns: {},
  };

  function recordDecision(toolName: string, decision: "allow" | "deny" | "ask") {
    stats.totalDecisions++;
    if (decision === "allow") stats.allowCount++;
    if (decision === "deny") stats.denyCount++;

    stats.commonPatterns[toolName] = (stats.commonPatterns[toolName] || 0) + 1;

    history.push({
      toolName,
      decision,
      timestamp: Date.now(),
    });

    if (history.length > MAX_FEEDBACK_HISTORY) {
      history.shift();
    }
  }

  function recordFeedback(toolName: string, userFeedback: string) {
    const last = history[history.length - 1];
    if (last && last.toolName === toolName) {
      last.userFeedback = userFeedback;
      stats.withFeedback++;

      api.logger.info(
        `[cc-optimize] Permission feedback: ${toolName} → "${userFeedback.slice(0, 60)}"`,
      );
    }
  }

  function getSuggestionPrompt(): string {
    const recent = history.slice(-10);

    if (recent.length === 0) return "";

    const allowTools = recent.filter((e) => e.decision === "allow").map((e) => e.toolName);
    const askTools = recent.filter((e) => e.decision === "ask").map((e) => e.toolName);
    const deniedTools = recent.filter((e) => e.decision === "deny").map((e) => e.toolName);

    const parts: string[] = [];

    if (allowTools.length > 0) {
      parts.push(`Recently allowed: ${[...new Set(allowTools)].join(", ")}`);
    }

    if (askTools.length > 0) {
      parts.push(`Required confirmation: ${[...new Set(askTools)].join(", ")}`);
    }

    if (deniedTools.length > 0) {
      parts.push(`Denied: ${[...new Set(deniedTools)].join(", ")}`);
    }

    const feedbackEntries = recent.filter((e) => e.userFeedback);
    if (feedbackEntries.length > 0) {
      parts.push(`User feedback: ${feedbackEntries.map((e) => e.userFeedback).join("; ")}`);
    }

    return parts.join("\n");
  }

  function getStats(): FeedbackStats {
    return { ...stats };
  }

  function getMostUsedTool(): string | null {
    let maxTool = "";
    let maxCount = 0;
    for (const [tool, count] of Object.entries(stats.commonPatterns)) {
      if (count > maxCount) {
        maxCount = count;
        maxTool = tool;
      }
    }
    return maxTool || null;
  }

  api.registerHook("before_tool_call", async (ctx) => {
    const toolName = (ctx as { toolName?: string }).toolName || "";
    const decision = (ctx as { metadata?: { ccPermissionDecision?: string } }).metadata?.ccPermissionDecision;

    if (toolName && decision) {
      recordDecision(toolName, decision as "allow" | "deny" | "ask");
    }

    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        ccFeedbackStats: getStats(),
      },
    };
  }, { name: "cc-optimize:feedback-before-tool" });

  api.logger.info("[cc-optimize] Permission feedback collector: tracking decisions + user feedback");

  return {
    recordDecision,
    recordFeedback,
    getSuggestionPrompt,
    getStats,
    getMostUsedTool,
    getHistory: () => [...history],
  };
}
