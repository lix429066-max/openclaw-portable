import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export function registerHelpTool(api: OpenClawPluginApi) {
  api.registerTool({
    name: "cc_help",
    description: "List all available cc-optimize tools and their descriptions. Use this to discover what tools you have.",
    parameters: { type: "object" as const, properties: {} },
    async execute() {
      return {
        tools: [
          {
            name: "todo_write",
            description: "Create and manage a structured task list (pending/in_progress/completed/cancelled, high/med/low). Full-list-replace; items matched by content.",
            category: "planning",
            example: 'todo_write(todos: [{content: "Fix null check", status: "in_progress", priority: "high"}])',
          },
          {
            name: "cc_mode",
            description: "Switch operational mode: plan (read-only research), build (normal), beast (full autonomy — iterate until done).",
            category: "planning",
            example: 'cc_mode(mode: "beast", reason: "multi-file refactor needs full autonomy")',
          },
          {
            name: "cc_question",
            description: "Ask user a structured question with predefined options. Use to clarify requirements or confirm decisions.",
            category: "planning",
            example: 'cc_question(question: "Which approach?", header: "Approach", options: [{label:"A", description:"..."}])',
          },
          {
            name: "session_note",
            description: "Key-value scratchpad per session (set/get/list/delete). For intermediate findings or decisions.",
            category: "memory",
            example: 'session_note(action: "set", key: "root-cause", value: "null pointer in validate()")',
          },
          {
            name: "cache",
            description: "Cache tool results (get/set/clear) with 30s TTL. Use before re-reading recently-accessed files.",
            category: "optimization",
            example: 'cache(action: "get", key: "src/main.ts")',
          },
          {
            name: "cc_context",
            description: "Check token usage vs context window. Shows usage% and compaction recommendation.",
            category: "diagnostics",
            example: "cc_context()",
          },
          {
            name: "cc_doctor",
            description: "5-point health check: gateway, config, workspace, plugins, LCM database, Node.js version.",
            category: "diagnostics",
            example: "cc_doctor()",
          },
          {
            name: "cc_status",
            description: "Session status: model, fallback chain, gateway, plugins, cron jobs, config version.",
            category: "diagnostics",
            example: "cc_status()",
          },
          {
            name: "cc_config",
            description: "Show cc-optimize plugin configuration: active modules, thresholds, tools.",
            category: "diagnostics",
            example: "cc_config()",
          },
          {
            name: "cc_help",
            description: "List all cc-optimize tools with descriptions, examples, and module categories.",
            category: "diagnostics",
            example: "cc_help()",
          },
          {
            name: "cc_diff",
            description: "Show git diff (staged/unstaged/all). Max 50K chars.",
            category: "git",
            example: 'cc_diff(mode: "unstaged", path: "src/")',
          },
          {
            name: "cc_lint",
            description: "Quick validation: bracket balance, JSON parse, import detection. For sanity checks before committing.",
            category: "quality",
            example: 'cc_lint(path: "src/index.ts", check: "all")',
          },
        ],
        modules: {
          active: 60,
          categories: {
            safety: ["shell-safety", "permission-matrix", "stall-detector", "session-recovery", "write-discipline"],
            performance: ["compaction (micro/auto/emergency)", "tool-partitioner (10 concurrency)", "content-addressed-temp", "cache (30s TTL)"],
            observability: ["health-monitor (6 checks, 60s)", "error-fallback (L1→L3 cascade)", "budget-guard (200K tokens)", "git-state-reader"],
            context: ["context-injection (12 files)", "prompt-enhancer (CC-style)", "git-context-injection"],
            memory: ["memory-templates (10-section)", "auto-memory-extractor (4-type, every 10 msgs)", "memory-integration (prompt+flush)"],
            execution: ["todo-write", "session-note", "cc-context", "cc-doctor", "cc-status", "cc-config", "cc-help", "cc-diff", "cc-lint"],
            model: ["model-resolver (4-level fallback: v4-pro→chat→reasoner→local-qwen)"],
            session: ["session-optimizer (snapshot+resume)", "session-recovery (crash-safe pointer)"],
            tasks: ["task-manager (3 types: bg/shell/agent)", "speculation-engine (9 pattern rules)"],
            permissions: ["permission-feedback (decision tracking)", "command-registry (11 built-in + 3 slash)"],
          },
        },
      };
    },
    isEnabled: () => true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  }, { name: "cc-optimize:cc-help" });
}
