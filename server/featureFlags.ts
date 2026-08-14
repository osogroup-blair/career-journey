import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export interface FeatureFlags {
  freeLifetimeLimit: number;
  proMonthlyLimit: number;
  byomBurstPerMinute: number;
  byomDailyLimit: number;
  killSwitches: {
    /** Blocks /api/ai/liteScan and both /api/sources/* routes entirely. */
    matches: boolean;
    /** Blocks all of /api/ai/* — an emergency global stop, not a per-feature one. */
    aiPipeline: boolean;
  };
}

// Same starting defaults as before this doc existed (server/billing.ts and
// rateLimiter.ts's old env-var-backed constants) — env vars still work as a
// fallback when the Firestore doc doesn't exist yet or a field is missing.
function defaultFlags(): FeatureFlags {
  return {
    freeLifetimeLimit: Number(process.env.FREE_AI_ACTIONS_LIFETIME_LIMIT) || 20,
    proMonthlyLimit: Number(process.env.PRO_MONTHLY_AI_ACTIONS_LIMIT) || 100,
    byomBurstPerMinute: Number(process.env.BYOM_BURST_PER_MINUTE) || 30,
    byomDailyLimit: Number(process.env.BYOM_DAILY_LIMIT) || 500,
    killSwitches: { matches: false, aiPipeline: false },
  };
}

// Short in-memory cache — these values change rarely (an admin editing a
// setting), so a per-request Firestore read for every AI call would be pure
// overhead. 30s is a reasonable staleness window for a kill switch: fast
// enough to feel "live" to an admin, cheap enough to not matter at request volume.
let cache: { flags: FeatureFlags; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

function flagsRef(app: App) {
  return getFirestore(app).collection("config").doc("featureFlags");
}

export async function getFeatureFlags(app: App): Promise<FeatureFlags> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) return cache.flags;

  const snap = await flagsRef(app).get();
  const stored = snap.exists ? (snap.data() as Partial<FeatureFlags>) : {};
  const flags: FeatureFlags = {
    ...defaultFlags(),
    ...stored,
    killSwitches: { ...defaultFlags().killSwitches, ...(stored.killSwitches || {}) },
  };
  cache = { flags, expiresAt: now + CACHE_TTL_MS };
  return flags;
}

export async function setFeatureFlags(app: App, updates: Partial<FeatureFlags>): Promise<FeatureFlags> {
  await flagsRef(app).set(updates, { merge: true });
  cache = null; // next read picks up the change immediately instead of waiting out the TTL
  return getFeatureFlags(app);
}
