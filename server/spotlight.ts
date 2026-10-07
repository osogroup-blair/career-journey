import express from "express";
import type { App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAdminApp } from "./firebaseAdmin";
import { getFeatureFlags } from "./featureFlags";
import { getBillingState, isPaidPlan } from "./billing";
import {
  buildSpotlightSnapshot,
  normalizeSpotlightSettings,
  suggestSpotlightSlug,
  validateSpotlightSlug,
} from "../src/lib/spotlightSnapshot";
import type { SpotlightSettings, SpotlightSnapshot } from "../src/types/spotlight";
import { renderSpotlightImage, renderSpotlightPdf } from "./pdfRenderer";

/**
 * Career Spotlight publishing (career-spotlight-plan.md, Phase 2).
 *
 * Data:
 * - users/{uid}/spotlight/settings — { settings, publishedSlug, updatedAt }. Server-written only.
 * - spotlights/{slug} — { ownerUid, slug, visibility, snapshot, publishedAt, updatedAt, imageVersion? }.
 *   The public copy. Fully denied to clients in firestore.rules; read and written only here.
 * - users/{uid}/spotlight/ogImage — the link-preview JPEG for the current publish (Phase 3).
 * - users/{uid}/spotlight/stats — { total, days: { "YYYY-MM-DD": n } } view counts. No visitor data.
 *   Both live under the account, so they survive address changes and account deletion removes them.
 *
 * Every owner route takes the uid from the verified token (req.uid), never the body. The
 * snapshot is always built here, from the Career Journey this server reads from Firestore —
 * a client can't publish content it sends, only choose settings. A missing page, an
 * unpublished one and one hidden by the kill switch all get the same 404, so the public
 * routes never reveal whether an address exists.
 */

export const SPOTLIGHTS = "spotlights";
/** Firestore's limit is 1MB per doc; leave room for the wrapper fields. */
const MAX_SNAPSHOT_BYTES = 900_000;

export interface PublishedSpotlight {
  ownerUid: string;
  slug: string;
  visibility: "unlisted" | "public";
  snapshot: SpotlightSnapshot;
  publishedAt: string;
  updatedAt: string;
  /** Set to `updatedAt` once the link-preview image for this publish exists. */
  imageVersion?: string;
}

/** What the owner's editor sees about their published page. */
export interface PublishedSummary {
  slug: string;
  visibility: "unlisted" | "public";
  publishedAt: string;
  updatedAt: string;
  snapshot: SpotlightSnapshot;
}

export class SpotlightError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

const settingsRef = (db: Firestore, uid: string) => db.collection("users").doc(uid).collection("spotlight").doc("settings");
const journeyRef = (db: Firestore, uid: string) => db.collection("users").doc(uid).collection("careerJourney").doc("current");
const pageRef = (db: Firestore, slug: string) => db.collection(SPOTLIGHTS).doc(slug);
const imageRef = (db: Firestore, uid: string) => db.collection("users").doc(uid).collection("spotlight").doc("ogImage");
const statsRef = (db: Firestore, uid: string) => db.collection("users").doc(uid).collection("spotlight").doc("stats");

/** Firestore rejects `undefined` fields; the snapshot and settings use them for "not set". */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const summaryOf = (p: PublishedSpotlight): PublishedSummary => ({
  slug: p.slug,
  visibility: p.visibility,
  publishedAt: p.publishedAt,
  updatedAt: p.updatedAt,
  snapshot: p.snapshot,
});

async function readJourney(db: Firestore, uid: string): Promise<any> {
  const snap = await journeyRef(db, uid).get();
  if (!snap.exists) throw new SpotlightError("Add your Career Journey before publishing a Spotlight.", 409, "no_journey");
  return snap.data();
}

// ---------- owner operations ----------

export async function loadOwnerSpotlight(
  app: App,
  uid: string,
  now: Date = new Date(),
): Promise<{ settings: SpotlightSettings | null; published: PublishedSummary | null; views: ViewSummary }> {
  const db = getFirestore(app);
  const [stored, stats] = await Promise.all([settingsRef(db, uid).get(), statsRef(db, uid).get()]);
  const data = stored.exists ? (stored.data() as any) : null;
  let published: PublishedSummary | null = null;
  if (typeof data?.publishedSlug === "string") {
    const page = await pageRef(db, data.publishedSlug).get();
    if (page.exists && (page.data() as PublishedSpotlight).ownerUid === uid) published = summaryOf(page.data() as PublishedSpotlight);
  }
  return { settings: data?.settings ?? null, published, views: summarizeViews(stats.exists ? stats.data() : null, now) };
}

export async function saveSpotlightSettings(app: App, uid: string, raw: unknown): Promise<SpotlightSettings> {
  const db = getFirestore(app);
  const journeySnap = await journeyRef(db, uid).get();
  const settings = normalizeSpotlightSettings(raw, journeySnap.exists ? journeySnap.data() : {});
  await settingsRef(db, uid).set({ settings: plain(settings), updatedAt: new Date().toISOString() }, { merge: true });
  return settings;
}

export type SlugAvailability = { ok: true; slug: string } | { ok: false; reason: "too_short" | "too_long" | "invalid_characters" | "reserved" | "taken" };

export async function checkSpotlightSlug(app: App, uid: string, raw: unknown): Promise<SlugAvailability> {
  const check = validateSpotlightSlug(raw);
  if (!check.ok) return check;
  const page = await pageRef(getFirestore(app), check.slug).get();
  if (page.exists && (page.data() as PublishedSpotlight).ownerUid !== uid) return { ok: false, reason: "taken" };
  return check;
}

/**
 * Builds the snapshot from the stored Career Journey and publishes it at the settings'
 * slug, in one transaction: claims the address (refusing one another account holds),
 * moves the page if the slug changed, and saves the settings it was built from.
 */
export async function publishSpotlight(
  app: App,
  uid: string,
  rawSettings: unknown,
  opts: { canHideBadge: boolean; now?: Date },
): Promise<PublishedSummary> {
  const db = getFirestore(app);
  const journey = await readJourney(db, uid);
  const settings = normalizeSpotlightSettings(rawSettings, journey);
  if (!opts.canHideBadge) settings.showBadge = true;

  const check = validateSpotlightSlug(settings.slug ?? suggestSpotlightSlug(journey?.person?.name));
  if (check.ok === false) throw new SpotlightError("Choose a page address of 3–40 letters, numbers and single hyphens.", 400, check.reason);
  const slug = check.slug;
  settings.slug = slug;

  const { snapshot } = buildSpotlightSnapshot(journey, settings, opts.now);
  const body = plain(snapshot);
  if (JSON.stringify(body).length > MAX_SNAPSHOT_BYTES)
    throw new SpotlightError("Your page is too large to publish. Hide some roles or sections and try again.", 413, "too_large");

  const now = (opts.now ?? new Date()).toISOString();
  return db.runTransaction(async (tx) => {
    const stored = await tx.get(settingsRef(db, uid));
    const target = await tx.get(pageRef(db, slug));
    const previousSlug: string | null = stored.exists ? ((stored.data() as any).publishedSlug ?? null) : null;
    const previous = previousSlug && previousSlug !== slug ? await tx.get(pageRef(db, previousSlug)) : null;

    const existing = target.exists ? (target.data() as PublishedSpotlight) : null;
    if (existing && existing.ownerUid !== uid) throw new SpotlightError("That address is taken. Choose another.", 409, "taken");

    const page: PublishedSpotlight = {
      ownerUid: uid,
      slug,
      visibility: settings.visibility,
      snapshot: body,
      publishedAt: existing?.publishedAt ?? now,
      updatedAt: now,
    };
    tx.set(pageRef(db, slug), page);
    if (previous?.exists && (previous.data() as PublishedSpotlight).ownerUid === uid) tx.delete(pageRef(db, previousSlug!));
    tx.set(settingsRef(db, uid), { settings: plain(settings), publishedSlug: slug, updatedAt: now });
    return summaryOf(page);
  });
}

export async function unpublishSpotlight(app: App, uid: string): Promise<void> {
  const db = getFirestore(app);
  await db.runTransaction(async (tx) => {
    const stored = await tx.get(settingsRef(db, uid));
    const slug: string | null = stored.exists ? ((stored.data() as any).publishedSlug ?? null) : null;
    const page = slug ? await tx.get(pageRef(db, slug)) : null;
    if (page?.exists && (page.data() as PublishedSpotlight).ownerUid === uid) tx.delete(pageRef(db, slug!));
    if (stored.exists) tx.set(settingsRef(db, uid), { publishedSlug: null, updatedAt: new Date().toISOString() }, { merge: true });
    tx.delete(imageRef(db, uid));
  });
}

/** Account deletion: every page this account owns, found by owner rather than by the settings doc, so none is missed. */
export async function deleteSpotlightsOwnedBy(app: App, uid: string): Promise<void> {
  const db = getFirestore(app);
  const owned = await db.collection(SPOTLIGHTS).where("ownerUid", "==", uid).get();
  await Promise.all(owned.docs.map((d) => d.ref.delete()));
}

/** For the GDPR export (GET /api/user/export-data). */
export async function exportSpotlight(
  app: App,
  uid: string,
): Promise<{ settings: SpotlightSettings | null; published: PublishedSummary[]; viewsByDay: Record<string, number> }> {
  const db = getFirestore(app);
  const [stored, owned, stats] = await Promise.all([
    settingsRef(db, uid).get(),
    db.collection(SPOTLIGHTS).where("ownerUid", "==", uid).get(),
    statsRef(db, uid).get(),
  ]);
  return {
    settings: stored.exists ? ((stored.data() as any).settings ?? null) : null,
    published: owned.docs.map((d) => summaryOf(d.data() as PublishedSpotlight)),
    viewsByDay: (stats.exists ? (stats.data() as any)?.days : null) ?? {},
  };
}

// ---------- link-preview image ----------

/**
 * Renders and stores the link-preview image for the page as it is now, then points the page
 * at it. Runs after a publish has been answered (it takes a second or two in Chromium); if a
 * newer publish lands meanwhile, this one gives up rather than overwrite it. Without Chromium
 * it does nothing and pages simply have no image.
 */
export async function refreshSpotlightImage(app: App, uid: string, slug: string, version: string, opts: { renderOrigin: string; appUrl: string }): Promise<void> {
  const db = getFirestore(app);
  const page = await pageRef(db, slug).get();
  const data = page.exists ? (page.data() as PublishedSpotlight) : null;
  if (!data || data.ownerUid !== uid || data.updatedAt !== version) return;
  const address = `${new URL(opts.appUrl).host}/s/${slug}`;
  const image = await renderSpotlightImage(opts.renderOrigin, data.snapshot, address);
  await imageRef(db, uid).set({ data: image, contentType: "image/jpeg", slug, version, createdAt: new Date().toISOString() });
  await db.runTransaction(async (tx) => {
    const latest = await tx.get(pageRef(db, slug));
    const current = latest.exists ? (latest.data() as PublishedSpotlight) : null;
    if (current?.ownerUid === uid && current.updatedAt === version) tx.set(pageRef(db, slug), { imageVersion: version }, { merge: true });
  });
}

// ---------- view counts ----------

/** Link unfurlers, crawlers and scripts — not people reading the page. */
const NOT_A_READER = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|headless|curl|wget|python|axios|node-fetch|go-http|java\//i;

export function isCountableView(req: express.Request): boolean {
  if (req.method !== "GET") return false;
  if (req.query.from === "editor") return false; // the owner's own "Open public page"
  const ua = req.get("user-agent") || "";
  return ua !== "" && !NOT_A_READER.test(ua);
}

/** One more view today, on the owner's stats doc. Stores a count and nothing about the visitor. */
export async function recordSpotlightView(app: App, ownerUid: string, now: Date = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  await statsRef(getFirestore(app), ownerUid).set({ total: FieldValue.increment(1), days: { [day]: FieldValue.increment(1) } }, { merge: true });
}

export interface ViewSummary {
  total: number;
  last7: number;
  last30: number;
  /** The last 30 days, oldest first, including days with no views. */
  days: { date: string; count: number }[];
}

export function summarizeViews(stats: any, now: Date = new Date()): ViewSummary {
  const byDay: Record<string, number> = stats?.days && typeof stats.days === "object" ? stats.days : {};
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now.getTime() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date: d, count: Number(byDay[d]) || 0 };
  });
  return {
    total: Number(stats?.total) || 0,
    last7: days.slice(-7).reduce((n, d) => n + d.count, 0),
    last30: days.reduce((n, d) => n + d.count, 0),
    days,
  };
}

// ---------- public read ----------

/** The published page at `slug`, or null for a bad address, a missing page, or while the kill switch is on. */
export async function getPublicSpotlight(app: App, slug: unknown): Promise<PublishedSpotlight | null> {
  const check = validateSpotlightSlug(slug);
  if (!check.ok || check.slug !== slug) return null;
  const flags = await getFeatureFlags(app);
  if (flags.killSwitches.spotlight === true) return null;
  const page = await pageRef(getFirestore(app), check.slug).get();
  return page.exists ? (page.data() as PublishedSpotlight) : null;
}

// ---------- HTML for /s/:slug ----------

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** JSON that is safe inside a <script> element: no "</script>", no HTML comment openers, no line separators. */
export const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * Fills spotlight.html's two placeholders: page metadata (title, description, Open Graph,
 * robots) in <head>, and the snapshot as inline JSON so the page renders without a second
 * request. `page` null renders the not-found page.
 */
export function renderSpotlightHtml(template: string, page: PublishedSpotlight | null, appUrl: string): string {
  let head: string;
  if (!page) {
    head = `<title>Page not found</title>\n<meta name="robots" content="noindex, nofollow" />`;
  } else {
    const p = page.snapshot.person;
    const title = p.headline ? `${p.name} — ${p.headline}` : p.name || "Career Spotlight";
    const description = clip(p.summary || p.headline || `${p.name}'s career highlights`, 200);
    const url = `${appUrl.replace(/\/+$/, "")}/s/${page.slug}`;
    const image = page.imageVersion ? `${url}/og.jpg?v=${Date.parse(page.imageVersion) || 0}` : null;
    head = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      `<link rel="canonical" href="${escapeHtml(url)}" />`,
      `<meta property="og:type" content="profile" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:url" content="${escapeHtml(url)}" />`,
      ...(image
        ? [
            `<meta property="og:image" content="${escapeHtml(image)}" />`,
            `<meta property="og:image:width" content="1200" />`,
            `<meta property="og:image:height" content="630" />`,
            `<meta property="og:image:alt" content="${escapeHtml(title)}" />`,
            `<meta name="twitter:card" content="summary_large_image" />`,
          ]
        : [`<meta name="twitter:card" content="summary" />`]),
      page.visibility === "public" ? `<meta name="robots" content="index, follow" />` : `<meta name="robots" content="noindex, nofollow" />`,
    ].join("\n");
  }
  const data = `<script id="spotlight-data" type="application/json">${scriptJson(page ? page.snapshot : null)}</script>`;
  return template.replace("<!--spotlight-head-->", head).replace("<!--spotlight-data-->", data);
}

// ---------- rate limiting for the unauthenticated routes ----------

/**
 * Fixed-window per-IP limit. In-memory, so per process — a guard against one client
 * hammering Firestore reads, not a precise quota. Note req.ip is the proxy's address when
 * the app runs behind one without `trust proxy` set, which makes this a shared limit.
 */
export function ipRateLimit(limit: number, windowMs = 60_000) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    const key = req.ip || "unknown";
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) hits.set(key, { count: 1, resetAt: now + windowMs });
    else if (++entry.count > limit) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many requests. Try again in a minute." });
      return;
    }
    next();
  };
}

// ---------- routers ----------

const uidOf = (req: express.Request) => (req as any).uid as string | undefined;

function fail(res: express.Response, e: unknown) {
  if (e instanceof SpotlightError) {
    res.status(e.status).json({ error: e.message, code: e.code });
    return;
  }
  console.error("Spotlight request failed", e);
  res.status(500).json({ error: "Something went wrong. Try again." });
}

function needsFirebase(res: express.Response): void {
  res.status(501).json({ error: "Publishing a Spotlight needs an account. This copy of Career Journey runs without one.", code: "no_firebase" });
}

export interface SpotlightRenderOptions {
  /** This server's own address, for headless Chromium to load spotlight.html from. */
  renderOrigin: string;
}

const appUrl = () => process.env.APP_URL || "http://localhost:47293";

/** /api/spotlight/* — mounted in server.ts behind requireFirebaseAuth + requireFeature("career_spotlight"). */
export function createSpotlightRouter(opts: SpotlightRenderOptions): express.Router {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const app = getAdminApp();
    const uid = uidOf(req);
    if (!app || !uid) return needsFirebase(res);
    try {
      res.json(await loadOwnerSpotlight(app, uid));
    } catch (e) {
      fail(res, e);
    }
  });

  router.put("/settings", async (req, res) => {
    const app = getAdminApp();
    const uid = uidOf(req);
    if (!app || !uid) return needsFirebase(res);
    try {
      res.json({ settings: await saveSpotlightSettings(app, uid, req.body?.settings) });
    } catch (e) {
      fail(res, e);
    }
  });

  router.get("/slug/:slug", async (req, res) => {
    const app = getAdminApp();
    const uid = uidOf(req);
    if (!app || !uid) return needsFirebase(res);
    try {
      res.json(await checkSpotlightSlug(app, uid, req.params.slug));
    } catch (e) {
      fail(res, e);
    }
  });

  router.post("/publish", async (req, res) => {
    const app = getAdminApp();
    const uid = uidOf(req);
    if (!app || !uid) return needsFirebase(res);
    try {
      const billing = await getBillingState(app, uid);
      const canHideBadge = (req as any).isAdmin === true || billing.comped === true || isPaidPlan(billing.plan);
      const published = await publishSpotlight(app, uid, req.body?.settings, { canHideBadge });
      res.json({ published });
      refreshSpotlightImage(app, uid, published.slug, published.updatedAt, { renderOrigin: opts.renderOrigin, appUrl: appUrl() }).catch((e) =>
        console.warn(`Spotlight image for /s/${published.slug} not rendered: ${e?.message ?? e}`),
      );
    } catch (e) {
      fail(res, e);
    }
  });

  router.delete("/publish", async (req, res) => {
    const app = getAdminApp();
    const uid = uidOf(req);
    if (!app || !uid) return needsFirebase(res);
    try {
      await unpublishSpotlight(app, uid);
      res.json({ ok: true });
    } catch (e) {
      fail(res, e);
    }
  });

  return router;
}

const NOT_FOUND = { error: "Not found" };

/** /api/public/spotlights/:slug — no auth. Same 404 for missing, unpublished and switched-off pages. */
export function createPublicSpotlightRouter(): express.Router {
  const router = express.Router();
  router.get("/:slug", ipRateLimit(120), async (req, res) => {
    const app = getAdminApp();
    if (!app) return res.status(404).json(NOT_FOUND);
    try {
      const page = await getPublicSpotlight(app, req.params.slug);
      if (!page) return res.status(404).set("Cache-Control", "no-store").json(NOT_FOUND);
      res.set("Cache-Control", "public, max-age=60");
      if (page.visibility !== "public") res.set("X-Robots-Tag", "noindex, nofollow");
      res.json({ snapshot: page.snapshot });
    } catch (e) {
      console.error("Public spotlight read failed", e);
      res.status(500).json({ error: "Something went wrong. Try again." });
    }
  });
  return router;
}

/** Rendered PDFs, by page and publish time, so repeat downloads of the same version don't re-render. */
const pdfCache = new Map<string, Buffer>();
const PDF_CACHE_SIZE = 20;

function pdfFileName(name: string): string {
  const base = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "Career"}-Spotlight.pdf`;
}

/**
 * The public page and its files, registered before the SPA fallback:
 * - GET /s/:slug — HTML with metadata and data filled in on the server (link unfurlers in
 *   Slack and LinkedIn don't run JavaScript). Counts a view for real readers.
 * - GET /s/:slug/og.jpg — the link-preview image, when one has been rendered for this publish.
 * - GET /s/:slug/pdf — the page's print view as a PDF, rendered on demand and cached.
 * `loadTemplate` returns spotlight.html: through Vite in dev, from dist/ in production.
 */
export function registerSpotlightPage(app: express.Express, loadTemplate: (url: string) => Promise<string>, opts: SpotlightRenderOptions): void {
  app.get("/s/:slug", ipRateLimit(120), async (req, res, next) => {
    try {
      const admin = getAdminApp();
      const page = admin ? await getPublicSpotlight(admin, req.params.slug) : null;
      const html = renderSpotlightHtml(await loadTemplate(req.originalUrl), page, appUrl());
      res.status(page ? 200 : 404);
      res.set("Cache-Control", page ? "public, max-age=60" : "no-store");
      if (!page || page.visibility !== "public") res.set("X-Robots-Tag", "noindex, nofollow");
      res.type("html").send(html);
      if (admin && page && isCountableView(req))
        recordSpotlightView(admin, page.ownerUid).catch((e) => console.warn(`Spotlight view not counted: ${e?.message ?? e}`));
    } catch (e) {
      next(e);
    }
  });

  app.get("/s/:slug/og.jpg", ipRateLimit(120), async (req, res) => {
    const admin = getAdminApp();
    try {
      const page = admin ? await getPublicSpotlight(admin, req.params.slug) : null;
      const image = page?.imageVersion ? await imageRef(getFirestore(admin!), page.ownerUid).get() : null;
      const data = image?.exists ? (image.data() as any) : null;
      if (!page || !data || data.version !== page.imageVersion) return res.status(404).set("Cache-Control", "no-store").json(NOT_FOUND);
      res.set("Cache-Control", "public, max-age=3600");
      res.type(data.contentType || "image/jpeg").send(Buffer.from(data.data));
    } catch (e) {
      console.error("Spotlight image read failed", e);
      res.status(500).json({ error: "Something went wrong. Try again." });
    }
  });

  // Rendering is expensive, so this one is limited much more tightly than page views.
  app.get("/s/:slug/pdf", ipRateLimit(6), async (req, res) => {
    const admin = getAdminApp();
    try {
      const page = admin ? await getPublicSpotlight(admin, req.params.slug) : null;
      if (!page) return res.status(404).set("Cache-Control", "no-store").json(NOT_FOUND);
      const key = `${page.slug}@${page.updatedAt}`;
      let pdf = pdfCache.get(key);
      if (!pdf) {
        try {
          pdf = await renderSpotlightPdf(opts.renderOrigin, page.snapshot);
        } catch (e: any) {
          console.warn(`Spotlight PDF for /s/${page.slug} not rendered: ${e?.message ?? e}`);
          return res.status(503).json({ error: "The PDF isn't available right now. You can print the page instead." });
        }
        pdfCache.set(key, pdf);
        if (pdfCache.size > PDF_CACHE_SIZE) pdfCache.delete(pdfCache.keys().next().value!);
      }
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFileName(page.snapshot.person.name)}"`,
        "Cache-Control": "private, max-age=300",
        "X-Robots-Tag": "noindex, nofollow",
      });
      res.send(pdf);
    } catch (e) {
      console.error("Spotlight PDF failed", e);
      res.status(500).json({ error: "Something went wrong. Try again." });
    }
  });
}
