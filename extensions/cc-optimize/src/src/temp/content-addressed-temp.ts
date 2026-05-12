import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const hashCache = new Map<string, string>();

export function contentHash(content: string): string {
  const cached = hashCache.get(content);
  if (cached) return cached;

  const hash = createHash("sha256").update(content, "utf8").digest("hex").slice(0, 16);
  hashCache.set(content, hash);
  return hash;
}

export function contentAddressedTempPath(content: string, extension = ".txt"): string {
  const hash = contentHash(content);
  const baseDir = join(tmpdir(), "openclaw-cc", hash.slice(0, 2));
  return join(baseDir, `${hash.slice(2)}${extension}`);
}

export function initContentAddressedTempFiles(
  api: OpenClawPluginApi,
  _config: { contentAddressedTempFiles: boolean },
) {
  api.registerHook("session_start", async (ctx)=> {
    try {
      const tempBase = join(tmpdir(), "openclaw-cc");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(tempBase, { recursive: true });

      for (let i = 0; i < 256; i++) {
        const subDir = join(tempBase, i.toString(16).padStart(2, "0"));
        mkdirSync(subDir, { recursive: true });
      }

      api.logger.debug(`[cc-optimize] Content-addressed temp directories initialized at ${tempBase}`);
    } catch (err) {
      api.logger.warn(`[cc-optimize] Failed to initialize temp directories: ${err instanceof Error ? err.message : err}`);
    }

    return ctx;
  }, { name: "cc-optimize:temp-session-start" });

  api.registerHook("before_tool_call", async (ctx)=> {
    if (ctx.toolName === "write" && typeof ctx.args?.path === "string") {
      const path = ctx.args.path;
      if (path.includes(".openclaw-cc-") || path.includes("openclaw-cc/")) {
        api.logger.debug(`[cc-optimize] Content-addressed path detected: ${path}`);
      }
    }
    return ctx;
  }, { name: "cc-optimize:temp-before-tool" });

  return {
    contentHash,
    contentAddressedTempPath,
    hashCache,
  };
}

export function clearHashCache() {
  hashCache.clear();
}