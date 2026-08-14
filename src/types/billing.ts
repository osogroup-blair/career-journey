/**
 * Shared shape for the per-user billing/entitlement doc at
 * users/{uid}/meta/billing. The client can only ever read this doc
 * (see firestore.rules) — every field here is written exclusively by the
 * server, either via server/billing.ts's quota transaction or the Stripe
 * webhook handler (Phase 1), using the Admin SDK which bypasses security
 * rules entirely.
 */
export type PlanId = 'free' | 'pro_monthly' | 'byom_monthly' | 'byom_yearly';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';

/** Canonical home for this type — server/ai/types.ts re-exports it rather than defining its own copy. */
export type AIProviderId = 'gemini' | 'openai' | 'anthropic';

export interface BillingState {
  plan: PlanId;
  stripeCustomerId?: string;
  subscriptionStatus?: SubscriptionStatus;
  /** ISO timestamp — end of the current Stripe billing period, once a real subscription exists (Phase 1). */
  subscriptionCurrentPeriodEnd?: string;

  /** Never resets. Free's cap is a lifetime total, not monthly. */
  freeAiActionsUsed: number;

  /** Resets each Pro Monthly billing period. */
  proMonthlyAiActionsUsed: number;
  /** ISO timestamp — start of the period the counter above is tracking. */
  proMonthlyPeriodStart: string;

  /** BYOM abuse-guard daily counter — a safety rail, not a plan limit. Resets every 24h. */
  byomDailyActionsUsed?: number;
  byomDailyResetAt?: string;

  /** Provider + model choice for BYOM tiers — not secret, the API key itself is never stored here (see Phase 4). */
  byomProvider?: AIProviderId;
  byomModel?: string;

  /**
   * Admin-granted override (Phase 5) — bypasses the hard paid-plan gate and
   * all quota limits regardless of `plan`, without a real Stripe subscription
   * behind it. Used for support cases, beta testers, and the shared demo
   * account. `plan` is left alone so it still displays/behaves normally for
   * anything that isn't gating (e.g. showing "Pro Monthly" in the UI).
   */
  comped?: boolean;
}

export function isPaidPlan(plan: PlanId): boolean {
  return plan !== 'free';
}

/**
 * Mirrors server/billing.ts's defaultBillingState(). The billing doc is only
 * created lazily server-side on a user's first AI call — a brand-new account
 * that hasn't made one yet has no doc, so FirestoreDataStore.getBilling()
 * falls back to this rather than returning null. null is reserved for
 * "billing doesn't apply here" (local-only mode with no Firebase) — a real
 * signed-in user with no doc yet is still on the free plan, not exempt from
 * gating.
 */
export function defaultBillingState(): BillingState {
  return {
    plan: 'free',
    freeAiActionsUsed: 0,
    proMonthlyAiActionsUsed: 0,
    proMonthlyPeriodStart: new Date().toISOString(),
  };
}

export function isByomPlan(plan: PlanId): boolean {
  return plan === 'byom_monthly' || plan === 'byom_yearly';
}
