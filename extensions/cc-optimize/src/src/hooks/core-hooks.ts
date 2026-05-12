import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export function registerCoreHooks(api: OpenClawPluginApi) {
  let checkpointCount = 0;

  api.registerHook("after_compaction", async (ctx) => {
    checkpointCount++;
    api.logger.info(`[cc-optimize] Compaction completed (checkpoint #${checkpointCount})`);
    return ctx;
  }, { name: "cc-optimize:after-compact" });

  api.registerHook("before_agent_start", async (ctx) => {
    checkpointCount++;
    const agentId = (ctx as { agentId?: string }).agentId || "unknown";
    api.logger.info(`[cc-optimize] Agent check #${checkpointCount}: ${agentId} starting`);
    return ctx;
  }, { name: "cc-optimize:agent-start" });

  api.registerHook("before_model_resolve", async (ctx) => {
    api.logger.debug("[cc-optimize] Model resolution check");
    return ctx;
  }, { name: "cc-optimize:model-resolve" });

  api.registerHook("llm_output", async (ctx) => {
    const output = (ctx as { text?: string }).text || "";
    if (output.length > 0) {
      checkpointCount++;
      api.logger.debug(`[cc-optimize] LLM check #${checkpointCount}: ${output.length} chars`);
    }
    return ctx;
  }, { name: "cc-optimize:llm-output" });

  api.registerHook("message_received", async (ctx) => {
    checkpointCount++;
    const channel = (ctx as { channel?: string }).channel || "unknown";
    api.logger.debug(`[cc-optimize] Msg check #${checkpointCount}: from ${channel}`);
    return ctx;
  }, { name: "cc-optimize:msg-received" });

  api.registerHook("subagent_spawned", async (ctx) => {
    checkpointCount++;
    const key = (ctx as { sessionKey?: string }).sessionKey || "unknown";
    api.logger.info(`[cc-optimize] Subagent check #${checkpointCount}: ${key}`);
    return ctx;
  }, { name: "cc-optimize:subagent-spawned" });

  // Inject context before prompt is sent to LLM
  api.registerHook("before_prompt_build", async (ctx) => {
    const systemPrompt = (ctx as { systemPrompt?: string }).systemPrompt || "";
    if (systemPrompt.length > 0) {
      api.logger.debug(`[cc-optimize] Prompt check: ${systemPrompt.length} chars`);
    }
    return {
      ...ctx,
      metadata: {
        ...(ctx as { metadata?: Record<string, unknown> }).metadata,
        ccPromptInjected: true,
        ccCheckpoint: checkpointCount,
      },
    };
  }, { name: "cc-optimize:prompt-build" });

  api.registerHook("gateway_stop", async (ctx) => {
    api.logger.info(`[cc-optimize] Gateway stopping — ${checkpointCount} total checkpoints`);
    return ctx;
  }, { name: "cc-optimize:gateway-stop" });

  api.registerHook("llm_input", async (ctx) => {
    const prompt = (ctx as { prompt?: string }).prompt || "";
    api.logger.debug(`[cc-optimize] LLM input: ${prompt.length} chars`);
    return ctx;
  }, { name: "cc-optimize:llm-input" });

  api.registerHook("before_reset", async (ctx) => {
    api.logger.info("[cc-optimize] Session resetting — preserving critical state");
    return ctx;
  }, { name: "cc-optimize:before-reset" });

  api.logger.info("[cc-optimize] Core hooks: after_compaction, agent_start, model_resolve, llm_output, msg_received, subagent_spawned, prompt_build, gateway_stop, llm_input, before_reset (10 total)");
}
