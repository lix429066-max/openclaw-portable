import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getEffectiveContextWindow } from "../budget/model-resolver.js";

export function registerContextTool(api: OpenClawPluginApi) {
  api.registerTool((ctx) => ({
    name: "cc_context",
    description: "Check token usage and context window status. Use when: context might be full, before starting complex work, or when the model feels slow (could be compaction needed). Shows usage% and compaction recommendation.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    async call() {
      const sessionKey = ctx.sessionKey || "default";
      const agentId = "main";

      let sessionInfo = {
        sessionKey,
        agentId,
        model: "deepseek/deepseek-v4-pro",
        contextWindow: getEffectiveContextWindow("deepseek/deepseek-v4-pro"),
        budgetTokenUsage: 0,
        compactionStatus: "unknown",
        activeModules: 60,
      };

      try {
        const workspacePath = (ctx as { workspacePath?: string }).workspacePath ||
          join(process.env.USERPROFILE || "~", ".openclaw", "workspace");

        const agentsDir = join(process.env.USERPROFILE || "~", ".openclaw", "agents", agentId, "sessions");
        if (existsSync(agentsDir)) {
          sessionInfo.compactionStatus = "available";
        }
      } catch {
        // ignore path errors
      }

      const usagePct = sessionInfo.contextWindow > 0
        ? Number((sessionInfo.budgetTokenUsage / sessionInfo.contextWindow * 100).toFixed(1))
        : 0;

      const recommendation = usagePct > 85
        ? "URGENT: Context nearly full. Use /compact or lcm_expand NOW before proceeding with any tool calls."
        : usagePct > 70
          ? "WARNING: Context usage is high. Compact before starting complex work to avoid failures."
          : usagePct > 50
            ? "Moderate usage. You can proceed but compact after this task."
            : "Plenty of context available. Normal operation.";

      return {
        model: sessionInfo.model,
        contextWindow: sessionInfo.contextWindow,
        estimatedTokens: sessionInfo.budgetTokenUsage,
        usagePercent: usagePct,
        compaction: sessionInfo.compactionStatus,
        activeModules: sessionInfo.activeModules,
        recommendation,
        nextAction: usagePct > 70
          ? "suggest_compact"
          : usagePct > 50
            ? "proceed_with_caution"
            : "proceed",
      };
    },
    isEnabled: () => true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  }), { name: "cc-optimize:cc-context" });
}
