export const COMPACT_PREAMBLE = `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

- Do NOT use any tools (read, write, exec, grep, glob, etc.)
- You already have all the context you need in the conversation above.
- Tool calls will be REJECTED and will waste your only turn.
- Your entire response must be plain text: an <analysis> block followed by a <summary> block.`;

export const COMPACT_TEMPLATE_BASE = `You must produce a highly detailed summary of the conversation above to preserve all relevant context for future turns.

Your summary MUST follow this structure exactly:

1. **Primary Request and Intent**: What was the user asking for? What were the explicit goals?

2. **Key Technical Concepts**: List all technologies, frameworks, languages, APIs, and libraries discussed.

3. **Files and Code Sections**: Copy all relevant file paths, function signatures, edits made, and code snippets. Include exact line numbers if known. Do NOT omit any code that was written or modified — these are the most critical details.

4. **Errors and Fixes**: Document every error encountered, the user's feedback, and exactly how it was resolved.

5. **Problem Solving**: Describe the reasoning process for any non-trivial decisions. What alternatives were considered? Why was the chosen approach selected?

6. **All User Messages**: Record every user message verbatim (exclude tool results). These contain critical intent and feedback.

7. **Pending Tasks**: List everything that the user explicitly asked for but has not yet been completed.

8. **Current Work**: Describe precisely what was being worked on most recently. Include file names, function signatures, and code snippets.

9. **Optional Next Step**: If obvious, quote the direct next action. Otherwise omit this section.`;

export const COMPACT_TRAILER = `REMINDER: Do NOT call any tools. Respond with plain text only — an <analysis> block followed by a <summary> block.`;

export function formatCompactSummary(analysis: string, summary: string): string {
  const cleanedSummary = summary
    .replace(/^<summary>\s*/i, "")
    .replace(/\s*<\/summary>\s*$/i, "")
    .trim();

  return [
    "[Compact Summary]",
    `Length: analysis=${analysis.length} chars, summary=${cleanedSummary.length} chars`,
    "---",
    cleanedSummary,
  ].join("\n");
}

export function buildCompactPrompt(
  conversationPreview: string,
  previousSummary?: string,
): string {
  const parts: string[] = [COMPACT_PREAMBLE, ""];

  if (previousSummary) {
    parts.push("## Previous Summary Context");
    parts.push(previousSummary);
    parts.push("");
    parts.push("## Conversation to Summarize (since last compaction)");
  } else {
    parts.push("## Full Conversation to Summarize");
  }

  parts.push(`${conversationPreview}`);
  parts.push("");
  parts.push(COMPACT_TEMPLATE_BASE);
  parts.push("");
  parts.push(COMPACT_TRAILER);

  return parts.join("\n");
}

export function buildIncrementalCompactPrompt(
  previousSummary: string,
  newConversation: string,
): string {
  return `CRITICAL: Respond with TEXT ONLY. Do NOT call any tools.

You are refining an existing summary with new conversation content.

## Existing Summary
${previousSummary}

## New Conversation Content (to merge into summary)
${newConversation}

## Instructions
Update the summary to incorporate the new content. Follow the same 9-section structure:
1. Primary Request and Intent
2. Key Technical Concepts
3. Files and Code Sections
4. Errors and Fixes
5. Problem Solving
6. All User Messages
7. Pending Tasks
8. Current Work
9. Optional Next Step

Preserve ALL detail from the existing summary. Add new information from the conversation above.
If a section has no new content, keep the existing entry unchanged.

${COMPACT_TRAILER}`;
}
