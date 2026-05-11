import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export function registerQuestionTool(api: OpenClawPluginApi) {
  api.registerTool((_ctx) => ({
    name: "cc_question",
    description:
      "Ask the user a structured question with predefined options. Use when: you need to clarify requirements, choose between approaches, or confirm a decision. Do NOT use: for simple yes/no that can be inferred, or when you already know the answer.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The complete question to ask the user",
        },
        header: {
          type: "string",
          description: "Very short label (max 30 chars)",
        },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Display text (1-5 words)" },
              description: { type: "string", description: "Explanation of choice" },
            },
            required: ["label", "description"],
          },
        },
        multiple: {
          type: "boolean",
          description: "Allow selecting multiple choices (default: false)",
        },
      },
      required: ["question", "header", "options"],
    },
    async call({ question, header, options, multiple = false }: {
      question: string;
      header: string;
      options: Array<{ label: string; description: string }>;
      multiple?: boolean;
    }) {
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
  }), { name: "cc-optimize:cc-question" });
}
