import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

const todoStore = new Map<string, TodoItem[]>();

function getSessionTodos(sessionKey: string): TodoItem[] {
  if (!todoStore.has(sessionKey)) {
    todoStore.set(sessionKey, []);
  }
  return todoStore.get(sessionKey)!;
}

export function registerTodoTool(api: OpenClawPluginApi) {
  api.registerTool((ctx) => ({
    name: "todo_write",
    description: "Create and manage a structured task list for the current coding session. Use for tracking progress on complex multi-step tasks. Supports: pending/in_progress/completed/cancelled statuses with high/medium/low priority. Call with full list to replace; items matched by content to update.",
    inputSchema: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "Brief description of the task" },
              status: { type: "string", enum: ["pending", "in_progress", "completed", "cancelled"] },
              priority: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["content", "status", "priority"],
          },
        },
      },
      required: ["todos"],
    },
    async call({ todos }: { todos: TodoItem[] }) {
      const sessionKey = ctx.sessionKey || "default";
      const existing = getSessionTodos(sessionKey);

      for (const item of todos) {
        const existingItem = existing.find(
          (e) => e.content === item.content,
        );
        if (existingItem) {
          existingItem.status = item.status;
          existingItem.priority = item.priority;
        } else {
          existing.push({
            id: `todo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            content: item.content,
            status: item.status,
            priority: item.priority,
          });
        }
      }

      const summary = existing.filter((t) => t.status !== "completed" && t.status !== "cancelled");
      api.logger.info(
        `[cc-optimize] Todo: ${summary.length} active, ${existing.length} total`,
      );

      return {
        success: true,
        activeCount: summary.length,
        totalCount: existing.length,
        todos: summary,
      };
    },
    isEnabled: () => true,
    isReadOnly: () => false,
    isConcurrencySafe: () => true,
  }), { name: "cc-optimize:todo-write" });
}
