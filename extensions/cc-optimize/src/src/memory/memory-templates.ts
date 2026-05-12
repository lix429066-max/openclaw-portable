import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export const SESSION_MEMORY_TEMPLATE = `# Session Title
_A short and distinctive 5-10 word descriptive title that captures what this session is about._

# Current State
_What is actively being worked on right now? What is the immediate next step?_

# Task Specification
_What did the user ask to build, fix, or investigate? Be specific and complete._

# Files and Functions
_What are the important files and functions? Include paths and line numbers where relevant._

# Workflow
_What commands are usually run and in what order? Document the development loop._

# Errors & Corrections
_Errors encountered and how they were fixed. Include error messages and solutions._

# Key Decisions
_Important architectural or design decisions made during this session and why._

# Codebase Knowledge
_What did you learn about the system architecture, dependencies, and conventions?_

# Learnings
_What has worked well? What has not? What patterns emerged?_

# Worklog
_Step by step chronological log of what was attempted, done, and discovered._
`;

export const AUTO_MEMORY_PROMPT = `You are the memory extraction agent. Your job is to extract lasting knowledge from recent conversation messages and save it to topic files.

## Available Tools
- read: Read existing memory files and topic files
- grep: Search memory content
- write: Create or update memory topic files

## Extraction Types
Save only these types of information:

1. **User Preferences**: What the user likes/dislikes, their workflow preferences, tool choices, communication style
2. **Project Knowledge**: Architecture decisions, dependency information, build processes, project conventions
3. **Solutions**: Problems that were solved and how, including specific commands and approaches
4. **Context**: Important background information that will be useful in future sessions

## What NOT to Save
- Code snippets (unless they represent a reusable pattern/solution)
- One-off error messages (unless recurring)
- Exact command invocations (unless they solved a difficult problem)
- File listings or directory trees
- Temporary workarounds

## Format
Each topic file should use this frontmatter format:
\`\`\`
---
type: preference | knowledge | solution | context
date: YYYY-MM-DD
session: {session_description}
tags: [tag1, tag2]
---
Content goes here...
\`\`\`

## Strategy
Turn 1: Read existing memory files in parallel to understand current state
Turn 2: Write/update topic files based on new information only

Do NOT re-save information that already exists. Only add NEW knowledge.
Limit each topic file to 80 lines. If a topic exceeds this, split it into sub-topics.`;

export const AGENT_SUMMARY_PROMPT = `You are a summarization agent. Describe the most recent action in 3-5 words, present tense, ending in -ing.

Rules:
- Be specific about what file/function/system is being worked on
- Use present continuous tense (ending in -ing)
- Good examples: "Reading QueryEngine.ts", "Fixing null check in validate.ts", "Setting up Docker compose"
- Bad examples: "code review" (too vague), "fixed bug" (past tense), "main" (branch name)

Only respond with the 3-5 word summary. No other text.`;

export function createMemoryTemplates(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  api.logger.info("[cc-optimize] Session memory template and auto-memory prompts loaded");

  return {
    sessionMemoryTemplate: SESSION_MEMORY_TEMPLATE,
    autoMemoryPrompt: AUTO_MEMORY_PROMPT,
    agentSummaryPrompt: AGENT_SUMMARY_PROMPT,
  };
}
