import { existsSync, readFileSync, statSync, readdirSync, watchFile } from "node:fs";
import { resolve, dirname, join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface GitState {
  branch: string | null;
  headSha: string | null;
  remoteUrl: string | null;
  defaultBranch: string | null;
  isShallowClone: boolean;
  isDetached: boolean;
  gitDir: string;
  lastChecked: number;
}

const gitStateCache = new Map<string, GitState>();

function resolveGitDir(startPath: string): string | null {
  let current = resolve(startPath);

  for (let i = 0; i < 64; i++) {
    const gitPath = join(current, ".git");
    if (existsSync(gitPath)) {
      const stat = statSync(gitPath);
      if (stat.isDirectory()) return gitPath;
      if (stat.isFile()) {
        try {
          const content = readFileSync(gitPath, "utf8").trim();
          if (content.startsWith("gitdir:")) {
            const relativePath = content.slice(7).trim();
            const resolvedDir = resolve(dirname(gitPath), relativePath);
            if (existsSync(resolvedDir)) return resolvedDir;
          }
        } catch {
          return null;
        }
      }
      return gitPath;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

function readGitHead(gitDir: string): { branch: string | null; headSha: string | null; isDetached: boolean } {
  try {
    const headContent = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (headContent.startsWith("ref: refs/heads/")) {
      const branch = headContent.slice(16).trim();
      const refPath = join(gitDir, "refs", "heads", branch);
      let sha: string | null = null;
      if (existsSync(refPath)) {
        sha = readFileSync(refPath, "utf8").trim().slice(0, 40);
      }
      return { branch, headSha: sha, isDetached: false };
    }
    return { branch: null, headSha: headContent.slice(0, 40), isDetached: true };
  } catch {
    return { branch: null, headSha: null, isDetached: false };
  }
}

function readRemoteUrl(gitDir: string): string | null {
  try {
    const configPath = join(gitDir, "config");
    if (!existsSync(configPath)) return null;
    const config = readFileSync(configPath, "utf8");
    const match = config.match(/\[remote\s+"?(origin|upstream)"?\][\s\S]*?url\s*=\s*(.+)/im);
    return match ? match[2].trim() : null;
  } catch {
    return null;
  }
}

function isSafeBranchName(name: string): boolean {
  return /^[a-zA-Z0-9._\/+@-]+$/.test(name) && !name.includes("..") && !name.startsWith("-");
}

function checkShallowClone(commonDir: string): boolean {
  return existsSync(join(commonDir, "shallow"));
}

export function readGitState(workspacePath: string): GitState | null {
  const cached = gitStateCache.get(workspacePath);
  if (cached && (Date.now() - cached.lastChecked) < 5000) return cached;

  const gitDir = resolveGitDir(workspacePath);
  if (!gitDir) return null;

  const head = readGitHead(gitDir);
  const remoteUrl = readRemoteUrl(gitDir);
  const isShallow = checkShallowClone(gitDir);

  const state: GitState = {
    branch: head.branch && isSafeBranchName(head.branch) ? head.branch : null,
    headSha: head.headSha,
    remoteUrl,
    defaultBranch: null,
    isShallowClone: isShallow,
    isDetached: head.isDetached,
    gitDir,
    lastChecked: Date.now(),
  };

  gitStateCache.set(workspacePath, state);

  try {
    watchFile(join(gitDir, "HEAD"), { interval: 1000 }, () => {
      gitStateCache.delete(workspacePath);
    });
  } catch {
    // ignore watch failures
  }

  return state;
}

export function formatGitContext(workspacePath: string): string {
  const state = readGitState(workspacePath);
  if (!state) return "";

  const lines: string[] = [];
  lines.push("## Git Context");
  if (state.branch) lines.push(`- Branch: ${state.branch}${state.isDetached ? " (detached)" : ""}`);
  if (state.headSha) lines.push(`- HEAD: ${state.headSha.slice(0, 8)}`);
  if (state.remoteUrl) lines.push(`- Remote: ${state.remoteUrl}`);
  if (state.isShallowClone) lines.push("- Note: shallow clone (limited git history)");

  return lines.join("\n");
}

export function createGitStateReader(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  let workspacePath = "";

  function setWorkspacePath(path: string) {
    workspacePath = path;
  }

  api.registerHook("session_start", async (ctx)=> {
    if (!workspacePath) {
      workspacePath = (ctx as { workspacePath?: string }).workspacePath ||
        (ctx as { cwd?: string }).cwd || "";
    }

    const gitState = readGitState(workspacePath);
    if (gitState) {
      api.logger.info(
        `[cc-optimize] Git: branch=${gitState.branch || "detached"}, sha=${gitState.headSha?.slice(0, 8) || "unknown"}`,
      );
    } else {
      api.logger.debug("[cc-optimize] Not a git repository");
    }

    return {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        ccGitState: gitState ? {
          branch: gitState.branch,
          headSha: gitState.headSha?.slice(0, 8),
          hasRemote: !!gitState.remoteUrl,
        } : null,
      },
    };
  }, { name: "cc-optimize:git-session-start" });

  return {
    readGitState,
    formatGitContext,
    setWorkspacePath,
    getGitDir: (path: string) => resolveGitDir(path),
  };
}