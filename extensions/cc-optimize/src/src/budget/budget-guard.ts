import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface BudgetState {
  totalInputTokens: number;
  totalOutputTokens: number;
  maxBudgetTokens: number;
  maxTurns: number;
  currentTurn: number;
  budgetWarnings: Array<{ timestamp: number; ratio: number; message: string }>;
  lastCheckAt: number;
}

interface BudgetConfig {
  maxBudgetTokens: number;
  maxTurns: number;
  tokenBudgetSafetyMargin: number;
}

function estimateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 0.00000055) + (outputTokens * 0.00000219);
}

export function createBudgetGuard(
  api: OpenClawPluginApi,
  config: BudgetConfig,
  onTokenUpdate?: (input: number, output: number) => void,
) {
  const state: BudgetState = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    maxBudgetTokens: config.maxBudgetTokens || 200_000,
    maxTurns: config.maxTurns || 100,
    currentTurn: 0,
    budgetWarnings: [],
    lastCheckAt: 0,
  };

  function trackTokens(input: number, output: number) {
    state.totalInputTokens += input;
    state.totalOutputTokens += output;
    state.currentTurn++;

    onTokenUpdate?.(input, output);

    const totalTokens = state.totalInputTokens + state.totalOutputTokens;
    const ratio = totalTokens / state.maxBudgetTokens;
    const estimatedCost = estimateCost(state.totalInputTokens, state.totalOutputTokens);

    if (ratio >= 0.95) {
      const warning = {
        timestamp: Date.now(),
        ratio,
        message: `BUDGET CRITICAL: ${totalTokens}/${state.maxBudgetTokens} tokens (${(ratio * 100).toFixed(1)}%), estimated cost: $${estimatedCost.toFixed(4)}`,
      };
      state.budgetWarnings.push(warning);
      api.logger.warn(`[cc-optimize] ${warning.message}`);
    } else if (ratio >= 0.8) {
      api.logger.info(
        `[cc-optimize] Budget warning: ${(ratio * 100).toFixed(1)}% used (${totalTokens}/${state.maxBudgetTokens} tokens, est $${estimatedCost.toFixed(4)})`,
      );
    } else if (state.currentTurn % 10 === 0) {
      api.logger.debug(
        `[cc-optimize] Budget: turn ${state.currentTurn}, ${totalTokens} tokens, est $${estimatedCost.toFixed(4)}`,
      );
    }

    state.lastCheckAt = Date.now();
  }

  function getBudgetStatus() {
    const totalTokens = state.totalInputTokens + state.totalOutputTokens;
    const ratio = totalTokens / state.maxBudgetTokens;
    const estimatedCost = estimateCost(state.totalInputTokens, state.totalOutputTokens);
    return {
      totalInputTokens: state.totalInputTokens,
      totalOutputTokens: state.totalOutputTokens,
      totalTokens,
      maxBudgetTokens: state.maxBudgetTokens,
      ratio,
      estimatedCost,
      currentTurn: state.currentTurn,
      maxTurns: state.maxTurns,
      turnRatio: state.currentTurn / state.maxTurns,
      warnings: state.budgetWarnings.slice(-5),
    };
  }

  function isOverBudget(): boolean {
    const totalTokens = state.totalInputTokens + state.totalOutputTokens;
    return (
      totalTokens >= state.maxBudgetTokens * (1 - config.tokenBudgetSafetyMargin) ||
      state.currentTurn >= state.maxTurns
    );
  }

  api.registerHook("after_tool_call", async (ctx)=> {
    const usage = ctx.result?.usage;
    if (usage && typeof usage === "object") {
      const input = (usage as { inputTokens?: number; outputTokens?: number }).inputTokens ?? 0;
      const output = (usage as { inputTokens?: number; outputTokens?: number }).outputTokens ?? 0;
      if (input + output > 0) {
        trackTokens(input, output);

        if (isOverBudget()) {
          api.logger.warn(
            `[cc-optimize] Budget limit approaching! Turn ${state.currentTurn}/${state.maxTurns}, ` +
            `Tokens ${state.totalInputTokens + state.totalOutputTokens}/${state.maxBudgetTokens}`,
          );
        }
      }
    }
    return ctx;
  }, { name: "cc-optimize:budget-after-tool" });

  return {
    trackTokens,
    getBudgetStatus,
    isOverBudget,
    estimateCost,
  };
}