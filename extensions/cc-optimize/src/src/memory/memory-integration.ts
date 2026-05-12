import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export function registerMemoryIntegrations(api: OpenClawPluginApi) {
  const promptSection = [
    "## Session Context (cc-optimize)",
    "- Session tracking: active (recovery pointer enabled)",
    "- Compaction: 3-level (micro at 45%, auto at 65%, emergency at 90%)",
    "- Budget: 200K token limit with 80%/95% warning thresholds",
    "- Safety: fail-closed shell scanning, 5-mode permission matrix",
    "- Tools: 10 AI tools available (use cc_help to list)",
  ].join("\n");

  const flushPlan = {
    name: "cc-optimize-flush",
    priority: 50,
    async shouldFlush(context: { tokenCount: number; contextWindow: number }) {
      const ratio = context.contextWindow > 0
        ? context.tokenCount / context.contextWindow
        : 0;
      return ratio > 0.45;
    },
    async execute(_context: unknown) {
      api.logger.info("[cc-optimize] Memory flush triggered (context > 45%)");
    },
  };

  try {
    api.registerMemoryPromptSection?.("cc-optimize-context", async () => {
      return promptSection;
    });
  } catch {
    api.logger.debug("[cc-optimize] Memory prompt section skipped (plugin is not memory type)");
  }

  try {
    api.registerMemoryFlushPlan?.(flushPlan);
  } catch {
    api.logger.debug("[cc-optimize] Memory flush plan skipped (plugin is not memory type)");
  }

  api.logger.info("[cc-optimize] Memory integrations: prompt section + flush plan registered");
}
