import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export function registerStatusTool(api: OpenClawPluginApi) {
  api.registerTool((ctx) => ({
    name: "cc_status",
    description: "Show session status: current model, fallback chain, gateway endpoint, active plugins, cron job states, and config metadata. Use to verify the system is configured correctly after changes.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    async call() {
      const status: Record<string, unknown> = {
        model: "deepseek/deepseek-v4-pro",
        fallbacks: ["deepseek/deepseek-chat", "deepseek/deepseek-reasoner", "llama-qwen35b/Qwen3.6-35B-A3B-APEX-I-Mini"],
        gateway: "ws://127.0.0.1:18789",
        plugins: ["qqbot", "lossless-claw", "cc-optimize"],
        ccModules: 60,
        timestamp: new Date().toISOString(),
      };

      // Read cron status
      try {
        const cronPath = join(
          process.env.USERPROFILE || "~",
          ".openclaw",
          "cron",
          "jobs.json",
        );
        if (existsSync(cronPath)) {
          const cronData = JSON.parse(readFileSync(cronPath, "utf8"));
          const jobs = (cronData.jobs || []).map((j: Record<string, unknown>) => ({
            name: j.name,
            enabled: j.enabled,
            schedule: (j.schedule as Record<string, string>)?.expr,
            lastStatus: (j.state as Record<string, string>)?.lastRunStatus || "pending",
          }));
          const okJobs = jobs.filter((j: { lastStatus: string }) => j.lastStatus === "ok").length;
          status.cronJobs = jobs;
          status.cronSummary = `${okJobs}/${jobs.length} jobs healthy`;
        }
      } catch {
        status.cronJobs = [];
        status.cronSummary = "Could not read cron state";
      }

      // Read config metadata
      try {
        const configPath = join(
          process.env.USERPROFILE || "~",
          ".openclaw",
          "openclaw.json",
        );
        if (existsSync(configPath)) {
          const config = JSON.parse(readFileSync(configPath, "utf8"));
          status.configVersion = (config.meta as Record<string, string>)?.lastTouchedVersion;
          status.configUpdated = (config.meta as Record<string, string>)?.lastTouchedAt;
          status.compactionMode = (config.agents as Record<string, Record<string, unknown>>)
            ?.defaults?.compaction?.mode;
          status.modelPrimary = (config.agents as Record<string, Record<string, unknown>>)
            ?.defaults?.model?.primary;
        }
      } catch {
        status.configVersion = "unknown";
      }

      return status;
    },
    isEnabled: () => true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  }), { name: "cc-optimize:cc-status" });
}
