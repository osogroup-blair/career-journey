import type { Request, Response, NextFunction } from "express";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_LIMIT = 50;

const dailyLimit = Number(process.env.AI_DAILY_CALL_LIMIT) || DEFAULT_DAILY_LIMIT;

/**
 * In-memory per-uid counter on a rolling 24h window — resets on server restart and
 * doesn't share state across instances. Fine at launch scale (a single server
 * process); if traffic ever needs horizontal scaling, swap this for a Firestore- or
 * Redis-backed counter instead.
 */
const usage = new Map<string, { count: number; resetAt: number }>();

export function requireWithinAiQuota(req: Request, res: Response, next: NextFunction): void {
  const uid = (req as any).uid as string | undefined;
  if (!uid) {
    // No verified uid on the request — requireFirebaseAuth isn't configured (local
    // dev), so there's nothing to key the quota on. Let it through unmetered.
    next();
    return;
  }

  const now = Date.now();
  const entry = usage.get(uid);
  if (!entry || now >= entry.resetAt) {
    usage.set(uid, { count: 1, resetAt: now + DAY_MS });
    next();
    return;
  }

  if (entry.count >= dailyLimit) {
    res.status(429).json({
      error: `Daily AI usage limit reached (${dailyLimit}/day) — resets at ${new Date(entry.resetAt).toISOString()}`,
    });
    return;
  }

  entry.count += 1;
  next();
}
