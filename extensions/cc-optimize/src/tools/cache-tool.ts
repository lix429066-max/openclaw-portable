import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const fileCache = new Map<string, { content: string; timestamp: number }>();
const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 30_000;

export function registerCacheTool(api: OpenClawPluginApi) {
  function getCache(key: string): string | null {
    const entry = fileCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      fileCache.delete(key);
      return null;
    }
    return entry.content;
  }

  function setCache(key: string, content: string): void {
    if (fileCache.size >= MAX_CACHE_SIZE) {
      const oldest = [...fileCache.entries()]
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0];
      if (oldest) fileCache.delete(oldest[0]);
    }
    fileCache.set(key, { content, timestamp: Date.now() });
  }

  api.registerTool((ctx) => ({
    name: "cache",
    description: "Cache tool results to avoid redundant reads. Best for: multi-step workflows where the same file is read multiple times. Use get to check cache before reading a file that was recently read. Cache entries expire after 30 seconds.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get", "set", "clear"],
          description: "get=read from cache, set=save to cache, clear=wipe cache",
        },
        key: {
          type: "string",
          description: "Cache key (e.g., file path)",
        },
        value: {
          type: "string",
          description: "Content to cache (for 'set' action)",
        },
      },
      required: ["action"],
    },
    async call({ action, key, value }: { action: "get" | "set" | "clear"; key?: string; value?: string }) {
      switch (action) {
        case "get": {
          if (!key) return { error: { code: "MISSING_PARAM", message: "key required for get", param: "key" } };
          const cached = getCache(key);
          if (cached) {
            api.logger.debug(`[cc-optimize] Cache hit: ${key}`);
            return { hit: true, key, content: cached };
          }
          return { hit: false, key };
        }

        case "set": {
          if (!key || value === undefined) return { error: { code: "MISSING_PARAM", message: "key and value required for set" } };
          setCache(key, value);
          return { success: true, key, cached: true };
        }

        case "clear": {
          fileCache.clear();
          api.logger.info("[cc-optimize] Cache cleared");
          return { success: true, cleared: true };
        }

        default:
          return { error: { code: "INVALID_ACTION", message: `Unknown action: ${action}. Use: get, set, clear` } };
      }
    },
    isEnabled: () => true,
    isReadOnly: ({ action }: { action?: string }) => action === "get",
    isConcurrencySafe: () => true,
  }), { name: "cc-optimize:cache" });
}
