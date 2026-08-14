import type { Request, Response, NextFunction } from "express";
import { getAdminApp } from "./firebaseAdmin";
import { getBillingState, checkAndConsumeAiQuota } from "./billing";
import { getFeatureFlags } from "./featureFlags";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_LIMIT = 50;

// Fallback for requests with no verified uid, or when Firebase Admin isn't
// configured (local dev) — there's no plan to key a real quota off of, so
// this keeps the old flat per-identity daily counter as a basic safety net.
// Read lazily (function, not module-level const): this module is imported by
// server.ts before server.ts's own dotenv.config() call runs, since ESM
// hoists static imports ahead of the importing module's body — a module-level
// process.env read here would always see an unloaded environment.
function dailyLimit(): number {
  return Number(process.env.AI_DAILY_CALL_LIMIT) || DEFAULT_DAILY_LIMIT;
}
const fallbackUsage = new Map<string, { count: number; resetAt: number }>();

function checkFallbackLimit(key: string): { allowed: true } | { allowed: false; resetAt: number } {
  const now = Date.now();
  const entry = fallbackUsage.get(key);
  if (!entry || now >= entry.resetAt) {
    fallbackUsage.set(key, { count: 1, resetAt: now + DAY_MS });
    return { allowed: true };
  }
  if (entry.count >= dailyLimit()) {
    return { allowed: false, resetAt: entry.resetAt };
  }
  entry.count += 1;
  return { allowed: true };
}

// BYOM burst guard: per-minute sliding window, in-memory only. This is a fast
// circuit-breaker against a runaway loop hammering a user's own paid key, not
// a monetization control — it doesn't need to survive restarts or share state
// across instances, unlike the persisted daily counter in server/billing.ts.
const burstWindows = new Map<string, number[]>();

function withinBurstLimit(uid: string, limit: number): boolean {
  const now = Date.now();
  const recent = (burstWindows.get(uid) || []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) {
    burstWindows.set(uid, recent);
    return false;
  }
  recent.push(now);
  burstWindows.set(uid, recent);
  return true;
}

/**
 * Plan-aware AI usage gate. Free (20 lifetime), Pro Monthly (100/billing
 * period), and BYOM (30/min + 500/day abuse-guard) are all enforced here via
 * server/billing.ts's persisted, plan-keyed counters — see
 * payment-system-plan.md Phase 0. Falls back to the old flat in-memory daily
 * cap when there's no verified uid or Firebase Admin isn't configured, since
 * there's no plan to check in that case (matches the pre-existing local-dev
 * behavior of this middleware).
 */
export async function requireWithinAiQuota(req: Request, res: Response, next: NextFunction): Promise<void> {
  const uid = (req as any).uid as string | undefined;
  const app = getAdminApp();

  if (!uid || !app) {
    const key = uid || "anonymous";
    const result = checkFallbackLimit(key);
    if (result.allowed === false) {
      res.status(429).json({
        error: `Daily AI usage limit reached (${dailyLimit()}/day) — resets at ${new Date(result.resetAt).toISOString()}`,
      });
      return;
    }
    next();
    return;
  }

  try {
    const billing = await getBillingState(app, uid);

    if (!billing.comped && (billing.plan === "byom_monthly" || billing.plan === "byom_yearly")) {
      const flags = await getFeatureFlags(app);
      if (!withinBurstLimit(uid, flags.byomBurstPerMinute)) {
        res.status(429).json({ error: "Too many requests in a short window (safety limit) — wait a moment and try again." });
        return;
      }
    }

    const result = await checkAndConsumeAiQuota(app, uid);
    if (result.allowed === false) {
      res.status(429).json({ error: result.reason });
      return;
    }
    next();
  } catch (e) {
    console.error("AI quota check failed", e);
    res.status(500).json({ error: "Could not verify AI usage quota — try again." });
  }
}
