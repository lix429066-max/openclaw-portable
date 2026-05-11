import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface CommandDef {
  type: "immediate" | "prompt" | "agent";
  name: string;
  description: string;
  aliases?: string[];
  isEnabled: () => boolean;
  argumentHint?: string;
  load?: () => Promise<unknown>;
}

interface CommandResult {
  type: "text" | "jsx" | "agent";
  value?: string;
  shouldQuery?: boolean;
  model?: string;
}

const commandRegistry = new Map<string, CommandDef>();

export function registerCommand(cmd: CommandDef): void {
  commandRegistry.set(cmd.name, cmd);
  if (cmd.aliases) {
    for (const alias of cmd.aliases) {
      commandRegistry.set(alias, cmd);
    }
  }
}

export function getCommand(name: string): CommandDef | undefined {
  return commandRegistry.get(name);
}

export function listCommands(filter?: (cmd: CommandDef) => boolean): CommandDef[] {
  const unique = new Map<string, CommandDef>();
  for (const cmd of commandRegistry.values()) {
    if (!unique.has(cmd.name)) {
      if (!filter || filter(cmd)) {
        unique.set(cmd.name, cmd);
      }
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function buildDefaultCommands(api: OpenClawPluginApi): CommandDef[] {
  return [
    {
      type: "immediate",
      name: "help",
      description: "Show help and available commands",
      isEnabled: () => true,
      aliases: ["?"],
    },
    {
      type: "immediate",
      name: "status",
      description: "Show session status (model, tokens, uptime)",
      isEnabled: () => true,
    },
    {
      type: "immediate",
      name: "model",
      description: "Show or switch the current model",
      isEnabled: () => true,
      argumentHint: "[model-id]",
    },
    {
      type: "immediate",
      name: "mode",
      description: "Switch permission mode (default/acceptEdits/bypass/plan/dontAsk)",
      isEnabled: () => true,
      argumentHint: "[mode]",
    },
    {
      type: "prompt",
      name: "compact",
      description: "Manually trigger conversation compaction",
      isEnabled: () => true,
    },
    {
      type: "prompt",
      name: "new",
      description: "Start a new session",
      isEnabled: () => true,
      aliases: ["reset", "clear"],
    },
    {
      type: "immediate",
      name: "budget",
      description: "Show token budget and usage",
      isEnabled: () => true,
    },
    {
      type: "immediate",
      name: "tools",
      description: "List available tools with their safety metadata",
      isEnabled: () => true,
    },
    {
      type: "immediate",
      name: "sessions",
      description: "List active sessions",
      isEnabled: () => true,
    },
    {
      type: "prompt",
      name: "init",
      description: "Initialize project context (CLAUDE.md, AGENTS.md)",
      isEnabled: () => true,
      argumentHint: "[project-path]",
    },
    {
      type: "immediate",
      name: "config",
      description: "Show current configuration",
      isEnabled: () => true,
      aliases: ["settings"],
    },
  ];
}

export function createCommandRegistry(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  for (const cmd of buildDefaultCommands(api)) {
    registerCommand(cmd);
  }

  api.registerHook("session_start", async (ctx) => {
    const enabled = listCommands((c) => c.isEnabled());
    const byType: Record<string, number> = {};
    for (const cmd of enabled) {
      byType[cmd.type] = (byType[cmd.type] || 0) + 1;
    }
    api.logger.info(
      `[cc-optimize] Command registry: ${enabled.length} commands (${Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(", ")})`,
    );
    return ctx;
  }, { name: "cc-optimize:command-session" });

  return {
    registerCommand,
    getCommand,
    listCommands,
  };
}
