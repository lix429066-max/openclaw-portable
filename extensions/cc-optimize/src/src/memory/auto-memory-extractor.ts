import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface ExtractionConfig {
  memoryDir: string;
  topicsDir: string;
  maxTurns: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: ExtractionConfig = {
  memoryDir: "",
  topicsDir: "",
  maxTurns: 2,
  enabled: true,
};

const EXTRACTION_TYPES = {
  preference: "User preferences and workflow choices",
  knowledge: "Project architecture, dependencies, conventions",
  solution: "Problems solved and how, with commands/approaches",
  context: "Background information useful for future sessions",
};

const EXTRACTION_PROMPT = `You are the memory extraction agent. Extract lasting knowledge from the conversation.

## Types to Extract
1. **preference**: User likes/dislikes, workflow preferences, tool choices
2. **knowledge**: Architecture decisions, build processes, project conventions  
3. **solution**: Problems solved and how, specific commands and approaches
4. **context**: Background information useful in future sessions

## What NOT to Save
- Code snippets (unless reusable pattern)
- One-off error messages (unless recurring)
- Exact command invocations (unless solved a difficult problem)
- File listings or directory trees

## Format (YAML frontmatter required)
\`\`\`
---
type: preference | knowledge | solution | context
date: YYYY-MM-DD
tags: [tag1, tag2]
---
Content...
\`\`\`

## Strategy
Turn 1: Read existing topic files to understand current state
Turn 2: Write NEW information only. Do NOT re-save existing knowledge.
Limit each topic file to 80 lines.`;

export function createAutoMemoryExtractor(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  let config = { ...DEFAULT_CONFIG };
  let lastExtractionCursor = "";
  let extractionCount = 0;
  let isRunning = false;

  function init(memoryDir: string) {
    config.memoryDir = memoryDir;
    config.topicsDir = join(memoryDir, "topics");
    if (!existsSync(config.topicsDir)) {
      mkdirSync(config.topicsDir, { recursive: true });
    }
    api.logger.info(`[cc-optimize] Auto-memory extractor: ${config.topicsDir}`);
  }

  function getExistingTopics(): string[] {
    if (!existsSync(config.topicsDir)) return [];
    try {
      return readdirSync(config.topicsDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => f.replace(".md", ""));
    } catch {
      return [];
    }
  }

  function createTopicFile(type: string, content: string, tags: string[]): string {
    const date = new Date().toISOString().slice(0, 10);
    const slug = `${date}-${type}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = join(config.topicsDir, `${slug}.md`);

    const frontmatter = [
      "---",
      `type: ${type}`,
      `date: ${date}`,
      `tags: [${tags.join(", ")}]`,
      "---",
      "",
      content,
    ].join("\n");

    try {
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, frontmatter, "utf8");
      return slug;
    } catch (err) {
      api.logger.warn(`[cc-optimize] Failed to write topic: ${err instanceof Error ? err.message : err}`);
      return "";
    }
  }

  function updateTopicFile(slug: string, appendContent: string): boolean {
    const filePath = join(config.topicsDir, `${slug}.md`);
    if (!existsSync(filePath)) return false;

    try {
      const content = readFileSync(filePath, "utf8");
      const lines = content.split("\n");
      if (lines.length > 80) return false;

      writeFileSync(filePath, content + "\n" + appendContent, "utf8");
      return true;
    } catch {
      return false;
    }
  }

  function buildExtractionContext(recentMessages: Array<{ role: string; content: string }>): string {
    const existingTopics = getExistingTopics();
    const topicList = existingTopics.length > 0
      ? `Existing topics: ${existingTopics.join(", ")}`
      : "No existing topics yet.";

    const messages = recentMessages
      .slice(-20)
      .map((m) => `[${m.role}] ${m.content.slice(0, 500)}`)
      .join("\n");

    return `${EXTRACTION_PROMPT}\n\n${topicList}\n\n## Recent Conversation\n${messages}`;
  }

  function shouldExtract(messageCount: number): boolean {
    if (!config.enabled || isRunning) return false;
    return messageCount > 0 && messageCount % 10 === 0;
  }

  api.registerHook("session_start", async (ctx) => {
    const wsPath = (ctx as { workspacePath?: string }).workspacePath ||
      (ctx as { cwd?: string }).cwd || "";
    if (!wsPath) {
      api.logger.warn("[cc-optimize] Auto-memory: no workspace path available, skipping init");
      return ctx;
    }
    const memoryPath = join(wsPath, "memory");
    init(memoryPath);

    const topics = getExistingTopics();
    api.logger.info(`[cc-optimize] Memory scan: ${topics.length} existing topics`);

    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        ccMemoryTopics: topics,
      },
    };
  }, { name: "cc-optimize:auto-memory-session" });

  api.registerHook("after_tool_call", async (ctx) => {
    extractionCount++;
    if (shouldExtract(extractionCount)) {
      api.logger.debug(`[cc-optimize] Memory extraction trigger: ${extractionCount} messages since last extraction`);
    }
    return ctx;
  }, { name: "cc-optimize:auto-memory-trigger" });

  return {
    init,
    getExistingTopics,
    createTopicFile,
    updateTopicFile,
    buildExtractionContext,
    shouldExtract,
    getPrompt: () => EXTRACTION_PROMPT,
  };
}
