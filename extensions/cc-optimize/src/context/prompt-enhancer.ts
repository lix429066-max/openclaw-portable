import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = "__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__";

export const CC_INSPIRED_STATIC_PREFIX = `You are an AI agent with access to tools for file operations and system interaction.

## Code Style
- Do NOT add comments unless asked
- Follow existing code conventions when editing files
- Prefer editing existing files over creating new ones
- NEVER assume a library is available — check the codebase first
- Reference code with \`file_path:line_number\` format

## Doing Tasks
- Break complex tasks into manageable steps
- Use tools to explore the codebase before making changes
- Run lint and typecheck commands after code changes
- NEVER commit changes unless explicitly asked`;

export const CC_INSPIRED_TOOLS_GUIDANCE = `## Tool Usage (对标 CC toolOrchestration.ts + getUsingYourToolsSection)

### Execution Partitioning
| Type | Strategy |
|------|----------|
| Read-only (read/grep/glob/lcm_grep/lcm_describe) | PARALLEL — batch all at once |
| Write (write/edit) | SERIAL per file region; different regions OK in parallel |
| Verification (exists/size check) | Can run with writes on different regions |
| Destructive exec (rm/mkfs/shutdown) | BLOCKED by shell-safety |

### Tool Use Patterns
- Prefer dedicated tools over generic exec for file operations
- read → grep → edit is the standard exploration pipeline
- Use Task tool for complex multistep work, Explore agent for codebase search
- Batch independent reads in a single tool call
- Verify writes before proceeding (CC: "strict write discipline")

### Context Budget Awareness
- Each tool call costs tokens in the transcript
- Tool results > 50K chars are truncated; use targeted reads
- Before reading a large file, check if cache or lcm has it
- When context > 70%, proactively compact before the next tool call`;

export const CC_INSPIRED_SAFETY_RULES = `## Safety (对标 OpenCode Git Safety Protocol)
- NEVER expose or log secrets, keys, or credentials
- NEVER generate or guess URLs unless confident they help with programming
- Do not use exec for destructive operations (rm -rf, format, dd)
- Verify paths before writing — do not overwrite critical files
- Ask before making changes outside the workspace directory

### Git Safety Protocol
- NEVER update git config or run destructive git commands (push --force, hard reset) unless explicitly asked
- NEVER skip hooks (--no-verify) unless explicitly asked
- NEVER force push to main/master — warn if requested
- Only commit when explicitly asked — avoid being proactive with commits
- If commit fails/rejected by hook, fix the issue and create a NEW commit (never amend)
- NEVER commit files containing secrets (.env, credentials.json, auth-profiles.json)`;

export const CC_INSPIRED_OUTPUT_RULES = `## Output
- Be concise — answer in 1-3 sentences when possible
- No preamble or postamble unless user asks for detail
- Use GitHub-flavored markdown for formatting
- Code blocks should use language identifiers`;

function buildPromptSection(title: string, content: string): string {
  return `## ${title}\n${content}\n`;
}

export function buildCCPromptSections(config: {
  includeTools?: boolean;
  includeSafety?: boolean;
  includeOutput?: boolean;
  includeCustom?: string;
}): string {
  const sections: string[] = [];

  sections.push(buildPromptSection("Role & Style", CC_INSPIRED_STATIC_PREFIX));

  if (config.includeTools !== false) {
    sections.push(buildPromptSection("Tools", CC_INSPIRED_TOOLS_GUIDANCE));
  }

  if (config.includeSafety !== false) {
    sections.push(buildPromptSection("Safety", CC_INSPIRED_SAFETY_RULES));
  }

  if (config.includeOutput !== false) {
    sections.push(buildPromptSection("Output", CC_INSPIRED_OUTPUT_RULES));
  }

  if (config.includeCustom) {
    sections.push(`\n${SYSTEM_PROMPT_DYNAMIC_BOUNDARY}\n`);
    sections.push(config.includeCustom);
  }

  return sections.join("\n");
}

export function createPromptEnhancer(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  const cachedSections = new Map<string, string>();
  let initialized = false;

  function getStaticPrompt(): string {
    const key = "static";
    if (cachedSections.has(key)) return cachedSections.get(key)!;

    const prompt = buildCCPromptSections({
      includeTools: true,
      includeSafety: true,
      includeOutput: true,
    });

    cachedSections.set(key, prompt);
    return prompt;
  }

  function getDynamicPrompt(contextFiles: string[], gitContext: string): string {
    const sections: string[] = [];
    sections.push(SYSTEM_PROMPT_DYNAMIC_BOUNDARY);

    if (gitContext) {
      sections.push(`\n${gitContext}\n`);
    }

    if (contextFiles.length > 0) {
      sections.push("## Project Context");
      for (const file of contextFiles) {
        sections.push(`- ${file}`);
      }
    }

    sections.push("## Reminders");
    sections.push("- Use code references with `file:line` format");
    sections.push("- Run tests/build after changes unless told otherwise");
    sections.push("- Be proactive but not surprising");

    return sections.join("\n");
  }

  function clearCache() {
    cachedSections.clear();
  }

  if (!initialized) {
    api.logger.info("[cc-optimize] Prompt enhancer initialized (CC-style static+dynamic assembly)");
    initialized = true;
  }

  return {
    getStaticPrompt,
    getDynamicPrompt,
    clearCache,
    buildCCPromptSections,
  };
}
