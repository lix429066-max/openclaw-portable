import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const RETRY_INITIAL_DELAY = 2000;
const RETRY_BACKOFF_FACTOR = 2;
const RETRY_MAX_DELAY = 30_000;

export function computeRetryDelay(attempt: number): number {
  return Math.min(
    RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1),
    RETRY_MAX_DELAY,
  );
}

type ErrorCategory =
  | "rate_limit"
  | "billing"
  | "context_overflow"
  | "transient_http"
  | "auth"
  | "compaction_failure"
  | "session_corruption"
  | "unknown";

interface ClassifiedError {
  category: ErrorCategory;
  retryable: boolean;
  canFallback: boolean;
  cooldownMs: number;
  message: string;
  originalError: Error | string;
}

const ERROR_PATTERNS: Array<{
  category: ErrorCategory;
  patterns: RegExp[];
  cooldownMs: number;
  retryable: boolean;
}> = [
  {
    category: "rate_limit",
    patterns: [/rate.?limit/i, /too many requests/i, /429/i, /quota exceeded/i, /requests per (minute|hour|day)/i],
    cooldownMs: 30_000,
    retryable: true,
  },
  {
    category: "billing",
    patterns: [/billing/i, /insufficient.*(balance|quota|funds)/i, /payment required/i, /402/i, /credit/i, /account.*(balance|suspended|disabled)/i],
    cooldownMs: 0,
    retryable: false,
  },
  {
    category: "context_overflow",
    patterns: [
      /context.*(window|length|limit|overflow|exceed)/i,
      /token.*(limit|budget|exceed|overflow)/i,
      /too many tokens/i,
      /max.*tokens.*exceed/i,
      /prompt.*too.*long/i,
      // Provider-specific overflow patterns (OpenCode error.ts)
      /prompt is too long/i,                    // Anthropic
      /input is too long for requested model/i, // Amazon Bedrock
      /exceeds the context window/i,            // OpenAI
      /input token count.*exceeds the maximum/i,// Google Gemini
      /maximum prompt length is \d+/i,          // xAI Grok
      /reduce the length of the messages/i,     // Groq
      /maximum context length is \d+ tokens/i,  // OpenRouter, DeepSeek, vLLM
      /exceeds the limit of \d+/i,              // GitHub Copilot
      /exceeds the available context size/i,    // llama.cpp server
      /greater than the context length/i,       // LM Studio
      /context window exceeds limit/i,          // MiniMax
      /exceeded model token limit/i,            // Kimi, Moonshot
      /context[_ ]length[_ ]exceeded/i,         // Generic fallback
      /request entity too large/i,              // HTTP 413
      /context length is only \d+ tokens/i,     // vLLM
      /input length.*exceeds.*context length/i, // vLLM
      /too large for model with \d+ maximum context length/i, // Mistral
      /model_context_window_exceeded/i,         // z.ai
    ],
    cooldownMs: 1_000,
    retryable: true,
  },
  {
    category: "transient_http",
    patterns: [/econnrefused/i, /econnreset/i, /etimedout/i, /enotfound/i, /socket hang up/i, /network.?error/i, /timeout/i, /503/i, /502/i, /504/i, /temporarily unavailable/i],
    cooldownMs: 2_500,
    retryable: true,
  },
  {
    category: "auth",
    patterns: [/unauthorized/i, /401/i, /403/i, /invalid.*api.?key/i, /authentication/i, /not authorized/i, /access denied/i],
    cooldownMs: 0,
    retryable: false,
  },
  {
    category: "compaction_failure",
    patterns: [/compact/i, /summar.*fail/i, /context.*compress/i],
    cooldownMs: 5_000,
    retryable: true,
  },
  {
    category: "session_corruption",
    patterns: [/session.*(corrupt|invalid|expired)/i, /parse.?error.?message/i, /role.*order/i, /malformed.*message/i],
    cooldownMs: 1_000,
    retryable: false,
  },
];

export function classifyError(error: Error | string): ClassifiedError {
  const message = typeof error === "string" ? error : error.message;

  for (const pattern of ERROR_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(message)) {
        return {
          category: pattern.category,
          retryable: pattern.retryable,
          canFallback: pattern.category !== "auth" && pattern.category !== "session_corruption",
          cooldownMs: pattern.cooldownMs,
          message,
          originalError: error,
        };
      }
    }
  }

  return {
    category: "unknown",
    retryable: false,
    canFallback: true,
    cooldownMs: 1_000,
    message,
    originalError: error,
  };
}

export function getRecoveryStrategy(classified: ClassifiedError): {
  level: 1 | 2 | 3;
  message: string;
  action: string;
} {
  switch (classified.category) {
    case "rate_limit":
      return {
        level: 1,
        message: `Rate limit (cooldown: ${classified.cooldownMs}ms)`,
        action: "wait",
      };
    case "context_overflow":
      return {
        level: 1,
        message: "Context overflow",
        action: "compact",
      };
    case "transient_http":
      return {
        level: 1,
        message: `Transient HTTP (retry in ${classified.cooldownMs}ms)`,
        action: "retry",
      };
    case "compaction_failure":
      return {
        level: 2,
        message: "Compaction failed, retrying with simpler strategy",
        action: "retry_compact",
      };
    case "billing":
      return {
        level: 3,
        message: "Billing issue — switching to fallback provider",
        action: "fallback",
      };
    case "auth":
      return {
        level: 3,
        message: "Authentication failed — verify API key",
        action: "report",
      };
    case "session_corruption":
      return {
        level: 3,
        message: "Session corrupted — recommend /new",
        action: "report",
      };
    default:
      return {
        level: 2,
        message: "Unclassified error",
        action: "retry",
      };
  }
}

export function createErrorClassifier(
  api: OpenClawPluginApi,
  config: { errorFallbackChain: boolean; maxFallbackModels: number },
  onFallback?: (reason: string) => string | null,
) {
  let fallbackCallback = onFallback;

  function setFallbackCallback(cb: (reason: string) => string | null) {
    fallbackCallback = cb;
  }
  api.registerHook("llm_output", async (ctx)=> {
    const error = ctx.error;
    if (!error && !ctx.result?.error) return ctx;

    const rawError = error ?? ctx.result?.error;
    const classified = classifyError(
      rawError instanceof Error ? rawError : String(rawError ?? "unknown error"),
    );

    const recovery = getRecoveryStrategy(classified);

    api.logger.warn(
      `[cc-optimize] Error: ${classified.category} | L${recovery.level} | ${recovery.action} | ${recovery.message}`,
    );

    if (recovery.level === 3) {
      api.logger.error(
        `[cc-optimize] Recovery level 3 — ${recovery.message}`,
      );
    }

    if (classified.category === "context_overflow") {
      api.logger.info(
        `[cc-optimize] Context overflow — auto-compaction will reduce token usage`,
      );
    }

    if (classified.canFallback && fallbackCallback && classified.category !== "unknown") {
      const fallbackModel = fallbackCallback(classified.category);
      if (fallbackModel) {
        api.logger.warn(
          `[cc-optimize] Triggering model fallback: ${classified.category} → ${fallbackModel}`,
        );
      }
    }

    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        ccErrorCategory: classified.category,
        ccErrorRecoveryLevel: recovery.level,
        ccErrorRecoveryAction: recovery.action,
        ccErrorRetryable: classified.retryable,
        ccErrorCanFallback: classified.canFallback,
      },
    };
  }, { name: "cc-optimize:error-on-error" });

  return {
    classifyError,
    getRecoveryStrategy,
    setFallbackCallback,
    computeRetryDelay,
  };
}