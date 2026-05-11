import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface ContextFile {
  path: string;
  name: string;
  size: number;
  priority: number;
  content?: string;
  description: string;
}

const MAX_CONTEXT_SIZE = 16_000;

const CONTEXT_FILE_REGISTRY: Omit<ContextFile, "size">[] = [
  {
    path: "CLAUDE.md",
    name: "CLAUDE.md",
    priority: 10,
    description: "Project instructions and guidelines (Claude Code format)",
  },
  {
    path: "AGENTS.md",
    name: "AGENTS.md",
    priority: 10,
    description: "Session startup flow and memory system",
  },
  {
    path: "SOUL.md",
    name: "SOUL.md",
    priority: 9,
    description: "AI personality and principles",
  },
  {
    path: "HEARTBEAT.md",
    name: "HEARTBEAT.md",
    priority: 8,
    description: "Heartbeat response guide and KAIROS mode",
  },
  {
    path: "USER.md",
    name: "USER.md",
    priority: 8,
    description: "User profile and preferences",
  },
  {
    path: "IDENTITY.md",
    name: "IDENTITY.md",
    priority: 7,
    description: "AI identity and self-concept",
  },
  {
    path: "MEMORY.md",
    name: "MEMORY.md",
    priority: 7,
    description: "Memory index and topic map",
  },
  {
    path: "TOOLS.md",
    name: "TOOLS.md",
    priority: 6,
    description: "Tool inventory and capabilities",
  },
  {
    path: "PROJECTS.md",
    name: "PROJECTS.md",
    priority: 5,
    description: "Active project tracking",
  },
  {
    path: "ARCHITECTURE.md",
    name: "ARCHITECTURE.md",
    priority: 5,
    description: "System architecture documentation",
  },
  {
    path: "LEARNINGS.md",
    name: "LEARNINGS.md",
    priority: 4,
    description: "Past lessons and insights",
  },
  {
    path: "ERRORS.md",
    name: "ERRORS.md",
    priority: 4,
    description: "Error patterns and solutions",
  },
];

export function createContextInjector(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  let workspacePath = "";
  let cachedContextPrompt: string | null = null;
  let cachedMinimalPrompt: string | null = null;
  let lastScanTime = 0;
  const CACHE_TTL_MS = 30_000;

  function setWorkspacePath(path: string) {
    if (path !== workspacePath) {
      cachedContextPrompt = null;
      cachedMinimalPrompt = null;
    }
    workspacePath = path;
  }

  function resolveContextFilePath(relativePath: string): string {
    return resolve(workspacePath, relativePath);
  }

  function scanContextFiles(): ContextFile[] {
    if (!workspacePath) return [];

    const results: ContextFile[] = [];

    for (const entry of CONTEXT_FILE_REGISTRY) {
      const fullPath = resolveContextFilePath(entry.path);
      if (!existsSync(fullPath)) continue;

      try {
        const stat = statSync(fullPath);
        results.push({
          ...entry,
          path: fullPath,
          size: stat.size,
        });
      } catch {
        continue;
      }
    }

    return results.sort((a, b) => b.priority - a.priority || b.size - a.size);
  }

  function buildContextPrompt(): string {
    if (cachedContextPrompt && Date.now() - lastScanTime < CACHE_TTL_MS) {
      return cachedContextPrompt;
    }
    const prompt = buildContextPromptInternal();
    cachedContextPrompt = prompt;
    lastScanTime = Date.now();
    return prompt;
  }

  function buildContextPromptInternal(): string {
    const files = scanContextFiles();
    if (files.length === 0) return "";

    let prompt = "## Workspace Context\n\n";
    prompt += "These project files define conventions, identity, and system knowledge:\n\n";

    let totalSize = 0;
    for (const file of files) {
      if (totalSize > MAX_CONTEXT_SIZE) break;

      try {
        const content = readFileSync(file.path, "utf8");
        const truncated = content.length > 2000
          ? content.slice(0, 2000) + "\n... (truncated, " + content.length + " chars total)"
          : content;

        prompt += `### ${file.name} (${file.description})\n`;
        prompt += truncated + "\n\n";
        totalSize += truncated.length;
      } catch {
        prompt += `### ${file.name} (${file.description})\n`;
        prompt += "(file exists but could not be read)\n\n";
      }
    }

    prompt += "---\n";
    prompt += `Total context files: ${files.length}, loaded: ${totalSize} chars\n`;

    return prompt;
  }

  function buildMinimalContextPrompt(maxFiles = 3): string {
    if (cachedMinimalPrompt && Date.now() - lastScanTime < CACHE_TTL_MS) {
      return cachedMinimalPrompt;
    }
    const prompt = buildMinimalContextPromptInternal(maxFiles);
    cachedMinimalPrompt = prompt;
    return prompt;
  }

  function buildMinimalContextPromptInternal(maxFiles = 3): string {
    const files = scanContextFiles().slice(0, maxFiles);
    if (files.length === 0) return "";

    let prompt = "## Core Context\n\n";
    for (const file of files) {
      prompt += `- **${file.name}**: ${file.description}\n`;
    }
    return prompt;
  }

  function getFileSummary(): Array<{ name: string; size: number; priority: number }> {
    return scanContextFiles().map((f) => ({
      name: f.name,
      size: f.size,
      priority: f.priority,
    }));
  }

  api.registerHook("session_start", async (ctx)=> {
    if (!workspacePath) {
      workspacePath = (ctx as { workspacePath?: string }).workspacePath || "";
    }

    cachedContextPrompt = null;
    cachedMinimalPrompt = null;
    lastScanTime = 0;

    api.logger.debug(
      `[cc-optimize] Context injector: ${scanContextFiles().length} files found in workspace`,
    );

    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        ccContextFiles: getFileSummary(),
      },
    };
  }, { name: "cc-optimize:context-session-start" });

  return {
    setWorkspacePath,
    scanContextFiles,
    buildContextPrompt,
    buildMinimalContextPrompt,
    getFileSummary,
  };
}