import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { readGitState, formatGitContext } from "../git/git-state-reader.js";

interface GitInjectionState {
  lastBranch: string | null;
  lastSha: string | null;
  injectionCount: number;
  enabled: boolean;
}

export function createGitContextInjector(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  const state: GitInjectionState = {
    lastBranch: null,
    lastSha: null,
    injectionCount: 0,
    enabled: true,
  };

  function getGitPrompt(workspacePath: string): string {
    const gitState = readGitState(workspacePath);
    if (!gitState) return "";

    const branchChanged = gitState.branch !== state.lastBranch;
    const shaChanged = gitState.headSha !== state.lastSha;

    if (branchChanged || shaChanged) {
      state.lastBranch = gitState.branch;
      state.lastSha = gitState.headSha;
      state.injectionCount++;

      const context = formatGitContext(workspacePath);

      if (branchChanged && gitState.branch) {
        api.logger.info(`[cc-optimize] Git branch change: ${state.lastBranch} → ${gitState.branch}`);
      }

      return context;
    }

    return "";
  }

  api.registerHook("session_start", async (ctx) => {
    const wsPath = (ctx as { workspacePath?: string }).workspacePath || "";

    if (wsPath && state.enabled) {
      const gitPrompt = getGitPrompt(wsPath);
      if (gitPrompt) {
        api.logger.info(`[cc-optimize] Git context injected (#${state.injectionCount})`);
        return {
          ...ctx,
          metadata: {
            ...ctx.metadata,
            ccGitContext: gitPrompt,
            ccGitInjectionCount: state.injectionCount,
          },
        };
      }
    }

    return ctx;
  }, { name: "cc-optimize:git-inject-session" });

  return {
    getGitPrompt,
    getState: () => ({ ...state }),
  };
}
