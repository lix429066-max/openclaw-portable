const BYTES_PER_TOKEN_DEFAULT = 4;
const BYTES_PER_TOKEN_JSON = 2;
const IMAGE_FIXED_TOKENS = 2000;
const DOCUMENT_FIXED_TOKENS = 2000;

export function roughTokenCount(text: string, bytesPerToken = BYTES_PER_TOKEN_DEFAULT): number {
  return Math.max(1, Math.round(text.length / bytesPerToken));
}

export function bytesPerTokenForType(mimeType?: string): number {
  if (!mimeType) return BYTES_PER_TOKEN_DEFAULT;
  const lower = mimeType.toLowerCase();
  if (lower.includes("json")) return BYTES_PER_TOKEN_JSON;
  if (lower.includes("javascript") || lower.includes("typescript")) return BYTES_PER_TOKEN_JSON;
  return BYTES_PER_TOKEN_DEFAULT;
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  data?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  source?: { data?: string; media_type?: string };
}

export function estimateTokensForBlock(block: ContentBlock): number {
  switch (block.type) {
    case "text":
      return roughTokenCount(block.text || "");

    case "image":
    case "document":
      return IMAGE_FIXED_TOKENS;

    case "thinking":
      return roughTokenCount(block.thinking || "");

    case "redacted_thinking":
      return roughTokenCount(block.data || "");

    case "tool_use": {
      const name = block.name || "";
      const inputStr = block.input ? JSON.stringify(block.input) : "";
      return roughTokenCount(name + inputStr);
    }

    case "tool_result":
    case "tool_use_result": {
      const content = block.content;
      if (typeof content === "string") {
        return roughTokenCount(content);
      }
      if (Array.isArray(content)) {
        return content.reduce((sum, c) => {
          if (typeof c === "string") return sum + roughTokenCount(c);
          if (c && typeof c === "object") return sum + estimateTokensForBlock(c as ContentBlock);
          return sum;
        }, 0);
      }
      return roughTokenCount(JSON.stringify(content));
    }

    default:
      return roughTokenCount(JSON.stringify(block));
  }
}

export interface Message {
  role: string;
  content: string | ContentBlock | ContentBlock[] | unknown;
}

export function estimateTokensForMessage(message: Message): number {
  if (typeof message.content === "string") {
    return roughTokenCount(message.content);
  }

  if (Array.isArray(message.content)) {
    return message.content.reduce((sum, block) => {
      if (typeof block === "string") return sum + roughTokenCount(block);
      return sum + estimateTokensForBlock(block as ContentBlock);
    }, 0);
  }

  if (message.content && typeof message.content === "object") {
    return estimateTokensForBlock(message.content as ContentBlock);
  }

  return 0;
}

export function estimateTokensForMessages(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateTokensForMessage(msg), 0);
}

export function getContextWindowForModel(modelId: string): number {
  const lower = modelId.toLowerCase();
  if (lower.includes("gpt-5") || lower.includes("claude-opus-4") || lower.includes("claude-sonnet-4")) return 200_000;
  if (lower.includes("deepseek")) return 131_072;
  if (lower.includes("claude-3-opus")) return 200_000;
  if (lower.includes("claude-3.5") || lower.includes("claude-3-5")) return 200_000;
  if (lower.includes("gemini-2.5")) return 1_000_000;
  if (lower.includes("gemini-2.0")) return 1_000_000;
  if (lower.includes("gpt-4o") || lower.includes("gpt-4.1")) return 128_000;
  if (lower.includes("gpt-4")) return 8_192;
  return 131_072;
}

export function getEffectiveContextWindow(modelId: string, reservedForOutput = 20_000): number {
  return Math.max(4_000, getContextWindowForModel(modelId) - reservedForOutput);
}

export class TokenEstimator {
  private totalInput = 0;
  private totalOutput = 0;
  private turnCount = 0;

  trackInput(messages: Message[]): number {
    const tokens = estimateTokensForMessages(messages);
    this.totalInput += tokens;
    this.turnCount++;
    return tokens;
  }

  trackOutput(text: string): number {
    const tokens = roughTokenCount(text);
    this.totalOutput += tokens;
    return tokens;
  }

  trackUsage(usage: { inputTokens?: number; outputTokens?: number }): void {
    if (usage.inputTokens) this.totalInput += usage.inputTokens;
    if (usage.outputTokens) this.totalOutput += usage.outputTokens;
    this.turnCount++;
  }

  getTotal(): number {
    return this.totalInput + this.totalOutput;
  }

  getUsageRatio(contextWindow: number): number {
    return this.getTotal() / contextWindow;
  }

  getStats() {
    return {
      inputTokens: this.totalInput,
      outputTokens: this.totalOutput,
      totalTokens: this.getTotal(),
      turnCount: this.turnCount,
    };
  }

  reset() {
    this.totalInput = 0;
    this.totalOutput = 0;
    this.turnCount = 0;
  }
}
