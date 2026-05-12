import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface PredictionState {
  lastAction: string;
  lastToolName: string;
  lastPrediction: string | null;
  sessionPatterns: string[];
  predictionCount: number;
  hitCount: number;
}

const COMMON_PATTERNS = [
  { after: "read", predict: "grep", reason: "reading files often leads to searching" },
  { after: "grep", predict: "read", reason: "search results often need file reading" },
  { after: "grep", predict: "edit", reason: "searching often precedes editing" },
  { after: "read", predict: "edit", reason: "reading often leads to editing" },
  { after: "write", predict: "exec", reason: "writing code often needs testing" },
  { after: "edit", predict: "exec", reason: "editing often needs verification" },
  { after: "exec", predict: "exec", reason: "commands often need follow-up commands" },
  { after: "glob", predict: "read", reason: "finding files usually means reading them" },
  { after: "web_search", predict: "web_fetch", reason: "searching often leads to fetching" },
];

export function createSpeculationEngine(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  const state: PredictionState = {
    lastAction: "",
    lastToolName: "",
    lastPrediction: null,
    sessionPatterns: [],
    predictionCount: 0,
    hitCount: 0,
  };

  function predictNextAction(toolName: string, input: Record<string, unknown>): string | null {
    const name = toolName.toLowerCase().trim();

    for (const pattern of COMMON_PATTERNS) {
      if (name === pattern.after) {
        state.predictionCount++;
        state.lastPrediction = pattern.predict;
        api.logger.debug(`[cc-optimize] Prediction: after ${name} → likely ${pattern.predict} (${pattern.reason})`);
        return pattern.predict;
      }
    }

    if (name === state.lastToolName && name === "exec") {
      state.predictionCount++;
      state.lastPrediction = "exec";
      return "exec";
    }

    state.lastPrediction = null;
    return null;
  }

  function recordActualAction(toolName: string): void {
    if (state.lastPrediction && toolName === state.lastPrediction) {
      state.hitCount++;
    }
    state.lastToolName = toolName;
    state.sessionPatterns.push(toolName);

    if (state.sessionPatterns.length > 20) {
      state.sessionPatterns.shift();
    }
  }

  function getAccuracy(): number {
    if (state.predictionCount === 0) return 0;
    return state.hitCount / state.predictionCount;
  }

  function getCommonPattern(): string | null {
    if (state.sessionPatterns.length < 5) return null;

    const counts = new Map<string, number>();
    for (const p of state.sessionPatterns) {
      counts.set(p, (counts.get(p) || 0) + 1);
    }

    let maxTool = "";
    let maxCount = 0;
    for (const [tool, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        maxTool = tool;
      }
    }

    if (maxCount >= 3) {
      return maxTool;
    }
    return null;
  }

  api.registerHook("before_tool_call", async (ctx) => {
    const toolName = (ctx as { toolName?: string }).toolName || "";
    const args = (ctx as { args?: Record<string, unknown> }).args || {};

    if (toolName) {
      const prediction = predictNextAction(toolName, args);
      recordActualAction(toolName);

      return {
        ...ctx,
        metadata: {
          ...ctx.metadata,
          ccPrediction: prediction,
          ccPredictionAccuracy: getAccuracy(),
        },
      };
    }
    return ctx;
  }, { name: "cc-optimize:speculation-hook" });

  api.registerHook("session_start", async (ctx) => {
    api.logger.info("[cc-optimize] Speculation engine: analyzing tool patterns");
    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        ccSpeculationReady: true,
      },
    };
  }, { name: "cc-optimize:speculation-session" });

  api.logger.info("[cc-optimize] Speculation engine: 9 pattern rules loaded");

  return {
    predictNextAction,
    recordActualAction,
    getAccuracy,
    getCommonPattern,
    getState: () => ({ ...state }),
  };
}
