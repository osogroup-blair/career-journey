import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import dotenv from "dotenv";
import { FULL_KNOWLEDGE, CAREER_JOURNEY_BUILDER_KNOWLEDGE } from "./server/knowledge";
import { computeNextIds, computeNextVersion, versionChangesKey } from "./server/careerJourneyVersioning";
import { generateId } from "./src/lib/utils";
import { buildResumeDocx, buildCoverLetterDocx } from "./server/docxBuilder";
import { requireFirebaseAuth, requireAdmin, getAdminApp } from "./server/firebaseAdmin";
import { requireWithinAiQuota } from "./server/rateLimiter";
import { getActivePrompt, getActivePromptFilled, getAllPromptConfigs, savePromptOverride, restorePromptDefault, DEFAULT_PROMPTS } from "./server/promptStore";
import { getBillingState, setBillingFields, requireAnyPaidPlan, requireFeature, recordAiUsage, getUserAiUsage } from "./server/billing";
import { getDefaultFeatureMatrix } from "./src/types/featureFlags";
import {
  createTicket,
  listTicketsForUser,
  getTicketForUser,
  addUserMessage,
  listAllTickets,
  getTicketForAdmin,
  updateTicket,
  addAdminMessage,
  getTicketScreenshotUrl,
  TicketRateLimitError,
  TicketNotFoundError,
  TicketAccessError,
  getTicketScreenshotUrlForUser,
} from "./server/support";
import type { TicketType, TicketContext, TicketStatus, TicketTriageType, TicketPriority } from "./src/types/support";
import { createCheckoutSession, createPortalSession, handleStripeWebhook } from "./server/stripe";
import { getAIClientForRequest, buildProviderClient, MissingByomKeyError } from "./server/ai/getAIClient";
import { KeywordsResponseSchema, FitAnalysisSchema } from "./server/ai/schemas";
import { isByomPlan, AIProviderId, PlanId, BillingState } from "./src/types/billing";
import { getFeatureFlags, setFeatureFlags } from "./server/featureFlags";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { AllowedModelsConfig } from "./src/types/aiModels";
import { sendEmail, isEmailConfigured } from "./server/email";
import { logAdminAction, listAuditLogs } from "./server/auditLog";

/** Distinguishes "your BYOM key is missing/invalid" (actionable, 400) from an actual server error (500). */
function handleAiRouteError(e: any, res: express.Response) {
  console.error(e);
  if (e instanceof MissingByomKeyError) {
    res.status(400).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e.message });
}

async function trackUsage(
  req: express.Request,
  endpoint: string,
  model: string,
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  provider: string = "gemini"
) {
  const adminApp = getAdminApp();
  const uid = (req as any).uid as string | undefined;
  if (!adminApp || !uid) return;

  const isByom = Boolean(req.headers["x-byom-key"]);
  const promptTokens = (usageMetadata as any)?.promptTokenCount ?? (usageMetadata as any)?.promptTokens ?? 0;
  const completionTokens = (usageMetadata as any)?.candidatesTokenCount ?? (usageMetadata as any)?.completionTokens ?? 0;
  const totalTokens = (usageMetadata as any)?.totalTokenCount ?? (usageMetadata as any)?.totalTokens ?? (promptTokens + completionTokens);

  try {
    await recordAiUsage(adminApp, uid, {
      endpoint,
      model,
      provider,
      promptTokens,
      completionTokens,
      totalTokens,
      isByom,
    });
  } catch (err) {
    console.error(`Failed to record AI usage for ${endpoint}:`, err);
  }
}

dotenv.config();

const KNOWLEDGE_PREAMBLE = `Reference material below is the candidate's job-application pipeline: project instructions plus five skill files (JD pipeline, cover letter, voice, ATS tactics, JD signal map). Follow these rules exactly wherever they apply to the task requested after the reference material. Do not summarize or explain the reference material back; use it silently to inform your output.

${FULL_KNOWLEDGE}

---
`;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Deterministic, non-AI segmentation of raw JD text into paragraph/bullet
 * chunks with stable ids — the traceability anchor that lets a keyword or
 * fit-gap claim point back to the exact JD text it came from (EvidenceTrace).
 * Split on blank lines first; if that yields one giant blob (JDs pasted
 * without paragraph breaks), fall back to splitting on line breaks.
 */
function segmentJdText(jdText: string): { id: string; text: string }[] {
  const byParagraph = jdText.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  const chunks = byParagraph.length > 3 ? byParagraph : jdText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return chunks.map((text, i) => ({ id: `jd-${i}`, text }));
}

async function startServer() {
  const app = express();
  const PORT = 47293;

  // Registered BEFORE the global express.json() below, with its own raw-body
  // parser — Stripe's signature verification needs the exact raw request
  // bytes, not re-serialized JSON. Being the first matching route for this
  // exact path means express.json() (further down the stack) never touches
  // it. See payment-system-plan.md Phase 1 for why this ordering matters.
  app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    await handleStripeWebhook(adminApp, req, res);
  });

  app.use(express.json({ limit: '10mb' }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // No-op until FIREBASE_SERVICE_ACCOUNT_JSON is set (see server/firebaseAdmin.ts) —
  // guards the AI/sourcing endpoints once the app is deployed publicly.
  app.use("/api/ai", requireFirebaseAuth);
  app.use("/api/ai", requireWithinAiQuota);
  app.use("/api/sources", requireFirebaseAuth);
  // Job Analysis (Matches/discovery) is hard-gated behind any paid plan —
  // unlike the rest of /api/ai (journey-building, per-job pipeline), which
  // stays free-with-quota via requireWithinAiQuota above. Both /api/sources
  // routes (fetchCompanyJobs, fetchJobFromUrl) are Matches-only, so the whole
  // path group is gated; liteScan needs its own route-level middleware since
  // /api/ai has many non-gated siblings.
  app.use("/api/sources", requireAnyPaidPlan);
  app.use("/api/admin", requireFirebaseAuth);
  app.use("/api/admin", requireAdmin);
  app.use("/api/export", requireFirebaseAuth);
  app.use("/api/billing", requireFirebaseAuth);
  app.use("/api/support", requireFirebaseAuth);
  app.use("/api/user", requireFirebaseAuth);

  app.post("/api/billing/createCheckoutSession", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const { plan, email } = req.body as { plan: "pro_monthly" | "byom_monthly" | "byom_yearly"; email: string };
      const billing = await getBillingState(adminApp, uid);
      const appUrl = process.env.APP_URL || "http://localhost:47293";
      const url = await createCheckoutSession({
        uid,
        email,
        plan,
        existingStripeCustomerId: billing.stripeCustomerId,
        successUrl: `${appUrl}/#/upgrade?checkout=success`,
        cancelUrl: `${appUrl}/#/upgrade?checkout=cancelled`,
      });
      res.json({ url });
    } catch (e: any) {
      console.error("createCheckoutSession failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/billing/createPortalSession", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const billing = await getBillingState(adminApp, uid);
      if (!billing.stripeCustomerId) {
        res.status(400).json({ error: "No billing account yet — subscribe first." });
        return;
      }
      const appUrl = process.env.APP_URL || "http://localhost:47293";
      const url = await createPortalSession({
        stripeCustomerId: billing.stripeCustomerId,
        returnUrl: `${appUrl}/#/upgrade`,
      });
      res.json({ url });
    } catch (e: any) {
      console.error("createPortalSession failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Saves provider + model *choice* only — never the API key itself (see
  // payment-system-plan.md's Phase 4 key-handling decision: the key lives in
  // the browser's localStorage and rides per-request headers, not here).
  app.post("/api/billing/byomSettings", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const { provider, model } = req.body as { provider: AIProviderId; model: string };
      const billing = await getBillingState(adminApp, uid);
      if (!isByomPlan(billing.plan)) {
        res.status(403).json({ error: "BYOM settings require a BYOM plan." });
        return;
      }
      await setBillingFields(adminApp, uid, { byomProvider: provider, byomModel: model });
      res.json({ ok: true });
    } catch (e: any) {
      console.error("byomSettings save failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Tests a BYOM key with a real, minimal call through the same abstraction
  // the app actually uses (server/ai/*) — the most trustworthy check
  // available, since it exercises the exact code path a real request would.
  // Never stores the key regardless of outcome.
  app.post("/api/billing/validateByomKey", async (req, res) => {
    try {
      const { provider, apiKey, model } = req.body as { provider: AIProviderId; apiKey: string; model?: string };
      if (!provider || !apiKey) {
        res.status(400).json({ valid: false, error: "provider and apiKey are required" });
        return;
      }
      const client = buildProviderClient(provider, apiKey, model);
      await client.generateStructured({
        systemPrompt: "Respond with exactly the requested JSON shape and nothing else.",
        prompt: 'Respond with { "ok": true }.',
        schema: z.object({ ok: z.boolean() }),
      });
      res.json({ valid: true });
    } catch (e: any) {
      // 200, not 500 — an invalid key is an expected validation outcome, not
      // a server error. Each provider SDK's error message is usually already
      // actionable ("invalid API key", "insufficient quota", etc).
      res.json({ valid: false, error: e.message || "Key validation failed" });
    }
  });

  // Support tickets (admin-support-feedback-plan.md Phase 1). uid/email come from the
  // verified ID token (requireFirebaseAuth), never the request body — same trust
  // boundary as every other authenticated route here.
  app.post("/api/support/tickets", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const { type, title, description, context, screenshotPath } = req.body as {
        type: TicketType;
        title: string;
        description: string;
        context: Omit<TicketContext, "timestamp">;
        screenshotPath?: string;
      };
      if (!title?.trim() || !description?.trim()) {
        res.status(400).json({ error: "title and description are required" });
        return;
      }
      const email = (await getAuth(adminApp).getUser(uid)).email || null;
      const ticket = await createTicket(adminApp, uid, email, { type, title, description, context, screenshotPath });
      res.json(ticket);
    } catch (e: any) {
      if (e instanceof TicketRateLimitError) {
        res.status(429).json({ error: e.message });
        return;
      }
      console.error("createTicket failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/support/tickets", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      res.json(await listTicketsForUser(adminApp, uid));
    } catch (e: any) {
      console.error("listTicketsForUser failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/support/tickets/:id/messages", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      res.json(await getTicketForUser(adminApp, uid, req.params.id));
    } catch (e: any) {
      if (e instanceof TicketNotFoundError) {
        res.status(404).json({ error: e.message });
        return;
      }
      if (e instanceof TicketAccessError) {
        res.status(403).json({ error: e.message });
        return;
      }
      console.error("getTicketForUser failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/support/tickets/:id/screenshot", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const url = await getTicketScreenshotUrlForUser(adminApp, uid, req.params.id);
      if (url) res.json({ url });
      else res.status(404).json({ error: "No screenshot attached to this ticket" });
    } catch (e: any) {
      if (e instanceof TicketNotFoundError) {
        res.status(404).json({ error: e.message });
        return;
      }
      if (e instanceof TicketAccessError) {
        res.status(403).json({ error: e.message });
        return;
      }
      console.error("getTicketScreenshotUrlForUser failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/support/tickets/:id/messages", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const { body } = req.body as { body: string };
      if (!body?.trim()) {
        res.status(400).json({ error: "body is required" });
        return;
      }
      const message = await addUserMessage(adminApp, uid, req.params.id, body);
      res.json(message);
    } catch (e: any) {
      if (e instanceof TicketNotFoundError) {
        res.status(404).json({ error: e.message });
        return;
      }
      if (e instanceof TicketAccessError) {
        res.status(403).json({ error: e.message });
        return;
      }
      console.error("addUserMessage failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Admin ticket inbox (admin-support-feedback-plan.md Phase 3) — full CRUD against the
  // same tickets collection /api/support/* writes, gated by the /api/admin middleware
  // group registered above (requireFirebaseAuth + requireAdmin).
  app.get("/api/admin/tickets", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const { status, triageType } = req.query as { status?: TicketStatus; triageType?: TicketTriageType };
      res.json(await listAllTickets(adminApp, { status, triageType }));
    } catch (e: any) {
      console.error("listAllTickets failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/tickets/:id", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      res.json(await getTicketForAdmin(adminApp, req.params.id));
    } catch (e: any) {
      if (e instanceof TicketNotFoundError) {
        res.status(404).json({ error: e.message });
        return;
      }
      console.error("getTicketForAdmin failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Short-lived signed URL (5 min) rather than a stored public one — the bucket denies direct
  // client reads entirely (storage.rules), this is the only way to view a screenshot at all.
  app.get("/api/admin/tickets/:id/screenshot", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const url = await getTicketScreenshotUrl(adminApp, req.params.id);
      if (!url) {
        res.status(404).json({ error: "This ticket has no screenshot" });
        return;
      }
      res.json({ url });
    } catch (e: any) {
      if (e instanceof TicketNotFoundError) {
        res.status(404).json({ error: e.message });
        return;
      }
      console.error("getTicketScreenshotUrl failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/tickets/:id", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const { status, triageType, priority, adminNotes } = req.body as {
        status?: TicketStatus;
        triageType?: TicketTriageType;
        priority?: TicketPriority;
        adminNotes?: string;
      };
      res.json(await updateTicket(adminApp, req.params.id, { status, triageType, priority, adminNotes }));
    } catch (e: any) {
      if (e instanceof TicketNotFoundError) {
        res.status(404).json({ error: e.message });
        return;
      }
      console.error("updateTicket failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/tickets/:id/messages", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const { body } = req.body as { body: string };
      if (!body?.trim()) {
        res.status(400).json({ error: "body is required" });
        return;
      }
      res.json(await addAdminMessage(adminApp, uid, req.params.id, body));
    } catch (e: any) {
      if (e instanceof TicketNotFoundError) {
        res.status(404).json({ error: e.message });
        return;
      }
      console.error("addAdminMessage failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/features", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.json({
        features: getDefaultFeatureMatrix(),
        killSwitches: { matches: false, aiPipeline: false },
      });
      return;
    }
    try {
      const flags = await getFeatureFlags(adminApp);
      res.json({
        features: flags.features,
        killSwitches: flags.killSwitches,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/featureFlags", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    res.json(await getFeatureFlags(adminApp));
  });

  app.post("/api/admin/featureFlags", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const updated = await setFeatureFlags(adminApp, req.body);
      res.json(updated);
    } catch (e: any) {
      console.error("setFeatureFlags failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/allowedModels", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const config = req.body as AllowedModelsConfig;
      await getFirestore(adminApp).collection("config").doc("allowedModels").set(config);
      res.json({ ok: true });
    } catch (e: any) {
      console.error("save allowedModels failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Cross-references Firebase Auth accounts with their Firestore billing docs.
  // Fine at this app's scale (small user base) — would need pagination/an
  // index before this scales to thousands of accounts.
  app.get("/api/admin/users", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const { users } = await getAuth(adminApp).listUsers(1000);
      const rows = await Promise.all(
        users.map(async (u) => {
          const billing = await getBillingState(adminApp, u.uid);
          return {
            uid: u.uid,
            email: u.email || null,
            displayName: u.displayName || null,
            disabled: u.disabled,
            isAdmin: u.customClaims?.admin === true,
            createdAt: u.metadata.creationTime,
            lastSignInTime: u.metadata.lastSignInTime || null,
            plan: billing.plan,
            comped: billing.comped || false,
            subscriptionStatus: billing.subscriptionStatus,
            freeAiActionsUsed: billing.freeAiActionsUsed,
            proMonthlyAiActionsUsed: billing.proMonthlyAiActionsUsed,
            byomProvider: billing.byomProvider,
          };
        })
      );
      res.json(rows);
    } catch (e: any) {
      console.error("list admin users failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/users/:uid/detail", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const uid = req.params.uid;
      const [user, billing, jobsSnap, matchesSnap, ticketsSnap] = await Promise.all([
        getAuth(adminApp).getUser(uid),
        getBillingState(adminApp, uid),
        getFirestore(adminApp).collection("users").doc(uid).collection("jobs").get(),
        getFirestore(adminApp).collection("users").doc(uid).collection("matches").get(),
        getFirestore(adminApp).collection("tickets").where("uid", "==", uid).get(),
      ]);

      res.json({
        user: {
          uid: user.uid,
          email: user.email || null,
          displayName: user.displayName || null,
          photoURL: user.photoURL || null,
          emailVerified: user.emailVerified,
          disabled: user.disabled,
          isAdmin: user.customClaims?.admin === true,
          creationTime: user.metadata.creationTime,
          lastSignInTime: user.metadata.lastSignInTime || null,
        },
        billing,
        stats: {
          jobsCount: jobsSnap.size,
          matchesCount: matchesSnap.size,
          ticketsCount: ticketsSnap.size,
        },
      });
    } catch (e: any) {
      console.error("get user detail failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/users/:uid/usage", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const summary = await getUserAiUsage(adminApp, req.params.uid);
      res.json(summary);
    } catch (e: any) {
      console.error("get admin user usage failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  // --- USER DATA OWNERSHIP & PRIVACY ---
  app.get("/api/user/usage", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured or user not authenticated" });
      return;
    }
    try {
      const summary = await getUserAiUsage(adminApp, uid);
      res.json(summary);
    } catch (e: any) {
      console.error("get user usage failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/user/export-data", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured or user not authenticated" });
      return;
    }
    try {
      const db = getFirestore(adminApp);
      const [userAuth, billing, jobsSnap, matchesSnap, ticketsSnap] = await Promise.all([
        getAuth(adminApp).getUser(uid).catch(() => null),
        getBillingState(adminApp, uid),
        db.collection("users").doc(uid).collection("jobs").get().catch(() => ({ docs: [] as any[] })),
        db.collection("users").doc(uid).collection("matches").get().catch(() => ({ docs: [] as any[] })),
        db.collection("tickets").where("uid", "==", uid).get().catch(() => ({ docs: [] as any[] })),
      ]);

      res.json({
        exportedAt: new Date().toISOString(),
        user: userAuth
          ? {
              uid: userAuth.uid,
              email: userAuth.email,
              displayName: userAuth.displayName,
              photoURL: userAuth.photoURL,
              emailVerified: userAuth.emailVerified,
              creationTime: userAuth.metadata.creationTime,
            }
          : { uid },
        billing,
        jobs: jobsSnap.docs.map((d) => d.data()),
        matches: matchesSnap.docs.map((d) => d.data()),
        tickets: ticketsSnap.docs.map((d) => d.data()),
      });
    } catch (e: any) {
      console.error("export user data failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/user/account", async (req, res) => {
    const adminApp = getAdminApp();
    const uid = (req as any).uid as string | undefined;
    if (!adminApp || !uid) {
      res.status(500).json({ error: "Firebase Admin is not configured or user not authenticated" });
      return;
    }
    try {
      const db = getFirestore(adminApp);

      // Clean up jobs & matches subcollections
      const [jobsSnap, matchesSnap] = await Promise.all([
        db.collection("users").doc(uid).collection("jobs").get().catch(() => ({ docs: [] as any[] })),
        db.collection("users").doc(uid).collection("matches").get().catch(() => ({ docs: [] as any[] })),
      ]);

      const batch = db.batch();
      jobsSnap.docs.forEach((d) => batch.delete(d.ref));
      matchesSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(db.collection("users").doc(uid).collection("meta").doc("billing"));
      batch.delete(db.collection("users").doc(uid));
      await batch.commit();

      // Delete user from Firebase Auth
      await getAuth(adminApp).deleteUser(uid);

      res.json({ ok: true });
    } catch (e: any) {
      console.error("delete user account failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/audit-logs", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const logs = await listAuditLogs(adminApp, 100);
      res.json(logs);
    } catch (e: any) {
      console.error("list audit logs failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:uid/status", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const actorUid = (req as any).uid || "admin";
      const { disabled } = req.body as { disabled: boolean };
      await getAuth(adminApp).updateUser(req.params.uid, { disabled: Boolean(disabled) });

      await logAdminAction(adminApp, {
        actorUid,
        targetUid: req.params.uid,
        action: "set_status",
        details: { disabled: Boolean(disabled) },
      });

      res.json({ ok: true, disabled: Boolean(disabled) });
    } catch (e: any) {
      console.error("update user disabled status failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:uid/send-reset", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const actorUid = (req as any).uid || "admin";
      const user = await getAuth(adminApp).getUser(req.params.uid);
      if (!user.email) {
        res.status(400).json({ error: "User does not have an email address" });
        return;
      }
      const resetLink = await getAuth(adminApp).generatePasswordResetLink(user.email);
      if (isEmailConfigured) {
        await sendEmail({
          to: user.email,
          subject: "Password Reset Request - Career Journey",
          html: `<p>Hello,</p><p>An administrator has generated a password reset link for your account:</p><p><a href="${resetLink}">Click here to reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`,
        });
      }

      await logAdminAction(adminApp, {
        actorUid,
        targetUid: req.params.uid,
        targetEmail: user.email,
        action: "send_reset",
        details: { email: user.email },
      });

      res.json({ ok: true, resetLink });
    } catch (e: any) {
      console.error("generate password reset link failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/admin/users/:uid", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const actorUid = (req as any).uid || "admin";
      const uid = req.params.uid;
      // Delete user from Firebase Auth
      await getAuth(adminApp).deleteUser(uid);

      // Clean up user documents in Firestore
      const db = getFirestore(adminApp);
      await db.collection("users").doc(uid).delete();
      await db.collection("users").doc(uid).collection("meta").doc("billing").delete();

      await logAdminAction(adminApp, {
        actorUid,
        targetUid: uid,
        action: "delete_user",
        details: { deletedAt: new Date().toISOString() },
      });

      res.json({ ok: true });
    } catch (e: any) {
      console.error("delete user failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:uid/comp", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const actorUid = (req as any).uid || "admin";
      const { comped } = req.body as { comped: boolean };
      await setBillingFields(adminApp, req.params.uid, { comped });

      await logAdminAction(adminApp, {
        actorUid,
        targetUid: req.params.uid,
        action: "set_comp",
        details: { comped },
      });

      res.json({ ok: true });
    } catch (e: any) {
      console.error("comp user failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:uid/plan", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const actorUid = (req as any).uid || "admin";
      const { plan } = req.body as { plan: PlanId };
      const validPlans: PlanId[] = ["free", "pro_monthly", "byom_monthly", "byom_yearly"];
      if (!validPlans.includes(plan)) {
        res.status(400).json({ error: `Invalid plan. Must be one of: ${validPlans.join(", ")}` });
        return;
      }
      await setBillingFields(adminApp, req.params.uid, { plan });

      await logAdminAction(adminApp, {
        actorUid,
        targetUid: req.params.uid,
        action: "update_plan",
        details: { plan },
      });

      res.json({ ok: true, plan });
    } catch (e: any) {
      console.error("set user plan failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:uid/reset-quota", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const actorUid = (req as any).uid || "admin";
      const { quotaType } = req.body as { quotaType?: "free" | "pro_monthly" | "all" };
      const targetType = quotaType || "all";
      const updates: Partial<BillingState> = {};

      if (targetType === "free" || targetType === "all") {
        updates.freeAiActionsUsed = 0;
      }
      if (targetType === "pro_monthly" || targetType === "all") {
        updates.proMonthlyAiActionsUsed = 0;
        updates.proMonthlyPeriodStart = new Date().toISOString();
      }
      if (targetType === "all") {
        updates.byomDailyActionsUsed = 0;
      }

      await setBillingFields(adminApp, req.params.uid, updates);

      await logAdminAction(adminApp, {
        actorUid,
        targetUid: req.params.uid,
        action: "reset_quota",
        details: { quotaType: targetType, updates },
      });

      res.json({ ok: true, updates });
    } catch (e: any) {
      console.error("reset user quota failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/admin/users/:uid/admin-role", async (req, res) => {
    const adminApp = getAdminApp();
    if (!adminApp) {
      res.status(500).json({ error: "Firebase Admin is not configured" });
      return;
    }
    try {
      const actorUid = (req as any).uid || "admin";
      const targetUid = req.params.uid;
      const { makeAdmin } = req.body as { makeAdmin: boolean };

      if (typeof makeAdmin !== "boolean") {
        res.status(400).json({ error: "makeAdmin must be a boolean" });
        return;
      }

      const auth = getAuth(adminApp);
      const targetUser = await auth.getUser(targetUid);

      // Safeguard against revoking own admin if sole admin
      if (!makeAdmin && targetUid === actorUid) {
        const allUsers = await auth.listUsers(1000);
        const adminCount = allUsers.users.filter((u) => u.customClaims?.admin === true).length;
        if (adminCount <= 1) {
          res.status(400).json({
            error: "Cannot revoke your own admin access when you are the only administrator on the system.",
          });
          return;
        }
      }

      const currentClaims = targetUser.customClaims || {};
      await auth.setCustomUserClaims(targetUid, {
        ...currentClaims,
        admin: makeAdmin ? true : null,
      });

      await logAdminAction(adminApp, {
        actorUid,
        targetUid,
        targetEmail: targetUser.email,
        action: makeAdmin ? "grant_admin" : "revoke_admin",
        details: { makeAdmin, previousAdminState: currentClaims.admin === true },
      });

      res.json({ ok: true, isAdmin: makeAdmin });
    } catch (e: any) {
      console.error("update admin role failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/admin/prompts", (req, res) => {
    res.json(getAllPromptConfigs());
  });

  app.post("/api/admin/prompts/:id", (req, res) => {
    const { id } = req.params;
    const { template } = req.body as { template: string };
    if (!(id in DEFAULT_PROMPTS)) return res.status(404).json({ error: `Unknown prompt "${id}"` });
    if (typeof template !== "string" || !template.trim()) return res.status(400).json({ error: "template is required" });
    const saved = savePromptOverride(id, template);
    res.json(saved);
  });

  app.post("/api/admin/prompts/:id/restore", (req, res) => {
    const { id } = req.params;
    restorePromptDefault(id);
    res.json({ id, template: DEFAULT_PROMPTS[id]?.template ?? "" });
  });

  // Runs a candidate prompt template (possibly unsaved edits) against a small
  // fixed sample so an admin can sanity-check a change before committing it.
  app.post("/api/admin/prompts/:id/testRun", async (req, res) => {
    try {
      const { id } = req.params;
      const { template, sampleJdText } = req.body as { template: string; sampleJdText?: string };
      if (id !== "parse") {
        return res.status(400).json({ error: "Test Run currently only supports the 'parse' prompt — other prompts need a full job/career-journey context to run meaningfully." });
      }
      const jdText = sampleJdText || "Senior Software Engineer at a Series B fintech startup. Requires 5+ years of backend experience, strong Python skills, and a Bachelor's degree in Computer Science. Remote-friendly within the US.";
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}\n${template}\n\nCompany: Sample Co\nRole: Sample Role\n\nJob Description:\n${jdText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              company: { type: Type.STRING }, roleTitle: { type: Type.STRING }, reportingLine: { type: Type.STRING },
              teamScope: { type: Type.STRING }, mustHaves: { type: Type.ARRAY, items: { type: Type.STRING } },
              niceToHaves: { type: Type.ARRAY, items: { type: Type.STRING } }, strategicSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
              industryDomain: { type: Type.ARRAY, items: { type: Type.STRING } }, stageSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
              topCriticalSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              hardGates: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { category: { type: Type.STRING }, requirement: { type: Type.STRING } } } },
            },
          },
        },
      });
      res.json({ output: JSON.parse(response.text!) });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/parse", async (req, res) => {
    try {
      const { jdText, company, roleTitle } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('parse')}

Company: ${company || ''}
Role: ${roleTitle || ''}

Job Description:
${jdText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              company: { type: Type.STRING },
              roleTitle: { type: Type.STRING },
              reportingLine: { type: Type.STRING },
              teamScope: { type: Type.STRING },
              mustHaves: { type: Type.ARRAY, items: { type: Type.STRING } },
              niceToHaves: { type: Type.ARRAY, items: { type: Type.STRING } },
              strategicSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
              industryDomain: { type: Type.ARRAY, items: { type: Type.STRING } },
              stageSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
              topCriticalSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              hardGates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    requirement: { type: Type.STRING }
                  }
                }
              }
            },
            required: ["company", "roleTitle", "reportingLine", "teamScope", "mustHaves", "niceToHaves", "strategicSignals", "industryDomain", "stageSignals", "topCriticalSkills", "hardGates"]
          }
        }
      });
      await trackUsage(req, "parse", "gemini-3.1-pro-preview", response.usageMetadata);
      res.json({ ...JSON.parse(response.text!), jdSegments: segmentJdText(jdText) });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Phase 3 pilot migration onto the provider-agnostic abstraction
  // (server/ai/*) — the "simple/flat" pilot. See payment-system-plan.md.
  app.post("/api/ai/keywords", async (req, res) => {
    try {
      const { parse, careerJourney, jdSegments } = req.body;
      const client = await getAIClientForRequest(req, "gemini-3.5-flash-lite");
      const { data, usage, model } = await client.generateStructured({
        systemPrompt: `${KNOWLEDGE_PREAMBLE}${getActivePrompt('keywords')}`,
        prompt: `Job Parse:
${JSON.stringify(parse, null, 2)}

JD Segments (cite these ids in jdRefs):
${JSON.stringify(jdSegments || [], null, 2)}

Candidate Career Journey Context (cite real ids from here in evidenceRefs):
${JSON.stringify(careerJourney || {}, null, 2)}
`,
        schema: KeywordsResponseSchema,
      });
      await trackUsage(req, "keywords", model, usage, client.provider);
      res.json(data);
    } catch (e: any) {
      handleAiRouteError(e, res);
    }
  });

  app.post("/api/ai/clarifyQuestions", async (req, res) => {
    try {
      const { parse, careerJourney, keywords } = req.body;
      
      const nonEvidenced = (keywords || []).filter((kw: any) => 
        kw.evidenceStatus === 'PARTIAL' || kw.evidenceStatus === 'MISSING / POSSIBLE'
      ).slice(0, 5); 
      
      if (nonEvidenced.length === 0) {
        return res.json([]);
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('clarifyQuestions')}

List of Gap Keywords and their ATS status:
${JSON.stringify(nonEvidenced, null, 2)}

Candidate Master Career Journey Roles:
${JSON.stringify((careerJourney?.roles || []).map((r: any) => ({ id: r.id, organization: r.organization, title: r.title })), null, 2)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                keywordId: { type: Type.STRING },
                keywordPhrase: { type: Type.STRING },
                questionText: { type: Type.STRING },
                suggestedAction: { type: Type.STRING },
                targetRoleId: { type: Type.STRING },
                proposedAdditionType: { type: Type.STRING, description: "'Add new deliverable' | 'Add new achievement' | 'Add new skill'" }
              },
              required: ["id", "keywordId", "keywordPhrase", "questionText", "suggestedAction", "targetRoleId", "proposedAdditionType"]
            }
          }
        }
      });

      await trackUsage(req, "clarifyQuestions", "gemini-3.5-flash-lite", response.usageMetadata);
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Phase 3 pilot migration onto the provider-agnostic abstraction — the
  // "nested/complex" pilot, paired with keywords' "simple" case above.
  app.post("/api/ai/fitScore", async (req, res) => {
    try {
      const { parse, careerJourney, contextEntries, gateClarifications, jdSegments } = req.body;
      const client = await getAIClientForRequest(req, "gemini-3.5-flash-lite");
      const { data, usage, model } = await client.generateStructured({
        systemPrompt: `${KNOWLEDGE_PREAMBLE}${getActivePrompt('fitScore')}`,
        prompt: `Job Parse:
${JSON.stringify(parse)}
JD Segments (cite ids from here in jdRefs when a gap or lead-with point traces to specific JD text):
${JSON.stringify(jdSegments || [])}
Career Journey (cite real ids from here in evidenceRefs when a lead-with point traces to a specific deliverable/achievement/skill):
${JSON.stringify(careerJourney)}
Extra Context Entries:
${JSON.stringify(contextEntries)}
Candidate Custom Gate & Fit Clarifications (if any, where they explain and prove how they meet uncertain/failing requirements):
${JSON.stringify(gateClarifications || {})}

Generate an objective fit analysis. If the candidate has provided convincing explanations and objective proofs, factor them into upgrading the relevant dimension ratings ('Strong' | 'Moderate') and adjust the rationale and overallVerdict accordingly. For each leadWith/gaps entry, cite real evidenceRefs/jdRefs ids where applicable — leave them empty rather than inventing an id.`,
        schema: FitAnalysisSchema,
      });
      await trackUsage(req, "fitScore", model, usage, client.provider);
      res.json(data);
    } catch (e: any) {
      handleAiRouteError(e, res);
    }
  });

  app.post("/api/ai/auditGates", async (req, res) => {
    try {
      const { parse, careerJourney, gateClarifications, jdSegments } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('auditGates')}

Job Parse (containing requirements & hard gates):
${JSON.stringify(parse, null, 2)}

JD Segments (cite ids from here in jdRefs where a gate's requirement text traces to specific JD text):
${JSON.stringify(jdSegments || [], null, 2)}

Candidate 'Career Journey' History (roles, initiatives, skills, dates, etc. — cite real ids from here in evidenceRefs):
${JSON.stringify(careerJourney || {}, null, 2)}

Active Candidate Clarifications / Proofs (if any, keyed by the gate category or requirement):
${JSON.stringify(gateClarifications || {}, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overallVerdict: { type: Type.STRING, description: "'CLEAR TO APPLY' | 'VERIFY FIRST' | 'LIKELY AUTO-REJECT'" },
              gates: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    requirement: { type: Type.STRING },
                    verdict: { type: Type.STRING, description: "'CLEAR' | 'FAIL' | 'UNCERTAIN'" },
                    reason: { type: Type.STRING },
                    suggestedAction: { type: Type.STRING },
                    evidenceRefs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, id: { type: Type.STRING } }, required: ["type", "id"] } },
                    jdRefs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { segmentId: { type: Type.STRING } }, required: ["segmentId"] } }
                  },
                  required: ["category", "requirement", "verdict", "reason", "suggestedAction"]
                }
              }
            },
            required: ["overallVerdict", "gates"]
          }
        }
      });
      await trackUsage(req, "auditGates", "gemini-3.5-flash-lite", response.usageMetadata);
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  function stripHtml(html: string): string {
    return html
      // Greenhouse/Lever content fields arrive HTML-entity-escaped (e.g. "&lt;div&gt;"), so decode first.
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<\/(p|div|li|br|h[1-6])>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  app.post("/api/sources/fetchCompanyJobs", async (req, res) => {
    const { boardToken } = req.body as { boardToken: string };
    if (!boardToken || typeof boardToken !== "string") {
      return res.status(400).json({ error: "boardToken is required" });
    }
    const token = boardToken.trim();

    try {
      const ghRes = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`);
      if (ghRes.ok) {
        const data: any = await ghRes.json();
        const jobs = (data.jobs || []).map((j: any) => ({
          source: "greenhouse",
          externalId: String(j.id),
          companyName: j.company_name || token,
          title: j.title,
          location: j.location?.name,
          absoluteUrl: j.absolute_url,
          jdText: stripHtml(j.content || ""),
        }));
        return res.json({ source: "greenhouse", jobs });
      }
    } catch (e) {
      console.error(`Greenhouse lookup failed for "${token}"`, e);
    }

    try {
      const leverRes = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);
      if (leverRes.ok) {
        const data: any = await leverRes.json();
        if (Array.isArray(data)) {
          const jobs = data.map((j: any) => ({
            source: "lever",
            externalId: String(j.id),
            companyName: token,
            title: j.text,
            location: j.categories?.location,
            absoluteUrl: j.hostedUrl,
            jdText: stripHtml(
              [j.descriptionPlain || j.description, ...(j.lists || []).map((l: any) => `${l.text}\n${l.content || ""}`)]
                .filter(Boolean)
                .join("\n\n")
            ),
          }));
          return res.json({ source: "lever", jobs });
        }
      }
    } catch (e) {
      console.error(`Lever lookup failed for "${token}"`, e);
    }

    return res.status(404).json({ error: `No public job board found for "${token}" on Greenhouse or Lever. Check the token from the company's careers page URL.` });
  });

  // Below this length the stripped text is almost certainly a JS-rendered shell
  // page with no server-rendered JD content, not a real (if short) posting.
  const MIN_EXTRACTED_JD_LENGTH = 200;

  app.post("/api/sources/fetchJobFromUrl", async (req, res) => {
    const { url } = req.body as { url: string };
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url is required" });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: "That doesn't look like a valid URL." });
    }

    // Higher-fidelity structured extraction for known ATS boards, reusing the
    // same public APIs as fetchCompanyJobs above instead of scraping HTML.
    const greenhouseMatch = parsed.hostname.includes("greenhouse.io") ? parsed.pathname.match(/\/([^/]+)\/jobs\/(\d+)/) : null;
    const leverMatch = parsed.hostname.includes("lever.co") ? parsed.pathname.match(/^\/([^/]+)\/([a-f0-9-]+)/) : null;

    try {
      if (greenhouseMatch) {
        const [, token, jobId] = greenhouseMatch;
        const ghRes = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${jobId}?content=true`);
        if (ghRes.ok) {
          const j: any = await ghRes.json();
          return res.json({ jdText: stripHtml(j.content || ""), companyName: j.company_name || token, roleTitle: j.title });
        }
      } else if (leverMatch) {
        const [, token, postingId] = leverMatch;
        const leverRes = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}/${postingId}?mode=json`);
        if (leverRes.ok) {
          const j: any = await leverRes.json();
          const jdText = stripHtml([j.descriptionPlain || j.description, ...(j.lists || []).map((l: any) => `${l.text}\n${l.content || ""}`)].filter(Boolean).join("\n\n"));
          return res.json({ jdText, companyName: token, roleTitle: j.text });
        }
      }
    } catch (e) {
      console.error(`Structured fetch failed for "${url}", falling back to generic scrape`, e);
    }

    try {
      const pageRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CareerJourneyBot/1.0)" } });
      if (!pageRes.ok) {
        return res.status(502).json({ error: `The site returned ${pageRes.status} — try pasting the job description instead.` });
      }
      const html = await pageRes.text();
      const jdText = stripHtml(html);
      if (jdText.length < MIN_EXTRACTED_JD_LENGTH) {
        return res.status(422).json({ error: "could_not_extract" });
      }
      return res.json({ jdText });
    } catch (e: any) {
      console.error(`Generic fetch failed for "${url}"`, e);
      return res.status(502).json({ error: "Couldn't reach that URL — try pasting the job description instead." });
    }
  });

  app.post("/api/ai/liteScan", requireAnyPaidPlan, async (req, res) => {
    try {
      const { jdText, careerJourney, archiveLearnings } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('liteScan')}

Job Description:
${jdText}

Candidate Career Journey:
${JSON.stringify(careerJourney || {}, null, 2)}
${archiveLearnings ? `\nLearnings from past application outcomes (weigh these — if this posting resembles a pattern that's previously led to rejection or a bad fit, reflect that in matchScore/verdict/topGaps rather than scoring on keyword overlap alone):\n${archiveLearnings}\n` : ''}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              parse: {
                type: Type.OBJECT,
                properties: {
                  company: { type: Type.STRING },
                  roleTitle: { type: Type.STRING },
                  reportingLine: { type: Type.STRING },
                  teamScope: { type: Type.STRING },
                  mustHaves: { type: Type.ARRAY, items: { type: Type.STRING } },
                  niceToHaves: { type: Type.ARRAY, items: { type: Type.STRING } },
                  strategicSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
                  industryDomain: { type: Type.ARRAY, items: { type: Type.STRING } },
                  stageSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
                  topCriticalSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  hardGates: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        category: { type: Type.STRING },
                        requirement: { type: Type.STRING }
                      }
                    }
                  }
                },
                required: ["company", "roleTitle", "reportingLine", "teamScope", "mustHaves", "niceToHaves", "strategicSignals", "industryDomain", "stageSignals", "topCriticalSkills", "hardGates"]
              },
              matchScore: { type: Type.NUMBER },
              verdict: { type: Type.STRING, description: "'PASS' | 'BORDERLINE' | 'SKIP'" },
              hardGateRisk: { type: Type.STRING, description: "'CLEAR TO APPLY' | 'VERIFY FIRST' | 'LIKELY AUTO-REJECT'" },
              topGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
              leadWith: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["parse", "matchScore", "verdict", "hardGateRisk", "topGaps", "leadWith"]
          }
        }
      });
      await trackUsage(req, "liteScan", "gemini-3.5-flash-lite", response.usageMetadata);
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Delta-based, not full-object-regeneration: asking Gemini to return an entire
  // updated CareerJourney under a bare `{ type: Type.OBJECT }` reliably comes back
  // `{}` (confirmed while building the Phase 4/5 builder endpoints - Gemini treats an
  // OBJECT schema with no declared `properties` as "no properties allowed"). Every
  // field below is a flat, fully-typed leaf, so there's nowhere for that trap to hide.
  // The server applies the delta to the existing Career Journey itself, the same way
  // the Phase 5 interview-refinement endpoint does.
  const PATCH_DELTA_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      reason: { type: Type.STRING },
      newAchievements: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            targetRoleId: { type: Type.STRING },
          },
          required: ["title"],
        },
      },
      newSkills: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            proficiency: { type: Type.STRING },
            years_experience: { type: Type.NUMBER },
            last_used: { type: Type.STRING },
          },
          required: ["name"],
        },
      },
      newDeliverables: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            targetRoleId: { type: Type.STRING },
            targetInitiativeId: { type: Type.STRING },
            description: { type: Type.STRING },
            impact: { type: Type.STRING },
            capability_alignment: { type: Type.ARRAY, items: { type: Type.STRING } },
            skill_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["targetRoleId", "description"],
        },
      },
      updatedDeliverables: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            deliverableId: { type: Type.STRING },
            description: { type: Type.STRING },
            impact: { type: Type.STRING },
          },
          required: ["deliverableId"],
        },
      },
      updatedAchievements: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            achievementId: { type: Type.STRING },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ["achievementId"],
        },
      },
      updatedSkills: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            skillId: { type: Type.STRING },
            proficiency: { type: Type.STRING },
            years_experience: { type: Type.NUMBER },
            last_used: { type: Type.STRING },
          },
          required: ["skillId"],
        },
      },
    },
    required: ["reason"],
  };

  // Applies a PATCH_DELTA_SCHEMA-shaped delta to a deep copy of careerJourney,
  // assigning real IDs as it goes. Returns the updated journey plus human-readable
  // summary strings (PatchReview.tsx just renders these as bullet lists).
  function applyCareerJourneyDelta(careerJourney: any, delta: any, nextIds: Record<string, string>) {
    const cj = JSON.parse(JSON.stringify(careerJourney || {}));
    if (!Array.isArray(cj.achievements)) cj.achievements = [];
    if (!Array.isArray(cj.skills_index)) cj.skills_index = [];
    if (!Array.isArray(cj.roles)) cj.roles = [];

    // Local counters so multiple new items of the same type in one call get
    // distinct, incrementing IDs starting from the precomputed next-available value.
    const counters: Record<string, number> = {};
    const nextId = (prefix: string) => {
      if (!(prefix in counters)) {
        const base = nextIds[prefix] || `${prefix}-001`;
        counters[prefix] = parseInt(base.split("-")[1], 10) || 1;
      } else {
        counters[prefix]++;
      }
      return `${prefix}-${String(counters[prefix]).padStart(3, "0")}`;
    };

    const summary = {
      newSkills: [] as string[],
      updatedSkills: [] as string[],
      newDeliverables: [] as string[],
      updatedDeliverables: [] as string[],
      newAchievements: [] as string[],
      updatedAchievements: [] as string[],
    };

    for (const a of delta.newAchievements || []) {
      const id = nextId("ACH");
      cj.achievements.unshift({
        id,
        title: a.title,
        description: a.description || "",
        category: a.category || "",
        role_ids: a.targetRoleId ? [a.targetRoleId] : [],
      });
      summary.newAchievements.push(a.title);
    }

    for (const s of delta.newSkills || []) {
      const id = nextId("SK");
      cj.skills_index.push({ id, name: s.name, category: s.category || "", proficiency: s.proficiency || "", years_experience: s.years_experience, last_used: s.last_used || "" });
      summary.newSkills.push(s.name);
    }

    for (const d of delta.newDeliverables || []) {
      const role = cj.roles.find((r: any) => r.id === d.targetRoleId);
      if (!role) continue;
      if (!Array.isArray(role.initiatives)) role.initiatives = [];
      let initiative = d.targetInitiativeId ? role.initiatives.find((i: any) => i.id === d.targetInitiativeId) : role.initiatives[0];
      if (!initiative) {
        initiative = { id: nextId("INIT"), name: "General", description: "", deliverables: [] };
        role.initiatives.push(initiative);
      }
      if (!Array.isArray(initiative.deliverables)) initiative.deliverables = [];
      const id = nextId("DEL");
      initiative.deliverables.push({
        id,
        description: d.description,
        impact: d.impact || "",
        capability_alignment: d.capability_alignment || [],
        skill_ids: d.skill_ids || [],
      });
      summary.newDeliverables.push(d.description);
    }

    for (const d of delta.updatedDeliverables || []) {
      for (const role of cj.roles) {
        for (const initiative of role.initiatives || []) {
          const target = (initiative.deliverables || []).find((x: any) => x.id === d.deliverableId);
          if (target) {
            if (d.description) target.description = d.description;
            if (d.impact) target.impact = d.impact;
            summary.updatedDeliverables.push(target.description);
          }
        }
      }
    }

    for (const a of delta.updatedAchievements || []) {
      const target = cj.achievements.find((x: any) => x.id === a.achievementId);
      if (target) {
        if (a.title) target.title = a.title;
        if (a.description) target.description = a.description;
        summary.updatedAchievements.push(target.title);
      }
    }

    for (const s of delta.updatedSkills || []) {
      const target = cj.skills_index.find((x: any) => x.id === s.skillId);
      if (target) {
        if (s.proficiency) target.proficiency = s.proficiency;
        if (s.years_experience !== undefined) target.years_experience = s.years_experience;
        if (s.last_used) target.last_used = s.last_used;
        summary.updatedSkills.push(target.name);
      }
    }

    return { updatedCareerJourney: cj, summary };
  }

  app.post("/api/ai/patchJourney", requireFeature("tailored_resume"), async (req, res) => {
    try {
      const { careerJourney, contextEntries } = req.body;
      const nextIds = computeNextIds(careerJourney);
      const nextVersion = computeNextVersion(careerJourney?.meta?.version);
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview", // Need a smarter model for JSON merging
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('patchJourney')}

Existing Career Journey:
${JSON.stringify(careerJourney, null, 2)}

New Context Entries (key is Keyword ID, value is Context Object):
${JSON.stringify(contextEntries, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: PATCH_DELTA_SCHEMA,
        },
      });
      const delta = JSON.parse(response.text!);
      await trackUsage(req, "patchJourney", "gemini-3.1-pro-preview", response.usageMetadata);
      const { updatedCareerJourney, summary: deltaSummary } = applyCareerJourneyDelta(careerJourney, delta, nextIds);

      updatedCareerJourney.meta = updatedCareerJourney.meta || {};
      updatedCareerJourney.meta.version = nextVersion;
      updatedCareerJourney.meta.last_updated = new Date().toISOString().split("T")[0];
      const changesKey = versionChangesKey(nextVersion);
      updatedCareerJourney.meta[changesKey] = [delta.reason].filter(Boolean);

      const summary = {
        id: generateId("PATCH"),
        targetVersion: nextVersion,
        reason: delta.reason || "",
        ...deltaSummary,
        linkUpdates: [] as string[],
        metaUpdate: { version: nextVersion, changes: delta.reason || "" },
        approvalStatus: "Pending",
      };

      res.json({ updatedCareerJourney, summary });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/resumeStrategy", requireFeature("tailored_resume"), async (req, res) => {
    try {
      const { parse, careerJourney, contextEntries, remediation } = req.body as { parse: any; careerJourney: any; contextEntries: any; remediation?: string[] };
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('resumeStrategy')}
${remediation && remediation.length > 0 ? `\nThis is a REBUILD after a failed Stage 7 keyword gate. Work these missing keywords truthfully into keywordPlacement, skillRows, and/or selectedOutcomes wherever the Career Journey honestly supports them - never fabricate evidence for one that has none: ${remediation.join(', ')}\n` : ''}
Generate a Resume Strategy for this job posting based on candidate's context.

Job Parse:
${JSON.stringify(parse)}
Career Journey:
${JSON.stringify(careerJourney)}
Extra Context Entries:
${JSON.stringify(contextEntries)}

Output a detailed strategy.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              outputBasename: { type: Type.STRING },
              headerTagline: { type: Type.STRING },
              executiveSummary: { type: Type.STRING },
              selectedOutcomes: { type: Type.ARRAY, items: { type: Type.STRING } },
              roleStrategies: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    company: { type: Type.STRING },
                    titleReframe: { type: Type.STRING },
                    note: { type: Type.STRING }
                  },
                  required: ["company", "titleReframe", "note"]
                }
              },
              skillRows: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    content: { type: Type.STRING }
                  },
                  required: ["label", "content"]
                }
              },
              keywordPlacement: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["category", "keywords"]
                }
              },
              cautionClaims: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["outputBasename", "headerTagline", "executiveSummary", "selectedOutcomes", "roleStrategies", "skillRows", "keywordPlacement", "cautionClaims"]
          }
        }
      });
      await trackUsage(req, "resumeStrategy", "gemini-3.1-pro-preview", response.usageMetadata);
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // /api/ai/keywordCoverage retired (Phase 3) — the Rating stage's finalized
  // keyword evidence table now does this check once, before resume generation,
  // instead of re-scoring the drafted strategy after the fact.

  app.post("/api/ai/generateResume", requireFeature("tailored_resume"), async (req, res) => {
    try {
      const { careerJourney, strategy, parse, remediation } = req.body as { careerJourney: any; strategy: any; parse: any; remediation?: string[] };
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('generateResume')}
${remediation && remediation.length > 0 ? `\nThis is a REBUILD after a failed keyword gate. These keywords are missing and must be truthfully worked into the summary, skills, or a role bullet if any honest evidence supports them (do not fabricate experience for a keyword that has none): ${remediation.join(', ')}\n` : ''}

Career Journey:
${JSON.stringify(careerJourney, null, 2)}

Resume Strategy:
${JSON.stringify(strategy, null, 2)}

Job Parse:
${JSON.stringify(parse, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 1024 },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              contactInfo: { type: Type.STRING },
              summary: { type: Type.STRING },
              skills: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { category: { type: Type.STRING }, terms: { type: Type.STRING } },
                  required: ["category", "terms"]
                }
              },
              experience: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    company: { type: Type.STRING },
                    companyDescriptor: { type: Type.STRING, description: "The canonical resume_company_descriptor for this role's employer, verbatim from the Career Journey, if one exists." },
                    companyUrl: { type: Type.STRING, description: "The canonical resume_company_url for this role's employer, verbatim from the Career Journey, if one exists." },
                    title: { type: Type.STRING },
                    dates: { type: Type.STRING },
                    location: { type: Type.STRING },
                    bullets: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          text: { type: Type.STRING },
                          evidenceRefs: {
                            type: Type.ARRAY,
                            items: {
                              type: Type.OBJECT,
                              properties: { type: { type: Type.STRING }, id: { type: Type.STRING } },
                              required: ["type", "id"]
                            }
                          }
                        },
                        required: ["text"]
                      }
                    }
                  },
                  required: ["company", "title", "dates", "location", "bullets"]
                }
              },
              education: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    institution: { type: Type.STRING },
                    degree: { type: Type.STRING },
                    graduationDate: { type: Type.STRING }
                  },
                  required: ["institution", "degree", "graduationDate"]
                }
              }
            },
            required: ["name", "contactInfo", "summary", "skills", "experience", "education"]
          }
        }
      });
      await trackUsage(req, "generateResume", "gemini-3.7-flash", response.usageMetadata);
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/coverLetter", requireFeature("cover_letter"), async (req, res) => {
    try {
      const { parse, careerJourney, fitAnalysis, resumeStrategy } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('coverLetter')}

Job Parse:
${JSON.stringify(parse, null, 2)}

Career Journey:
${JSON.stringify(careerJourney, null, 2)}

Fit Analysis (reuse, do not re-derive):
${JSON.stringify(fitAnalysis || {}, null, 2)}

Resume Strategy (reuse for positioning consistency):
${JSON.stringify(resumeStrategy || {}, null, 2)}

Return the final cover letter body text only (no subject line, no "Dear Hiring Manager" placeholder unless no name is available - use a natural team salutation like "Dear [Company] team," when no specific name is known), plus its word count.`,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 1024 },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              content: { type: Type.STRING },
              wordCount: { type: Type.NUMBER }
            },
            required: ["content", "wordCount"]
          }
        }
      });
      const result = JSON.parse(response.text!);
      result.approvalStatus = "Draft";
      await trackUsage(req, "coverLetter", "gemini-3.7-flash", response.usageMetadata);
      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/applicationAssistant", async (req, res) => {
    try {
      const { transcript, parse, careerJourney, resume, fitAnalysis } = req.body as {
        transcript: { role: "user" | "assistant"; content: string }[];
        parse: any; careerJourney: any; resume: any; fitAnalysis: any;
      };
      const history = transcript.slice(0, -1).map((t) => `${t.role === "user" ? "Candidate" : "Assistant"}: ${t.content}`).join("\n");
      const latest = transcript[transcript.length - 1]?.content || "";
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('applicationAssistant')}

Job Parse:
${JSON.stringify(parse, null, 2)}

Tailored Resume (already generated for this job):
${JSON.stringify(resume || {}, null, 2)}

Fit Analysis:
${JSON.stringify(fitAnalysis || {}, null, 2)}

Career Journey:
${JSON.stringify(careerJourney, null, 2)}

Conversation so far:
${history}

Candidate's latest message: "${latest}"`,
      });
      await trackUsage(req, "applicationAssistant", "gemini-3.7-flash", response.usageMetadata);
      res.json({ reply: response.text });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/generateFormAnswers", async (req, res) => {
    try {
      const { fields, parse, careerJourney, resume } = req.body as { fields: { id: string; label: string; fieldType: string; options?: string[] }[]; parse: any; careerJourney: any; resume: any };
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('generateFormAnswers')}

Fields:
${JSON.stringify(fields, null, 2)}

Job Parse:
${JSON.stringify(parse, null, 2)}

Tailored Resume:
${JSON.stringify(resume || {}, null, 2)}

Career Journey:
${JSON.stringify(careerJourney, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 1024 },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answers: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { fieldId: { type: Type.STRING }, answer: { type: Type.STRING } },
                  required: ["fieldId", "answer"]
                }
              }
            },
            required: ["answers"]
          }
        }
      });
      const { answers } = JSON.parse(response.text!);
      const byId: Record<string, string> = {};
      for (const a of answers) byId[a.fieldId] = a.answer;
      await trackUsage(req, "generateFormAnswers", "gemini-3.7-flash", response.usageMetadata);
      res.json({ answers: byId });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/interviewPrep", requireFeature("interview_prep"), async (req, res) => {
    try {
      const { round, parse, fitAnalysis, careerJourney } = req.body as { round: any; parse: any; fitAnalysis: any; careerJourney: any };
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('interviewPrep')}

Interview Round:
${JSON.stringify(round, null, 2)}

Job Parse:
${JSON.stringify(parse, null, 2)}

Fit Analysis (known gaps and strengths for this role):
${JSON.stringify(fitAnalysis || {}, null, 2)}

Career Journey:
${JSON.stringify(careerJourney, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              likelyQuestions: {
                type: Type.ARRAY,
                items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, why: { type: Type.STRING } }, required: ["question", "why"] }
              },
              meetingGoal: { type: Type.STRING },
              talkingPoints: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["likelyQuestions", "meetingGoal", "talkingPoints"]
          }
        }
      });
      const result = JSON.parse(response.text!);
      result.generatedAt = new Date().toISOString();
      await trackUsage(req, "interviewPrep", "gemini-3.7-flash", response.usageMetadata);
      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/interviewPrepChat", requireFeature("interview_prep"), async (req, res) => {
    try {
      const { transcript, round, parse, careerJourney } = req.body as {
        transcript: { role: "user" | "assistant"; content: string }[];
        round: any; parse: any; careerJourney: any;
      };
      const history = transcript.slice(0, -1).map((t) => `${t.role === "user" ? "Candidate" : "Coach"}: ${t.content}`).join("\n");
      const latest = transcript[transcript.length - 1]?.content || "";
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('interviewPrepChat')}

Interview Round:
${JSON.stringify(round, null, 2)}
Job Parse:
${JSON.stringify(parse, null, 2)}
Career Journey:
${JSON.stringify(careerJourney, null, 2)}

Conversation so far:
${history}

Candidate's latest message: "${latest}"`,
      });
      await trackUsage(req, "interviewPrepChat", "gemini-3.7-flash", response.usageMetadata);
      res.json({ reply: response.text });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/offerGuidance", requireFeature("offer_comparison"), async (req, res) => {
    try {
      const { offer, parse, careerJourney } = req.body as { offer: any; parse: any; careerJourney: any };
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('offerGuidance')}

Offer Details:
${JSON.stringify(offer, null, 2)}
Job Parse:
${JSON.stringify(parse, null, 2)}
Career Journey (for leverage/market positioning context):
${JSON.stringify(careerJourney, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 1024 },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              askAbout: { type: Type.ARRAY, items: { type: Type.STRING } },
              avoidAsking: { type: Type.ARRAY, items: { type: Type.STRING } },
              negotiationAngles: { type: Type.ARRAY, items: { type: Type.STRING } },
              redFlags: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["askAbout", "avoidAsking", "negotiationAngles", "redFlags"]
          }
        }
      });
      await trackUsage(req, "offerGuidance", "gemini-3.7-flash", response.usageMetadata);
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/compareOffers", requireFeature("offer_comparison"), async (req, res) => {
    try {
      const { offers, careerJourney } = req.body as { offers: { jobId: string; companyName: string; roleTitle: string; offer: any }[]; careerJourney: any };
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('compareOffers')}

Offers:
${JSON.stringify(offers, null, 2)}
Career Journey (positioning/preferences context):
${JSON.stringify(careerJourney?.person?.positioning || {}, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 1024 },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              perOffer: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    jobId: { type: Type.STRING },
                    pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                    cons: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["jobId", "pros", "cons"]
                }
              },
              recommendation: { type: Type.STRING }
            },
            required: ["perOffer", "recommendation"]
          }
        }
      });
      await trackUsage(req, "compareOffers", "gemini-3.7-flash", response.usageMetadata);
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Gemini's structured-output mode treats a bare `{ type: Type.OBJECT }` (no
  // `properties`) as "an object with no properties allowed" and returns `{}` —
  // learned by actually testing this endpoint, not by inspection. The draft needs a
  // concrete (if partial) shape so the model has somewhere to put what it extracts.
  const DRAFT_CAREER_JOURNEY_SCHEMA = {
    type: Type.OBJECT,
    properties: {
      person: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          location: { type: Type.STRING },
          phone: { type: Type.STRING },
          email: { type: Type.STRING },
          linkedin: { type: Type.STRING },
        },
      },
      roles: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            organization: { type: Type.STRING },
            title: { type: Type.STRING },
            start_date: { type: Type.STRING },
            end_date: { type: Type.STRING },
            location: { type: Type.STRING },
            description: { type: Type.STRING },
            initiatives: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  deliverables: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        description: { type: Type.STRING },
                        impact: { type: Type.STRING },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      achievements: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
            role_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
      skills_index: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            name: { type: Type.STRING },
            category: { type: Type.STRING },
            proficiency: { type: Type.STRING },
            last_used: { type: Type.STRING },
          },
        },
      },
      education: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            institution: { type: Type.STRING },
            program: { type: Type.STRING },
            degree_type: { type: Type.STRING },
            start: { type: Type.STRING },
            end: { type: Type.STRING },
          },
        },
      },
    },
  };

  app.post("/api/ai/buildJourneyFromResume", requireFeature("strengthen_journey"), async (req, res) => {
    try {
      const { resumeText } = req.body as { resumeText: string };
      const nextIds = computeNextIds({});
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${CAREER_JOURNEY_BUILDER_KNOWLEDGE}

---

${getActivePrompt('buildJourneyFromResume')}

Start ID numbering fresh from these values: ${JSON.stringify(nextIds)}.

Resume text:
${resumeText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              draftCareerJourney: DRAFT_CAREER_JOURNEY_SCHEMA,
              notes: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["draftCareerJourney", "notes"],
          },
        },
      });
      await trackUsage(req, "buildJourneyFromResume", "gemini-3.1-pro-preview", response.usageMetadata);
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/buildJourneyChat", requireFeature("strengthen_journey"), async (req, res) => {
    try {
      const { transcript, currentDraft } = req.body as {
        transcript: { role: "user" | "assistant"; content: string }[];
        currentDraft: any;
      };
      const nextIds = computeNextIds(currentDraft || {});
      const transcriptText = (transcript || [])
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: `${CAREER_JOURNEY_BUILDER_KNOWLEDGE}

---

${getActivePrompt('buildJourneyChat')}

Current draft so far (merge each new answer into this, don't restart it): ${JSON.stringify(currentDraft || {})}

New IDs for anything you add this turn start from: ${JSON.stringify(nextIds)}

Conversation so far:
${transcriptText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assistantMessage: { type: Type.STRING },
              updatedDraft: DRAFT_CAREER_JOURNEY_SCHEMA,
              readyForReview: { type: Type.BOOLEAN },
            },
            required: ["assistantMessage", "updatedDraft", "readyForReview"],
          },
        },
      });
      await trackUsage(req, "buildJourneyChat", "gemini-3.7-flash", response.usageMetadata);
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/refineFromInterviewAnswer", requireFeature("strengthen_journey"), async (req, res) => {
    try {
      const { entityType, current, question, answer } = req.body as {
        entityType: "achievement" | "skill" | "role";
        current: Record<string, any>;
        question: string;
        answer: string;
      };
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${CAREER_JOURNEY_BUILDER_KNOWLEDGE}

---

${getActivePromptFilled('refineFromInterviewAnswer', { entityType })}

Current ${entityType}: ${JSON.stringify(current)}

Question asked: ${question}

User's answer: ${answer}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              last_used: { type: Type.STRING },
              proficiency: { type: Type.STRING },
              years_experience: { type: Type.NUMBER },
              summary: { type: Type.STRING },
            },
            required: ["summary"],
          },
        },
      });
      await trackUsage(req, "refineFromInterviewAnswer", "gemini-3.1-pro-preview", response.usageMetadata);
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/export/resume.docx", async (req, res) => {
    try {
      const { resume, strategy, companyName, roleTitle } = req.body;
      const buffer = await buildResumeDocx(resume, strategy);
      const roleSlug = String(roleTitle || "Role").replace(/[^a-zA-Z0-9]+/g, "");
      const companySlug = String(companyName || "Company").replace(/[^a-zA-Z0-9]+/g, "");
      const nameSlug = String(resume?.name || "Resume").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]+/g, "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${nameSlug}_Resume_${companySlug}_${roleSlug}.docx"`);
      res.send(buffer);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/export/coverLetter.docx", async (req, res) => {
    try {
      const { coverLetter, companyName, roleTitle, candidateName, candidateContactInfo } = req.body;
      const buffer = await buildCoverLetterDocx(coverLetter, { name: candidateName, contactInfo: candidateContactInfo });
      const roleSlug = String(roleTitle || "Role").replace(/[^a-zA-Z0-9]+/g, "");
      const companySlug = String(companyName || "Company").replace(/[^a-zA-Z0-9]+/g, "");
      const nameSlug = String(candidateName || "CoverLetter").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]+/g, "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${nameSlug}_CoverLetter_${companySlug}_${roleSlug}.docx"`);
      res.send(buffer);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
