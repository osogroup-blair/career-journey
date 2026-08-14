import Stripe from "stripe";
import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Request, Response } from "express";
import { setBillingFields } from "./billing";
import type { PlanId, SubscriptionStatus } from "../src/types/billing";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  if (stripeClient) return stripeClient;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

// Functions, not module-level consts — this module is imported by server.ts
// before server.ts's own dotenv.config() call runs (ESM hoists static imports
// ahead of the importing module's body), so a module-level process.env read
// here would always see an unloaded environment regardless of .env's contents.
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

// Maps a Stripe Price ID to the plan it grants — see payment-system-plan.md
// Phase 1 step 3 for how these three Prices are created in the Dashboard.
function priceIdToPlan(): Record<string, PlanId> {
  const map: Record<string, PlanId> = {};
  if (process.env.STRIPE_PRICE_PRO_MONTHLY) map[process.env.STRIPE_PRICE_PRO_MONTHLY] = "pro_monthly";
  if (process.env.STRIPE_PRICE_BYOM_MONTHLY) map[process.env.STRIPE_PRICE_BYOM_MONTHLY] = "byom_monthly";
  if (process.env.STRIPE_PRICE_BYOM_YEARLY) map[process.env.STRIPE_PRICE_BYOM_YEARLY] = "byom_yearly";
  return map;
}

function planToPriceEnv(): Record<Exclude<PlanId, "free">, string | undefined> {
  return {
    pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    byom_monthly: process.env.STRIPE_PRICE_BYOM_MONTHLY,
    byom_yearly: process.env.STRIPE_PRICE_BYOM_YEARLY,
  };
}

/**
 * Creates a hosted Checkout Session for one of the 3 paid Prices. `uid` is
 * carried two ways so every downstream webhook event can resolve back to a
 * Firebase user without a reverse-lookup table: `client_reference_id` on the
 * Session (present on checkout.session.completed) and `subscription_data.metadata`
 * on the Subscription itself (present on every later subscription/invoice event).
 */
export async function createCheckoutSession(params: {
  uid: string;
  email: string;
  plan: Exclude<PlanId, "free">;
  successUrl: string;
  cancelUrl: string;
  /** Pass this on a re-subscribe so Stripe reuses the existing Customer instead of creating a duplicate. */
  existingStripeCustomerId?: string;
}): Promise<string> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");

  const priceId = planToPriceEnv()[params.plan];
  if (!priceId) throw new Error(`No Stripe Price ID configured for plan "${params.plan}"`);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: params.uid,
    ...(params.existingStripeCustomerId
      ? { customer: params.existingStripeCustomerId }
      : { customer_email: params.email }),
    subscription_data: { metadata: { firebaseUID: params.uid } },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

/**
 * Creates a Customer Portal session so a subscriber can switch plans, update
 * payment method, or cancel — all self-service, no custom UI needed. Requires
 * a stripeCustomerId already on the billing doc, which only exists after a
 * completed Checkout (see handleCheckoutSessionCompleted below).
 */
export async function createPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing)");

  const session = await stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
  return session.url;
}

function toSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "trialing":
      return "trialing";
    default:
      return "incomplete";
  }
}

function planFromSubscription(sub: Stripe.Subscription): PlanId | null {
  const priceId = sub.items.data[0]?.price?.id;
  if (!priceId) return null;
  return priceIdToPlan()[priceId] || null;
}

async function uidFromSubscription(stripe: Stripe, sub: Stripe.Subscription): Promise<string | null> {
  if (sub.metadata?.firebaseUID) return sub.metadata.firebaseUID;
  // Fallback for subscriptions created/modified without our metadata (shouldn't
  // happen via this app's own Checkout flow, but defensive against manual
  // Dashboard edits during testing).
  const customer = await stripe.customers.retrieve(sub.customer as string);
  if (customer.deleted !== true && customer.metadata?.firebaseUID) return customer.metadata.firebaseUID;
  return null;
}

async function handleCheckoutSessionCompleted(app: App, session: Stripe.Checkout.Session): Promise<void> {
  const uid = session.client_reference_id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!uid || !customerId) {
    console.error("checkout.session.completed missing client_reference_id or customer", session.id);
    return;
  }
  const stripe = getStripeClient()!;
  // Stamp the customer with the uid too, as a second path to resolve it
  // (belt-and-suspenders alongside subscription_data.metadata above).
  await stripe.customers.update(customerId, { metadata: { firebaseUID: uid } });

  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const plan = subscriptionId ? planFromSubscription(await stripe.subscriptions.retrieve(subscriptionId)) : null;

  await setBillingFields(app, uid, {
    stripeCustomerId: customerId,
    plan: plan || "free",
    subscriptionStatus: "active",
  });
}

async function handleSubscriptionUpdated(app: App, sub: Stripe.Subscription): Promise<void> {
  const stripe = getStripeClient()!;
  const uid = await uidFromSubscription(stripe, sub);
  if (!uid) {
    console.error("customer.subscription.updated: could not resolve firebaseUID", sub.id);
    return;
  }
  const plan = planFromSubscription(sub);
  const periodEnd = sub.items.data[0]?.current_period_end;
  await setBillingFields(app, uid, {
    plan: plan || "free",
    subscriptionStatus: toSubscriptionStatus(sub.status),
    subscriptionCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : undefined,
  });
}

async function handleSubscriptionDeleted(app: App, sub: Stripe.Subscription): Promise<void> {
  const stripe = getStripeClient()!;
  const uid = await uidFromSubscription(stripe, sub);
  if (!uid) {
    console.error("customer.subscription.deleted: could not resolve firebaseUID", sub.id);
    return;
  }
  await setBillingFields(app, uid, { plan: "free", subscriptionStatus: "canceled" });
}

async function handleInvoicePaymentFailed(app: App, invoice: Stripe.Invoice): Promise<void> {
  const stripe = getStripeClient()!;
  // Newer Stripe API versions moved this from a top-level invoice.subscription
  // field to parent.subscription_details.subscription.
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
  if (!subscriptionId) return;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const uid = await uidFromSubscription(stripe, sub);
  if (!uid) {
    console.error("invoice.payment_failed: could not resolve firebaseUID", invoice.id);
    return;
  }
  await setBillingFields(app, uid, { subscriptionStatus: "past_due" });
}

/**
 * Idempotency guard: Stripe can and does redeliver the same event. Recorded
 * in a top-level stripeEvents/{eventId} doc — server/Admin-SDK-only, no
 * firestore.rules path grants client access to it at all.
 */
async function alreadyProcessed(app: App, eventId: string): Promise<boolean> {
  const ref = getFirestore(app).collection("stripeEvents").doc(eventId);
  const db = getFirestore(app);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return true;
    tx.set(ref, { processedAt: new Date().toISOString() });
    return false;
  });
}

/**
 * Express handler for POST /api/billing/webhook. Must be registered with a
 * raw-body parser BEFORE app.use(express.json()) in server.ts — Stripe's
 * signature verification needs the exact raw bytes, not re-serialized JSON.
 */
export async function handleStripeWebhook(app: App, req: Request, res: Response): Promise<void> {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    res.status(500).json({ error: "Stripe webhook is not configured" });
    return;
  }

  const signature = req.headers["stripe-signature"];
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature as string, webhookSecret);
  } catch (e: any) {
    console.error("Stripe webhook signature verification failed", e.message);
    res.status(400).json({ error: `Webhook signature verification failed: ${e.message}` });
    return;
  }

  if (await alreadyProcessed(app, event.id)) {
    res.status(200).json({ received: true, deduped: true });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(app, event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        // Stripe fires "created" (not "updated") on a brand-new subscription —
        // found via live testing: subscriptionCurrentPeriodEnd never got set on
        // first subscribe because only "updated" was handled. Same sync logic
        // applies to both, so both route here.
        await handleSubscriptionUpdated(app, event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(app, event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(app, event.data.object as Stripe.Invoice);
        break;
      default:
        // Not one we act on — still 200 so Stripe doesn't retry it forever.
        break;
    }
    res.status(200).json({ received: true });
  } catch (e: any) {
    console.error(`Failed to process Stripe webhook event ${event.type} (${event.id})`, e);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}
