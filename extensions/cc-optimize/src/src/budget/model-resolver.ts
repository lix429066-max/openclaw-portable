import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface ModelOption {
  id: string;
  provider: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  priority: number;
}

const MODEL_PRIORITY: Record<string, number> = {
  "deepseek/deepseek-v4-pro": 10,
  "deepseek/deepseek-chat": 8,
  "deepseek/deepseek-reasoner": 7,
  "llama-qwen35b/Qwen3.6-35B-A3B-APEX-I-Mini": 5,
};

export function resolveModel(
  currentModel: string,
  fallbacks: string[],
  allowList?: string[],
): string {
  if (!allowList || allowList.length === 0) return currentModel;

  if (allowList.some((a) => matchModel(a, currentModel))) return currentModel;

  for (const fb of fallbacks) {
    if (allowList.some((a) => matchModel(a, fb))) return fb;
  }

  return currentModel;
}

function matchModel(rule: string, modelId: string): boolean {
  const normalized = rule.toLowerCase().trim();
  if (normalized === "*" || normalized === "all") return true;
  if (normalized === modelId.toLowerCase()) return true;
  if (normalized.includes("*")) {
    return new RegExp("^" + normalized.replace(/\*/g, ".*") + "$").test(modelId.toLowerCase());
  }
  return false;
}

export function rankModels(models: ModelOption[]): ModelOption[] {
  return [...models].sort((a, b) => {
    const pa = MODEL_PRIORITY[`${a.provider}/${a.id}`] || 1;
    const pb = MODEL_PRIORITY[`${b.provider}/${b.id}`] || 1;
    return pb - pa;
  });
}

function getContextWindowForId(modelId: string): number {
  const lower = modelId.toLowerCase();
  if (lower.includes("gpt-5")) return 200_000;
  if (lower.includes("claude")) {
    if (lower.includes("opus-4") || lower.includes("sonnet-4")) return 200_000;
    return 200_000;
  }
  if (lower.includes("deepseek")) return 131_072;
  if (lower.includes("gemini-2.5")) return 1_000_000;
  if (lower.includes("qwen")) return 72_000;
  return 131_072;
}

export function getEffectiveContextWindow(modelId: string, reservedForOutput = 20_000): number {
  return Math.max(4_000, getContextWindowForId(modelId) - reservedForOutput);
}

export const COMPACTION_CONSTANTS = {
  MAX_OUTPUT_TOKENS_FOR_SUMMARY: 20_000,
  AUTOCOMPACT_BUFFER_TOKENS: 13_000,
  WARNING_THRESHOLD_BUFFER_TOKENS: 20_000,
  MANUAL_COMPACT_BUFFER_TOKENS: 3_000,
  MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES: 3,
  POST_COMPACT_MAX_FILES_TO_RESTORE: 5,
  POST_COMPACT_TOKEN_BUDGET: 50_000,
  POST_COMPACT_MAX_TOKENS_PER_FILE: 5_000,
};

export function createModelResolver(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  const modelState = {
    current: "",
    fallbacks: [] as string[],
    allowList: [] as string[],
  };

  function setCurrent(model: string) {
    modelState.current = model;
    api.logger.info(`[cc-optimize] Model set: ${model} (${getContextWindowForId(model)} context)`);
  }

  function setFallbacks(fallbacks: string[]) {
    modelState.fallbacks = fallbacks;
    api.logger.info(`[cc-optimize] Fallbacks: ${fallbacks.join(" → ")}`);
  }

  function getBestAvailable(deniedModels?: string[]): string {
    const candidates = [modelState.current, ...modelState.fallbacks];
    const denied = new Set((deniedModels || []).map((m) => m.toLowerCase()));

    for (const candidate of candidates) {
      if (!denied.has(candidate.toLowerCase())) return candidate;
    }
    return modelState.current;
  }

  function getModelInfo() {
    return {
      current: modelState.current,
      contextWindow: getContextWindowForId(modelState.current),
      effectiveWindow: getEffectiveContextWindow(modelState.current),
      fallbacks: modelState.fallbacks,
    };
  }

  return {
    setCurrent,
    setFallbacks,
    getBestAvailable,
    getModelInfo,
    resolveModel,
    rankModels,
    getContextWindowForId,
    getEffectiveContextWindow,
  };
}
