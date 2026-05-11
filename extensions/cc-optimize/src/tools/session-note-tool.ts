import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const sessionNotes = new Map<string, string>();

export function registerSessionNoteTool(api: OpenClawPluginApi) {
  api.registerTool((ctx) => ({
    name: "session_note",
    description: "Save a note to the current session's scratchpad. Use this to persist intermediate findings, TODO items, or decisions that don't need memory persistence.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "A short key/name for this note (e.g., 'bug-root-cause', 'refactor-plan')",
        },
        value: {
          type: "string",
          description: "The content to save. Can be multi-line. Use this for findings, plans, or decisions.",
        },
        action: {
          type: "string",
          enum: ["set", "get", "list", "delete"],
          description: "set=save note, get=read note, list=all notes, delete=remove note",
        },
      },
      required: ["action"],
    },
    async call({ key, value, action }: { key?: string; value?: string; action: "set" | "get" | "list" | "delete" }) {
      const sessionKey = ctx.sessionKey || "default";

      if (!sessionNotes.has(sessionKey)) {
        sessionNotes.set(sessionKey, "{}");
      }

      const notes = JSON.parse(sessionNotes.get(sessionKey)! || "{}") as Record<string, string>;

      switch (action) {
        case "set":
          if (!key || !value) return { error: { code: "MISSING_PARAM", message: "key and value required for set" } };
          notes[key] = value;
          sessionNotes.set(sessionKey, JSON.stringify(notes));
          api.logger.info(`[cc-optimize] Session note set: ${key} (${value.length} chars)`);
          return { success: true, key, saved: true };

        case "get":
          if (!key) return { error: { code: "MISSING_PARAM", message: "key required for get" } };
          return { key, value: notes[key] || null };

        case "list":
          return { keys: Object.keys(notes), count: Object.keys(notes).length };

        case "delete":
          if (!key) return { error: { code: "MISSING_PARAM", message: "key required for delete" } };
          delete notes[key];
          sessionNotes.set(sessionKey, JSON.stringify(notes));
          return { success: true, key, deleted: true };

        default:
          return { error: { code: "INVALID_ACTION", message: `Unknown action: ${action}. Use: set, get, list, delete` } };
      }
    },
    isEnabled: () => true,
    isReadOnly: ({ action }: { action?: string }) => action === "get" || action === "list",
    isConcurrencySafe: () => true,
  }), { name: "cc-optimize:session-note" });
}
