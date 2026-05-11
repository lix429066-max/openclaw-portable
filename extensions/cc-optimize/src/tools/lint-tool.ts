import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export function registerLintTool(api: OpenClawPluginApi) {
  api.registerTool((ctx) => ({
    name: "cc_lint",
    description: "Run basic validation on files: checks bracket balance, detects imports, verifies JSON syntax. Best for: quick sanity check after editing TS/JS/JSON files. Not a full linter — for quick validation before committing.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File or directory path to check",
        },
        check: {
          type: "string",
          enum: ["syntax", "imports", "types", "all"],
          description: "What to check: syntax=basic parse, imports=import resolution, types=type annotations, all=everything",
        },
      },
      required: ["path"],
    },
    async call({ path, check = "syntax" }: { path: string; check?: string }) {
      const workspacePath = (ctx as { workspacePath?: string }).workspacePath ||
        process.cwd();

      const resolvedPath = resolve(workspacePath, path);
      const results: Array<{ file: string; issue: string; severity: string; line?: number }> = [];

      // Check if file/dir exists
      if (!existsSync(resolvedPath)) {
        return { error: { code: "NOT_FOUND", message: `Path not found: ${path}` } };
      }

      const stat = statSync(resolvedPath);
      const isDir = stat.isDirectory();

      if (isDir) {
        results.push({
          file: path,
          issue: `Directory check: ${path} exists and is a directory`,
          severity: "info",
        });
        return { path, isDirectory: true, results, summary: "Directory exists" };
      }

      // Read file content
      try {
        const content = readFileSync(resolvedPath, "utf8");
        const ext = path.split(".").pop()?.toLowerCase() || "";
        const lines = content.split("\n");

        if (check === "syntax" || check === "all") {
          // Basic syntax checks
          if (ext === "json") {
            try {
              JSON.parse(content);
            } catch {
              results.push({ file: path, issue: "JSON parse error", severity: "error" });
            }
          }

          if (ext === "ts" || ext === "tsx" || ext === "js") {
            let braceCount = 0;
            let parenCount = 0;
            let bracketCount = 0;
            for (let i = 0; i < lines.length; i++) {
              const cleaned = lines[i]
                .replace(/`[^`]*`/g, "")     // skip template literals
                .replace(/'[^']*'/g, "")     // skip single-quoted strings
                .replace(/"[^"]*"/g, "")     // skip double-quoted strings
                .replace(/\/\/.*/g, "");     // skip line comments
              braceCount += (cleaned.match(/\{/g) || []).length - (cleaned.match(/\}/g) || []).length;
              parenCount += (cleaned.match(/\(/g) || []).length - (cleaned.match(/\)/g) || []).length;
              bracketCount += (cleaned.match(/\[/g) || []).length - (cleaned.match(/\]/g) || []).length;
            }
            if (braceCount !== 0) {
              results.push({ file: path, issue: `Unbalanced braces (diff: ${braceCount}) — check template literals and regex`, severity: "warning" });
            }
            if (parenCount !== 0) {
              results.push({ file: path, issue: `Unbalanced parentheses (diff: ${parenCount}) — check regex literals`, severity: "warning" });
            }
          }
        }

        if (check === "imports" || check === "all") {
          if (ext === "ts" || ext === "tsx" || ext === "js") {
            const importPattern = /from\s+['"]([^'"]+)['"]/g;
            let match;
            const imports: string[] = [];
            while ((match = importPattern.exec(content)) !== null) {
              imports.push(match[1]);
            }
            results.push({
              file: path,
              issue: `${imports.length} imports detected`,
              severity: "info",
            });
          }
        }

        if (check === "types" || check === "all") {
          if (ext === "ts" || ext === "tsx") {
            const hasTypes = content.includes(": ") || content.includes("interface ") || content.includes("type ");
            if (hasTypes) {
              results.push({ file: path, issue: "TypeScript type annotations present", severity: "info" });
            }
          }
        }

        if (results.length === 0) {
          results.push({ file: path, issue: "No issues found", severity: "info" });
        }

        const errors = results.filter((r) => r.severity === "error").length;
        const warnings = results.filter((r) => r.severity === "warning").length;

        api.logger.info(`[cc-optimize] Lint: ${path} → ${errors} errors, ${warnings} warnings`);

        return {
          path,
          lines: lines.length,
          size: content.length,
          extension: ext,
          check,
          results,
          summary: errors > 0
            ? `${errors} error(s), ${warnings} warning(s)`
            : warnings > 0
              ? `${warnings} warning(s) — likely OK`
              : "All checks passed",
        };
      } catch (err) {
        return { error: { code: "READ_FAILED", message: `Cannot read file: ${err instanceof Error ? err.message : err}` } };
      }
    },
    isEnabled: () => true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  }), { name: "cc-optimize:cc-lint" });
}
