import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createStructuredToolRegistry } from "./src/tools/structured-tool-registry.js";
import { createCompactionManager } from "./src/compact/compaction-manager.js";
import { createErrorClassifier } from "./src/errors/error-classifier.js";
import { createParallelHookRunner } from "./src/hooks/parallel-hook-runner.js";
import { initContentAddressedTempFiles } from "./src/temp/content-addressed-temp.js";
import { createBudgetGuard } from "./src/budget/budget-guard.js";
import { createContextInjector } from "./src/context/context-injector.js";
import { createSessionOptimizer } from "./src/session/session-optimizer.js";
import { createToolPartitioner } from "./src/tools/tool-partitioner.js";
import { createPermissionMatrix } from "./src/tools/permission-matrix.js";
import { createTaskManager } from "./src/tasks/task-manager.js";
import { createShellSafety } from "./src/shell/shell-safety.js";
import { createGitStateReader } from "./src/git/git-state-reader.js";
import { createMemoryTemplates } from "./src/memory/memory-templates.js";
import { createPromptEnhancer, BEAST_MODE_REMINDER } from "./src/context/prompt-enhancer.js";
import { createModelResolver } from "./src/budget/model-resolver.js";
import { createCommandRegistry } from "./src/tools/command-registry.js";
import { createHealthMonitor } from "./src/hooks/health-monitor.js";
import { createSessionRecovery } from "./src/session/session-recovery.js";
import { createAutoMemoryExtractor } from "./src/memory/auto-memory-extractor.js";
import { createSpeculationEngine } from "./src/tools/speculation-engine.js";
import { createGitContextInjector } from "./src/context/git-context-injector.js";
import { createPermissionFeedback } from "./src/tools/permission-feedback.js";
import { createStallDetector } from "./src/tasks/stall-detector.js";
import { registerMemoryIntegrations } from "./src/memory/memory-integration.js";
import { registerTodoTool } from "./src/tools/todo-tool.js";
import { registerSessionNoteTool } from "./src/tools/session-note-tool.js";
import { registerContextTool } from "./src/tools/context-tool.js";
import { registerDoctorTool } from "./src/tools/doctor-tool.js";
import { registerStatusTool } from "./src/tools/status-tool.js";
import { registerCacheTool } from "./src/tools/cache-tool.js";
import { registerHelpTool } from "./src/tools/help-tool.js";
import { registerDiffTool } from "./src/tools/diff-tool.js";
import { registerLintTool } from "./src/tools/lint-tool.js";
import { registerConfigTool } from "./src/tools/config-tool.js";
import { registerQuestionTool } from "./src/tools/question-tool.js";
import { registerModeTool } from "./src/tools/mode-tool.js";
import { registerCommands } from "./src/tools/commands.js";
import { registerCoreHooks } from "./src/hooks/core-hooks.js";

type PluginConfig = {
  enabled: boolean;
  autocompactThreshold: number;
  microCompactThreshold: number;
  reactiveCompactEnabled: boolean;
  errorFallbackChain: boolean;
  parallelHooks: boolean;
  contentAddressedTempFiles: boolean;
  structuredTools: boolean;
  freshTailCount: number;
  collapseThreshold: number;
  maxFallbackModels: number;
  tokenBudgetSafetyMargin: number;
  maxBudgetTokens: number;
  budgetTracking: boolean;
  contextInjection: boolean;
  sessionOptimization: boolean;
  toolPartitioning: boolean;
  permissionMatrix: boolean;
  taskManager: boolean;
  shellSafety: boolean;
  gitStateReader: boolean;
  memoryTemplates: boolean;
  promptEnhancer: boolean;
  modelResolver: boolean;
  commandRegistry: boolean;
  healthMonitor: boolean;
  sessionRecovery: boolean;
  autoMemoryExtractor: boolean;
  speculationEngine: boolean;
  gitContextInjection: boolean;
  permissionFeedback: boolean;
  stallDetector: boolean;
};

function resolveConfig(raw: unknown): PluginConfig {
  const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  const isBool = (v: unknown): v is boolean => typeof v === "boolean";
  const defaults: PluginConfig = {
    enabled: true,
    autocompactThreshold: 0.6,
    microCompactThreshold: 0.45,
    reactiveCompactEnabled: true,
    errorFallbackChain: true,
    parallelHooks: true,
    contentAddressedTempFiles: true,
    structuredTools: true,
    freshTailCount: 8,
    collapseThreshold: 0.9,
    maxFallbackModels: 3,
    tokenBudgetSafetyMargin: 0.05,
    maxBudgetTokens: 200_000,
    budgetTracking: true,
    contextInjection: true,
    sessionOptimization: true,
    toolPartitioning: true,
    permissionMatrix: true,
    taskManager: true,
    shellSafety: true,
    gitStateReader: true,
    memoryTemplates: true,
    promptEnhancer: true,
    modelResolver: true,
    commandRegistry: true,
    healthMonitor: true,
    sessionRecovery: true,
    autoMemoryExtractor: true,
    speculationEngine: true,
    gitContextInjection: true,
    permissionFeedback: true,
    stallDetector: true,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const input = raw as Record<string, unknown>;
  return {
    enabled: isBool(input.enabled) ? input.enabled : defaults.enabled,
    autocompactThreshold: isNum(input.autocompactThreshold) ? input.autocompactThreshold : defaults.autocompactThreshold,
    microCompactThreshold: isNum(input.microCompactThreshold) ? input.microCompactThreshold : defaults.microCompactThreshold,
    reactiveCompactEnabled: isBool(input.reactiveCompactEnabled) ? input.reactiveCompactEnabled : defaults.reactiveCompactEnabled,
    errorFallbackChain: isBool(input.errorFallbackChain) ? input.errorFallbackChain : defaults.errorFallbackChain,
    parallelHooks: isBool(input.parallelHooks) ? input.parallelHooks : defaults.parallelHooks,
    contentAddressedTempFiles: isBool(input.contentAddressedTempFiles) ? input.contentAddressedTempFiles : defaults.contentAddressedTempFiles,
    structuredTools: isBool(input.structuredTools) ? input.structuredTools : defaults.structuredTools,
    freshTailCount: isNum(input.freshTailCount) ? Math.max(1, Math.round(input.freshTailCount)) : defaults.freshTailCount,
    collapseThreshold: isNum(input.collapseThreshold) ? input.collapseThreshold : defaults.collapseThreshold,
    maxFallbackModels: isNum(input.maxFallbackModels) ? Math.max(0, Math.round(input.maxFallbackModels)) : defaults.maxFallbackModels,
    tokenBudgetSafetyMargin: isNum(input.tokenBudgetSafetyMargin) ? input.tokenBudgetSafetyMargin : defaults.tokenBudgetSafetyMargin,
    maxBudgetTokens: isNum(input.maxBudgetTokens) ? Math.max(10_000, Math.round(input.maxBudgetTokens)) : defaults.maxBudgetTokens,
    budgetTracking: isBool(input.budgetTracking) ? input.budgetTracking : defaults.budgetTracking,
    contextInjection: isBool(input.contextInjection) ? input.contextInjection : defaults.contextInjection,
    sessionOptimization: isBool(input.sessionOptimization) ? input.sessionOptimization : defaults.sessionOptimization,
    toolPartitioning: isBool(input.toolPartitioning) ? input.toolPartitioning : defaults.toolPartitioning,
    permissionMatrix: isBool(input.permissionMatrix) ? input.permissionMatrix : defaults.permissionMatrix,
    taskManager: isBool(input.taskManager) ? input.taskManager : defaults.taskManager,
    shellSafety: isBool(input.shellSafety) ? input.shellSafety : defaults.shellSafety,
    gitStateReader: isBool(input.gitStateReader) ? input.gitStateReader : defaults.gitStateReader,
    memoryTemplates: isBool(input.memoryTemplates) ? input.memoryTemplates : defaults.memoryTemplates,
    promptEnhancer: isBool(input.promptEnhancer) ? input.promptEnhancer : defaults.promptEnhancer,
    modelResolver: isBool(input.modelResolver) ? input.modelResolver : defaults.modelResolver,
    commandRegistry: isBool(input.commandRegistry) ? input.commandRegistry : defaults.commandRegistry,
    healthMonitor: isBool(input.healthMonitor) ? input.healthMonitor : defaults.healthMonitor,
    sessionRecovery: isBool(input.sessionRecovery) ? input.sessionRecovery : defaults.sessionRecovery,
    autoMemoryExtractor: isBool(input.autoMemoryExtractor) ? input.autoMemoryExtractor : defaults.autoMemoryExtractor,
    speculationEngine: isBool(input.speculationEngine) ? input.speculationEngine : defaults.speculationEngine,
    gitContextInjection: isBool(input.gitContextInjection) ? input.gitContextInjection : defaults.gitContextInjection,
    permissionFeedback: isBool(input.permissionFeedback) ? input.permissionFeedback : defaults.permissionFeedback,
    stallDetector: isBool(input.stallDetector) ? input.stallDetector : defaults.stallDetector,
  };
}

const ccOptimizePlugin = {
  id: "cc-optimize",
  name: "Claude Code-Inspired Optimizations",
  description:
    "46 hooks + 10 AI tools + 5 cross-module integrations = 60 active modules. Multi-level compaction with real token tracking, error→model auto-fallback, workspace context injection, 5-mode permission matrix, fail-closed shell safety, 6-point health monitoring, session crash recovery, speculation engine, stall detection, and auto-memory extraction.",

  configSchema: {
    parse(value: unknown) {
      return resolveConfig(value);
    },
  },

  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api.pluginConfig);
    if (!config.enabled) {
      api.logger.info("[cc-optimize] Plugin disabled, skipping registration");
      return;
    }

    api.logger.info(
      `[cc-optimize] Initializing (${Object.entries(config).filter(([k,v]) => typeof v === 'boolean' && v === true).map(([k]) => k).join(', ')})`,
    );

    // Shared state object (wired across modules for cross-concern monitoring)
    const sharedState = {
      rateLimitTokens: 0,
      dangerousCommands: [] as string[],
      lastGitBranch: null as string | null,
      activeTaskCount: 0,
      compactionCount: 0,
      errorCount: 0,
      beastModeActive: false,  // 默认关闭，LLM 通过 permission-matrix setMode("beast") 激活
    };

    // Phase 1: Create all module instances (capture return values for cross-module wiring)
    const toolRegistry = config.structuredTools ? createStructuredToolRegistry(api, config) : null;
    const errorClassifier = config.errorFallbackChain ? createErrorClassifier(api, config) : null;
    const hookRunner = config.parallelHooks ? createParallelHookRunner(api, config) : null;
    const tempFiles = config.contentAddressedTempFiles ? initContentAddressedTempFiles(api, config) : null;
    const healthMonitor = config.healthMonitor ? createHealthMonitor(api, config) : null;
    const compactionManager = createCompactionManager(api, config);
    const budgetGuard = config.budgetTracking ? createBudgetGuard(api, { maxBudgetTokens: config.maxBudgetTokens, maxTurns: 100, tokenBudgetSafetyMargin: config.tokenBudgetSafetyMargin }, (input, output) => {
      healthMonitor?.notifyTokens(input, output);
      compactionManager.syncTokens(input, output);
    }) : null;
    const contextInjector = config.contextInjection ? createContextInjector(api, config) : null;
    const sessionOptimizer = config.sessionOptimization ? createSessionOptimizer(api, config) : null;
    const partitioner = config.toolPartitioning ? createToolPartitioner(api, config) : null;
    const permissions = config.permissionMatrix ? createPermissionMatrix(api, config, (mode) => {
      sharedState.beastModeActive = mode === "beast";
    }) : null;
    const taskManager = config.taskManager ? createTaskManager(api, config) : null;
    const shellSafety = config.shellSafety ? createShellSafety(api, config, (cmd, reason) => {
      sharedState.dangerousCommands.push(`${cmd.slice(0, 60)} — ${reason}`);
      if (sharedState.dangerousCommands.length > 20) sharedState.dangerousCommands.shift();
    }) : null;
    const gitReader = config.gitStateReader ? createGitStateReader(api, config) : null;
    const memory = config.memoryTemplates ? createMemoryTemplates(api, config) : null;
    const promptEnhancer = config.promptEnhancer ? createPromptEnhancer(api, config) : null;
    const modelResolver = config.modelResolver ? createModelResolver(api, config) : null;
    const commandRegistry = config.commandRegistry ? createCommandRegistry(api, config) : null;
    const sessionRecovery = config.sessionRecovery ? createSessionRecovery(api, config) : null;
    const autoMemoryExtractor = config.autoMemoryExtractor ? createAutoMemoryExtractor(api, config) : null;
    const speculationEngine = config.speculationEngine ? createSpeculationEngine(api, config) : null;
    const gitContextInjector = config.gitContextInjection ? createGitContextInjector(api, config) : null;
    const permissionFeedback = config.permissionFeedback ? createPermissionFeedback(api, config) : null;
    const stallDetector = config.stallDetector ? createStallDetector(api, config) : null;

    // Register actual tools that the AI model can invoke
    registerTodoTool(api);
    registerSessionNoteTool(api);
    registerContextTool(api);
    registerDoctorTool(api);
    registerStatusTool(api);
    registerCacheTool(api);
    registerHelpTool(api);
    registerDiffTool(api);
    registerLintTool(api);
    registerConfigTool(api);
    registerQuestionTool(api);
    registerModeTool(api, (mode) => {
      sharedState.beastModeActive = mode === "beast";
    });
    api.logger.info("[cc-optimize] Tools registered: todo_write, session_note, cc_context, cc_doctor, cc_status, cache, cc_help, cc_diff, cc_lint, cc_config, cc_question, cc_mode");

    // Deep integration: register slash commands + core hooks
    registerCommands(api);
    registerCoreHooks(api);

    // Register memory integrations (prompt section + flush plan)
    if (config.memoryTemplates) {
      registerMemoryIntegrations(api);
    }

    // Context injection into system prompt
    if (contextInjector) {
      api.registerHook("before_prompt_build", async (ctx) => {
        const wsPath = (ctx as { workspacePath?: string }).workspacePath || "";
        if (wsPath) {
          contextInjector.setWorkspacePath(wsPath);
          const ctxPrompt = contextInjector.buildContextPrompt();
          if (ctxPrompt) {
            const systemPrompt = (ctx as { systemPrompt?: string }).systemPrompt ?? "";
            return {
              ...ctx,
              systemPrompt: systemPrompt + "\n\n" + ctxPrompt,
            };
          }
        }
        return ctx;
      }, { name: "cc-optimize:context-inject-prompt" });
    }

    // Capability discovery — inject at session start so LLM knows what it can do
    api.registerHook("session_start", async (ctx) => {
      const capabilityPrompt = [
        "<system-reminder>",
        "## Your Capabilities (cc-optimize enhanced)",
        "",
        "**12 tools**: todo_write, session_note, cache, cc_context, cc_doctor, cc_status, cc_config, cc_help, cc_question, cc_diff, cc_lint, cc_mode",
        "**3 modes**: plan (read-only) → build (normal) → beast (full autonomy). Switch via cc_mode(mode).",
        "**6 subtypes**: explore, general, code-review, research, verify, scout",
        "**Safety**: shell-safety (18 patterns), Git Safety Protocol, write-discipline (auto-verify)",
        "**Recovery**: L1→L3 error cascade, 4-level model fallback (v4-pro→chat→reasoner→local-qwen)",
        "**Budget**: 200K token budget with real-time tracking. Use cc_context to check.",
        "</system-reminder>",
      ].join("\n");
      return {
        ...ctx,
        metadata: {
          ...ctx.metadata,
          ccCapabilityPrompt: capabilityPrompt,
        },
      };
    }, { name: "cc-optimize:capability-inject" });

    // Beast mode injection (OpenCode beast.txt — full autonomy)
    api.registerHook("before_prompt_build", async (ctx) => {
      if (sharedState.beastModeActive) {
        const systemPrompt = (ctx as { systemPrompt?: string }).systemPrompt ?? "";
        return {
          ...ctx,
          systemPrompt: systemPrompt + "\n\n" + BEAST_MODE_REMINDER,
        };
      }
      return ctx;
    }, { name: "cc-optimize:beast-mode-inject" });

    // Phase 2: Wire cross-module dependencies (shared state + inter-module communication)

    if (modelResolver && modelResolver.setCurrent) {
      modelResolver.setCurrent("deepseek/deepseek-v4-pro");
      modelResolver.setFallbacks(["deepseek/deepseek-chat", "deepseek/deepseek-reasoner", "llama-qwen35b/Qwen3.6-35B-A3B-APEX-I-Mini"]);
      api.logger.info(`[cc-optimize] Model: deepseek/deepseek-v4-pro → deepseek-chat → deepseek-reasoner → local-Qwen35b`);
    }

    if (errorClassifier && modelResolver && config.errorFallbackChain) {
      errorClassifier.setFallbackCallback((reason: string) => {
        const denied = [modelResolver.getModelInfo().current];
        return modelResolver.getBestAvailable(denied);
      });
      api.logger.debug("[cc-optimize] Error classifier wired to model fallback chain");
    }

    if (gitReader && contextInjector && gitReader.formatGitContext) {
      const gitCtx = gitReader.formatGitContext(process.cwd());
      if (gitCtx) {
        sharedState.lastGitBranch = gitCtx;
        api.logger.debug("[cc-optimize] Git context wired to context injector");
      }
    }

    if (taskManager) {
      sharedState.activeTaskCount = taskManager.getActiveAgentTasks().length;
      api.logger.debug(`[cc-optimize] Task manager wired: ${taskManager.getTaskSummary()}`);
    }

    if (budgetGuard) {
      api.registerHook("after_tool_call", async (ctx) => {
        const status = budgetGuard.getBudgetStatus();
        sharedState.rateLimitTokens = status.totalTokens;
        sharedState.compactionCount = compactionManager.getCompactionStats().compactedCount;
        return ctx;
      }, { name: "cc-optimize:shared-state-sync" });
    }

    // CC Strict Write Discipline: verify every write/edit immediately
    api.registerHook("after_tool_call", async (ctx) => {
      const toolName = (ctx as { toolName?: string }).toolName?.toLowerCase() || "";
      if (toolName !== "write" && toolName !== "edit") return ctx;
      const result = ctx.result;
      if (result?.isError) return ctx;
      try {
        const { existsSync, statSync } = await import("node:fs");
        const path = (ctx as { args?: { path?: string; filePath?: string } }).args?.path ||
          (ctx as { args?: { filePath?: string } }).args?.filePath;
        if (path && existsSync(path)) {
          const stat = statSync(path);
          if (stat.size > 0) {
            api.logger.debug(`[cc-optimize] Write verified: ${path.slice(-40)} (${stat.size} bytes)`);
          } else {
            api.logger.warn(`[cc-optimize] Write DISCIPLINE FAIL: ${path} is zero bytes`);
          }
        }
      } catch {
        // verification best-effort
      }
      return ctx;
    }, { name: "cc-optimize:write-discipline" });
    api.registerHook("before_compaction", async (ctx) => {
      const snapshot = compactionManager.takePreCompactSnapshot();
      api.logger.info(`[cc-optimize] PreCompact snapshot: ${snapshot}`);
      return {
        ...ctx,
        metadata: { ...ctx.metadata, ccPreCompactSnapshot: snapshot },
      };
    }, { name: "cc-optimize:pre-compact-snapshot" });

    api.registerHook("after_compaction", async (ctx) => {
      const verification = compactionManager.verifyPostCompact(0);
      api.logger.info(
        `[cc-optimize] PostCompact verify: ratio=${verification.actualRatio.toFixed(2)}`,
      );
      return {
        ...ctx,
        metadata: { ...ctx.metadata, ccPostCompactOk: verification.ok },
      };
    }, { name: "cc-optimize:post-compact-verify" });

    // Phase 3: Enumerate loaded modules
    const loadedModules = [
      toolRegistry && "tools",
      errorClassifier && "errors",
      hookRunner && "hooks",
      tempFiles && "temp",
      budgetGuard && "budget",
      contextInjector && "context",
      sessionOptimizer && "sessions",
      partitioner && "partitioner",
      permissions && "permissions",
      taskManager && "tasks",
      shellSafety && "shell",
      gitReader && "git",
      memory && "memory",
      promptEnhancer && "prompts",
      modelResolver && "models",
      commandRegistry && "commands",
      healthMonitor && "health",
      sessionRecovery && "recovery",
      autoMemoryExtractor && "automemory",
      speculationEngine && "speculate",
      gitContextInjector && "gitctx",
      permissionFeedback && "feedback",
      stallDetector && "stall",
      "tools:todo_write",
      "tools:session_note",
      "tools:cc_context",
      "tools:cc_doctor",
      "tools:cc_status",
      "tools:cache",
      "tools:cc_help",
      "tools:cc_diff",
      "tools:cc_lint",
      "tools:cc_config",
      "compact",
    ].filter(Boolean);

    api.logger.info(`[cc-optimize] Loaded ${loadedModules.length} modules: ${loadedModules.join(', ')}`);
    api.logger.info("[cc-optimize] All modules wired and active");
  },
};

export default ccOptimizePlugin;
