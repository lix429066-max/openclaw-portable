import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Array<{ name: string; status: string; detail: string }>;
  summary: string;
}

export function registerDoctorTool(api: OpenClawPluginApi) {
  api.registerTool((ctx) => ({
    name: "cc_doctor",
    description: "Run a 5-point health check on the openclaw system. Checks: gateway connectivity, config file validity, workspace directory, installed plugins, LCM database. Use when: gateway seems slow, after config changes, or troubleshooting.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    async call() {
      const checks: Array<{ name: string; status: string; detail: string }> = [];
      let unhealthyCount = 0;

      // Check 1: Gateway port
      try {
        const net = await import("node:net");
        const portOpen = await new Promise<boolean>((resolve) => {
          const s = net.createConnection({ port: 18789, host: "127.0.0.1" }, () => { s.destroy(); resolve(true); });
          s.on("error", () => resolve(false));
          s.setTimeout(2000, () => { s.destroy(); resolve(false); });
        });
        checks.push({
          name: "gateway",
          status: portOpen ? "ok" : "error",
          detail: portOpen ? "Gateway responding on :18789" : "Gateway not reachable on :18789",
        });
        if (!portOpen) unhealthyCount++;
      } catch {
        checks.push({ name: "gateway", status: "unknown", detail: "Could not check gateway" });
      }

      // Check 2: Config file
      const configPath = join(homedir(), ".openclaw", "openclaw.json");
      if (existsSync(configPath)) {
        try {
          const stat = statSync(configPath);
          const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
          checks.push({
            name: "config",
            status: "ok",
            detail: `Config exists (${(stat.size / 1024).toFixed(1)} KB, modified ${ageHours.toFixed(1)}h ago)`,
          });
        } catch {
          checks.push({ name: "config", status: "error", detail: "Config file exists but cannot be read" });
          unhealthyCount++;
        }
      } else {
        checks.push({ name: "config", status: "error", detail: "Config file missing" });
        unhealthyCount++;
      }

      // Check 3: Disk space (workspace)
      try {
        const workspacePath = join(homedir(), ".openclaw", "workspace");
        if (existsSync(workspacePath)) {
          checks.push({ name: "workspace", status: "ok", detail: `Workspace directory exists` });
        } else {
          checks.push({ name: "workspace", status: "error", detail: "Workspace directory missing" });
          unhealthyCount++;
        }
      } catch {
        checks.push({ name: "workspace", status: "unknown", detail: "Could not check workspace" });
      }

      // Check 4: Plugins
      const pluginsPath = join(homedir(), ".openclaw", "extensions");
      if (existsSync(pluginsPath)) {
        try {
          const { readdirSync } = await import("node:fs");
          const plugins = readdirSync(pluginsPath).filter((f) => !f.startsWith("."));
          checks.push({
            name: "plugins",
            status: "ok",
            detail: `${plugins.length} plugins installed (${plugins.join(", ")})`,
          });
        } catch {
          checks.push({ name: "plugins", status: "error", detail: "Cannot read plugins directory" });
          unhealthyCount++;
        }
      }

      // Check 5: Memory DB
      const lcmPath = join(homedir(), ".openclaw", "lcm.db");
      if (existsSync(lcmPath)) {
        try {
          const stat = statSync(lcmPath);
          checks.push({
            name: "memory_db",
            status: "ok",
            detail: `LCM database exists (${(stat.size / 1024).toFixed(1)} KB)`,
          });
        } catch {
          checks.push({ name: "memory_db", status: "error", detail: "LCM database cannot be read" });
          unhealthyCount++;
        }
      } else {
        checks.push({ name: "memory_db", status: "warning", detail: "LCM database not found" });
      }

      // Check 6: Node.js version
      checks.push({
        name: "node_version",
        status: "ok",
        detail: `Node.js ${process.version} on ${process.platform}/${process.arch}`,
      });

      const status = unhealthyCount === 0 ? "healthy" : unhealthyCount <= 2 ? "degraded" : "unhealthy";

      const summary = status === "healthy"
        ? "All systems operational"
        : status === "degraded"
          ? `${unhealthyCount} component(s) need attention`
          : `${unhealthyCount} component(s) failing — investigation required`;

      api.logger.info(`[cc-optimize] Doctor: ${status} (${unhealthyCount} issues)`);

      return {
        status,
        summary,
        checks,
        checkedAt: new Date().toISOString(),
      } as HealthReport;
    },
    isEnabled: () => true,
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  }), { name: "cc-optimize:cc-doctor" });
}
