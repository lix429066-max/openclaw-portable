import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

type TaskStatus = "pending" | "running" | "completed" | "failed" | "killed";
type TaskType = "background_session" | "shell" | "agent";
type AgentSubtype = "explore" | "general" | "code-review" | "research" | "verify" | "scout";

const AGENT_SUBTYPE_PROMPTS: Record<AgentSubtype, string> = {
  explore: `You are a file search specialist for codebase exploration.
Guidelines:
- Use Glob for broad file pattern matching
- Use Grep for searching file contents with regex
- Use Read when you know the specific file path
- Return file paths as absolute paths in your final response
- Do NOT create files or modify system state
- Complete the search request efficiently and report clearly.
- IMPORTANT: Complete your task within 10 steps. If approaching the limit, summarize findings and stop.`,
  general: `You are a general-purpose coding assistant sub-agent.
- Execute the assigned task directly and efficiently
- Use tools as needed: read, write, edit, grep, glob, bash
- Report results concisely with file paths and line numbers.
- IMPORTANT: Complete your task within 15 steps. Do not get stuck in loops.`,
  "code-review": `You are a code review specialist.
- Focus on security, performance, and maintainability
- Check for best practices, potential bugs, and code style issues
- Reference specific file paths and line numbers in your review
- Do NOT modify files — report findings only.
- IMPORTANT: Review within 8 steps — read the key files and report.`,
  research: `You are a research analysis sub-agent.
- Read multiple files in parallel to understand the codebase
- Synthesize findings into a coherent analysis
- Provide file paths, line numbers, and code references
- Focus on architecture patterns, dependencies, and conventions.
- IMPORTANT: Complete within 12 steps — read broadly, then synthesize.`,
  verify: `You are a verification sub-agent.
- Prove that code works by running tests and checking output
- Verify file existence, size, and content correctness
- Report pass/fail with specific evidence
- Do NOT modify files — verify only.
- IMPORTANT: Complete within 5 steps — run tests, check output, report.`,
  scout: `You are a read-only research agent for external libraries, dependency source, and documentation.
- Investigate dependency repositories, library source, and third-party APIs
- Use glob, grep, and read to inspect code (clone repos if needed)
- Use web_fetch for official documentation
- Cite exact file paths and line references
- Separate verified facts from inferences
- Do NOT modify files or the user's workspace
- IMPORTANT: Complete within 12 steps — investigate, then report evidence.`,
};

interface TaskStateBase {
  taskId: string;
  type: TaskType;
  status: TaskStatus;
  description: string;
  createdAt: number;
  updatedAt: number;
  toolUseId?: string;
  notified: boolean;
  isBackgrounded: boolean;
}

interface BackgroundSessionTask extends TaskStateBase {
  type: "background_session";
  sessionKey: string;
  agentId: string;
  messageCount: number;
  tokenCount: number;
}

interface ShellTask extends TaskStateBase {
  type: "shell";
  command: string;
  outputPath?: string;
  exitCode?: number;
  stallCheckCount: number;
  lastOutputSize: number;
}

interface AgentTask extends TaskStateBase {
  type: "agent";
  subSessionKey: string;
  parentSessionKey: string;
  agentSubtype: AgentSubtype;
  resumeEnabled: boolean;
  progress: {
    toolUseCount: number;
    inputTokens: number;
    outputTokens: number;
    recentActivities: string[];
  };
}

type TaskState = BackgroundSessionTask | ShellTask | AgentTask;

interface TaskNotification {
  taskId: string;
  toolUseId?: string;
  status: TaskStatus;
  summary: string;
}

const MAX_RECENT_ACTIVITIES = 5;
const STALL_CHECK_INTERVAL_MS = 5000;
const STALL_COUNT_THRESHOLD = 9;
const TASK_EVICT_AFTER_MS = 30_000;

const PROMPT_PATTERNS = [
  /\(y\/n\)/i,
  /\[Y\/n\]/i,
  /\[y\/N\]/i,
  /Continue\?/i,
  /Proceed\?/i,
  /Press any key/i,
];

function formatTaskNotification(task: TaskState): TaskNotification {
  return {
    taskId: task.taskId,
    toolUseId: task.toolUseId,
    status: task.status,
    summary: task.status === "completed"
      ? `Task completed: ${task.description}`
      : task.status === "failed"
        ? `Task failed: ${task.description}`
        : task.status === "killed"
          ? `Task killed: ${task.description}`
          : `Task status: ${task.status}`,
  };
}

export function createTaskManager(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  const tasks = new Map<string, TaskState>();
  const notificationQueue: TaskNotification[] = [];
  let taskCounter = 0;

  function generateTaskId(prefix: string): string {
    taskCounter++;
    return `${prefix}_${Date.now().toString(36)}_${taskCounter.toString(36)}`;
  }

  function registerTask(task: TaskState): void {
    tasks.set(task.taskId, task);
    api.logger.info(`[cc-optimize] Task registered: ${task.taskId} (${task.type}) — ${task.description}`);
  }

  function updateTaskState(taskId: string, updater: (prev: TaskState) => TaskState): void {
    const current = tasks.get(taskId);
    if (!current) return;

    const updated = updater(current);
    updated.updatedAt = Date.now();
    tasks.set(taskId, updated);

    if (updated.status !== current.status) {
      if (updated.status === "completed" || updated.status === "failed" || updated.status === "killed") {
        notificationQueue.push(formatTaskNotification(updated));
        api.logger.info(`[cc-optimize] Task ${taskId}: ${current.status} → ${updated.status}`);
      }
    }
  }

  function startBackgroundSession(sessionKey: string, agentId: string, description: string): TaskState {
    const task: BackgroundSessionTask = {
      taskId: generateTaskId("bs"),
      type: "background_session",
      status: "running",
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notified: false,
      isBackgrounded: true,
      sessionKey,
      agentId,
      messageCount: 0,
      tokenCount: 0,
    };
    registerTask(task);
    return task;
  }

  function startShellCommand(command: string, description: string): TaskState {
    const task: ShellTask = {
      taskId: generateTaskId("sh"),
      type: "shell",
      status: "running",
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notified: false,
      isBackgrounded: true,
      command,
      stallCheckCount: 0,
      lastOutputSize: 0,
    };
    registerTask(task);
    return task;
  }

  function startAgentTask(
    subSessionKey: string,
    parentSessionKey: string,
    description: string,
    subtype: AgentSubtype = "general",
  ): TaskState {
    const task: AgentTask = {
      taskId: generateTaskId("ag"),
      type: "agent",
      status: "running",
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notified: false,
      isBackgrounded: true,
      subSessionKey,
      parentSessionKey,
      agentSubtype: subtype,
      resumeEnabled: true,
      progress: {
        toolUseCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        recentActivities: [],
      },
    };
    registerTask(task);
    return task;
  }

  function updateAgentProgress(taskId: string, toolUseName: string, inputTokens: number, outputTokens: number): void {
    updateTaskState(taskId, (prev) => {
      if (prev.type !== "agent") return prev;
      const activites = [
        toolUseName,
        ...prev.progress.recentActivities,
      ].slice(0, MAX_RECENT_ACTIVITIES);
      return {
        ...prev,
        progress: {
          toolUseCount: prev.progress.toolUseCount + 1,
          inputTokens: prev.progress.inputTokens + inputTokens,
          outputTokens: prev.progress.outputTokens + outputTokens,
          recentActivities: activites,
        },
      };
    });
  }

  function addAgentTokens(inputTokens: number, outputTokens: number): void {
    for (const [id, task] of tasks) {
      if (task.type === "agent" && task.status === "running") {
        updateTaskState(id, (prev) => {
          if (prev.type !== "agent") return prev;
          return {
            ...prev,
            progress: {
              ...prev.progress,
              inputTokens: prev.progress.inputTokens + inputTokens,
              outputTokens: prev.progress.outputTokens + outputTokens,
            },
          };
        });
      }
    }
  }

  function completeTask(taskId: string): void {
    updateTaskState(taskId, (prev) => ({
      ...prev,
      status: "completed",
    }));
  }

  function failTask(taskId: string, _reason?: string): void {
    updateTaskState(taskId, (prev) => ({
      ...prev,
      status: "failed",
    }));
  }

  function killTask(taskId: string): boolean {
    const task = tasks.get(taskId);
    if (!task || task.status !== "running") return false;
    updateTaskState(taskId, (prev) => ({
      ...prev,
      status: "killed",
    }));
    return true;
  }

  function checkStall(taskId: string, currentOutputSize: number): boolean {
    const task = tasks.get(taskId);
    if (!task || task.type !== "shell") return false;

    const shellTask = task as ShellTask;
    const isStalled = currentOutputSize === shellTask.lastOutputSize;
    if (isStalled) {
      shellTask.stallCheckCount++;
    } else {
      shellTask.stallCheckCount = 0;
    }
    shellTask.lastOutputSize = currentOutputSize;

    if (shellTask.stallCheckCount >= STALL_COUNT_THRESHOLD) {
      api.logger.warn(
        `[cc-optimize] Task ${taskId}: stalled — no output change for ${shellTask.stallCheckCount * STALL_CHECK_INTERVAL_MS / 1000}s`,
      );
      return true;
    }
    return false;
  }

  function getActiveSessions(): BackgroundSessionTask[] {
    return Array.from(tasks.values())
      .filter((t): t is BackgroundSessionTask =>
        t.type === "background_session" && t.status === "running",
      );
  }

  function getActiveAgentTasks(): AgentTask[] {
    return Array.from(tasks.values())
      .filter((t): t is AgentTask =>
        t.type === "agent" && t.status === "running",
      );
  }

  function evictCompletedTasks(): void {
    const now = Date.now();
    for (const [id, task] of tasks) {
      if (task.status !== "running" && (now - task.updatedAt) > TASK_EVICT_AFTER_MS) {
        tasks.delete(id);
        api.logger.debug(`[cc-optimize] Task ${id} evicted`);
      }
    }
  }

  function getTaskSummary(): string {
    const running = Array.from(tasks.values()).filter((t) => t.status === "running");
    if (running.length === 0) return "No active tasks";
    const byType: Record<string, number> = {};
    for (const t of running) {
      const label = t.type === "agent" ? `${t.type}/${(t as AgentTask).agentSubtype}` : t.type;
      byType[label] = (byType[label] || 0) + 1;
    }
    return Object.entries(byType)
      .map(([type, count]) => `${count} ${type}`)
      .join(", ");
  }

  function resumeTask(taskId: string): TaskState | null {
    const task = tasks.get(taskId);
    if (!task || task.type !== "agent") return null;
    const agentTask = task as AgentTask;
    if (!agentTask.resumeEnabled) return null;
    const resumed: AgentTask = {
      ...agentTask,
      status: "running",
      updatedAt: Date.now(),
      notified: false,
    };
    tasks.set(taskId, resumed);
    api.logger.info(`[cc-optimize] Task resumed: ${taskId} (${agentTask.agentSubtype}) — ${agentTask.description}`);
    return resumed;
  }

  setInterval(() => evictCompletedTasks(), 60_000);

  return {
    registerTask,
    updateTaskState,
    startBackgroundSession,
    startShellCommand,
    startAgentTask,
    updateAgentProgress,
    addAgentTokens,
    completeTask,
    failTask,
    killTask,
    checkStall,
    getActiveSessions,
    getActiveAgentTasks,
    getTaskSummary,
    resumeTask,
    getSubtypePrompt: (subtype: AgentSubtype) => AGENT_SUBTYPE_PROMPTS[subtype],
    getAllSubtypes: () => Object.keys(AGENT_SUBTYPE_PROMPTS) as AgentSubtype[],
    getTask: (id: string) => tasks.get(id),
    getAllTasks: () => Array.from(tasks.values()),
  };
}
