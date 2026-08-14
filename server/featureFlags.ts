import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { FeatureKey, FeatureFlags } from "../src/types/featureFlags";
import { getDefaultFeatureMatrix, FEATURE_METADATA } from "../src/types/featureFlags";
import type { PlanId } from "../src/types/billing";

export type { FeatureFlags, FeatureKey };

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
    features: getDefaultFeatureMatrix(),
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
  const defaults = defaultFlags();

  // Deep-merge features matrix
  const mergedFeatures: Record<FeatureKey, Record<PlanId, boolean>> = {
    ...getDefaultFeatureMatrix(),
  };

  if (stored.features) {
    for (const key of Object.keys(mergedFeatures) as FeatureKey[]) {
      if (stored.features[key]) {
        mergedFeatures[key] = {
          ...mergedFeatures[key],
          ...stored.features[key],
        };
      }
    }
  }

  const flags: FeatureFlags = {
    ...defaults,
    ...stored,
    killSwitches: { ...defaults.killSwitches, ...(stored.killSwitches || {}) },
    features: mergedFeatures,
  };
  cache = { flags, expiresAt: now + CACHE_TTL_MS };
  return flags;
}

export function _resetFeatureFlagsCache(): void {
  cache = null;
}

export async function setFeatureFlags(app: App, updates: Partial<FeatureFlags>): Promise<FeatureFlags> {
  await flagsRef(app).set(updates, { merge: true });
  cache = null; // next read picks up the change immediately instead of waiting out the TTL
  return getFeatureFlags(app);
}

/**
 * Checks if a specific feature is enabled for a user.
 * 
 * Rules:
 * 1. Emergency Kill Switches override everything (even admin/comped users).
 * 2. Admins (isAdmin = true) and Comped users (comped = true) bypass tier gates and have all features.
 * 3. Standard users check the matrix for their plan (defaulting to 'free' if no plan specified).
 */
export function isFeatureEnabled(
  flags: FeatureFlags,
  feature: FeatureKey,
  user?: { plan?: PlanId; isAdmin?: boolean; comped?: boolean }
): boolean {
  // Global Emergency Kill Switch
  if (flags.killSwitches.aiPipeline) {
    return false;
  }

  // Specific matches kill switch
  if (feature === "job_matches" && flags.killSwitches.matches) {
    return false;
  }

  // Admin & Comped users have full access to all features
  if (user?.isAdmin || user?.comped) {
    return true;
  }

  const plan: PlanId = user?.plan || "free";
  const featureDef = flags.features?.[feature];

  if (featureDef && typeof featureDef[plan] === "boolean") {
    return featureDef[plan];
  }

  // Fallback to default registry metadata
  const defaultMeta = FEATURE_METADATA[feature];
  if (defaultMeta && typeof defaultMeta.defaultPlans[plan] === "boolean") {
    return defaultMeta.defaultPlans[plan];
  }

  return false;
}
