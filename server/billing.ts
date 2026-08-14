import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Request, Response, NextFunction } from "express";
import { getAdminApp } from "./firebaseAdmin";
import { getFeatureFlags, isFeatureEnabled } from "./featureFlags";
import type { BillingState, PlanId } from "../src/types/billing";
import type { FeatureKey } from "../src/types/featureFlags";
import { FEATURE_METADATA } from "../src/types/featureFlags";

const DAY_MS = 24 * 60 * 60 * 1000;

function defaultBillingState(): BillingState {
  return {
    plan: "free",
    freeAiActionsUsed: 0,
    proMonthlyAiActionsUsed: 0,
    proMonthlyPeriodStart: new Date().toISOString(),
  };
}

function billingRef(app: App, uid: string) {
  return getFirestore(app).collection("users").doc(uid).collection("meta").doc("billing");
}

/**
 * Reads (and lazily creates, on first read) the billing/entitlement doc for a
 * user. Never called from the client — only server code with an Admin SDK
 * instance, which bypasses firestore.rules entirely.
 */
export async function getBillingState(app: App, uid: string): Promise<BillingState> {
  const ref = billingRef(app, uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const initial = defaultBillingState();
    await ref.set(initial);
    return initial;
  }
  return { ...defaultBillingState(), ...(snap.data() as Partial<BillingState>) };
}

export function isPaidPlan(plan: PlanId): boolean {
  return plan !== "free";
}

/**
 * Checks whether a feature is permitted for the current user based on:
 * 1. Emergency kill switch state (aiPipeline or feature-specific)
 * 2. Admin & comped privileges (automatic full feature access)
 * 3. Subscription plan vs. the Feature Matrix in config/featureFlags
 */
export function requireFeature(feature: FeatureKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const app = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    const isAdmin = (req as any).isAdmin === true;

    if (!app) {
      // Local development without Firebase Admin
      next();
      return;
    }

    try {
      const flags = await getFeatureFlags(app);

      // Emergency kill switch applies to everyone including admins
      if (flags.killSwitches.aiPipeline || (feature === "job_matches" && flags.killSwitches.matches)) {
        res.status(503).json({
          error: `${FEATURE_METADATA[feature]?.label || "This feature"} is temporarily disabled — try again shortly.`,
        });
        return;
      }

      if (isAdmin) {
        next();
        return;
      }

      if (!uid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const billing = await getBillingState(app, uid);
      const enabled = isFeatureEnabled(flags, feature, {
        plan: billing.plan,
        isAdmin: false,
        comped: billing.comped,
      });

      if (!enabled) {
        res.status(403).json({
          error: `${FEATURE_METADATA[feature]?.label || "This feature"} is not enabled for your plan — upgrade to unlock.`,
          feature,
          currentPlan: billing.plan,
        });
        return;
      }

      next();
    } catch (e) {
      console.error(`requireFeature(${feature}): check failed`, e);
      res.status(500).json({ error: "Could not verify feature permissions — try again." });
    }
  };
}

/**
 * Hard gate for Job Analysis/Matches endpoints — delegating to requireFeature("job_matches")
 * for backwards compatibility.
 */
export function requireAnyPaidPlan(req: Request, res: Response, next: NextFunction): void {
  requireFeature("job_matches")(req, res, next);
}

/**
 * Server-only write path for billing state, used by the Stripe webhook
 * handler (server/stripe.ts) to sync plan/subscription fields — the only
 * other writer is the quota transaction above. Never exposed to the client;
 * firestore.rules makes users/{uid}/meta/billing client-write: false.
 */
export async function setBillingFields(app: App, uid: string, fields: Partial<BillingState>): Promise<void> {
  await billingRef(app, uid).set(fields, { merge: true });
}

type QuotaResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Checks the caller's plan-specific AI-action quota and atomically consumes
 * one unit if allowed, in a single Firestore transaction so a blocked call
 * never consumes quota and concurrent requests can't race past the limit.
 * Comped accounts always pass without consuming anything.
 */
export async function checkAndConsumeAiQuota(app: App, uid: string): Promise<QuotaResult> {
  const [flags, db] = [await getFeatureFlags(app), getFirestore(app)];
  if (flags.killSwitches.aiPipeline) {
    return { allowed: false, reason: "AI features are temporarily disabled — try again shortly." };
  }
  const ref = billingRef(app, uid);

  return db.runTransaction(async (tx): Promise<QuotaResult> => {
    const snap = await tx.get(ref);
    const state: BillingState = snap.exists
      ? { ...defaultBillingState(), ...(snap.data() as Partial<BillingState>) }
      : defaultBillingState();

    if (state.comped) {
      return { allowed: true };
    }

    if (state.plan === "free") {
      if (state.freeAiActionsUsed >= flags.freeLifetimeLimit) {
        return {
          allowed: false,
          reason: `Free plan's ${flags.freeLifetimeLimit} lifetime AI actions are used up — upgrade to keep going.`,
        };
      }
      tx.set(ref, { ...state, freeAiActionsUsed: state.freeAiActionsUsed + 1 }, { merge: true });
      return { allowed: true };
    }

    if (state.plan === "pro_monthly") {
      const periodStart = new Date(state.proMonthlyPeriodStart);
      const now = new Date();
      const periodElapsedMonths =
        (now.getFullYear() - periodStart.getFullYear()) * 12 + (now.getMonth() - periodStart.getMonth());

      if (periodElapsedMonths >= 1) {
        tx.set(
          ref,
          { ...state, proMonthlyAiActionsUsed: 1, proMonthlyPeriodStart: now.toISOString() },
          { merge: true }
        );
        return { allowed: true };
      }

      if (state.proMonthlyAiActionsUsed >= flags.proMonthlyLimit) {
        return {
          allowed: false,
          reason: `Pro Monthly's ${flags.proMonthlyLimit} AI actions for this billing period are used up — resets next cycle.`,
        };
      }
      tx.set(ref, { ...state, proMonthlyAiActionsUsed: state.proMonthlyAiActionsUsed + 1 }, { merge: true });
      return { allowed: true };
    }

    // byom_monthly / byom_yearly — no spend cap, just the daily safety rail.
    const now = Date.now();
    const resetAt = state.byomDailyResetAt ? new Date(state.byomDailyResetAt).getTime() : 0;
    if (now >= resetAt) {
      tx.set(
        ref,
        { ...state, byomDailyActionsUsed: 1, byomDailyResetAt: new Date(now + DAY_MS).toISOString() },
        { merge: true }
      );
      return { allowed: true };
    }
    if ((state.byomDailyActionsUsed || 0) >= flags.byomDailyLimit) {
      return {
        allowed: false,
        reason: `Daily safety limit (${flags.byomDailyLimit} actions) reached for your own API key — resets within 24h. This is an abuse-guard against runaway bugs, not a plan limit.`,
      };
    }
    tx.set(ref, { ...state, byomDailyActionsUsed: (state.byomDailyActionsUsed || 0) + 1 }, { merge: true });
    return { allowed: true };
  });
}
