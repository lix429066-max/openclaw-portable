import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  buildCompactPrompt,
  buildIncrementalCompactPrompt,
  formatCompactSummary,
  COMPACT_PREAMBLE,
  COMPACT_TRAILER,
} from "./compact-prompt-templates.js";
import { roughTokenCount, estimateTokensForMessage, estimateTokensForMessages } from "../budget/token-estimator.js";

interface CompactionState {
  totalTokens: number;
  contextWindow: number;
  compactedCount: number;
  microCompactedCount: number;
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
  lastReactiveCheck: number;
  lastSummary: string;
  compactionHistory: Array<{
    timestamp: number;
    level: "micro" | "auto" | "emergency";
    beforeTokens: number;
    afterTokens: number;
  }>;
}

interface CompactionConfig {
  autocompactThreshold: number;
  microCompactThreshold: number;
  reactiveCompactEnabled: boolean;
  freshTailCount: number;
  collapseThreshold: number;
  tokenBudgetSafetyMargin: number;
}

// OpenCode-style compaction constants
const TOOL_OUTPUT_MAX_CHARS = 2000;
const PRUNE_PROTECTED_TOOLS = new Set(["todo_write", "session_note", "cc_context"]);
const MIN_PRESERVE_RECENT_CHARS = 2000;

function estimateTokens(text: string): number {
  return roughTokenCount(text);
}

function shouldTriggerMicroCompact(
  currentTokens: number,
  contextWindow: number,
  threshold: number,
): boolean {
  return currentTokens / contextWindow >= threshold;
}

function shouldTriggerAutoCompact(
  currentTokens: number,
  contextWindow: number,
  threshold: number,
): boolean {
  return currentTokens / contextWindow >= threshold;
}

function shouldTriggerEmergencyCollapse(
  currentTokens: number,
  contextWindow: number,
  threshold: number,
): boolean {
  return currentTokens / contextWindow >= threshold;
}

export function createCompactionManager(
  api: OpenClawPluginApi,
  config: CompactionConfig,
) {
  const state: CompactionState = {
    totalTokens: 0,
    contextWindow: 131072,
    compactedCount: 0,
    microCompactedCount: 0,
    consecutiveFailures: 0,
    maxConsecutiveFailures: 3,
    lastReactiveCheck: Date.now(),
    lastSummary: "",
    compactionHistory: [],
  };

  function syncTokens(inputTokens: number, outputTokens: number) {
    state.totalTokens += inputTokens + outputTokens;
  }

  function updateContextWindow(window: number) {
    state.contextWindow = window;
  }

  function getCompactionLevel(): "none" | "micro" | "auto" | "emergency" {
    const ratio = state.totalTokens / state.contextWindow;
    if (shouldTriggerEmergencyCollapse(state.totalTokens, state.contextWindow, config.collapseThreshold)) {
      return "emergency";
    }
    if (shouldTriggerAutoCompact(state.totalTokens, state.contextWindow, config.autocompactThreshold)) {
      return "auto";
    }
    if (shouldTriggerMicroCompact(state.totalTokens, state.contextWindow, config.microCompactThreshold)) {
      return "micro";
    }
    return "none";
  }

  function recordCompaction(level: "micro" | "auto" | "emergency", beforeTokens: number, afterTokens: number) {
    state.compactionHistory.push({
      timestamp: Date.now(),
      level,
      beforeTokens,
      afterTokens,
    });
    if (state.compactionHistory.length > 50) {
      state.compactionHistory.shift();
    }

    if (level === "micro") state.microCompactedCount++;
    else state.compactedCount++;
  }

  function getCompactionStats() {
    const recent = state.compactionHistory.slice(-10);
    const totalSavings = recent.reduce((sum, h) => sum + (h.beforeTokens - h.afterTokens), 0);
    return {
      compactedCount: state.compactedCount,
      microCompactedCount: state.microCompactedCount,
      currentTokens: state.totalTokens,
      contextWindow: state.contextWindow,
      compactionRatio: state.contextWindow > 0 ? state.totalTokens / state.contextWindow : 0,
      recentHistory: recent,
      totalRecentSavings: totalSavings,
      preCompactSnapshot: state.lastSummary,
    };
  }

  function takePreCompactSnapshot(): string {
    const snapshot = JSON.stringify({
      tokens: state.totalTokens,
      window: state.contextWindow,
      ratio: state.contextWindow > 0 ? (state.totalTokens / state.contextWindow).toFixed(2) : "0",
      compactedSoFar: state.compactedCount,
      timestamp: new Date().toISOString(),
    });
    state.lastSummary = snapshot;
    return snapshot;
  }

  function verifyPostCompact(expectedReduction: number): { ok: boolean; actualRatio: number } {
    const actualRatio = state.contextWindow > 0 ? state.totalTokens / state.contextWindow : 0;
    return {
      ok: state.totalTokens > 0,
      actualRatio,
    };
  }

  function buildCompactionStrategy(
    messages: Array<{ role: string; content: unknown }>,
    level: "micro" | "auto" | "emergency",
  ): Array<{ role: string; content: unknown }> {
    const freshTail = Math.max(2, config.freshTailCount);

    if (level === "micro") {
      const keep = messages.slice(-freshTail);
      const compact = messages.slice(0, -freshTail);
      if (compact.length === 0) return messages;

      const summaryContent = compact
        .map((m) => {
          const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
          if (content.length > 200) return `[${m.role}] ${content.slice(0, 200)}...`;
          return `[${m.role}] ${content}`;
        })
        .join("\n");

      const summaryTokens = estimateTokens(summaryContent);
      api.logger.debug(
        `[cc-optimize] Micro-compact: ${compact.length} messages → ${summaryTokens} token summary + ${keep.length} tail`,
      );
      recordCompaction("micro", state.totalTokens, summaryTokens + keep.length * 100);

      return [
        {
          role: "system",
          content: `[Micro-compacted summary of ${compact.length} earlier messages]\n${summaryContent}`,
        },
        ...keep,
      ];
    }

    if (level === "auto") {
      const keep = messages.slice(-freshTail);
      const compact = messages.slice(0, -freshTail);
      if (compact.length === 0) return messages;

      const summaryByRole: Record<string, string[]> = {};
      for (const m of compact) {
        const role = m.role;
        if (!summaryByRole[role]) summaryByRole[role] = [];
        const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
        summaryByRole[role].push(content);
      }

      let summary = "[Auto-compacted conversation summary]\n\n";
      for (const [role, contents] of Object.entries(summaryByRole)) {
        const merged = contents.join(" ");
        const truncated = merged.length > 1000 ? merged.slice(0, 1000) + "..." : merged;
        summary += `**${role} messages (${contents.length}):**\n${truncated}\n\n`;
      }

      const afterTokens = estimateTokens(summary) + keep.length * 100;
      api.logger.info(
        `[cc-optimize] Auto-compact: ${compact.length} messages → ${estimateTokens(summary)} token summary`,
      );
      recordCompaction("auto", state.totalTokens, afterTokens);

      return [
        {
          role: "system",
          content: summary,
        },
        ...keep,
      ];
    }

    if (level === "emergency") {
      const keep = messages.slice(-4);
      api.logger.warn(
        `[cc-optimize] Emergency collapse: ${messages.length} messages → keeping last ${keep.length}`,
      );
      recordCompaction("emergency", state.totalTokens, keep.length * 200);
      return keep;
    }

    return messages;
  }

  api.registerHook("before_tool_call", async (ctx)=> {
    const level = getCompactionLevel();
    if (level === "none") return ctx;

    api.logger.debug(
      `[cc-optimize] Compaction level: ${level} (tokens: ${state.totalTokens}/${state.contextWindow}, ratio: ${(state.totalTokens / state.contextWindow * 100).toFixed(1)}%)`,
    );

    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        ccCompactLevel: level,
      },
    };
  }, { name: "cc-optimize:compact-before-tool" });

  return {
    updateContextWindow,
    syncTokens,
    getCompactionLevel,
    buildCompactionStrategy,
    getCompactionStats,
    recordCompaction,
    estimateTokens,
    takePreCompactSnapshot,
    verifyPostCompact,
  };
}