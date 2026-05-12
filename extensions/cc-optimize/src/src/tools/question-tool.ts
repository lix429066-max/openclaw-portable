import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export function registerQuestionTool(api: OpenClawPluginApi) {
  api.registerTool({
    name: "cc_question",
    description:
      "Ask the user a structured question with predefined options. Use when: you need to clarify requirements, choose between approaches, or confirm a decision. Do NOT use: for simple yes/no that can be inferred, or when you already know the answer.",
    parameters: {
      type: "object" as const,
      properties: {
        question: { type: "string" },
        header: { type: "string" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              description: { type: "string" },
            },
            required: ["label", "description"],
          },
        },
        multiple: { type: "boolean" },
      },
      required: ["question", "header", "options"],
    },
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const question = (params.question as string) || "";
      const header = (params.header as string) || "";
      const options = (params.options as Array<{ label: string; description: string }>) || [];
      const multiple = params.multiple as boolean | undefined;
      return {
        type: "question",
        question,
        header,
        options,
        multiple,
        note: "Present these options to the user and wait for their selection before proceeding.",
      };
    },
    isEnabled: () => true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  }, { name: "cc-optimize:cc-question" });
}
