import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface RateLimitState {
  fiveHourTokens: number;
  sevenDayTokens: number;
  lastCheckAt: number;
  warningIssued: boolean;
  criticalIssued: boolean;
}

interface HealthCheck {
  name: string;
  status: "ok" | "warning" | "error" | "unknown";
  message: string;
  lastChecked: number;
}

const FIVE_HOUR_LIMIT = 200_000;
const SEVEN_DAY_LIMIT = 1_000_000;
const RATE_LIMIT_WARNING_RATIO = 0.8;
const RATE_LIMIT_CRITICAL_RATIO = 0.95;
const HEALTH_CHECK_INTERVAL_MS = 60_000;

export function createHealthMonitor(
  api: OpenClawPluginApi,
  _config: Record<string, unknown>,
) {
  const rateLimit: RateLimitState = {
    fiveHourTokens: 0,
    sevenDayTokens: 0,
    lastCheckAt: Date.now(),
    warningIssued: false,
    criticalIssued: false,
  };

  const checks: HealthCheck[] = [
    { name: "gateway", status: "unknown", message: "Not checked", lastChecked: 0 },
    { name: "model_auth", status: "unknown", message: "Not checked", lastChecked: 0 },
    { name: "rate_limit", status: "ok", message: "Within limits", lastChecked: 0 },
    { name: "disk_space", status: "unknown", message: "Not checked", lastChecked: 0 },
    { name: "memory", status: "unknown", message: "Not checked", lastChecked: 0 },
    { name: "cron", status: "unknown", message: "Not checked", lastChecked: 0 },
  ];

  function trackTokens(inputTokens: number, outputTokens: number) {
    rateLimit.fiveHourTokens += inputTokens + outputTokens;
    rateLimit.sevenDayTokens += inputTokens + outputTokens;

    const fiveHourRatio = rateLimit.fiveHourTokens / FIVE_HOUR_LIMIT;
    const sevenDayRatio = rateLimit.sevenDayTokens / SEVEN_DAY_LIMIT;
    const maxRatio = Math.max(fiveHourRatio, sevenDayRatio);

    if (maxRatio >= RATE_LIMIT_CRITICAL_RATIO && !rateLimit.criticalIssued) {
      rateLimit.criticalIssued = true;
      rateLimit.warningIssued = true;
      api.logger.warn(
        `[cc-optimize] RATE LIMIT CRITICAL: ${(maxRatio * 100).toFixed(1)}% used (5h: ${rateLimit.fiveHourTokens}/${FIVE_HOUR_LIMIT}, 7d: ${rateLimit.sevenDayTokens}/${SEVEN_DAY_LIMIT})`,
      );
      updateHealthCheck("rate_limit", "error", `Rate limit critical: ${(maxRatio * 100).toFixed(0)}%`);
    } else if (maxRatio >= RATE_LIMIT_WARNING_RATIO && !rateLimit.warningIssued) {
      rateLimit.warningIssued = true;
      api.logger.warn(
        `[cc-optimize] Rate limit warning: ${(maxRatio * 100).toFixed(1)}% used`,
      );
      updateHealthCheck("rate_limit", "warning", `Rate limit warning: ${(maxRatio * 100).toFixed(0)}%`);
    } else if (maxRatio < RATE_LIMIT_WARNING_RATIO) {
      rateLimit.warningIssued = false;
      rateLimit.criticalIssued = false;
      updateHealthCheck("rate_limit", "ok", `Usage: ${(maxRatio * 100).toFixed(0)}%`);
    }

    rateLimit.lastCheckAt = Date.now();
  }

  function updateHealthCheck(name: string, status: "ok" | "warning" | "error", message: string) {
    const check = checks.find((c) => c.name === name);
    if (check) {
      check.status = status;
      check.message = message;
      check.lastChecked = Date.now();
    }
  }

  function runHealthChecks() {
    updateHealthCheck("gateway", "ok", "Gateway running");

    if (rateLimit.lastCheckAt > 0) {
      const fiveHourRatio = rateLimit.fiveHourTokens / FIVE_HOUR_LIMIT;
      if (fiveHourRatio >= RATE_LIMIT_CRITICAL_RATIO) {
        updateHealthCheck("rate_limit", "error", `5h usage: ${(fiveHourRatio * 100).toFixed(0)}%`);
      } else if (fiveHourRatio >= RATE_LIMIT_WARNING_RATIO) {
        updateHealthCheck("rate_limit", "warning", `5h usage: ${(fiveHourRatio * 100).toFixed(0)}%`);
      } else {
        updateHealthCheck("rate_limit", "ok", `5h usage: ${(fiveHourRatio * 100).toFixed(0)}%`);
      }
    }

    const okCount = checks.filter((c) => c.status === "ok").length;
    const warnCount = checks.filter((c) => c.status === "warning").length;
    const errCount = checks.filter((c) => c.status === "error").length;

    api.logger.debug(
      `[cc-optimize] Health: ${okCount} ok, ${warnCount} warn, ${errCount} err | ` +
      `tokens: ${rateLimit.fiveHourTokens}/${FIVE_HOUR_LIMIT} (5h)`,
    );
  }

  function getHealthSummary(): string {
    const lines: string[] = ["## Health Status"];
    for (const check of checks) {
      const icon = check.status === "ok" ? "✓" : check.status === "warning" ? "⚠" : check.status === "error" ? "✗" : "?";
      lines.push(`- ${icon} ${check.name}: ${check.message}`);
    }
    const ratio = (rateLimit.fiveHourTokens / FIVE_HOUR_LIMIT * 100).toFixed(1);
    lines.push(`- Rate limit: ${ratio}% (${rateLimit.fiveHourTokens}/${FIVE_HOUR_LIMIT})`);
    return lines.join("\n");
  }

  function notifyTokens(input: number, output: number) {
    trackTokens(input, output);
  }

  setInterval(() => runHealthChecks(), HEALTH_CHECK_INTERVAL_MS);

  api.logger.info("[cc-optimize] Health monitor started (interval: 60s, rate-limit tracking active)");

  return {
    trackTokens,
    notifyTokens,
    getHealthSummary,
    updateHealthCheck,
    getChecks: () => [...checks],
    getRateLimitState: () => ({ ...rateLimit }),
  };
}