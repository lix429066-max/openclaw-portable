import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface StructuredToolDef {
  name: string;
  isEnabled: boolean;
  isReadOnly: boolean;
  isConcurrencySafe: boolean;
  isDestructive: boolean;
  maxResultSizeChars: number;
  searchHints: string[];
  category: string;
  permissionProfile: string[];
}

const TOOL_CATEGORIES: Record<string, StructuredToolDef> = {
  read: {
    name: "read",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 200_000,
    searchHints: ["read", "file", "view", "open", "cat"],
    category: "files",
    permissionProfile: ["minimal", "coding", "messaging", "full"],
  },
  write: {
    name: "write",
    isEnabled: true,
    isReadOnly: false,
    isConcurrencySafe: false,
    isDestructive: true,
    maxResultSizeChars: 50_000,
    searchHints: ["write", "create", "new file", "save"],
    category: "files",
    permissionProfile: ["coding", "full"],
  },
  edit: {
    name: "edit",
    isEnabled: true,
    isReadOnly: false,
    isConcurrencySafe: false,
    isDestructive: true,
    maxResultSizeChars: 50_000,
    searchHints: ["edit", "modify", "change", "replace", "update"],
    category: "files",
    permissionProfile: ["coding", "full"],
  },
  exec: {
    name: "exec",
    isEnabled: true,
    isReadOnly: false,
    isConcurrencySafe: false,
    isDestructive: true,
    maxResultSizeChars: 100_000,
    searchHints: ["exec", "run", "shell", "terminal", "command", "bash", "execute"],
    category: "runtime",
    permissionProfile: ["coding", "full"],
  },
  glob: {
    name: "glob",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 100_000,
    searchHints: ["glob", "find", "pattern", "search files", "ls", "list"],
    category: "files",
    permissionProfile: ["minimal", "coding", "messaging", "full"],
  },
  grep: {
    name: "grep",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 100_000,
    searchHints: ["grep", "search", "find", "content", "rg", "search code"],
    category: "files",
    permissionProfile: ["minimal", "coding", "messaging", "full"],
  },
  web_search: {
    name: "web_search",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 50_000,
    searchHints: ["search", "web", "google", "find online", "internet"],
    category: "web",
    permissionProfile: ["coding", "messaging", "full"],
  },
  web_fetch: {
    name: "web_fetch",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 100_000,
    searchHints: ["fetch", "url", "download", "http", "curl", "wget"],
    category: "web",
    permissionProfile: ["coding", "messaging", "full"],
  },
  memory_search: {
    name: "memory_search",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 100_000,
    searchHints: ["memory", "recall", "remember", "history", "past"],
    category: "memory",
    permissionProfile: ["coding", "messaging", "full"],
  },
  sessions_spawn: {
    name: "sessions_spawn",
    isEnabled: true,
    isReadOnly: false,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 50_000,
    searchHints: ["spawn", "agent", "subagent", "delegate", "task"],
    category: "sessions",
    permissionProfile: ["coding", "full"],
  },
  task: {
    name: "task",
    isEnabled: true,
    isReadOnly: false,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 50_000,
    searchHints: ["task", "todo", "plan", "track", "organize"],
    category: "sessions",
    permissionProfile: ["coding", "full"],
  },
  // ── cc-optimize tools ──
  todo_write: {
    name: "todo_write",
    isEnabled: true,
    isReadOnly: false,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 20_000,
    searchHints: ["todo", "task", "list", "plan", "organize", "track"],
    category: "planning",
    permissionProfile: ["coding", "full"],
  },
  session_note: {
    name: "session_note",
    isEnabled: true,
    isReadOnly: false,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 50_000,
    searchHints: ["note", "scratchpad", "save", "intermediate", "findings"],
    category: "memory",
    permissionProfile: ["coding", "full"],
  },
  cc_context: {
    name: "cc_context",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 10_000,
    searchHints: ["context", "tokens", "window", "usage", "budget"],
    category: "diagnostics",
    permissionProfile: ["coding", "messaging", "full"],
  },
  cc_doctor: {
    name: "cc_doctor",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 10_000,
    searchHints: ["health", "doctor", "check", "diagnostic", "gateway"],
    category: "diagnostics",
    permissionProfile: ["coding", "messaging", "full"],
  },
  cc_status: {
    name: "cc_status",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 10_000,
    searchHints: ["status", "session", "model", "version", "config"],
    category: "diagnostics",
    permissionProfile: ["coding", "messaging", "full"],
  },
  cache: {
    name: "cache",
    isEnabled: true,
    isReadOnly: false,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 200_000,
    searchHints: ["cache", "cached", "result", "avoid", "read again"],
    category: "optimization",
    permissionProfile: ["coding", "full"],
  },
  cc_diff: {
    name: "cc_diff",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 50_000,
    searchHints: ["diff", "git", "changes", "staged", "unstaged", "review"],
    category: "git",
    permissionProfile: ["coding", "full"],
  },
  cc_lint: {
    name: "cc_lint",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 30_000,
    searchHints: ["lint", "check", "validate", "syntax", "error", "bracket"],
    category: "quality",
    permissionProfile: ["coding", "full"],
  },
  cc_config: {
    name: "cc_config",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 10_000,
    searchHints: ["config", "configuration", "plugin", "settings"],
    category: "diagnostics",
    permissionProfile: ["coding", "messaging", "full"],
  },
  cc_help: {
    name: "cc_help",
    isEnabled: true,
    isReadOnly: true,
    isConcurrencySafe: true,
    isDestructive: false,
    maxResultSizeChars: 10_000,
    searchHints: ["help", "tools", "list", "available", "cc-optimize"],
    category: "diagnostics",
    permissionProfile: ["coding", "messaging", "full"],
  },
};

function buildToolEnhancementPrompt(): string {
  const registry = Object.values(TOOL_CATEGORIES);
  const categories = [...new Set(registry.map((t) => t.category))];

  let prompt = "## Tool Metadata\n\n";
  prompt += "Tools are classified with the following attributes:\n\n";

  for (const cat of categories) {
    const tools = registry.filter((t) => t.category === cat);
    prompt += `### ${cat}\n`;
    for (const t of tools) {
      const flags: string[] = [];
      if (t.isReadOnly) flags.push("readOnly");
      if (t.isConcurrencySafe) flags.push("concurrencySafe");
      if (t.isDestructive) flags.push("destructive");
      prompt += `- **${t.name}**: ${t.isEnabled ? "enabled" : "disabled"} [${flags.join(", ")}]\n`;
      if (t.searchHints.length > 0) {
        prompt += `  search: ${t.searchHints.join(", ")}\n`;
      }
    }
    prompt += "\n";
  }
  return prompt;
}

export function createStructuredToolRegistry(
  api: OpenClawPluginApi,
  _config: { structuredTools: boolean },
) {
  const registry = structuredClone(TOOL_CATEGORIES);

  const getTool = (name: string): StructuredToolDef | undefined => registry[name];
  const getReadOnlyTools = (): StructuredToolDef[] =>
    Object.values(registry).filter((t) => t.isReadOnly);
  const getToolsByCategory = (category: string): StructuredToolDef[] =>
    Object.values(registry).filter((t) => t.category === category);
  const getEnabledTools = (): StructuredToolDef[] =>
    Object.values(registry).filter((t) => t.isEnabled);
  const getConcurrencySafeTools = (): StructuredToolDef[] =>
    Object.values(registry).filter((t) => t.isConcurrencySafe);

  const prompt = buildToolEnhancementPrompt();
  api.logger.info(
    `[cc-optimize] Tool registry: ${getEnabledTools().length} tools in ${[...new Set(Object.values(registry).map((t) => t.category))].length} categories`,
  );

  return {
    getTool,
    getReadOnlyTools,
    getToolsByCategory,
    getEnabledTools,
    getConcurrencySafeTools,
    prompt,
  };
}
