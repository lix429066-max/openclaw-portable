import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const DANGEROUS_NODE_TYPES = new Set([
  "command_substitution",
  "process_substitution",
  "expansion",
  "simple_expansion",
  "brace_expression",
  "subshell",
  "compound_statement",
  "function_definition",
  "test_command",
  "ansi_c_string",
  "herestring_redirect",
  "heredoc_redirect",
]);

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /rm\s+-rf\s+(\/|\/etc|\/home|\/var|\/usr)/, reason: "destructive deletion of system directories" },
  { pattern: /:\s*\(\)\s*\{\s*:\s*\|\s*:?\s*&\s*\}/, reason: "fork bomb detected" },
  { pattern: /mkfs\./, reason: "filesystem format" },
  { pattern: /dd\s+if=/, reason: "raw disk write" },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: "writing to raw disk device" },
  { pattern: />\s*\/dev\/nvme/, reason: "writing to raw NVMe device" },
  { pattern: /chmod\s+.*777/, reason: "world-writable permissions" },
  { pattern: /chown\s+.*:\s*\/etc\//, reason: "changing ownership of system config" },
  { pattern: /shutdown|reboot|halt|poweroff/, reason: "system power control" },
  { pattern: /iptables\s+-F/, reason: "flushing firewall rules" },
  { pattern: /curl.*\|\s*(ba)?sh/, reason: "curl pipe to shell" },
  { pattern: /wget.*-O\s*-\s*\|/, reason: "wget pipe to shell" },
  { pattern: /\/etc\/passwd/, reason: "accessing password file" },
  { pattern: /\/etc\/shadow/, reason: "accessing shadow file" },
  { pattern: /\.ssh\/authorized_keys/, reason: "modifying SSH authorized keys" },
  { pattern: /nc\s+-[lL].*-e/, reason: "netcat reverse shell" },
  { pattern: /base64.*-d\|/, reason: "base64 decode pipe (obfuscation)" },
];

const READ_ONLY_COMMAND_PREFIXES: Record<string, string[]> = {
  git: ["log", "diff", "show", "status", "branch", "tag", "stash list", "ls-files",
    "ls-remote", "remote show", "rev-parse", "rev-list", "describe", "cat-file",
    "for-each-ref", "grep", "shortlog", "reflog", "blame", "config --get",
    "merge-base", "worktree list", "stash show"],
  docker: ["logs", "inspect", "ps", "images", "info", "version"],
  npm: ["ls", "list", "view", "info", "outdated", "audit", "config list"],
  rg: ["--files", "--count", "--stats", "-l"],
  ls: ["*"],
  cat: ["*"],
  head: ["*"],
  tail: ["*"],
  wc: ["*"],
  find: ["*"],
  stat: ["*"],
  file: ["*"],
  du: ["*"],
  df: ["*"],
  ps: ["*"],
  grep: ["*"],
  awk: ["*"],
  sed: ["-n", "*"],
  env: ["*"],
  printenv: ["*"],
  which: ["*"],
  whereis: ["*"],
  type: ["*"],
  echo: ["*"],
  printf: ["*"],
  date: ["*"],
  uname: ["*"],
  hostname: ["*"],
  whoami: ["*"],
  id: ["*"],
};

export function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  if (!cmd) return false;

  const allowedPrefixes = READ_ONLY_COMMAND_PREFIXES[cmd];
  if (!allowedPrefixes) return false;

  if (allowedPrefixes.includes("*")) return true;

  const rest = parts.slice(1).join(" ");
  for (const prefix of allowedPrefixes) {
    if (rest.startsWith(prefix)) return true;
  }

  return false;
}

export function scanDangerousPatterns(command: string): string[] {
  const reasons: string[] = [];
  const lower = command.toLowerCase();

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(lower)) {
      reasons.push(reason);
    }
  }

  return reasons;
}

export function containsDangerousConstructs(command: string): boolean {
  if (command.includes("$(") || command.includes("`")) return true;
  if (command.includes("${")) return true;
  if (command.includes("<(") || command.includes(">(")) return true;
  if (command.match(/<<-?\s*['"]?\w+['"]?/)) return true;
  if (command.includes("&>") || command.includes(">&")) return true;
  return false;
}

export function hasUnsafeRedirect(command: string): boolean {
  const redirectPattern = /(?:^|\s)([12]?>>?\s*(\S+))/g;
  let match;
  while ((match = redirectPattern.exec(command)) !== null) {
    const target = match[2];
    if (!target) continue;
    if (target.includes("$") || target.includes("`")) return true;
    if (target.includes("*") || target.includes("?")) return true;
    if (target.includes("(") || target.includes("<")) return true;
    if (/^~/.test(target)) return true;
  }
  return false;
}

export function createShellSafety(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
  onDangerous?: (command: string, reason: string) => void,
) {
  api.registerHook("before_tool_call", async (event) => {
    const toolName = (event as { toolName?: string }).toolName?.toLowerCase() || "";
    if (toolName !== "exec" && toolName !== "bash" && toolName !== "shell") return event;

    const params = (event as { params?: Record<string, unknown> }).params || {};
    const command = String(params.command || params.cmd || "");

    if (!command.trim()) return event;

    const dangerousPatterns = scanDangerousPatterns(command);
    const hasDangerousConstructs = containsDangerousConstructs(command);
    const hasUnsafeRedir = hasUnsafeRedirect(command);
    const isReadOnly = isReadOnlyCommand(command);

    const flags: string[] = [];
    if (dangerousPatterns.length > 0) flags.push("DANGEROUS:" + dangerousPatterns.join(";"));
    if (hasDangerousConstructs) flags.push("complex_construct");
    if (hasUnsafeRedir) flags.push("unsafe_redirect");
    if (isReadOnly) flags.push("readOnly");

    if (flags.length > 0) {
      api.logger.info(
        `[cc-optimize] Shell safety: "${command.slice(0, 80)}" → [${flags.join(", ")}]`,
      );
    }

    if (dangerousPatterns.length > 0 && onDangerous) {
      onDangerous(command, dangerousPatterns[0]);
    }

    // BLOCK fork bombs and filesystem destruction commands
    if (dangerousPatterns.some((p) => p.includes("fork bomb") || p.includes("filesystem format"))) {
      api.logger.warn(`[cc-optimize] BLOCKED dangerous command: ${command.slice(0, 80)}`);
      return {
        block: true,
        blockReason: `Dangerous command blocked by cc-optimize: ${dangerousPatterns[0]}`,
      };
    }

    // BLOCK commands with dangerous constructs (command substitution, subshells)
    if (hasDangerousConstructs && dangerousPatterns.length > 0) {
      api.logger.warn(`[cc-optimize] BLOCKED complex dangerous command: ${command.slice(0, 80)}`);
      return {
        block: true,
        blockReason: `Complex dangerous command blocked by cc-optimize: ${dangerousPatterns[0]}`,
      };
    }

    return {
      params,
      metadata: {
        ccShellSafety: {
          isReadOnly,
          hasDangerousPatterns: dangerousPatterns.length > 0,
          dangerousPatterns,
          hasDangerousConstructs,
          hasUnsafeRedirect: hasUnsafeRedir,
        },
      },
    };
  }, { name: "cc-optimize:shell-before-tool" });

  return {
    isReadOnlyCommand,
    scanDangerousPatterns,
    containsDangerousConstructs,
    hasUnsafeRedirect,
  };
}