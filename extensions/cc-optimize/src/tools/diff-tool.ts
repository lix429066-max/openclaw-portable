import { execSync } from "node:child_process";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export function registerDiffTool(api: OpenClawPluginApi) {
  api.registerTool((ctx) => ({
    name: "cc_diff",
    description: "Show git diff for staged or unstaged changes (max 50K chars). Use before committing to review changes, or to check what files were modified. Default mode 'unstaged' shows working tree changes.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["staged", "unstaged", "all"],
          description: "staged=cached changes, unstaged=working tree, all=everything",
        },
        path: {
          type: "string",
          description: "Optional: limit diff to a specific file or directory",
        },
      },
    },
    async call({ mode = "unstaged", path }: { mode?: string; path?: string }) {
      try {
        const workspacePath = (ctx as { workspacePath?: string }).workspacePath ||
          process.cwd();

        const args: string[] = [];

        if (mode === "staged") {
          args.push("--cached");
        } else if (mode === "all") {
          args.push("HEAD");
        }

        if (path) {
          args.push("--", path);
        }

        const command = `git -C "${workspacePath}" diff ${args.join(" ")}`;
        const output = execSync(command, {
          encoding: "utf8",
          maxBuffer: 100_000,
          timeout: 10_000,
          cwd: workspacePath,
        }).trim();

        if (!output) {
          return { mode, changes: "No changes detected", files: [] };
        }

        const filePattern = /^diff --git a\/(.+) b\/(.+)$/gm;
        const files: string[] = [];
        let match;
        while ((match = filePattern.exec(output)) !== null) {
          files.push(match[1]);
        }

        const truncated = output.length > 50_000
          ? output.slice(0, 50_000) + `\n... [truncated, ${output.length} total chars]`
          : output;

        api.logger.info(`[cc-optimize] Diff: ${mode}, ${files.length} files, ${output.length} chars`);

        return {
          mode,
          files,
          fileCount: files.length,
          totalChars: output.length,
          truncated: output.length > 50_000,
          diff: truncated,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not a git repository") || msg.includes("fatal:")) {
          return { error: { code: "NOT_GIT_REPO", message: "Not a git repository or git not available" } };
        }
        return { error: { code: "DIFF_FAILED", message: msg } };
      }
    },
    isEnabled: () => true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  }), { name: "cc-optimize:cc-diff" });
}
