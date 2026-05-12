import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export function registerConfigTool(api: OpenClawPluginApi) {
  api.registerTool({
    name: "cc_config",
    description: "Show cc-optimize plugin configuration. Use to check which optimization modules are active, compaction thresholds, and available tools. Read-only diagnostic.",
    parameters: { type: "object" as const, properties: {} },
    async execute() {
      const config = api.pluginConfig || {};

      const enabled = typeof config === "object" && config !== null
        ? Object.entries(config as Record<string, unknown>)
            .filter(([k, v]) => typeof v === "boolean" && v === true)
            .map(([k]) => k)
        : [];

      return {
        plugin: "cc-optimize",
        version: "1.0.0",
        enabledFeatures: enabled,
        activeCount: enabled.length,
        compaction: {
          auto: config && typeof config === "object" ? (config as Record<string, number>).autocompactThreshold : 0.65,
          micro: config && typeof config === "object" ? (config as Record<string, number>).microCompactThreshold : 0.45,
          emergency: config && typeof config === "object" ? (config as Record<string, number>).collapseThreshold : 0.9,
        },
        safety: {
          shellSafety: true,
          permissionMatrix: true,
          stallDetector: true,
          sessionRecovery: true,
        },
        tools: [
          "todo_write",
          "session_note",
          "cc_context",
          "cc_doctor",
          "cc_status",
          "cc_help",
          "cc_diff",
          "cc_lint",
          "cc_config",
          "cache",
        ],
        hooks: 46,
        modules: 60,
      };
    },
    isEnabled: () => true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  }, { name: "cc-optimize:cc-config" });
}
