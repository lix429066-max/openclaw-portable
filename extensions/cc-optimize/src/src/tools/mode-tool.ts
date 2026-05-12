import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

type AgentMode = "plan" | "build" | "beast";

export function registerModeTool(api: OpenClawPluginApi, setMode: (mode: "plan" | "beast" | "build") => void) {
  api.registerTool({
    name: "cc_mode",
    description:
      "Switch the agent's operational mode. plan=read-only research only. build=normal with file changes. beast=full autonomy, iterate until done. Use beast for complex multi-step tasks, plan before implementation.",
    parameters: {
      type: "object" as const,
      properties: {
        mode: { type: "string", enum: ["plan", "build", "beast"] },
        reason: { type: "string" },
      },
      required: ["mode"],
    },
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const mode = (params.mode as AgentMode) || "build";
      const reason = (params.reason as string) || "";
      setMode(mode);
      const descriptions: Record<AgentMode, string> = {
        plan: "Plan mode: read-only. Research, search, read files. No edits or tool execution.",
        build: "Build mode: normal operation. File changes, shell commands allowed.",
        beast: "Beast mode: full autonomy. Keep iterating until problem solved. Test after each change.",
      };
      api.logger.info(`[cc-optimize] Mode switch: → ${mode} (reason: ${reason || "user requested"})`);
      return {
        switched: true,
        mode,
        description: descriptions[mode],
        rules: mode === "plan"
          ? ["READ ONLY — no edits, no shell, no file creation"]
          : mode === "beast"
            ? ["FULL AUTONOMY — iterate until done", "Test after each change", "Do NOT hand back control until solved"]
            : ["Normal operation", "Read files before editing", "Verify after writing"],
      };
    },
    isEnabled: () => true,
    isReadOnly: () => false,
    isConcurrencySafe: () => false,
  }, { name: "cc-optimize:cc-mode" });
}
