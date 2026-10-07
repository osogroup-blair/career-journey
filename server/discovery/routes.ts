import express from "express";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../firebaseAdmin";
import { isDiscoveryLicensed } from "../featureFlags";
import {
  DiscoveredJobPatchSchema,
  DiscoveryProfileUpdateSchema,
  STILLOPEN_REGIONS,
  type DiscoveredJob,
  type DiscoveredJobDetail,
  type DiscoveryProfile,
  type ListingStatusResult,
} from "../../src/types/discovery";
import { checkStatus, getJob, searchJobs, StillOpenError } from "./stillOpenClient";
import { htmlToText } from "../htmlToText";
import { formatLocationNotes, formatSalary } from "../../src/lib/discoveryFormat";
import {
  claimRun,
  computeNextRunAt,
  discoveredJobsCol,
  loadDiscoveredJobs,
  profileRef,
  recheckStatuses,
  runDiscoverySearch,
  scheduleRef,
} from "./runSearch";

/**
 * /api/discovery/* — Job Discovery (StillOpen). Mounted in server.ts behind
 * requireFirebaseAuth + requireFeature("job_discovery"), which makes it
 * admin-only until STILLOPEN_LICENSED is set. Every handler takes the uid from
 * the verified token (req.uid), never the body.
 */

/** "Search now" can't be clicked faster than this — every run is up to ~30 rate-limited StillOpen calls. */
const MANUAL_RUN_COOLDOWN_MS = 10 * 60 * 1000;
/** GET /jobs re-checks any listing whose status is older than this before returning it as open. */
const STATUS_MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Country codes StillOpen has already accepted this process — so saving a profile doesn't re-probe them.
const acceptedLocs = new Set<string>(STILLOPEN_REGIONS);

async function assertLocsAccepted(locs: string[]): Promise<void> {
  for (const loc of locs) {
    if (acceptedLocs.has(loc)) continue;
    try {
      await searchJobs({ q: "manager", loc, limit: 1 });
      acceptedLocs.add(loc);
    } catch (e) {
      if (e instanceof StillOpenError && e.status === 400) {
        throw new StillOpenError(`StillOpen doesn't recognise the location "${loc}". Use its 2-letter code (e.g. "uk" for the United Kingdom) or a region.`, 400);
      }
      throw e;
    }
  }
}

function uidOf(req: express.Request): string {
  return (req as any).uid as string;
}

function sendError(res: express.Response, e: any) {
  if (e instanceof StillOpenError) {
    res.status(e.status === 400 ? 400 : e.status === 429 ? 429 : 502).json({ error: e.message });
    return;
  }
  console.error("[discovery]", e);
  res.status(500).json({ error: "Something went wrong — try again." });
}

const EMPTY_PROFILE: Omit<DiscoveryProfile, "updatedAt"> = { cvText: "", cvGeneratedAt: null, searchProfile: null, schedule: "off" };

export function createDiscoveryRouter(): express.Router {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!getAdminApp() || !uidOf(req)) {
      res.status(501).json({ error: "Job Discovery needs Firebase configured and a signed-in account." });
      return;
    }
    next();
  });

  router.get("/profile", async (req, res) => {
    try {
      const db = getFirestore(getAdminApp()!);
      const uid = uidOf(req);
      const [profileSnap, scheduleSnap] = await Promise.all([profileRef(db, uid).get(), scheduleRef(db, uid).get()]);
      const profile = profileSnap.exists ? (profileSnap.data() as DiscoveryProfile) : { ...EMPTY_PROFILE, updatedAt: "" };
      res.json({
        profile: { ...EMPTY_PROFILE, ...profile, nextRunAt: scheduleSnap.exists ? scheduleSnap.data()?.nextRunAt ?? null : null },
        licensed: isDiscoveryLicensed(),
      });
    } catch (e) {
      sendError(res, e);
    }
  });

  router.put("/profile", async (req, res) => {
    const parsed = DiscoveryProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid profile." });
      return;
    }
    try {
      const update = parsed.data;
      if (update.searchProfile) await assertLocsAccepted(update.searchProfile.loc);

      const db = getFirestore(getAdminApp()!);
      const uid = uidOf(req);
      const now = new Date();
      const priorSnap = await profileRef(db, uid).get();
      const prior = priorSnap.exists ? (priorSnap.data() as DiscoveryProfile) : null;
      const fields: Record<string, unknown> = { updatedAt: now.toISOString() };
      for (const [k, v] of Object.entries(update)) if (v !== undefined) fields[k] = v;
      await profileRef(db, uid).set(fields, { merge: true });

      if (update.schedule && update.schedule !== prior?.schedule) {
        // First-ever schedule runs on the next tick; otherwise one interval after the last run (or now, if that's already passed).
        const lastRunAt = prior?.lastRun?.at ? new Date(prior.lastRun.at) : null;
        let nextRunAt = lastRunAt ? computeNextRunAt(update.schedule, lastRunAt, 0) : update.schedule === "off" ? null : now.toISOString();
        if (nextRunAt && new Date(nextRunAt) < now) nextRunAt = now.toISOString();
        await scheduleRef(db, uid).set({ uid, nextRunAt }, { merge: true });
      }
      const [saved, schedule] = await Promise.all([profileRef(db, uid).get(), scheduleRef(db, uid).get()]);
      res.json({ profile: { ...EMPTY_PROFILE, ...(saved.data() as DiscoveryProfile), nextRunAt: schedule.data()?.nextRunAt ?? null } });
    } catch (e) {
      sendError(res, e);
    }
  });

  // Starts a run and returns immediately — a run can take a minute at
  // StillOpen's pace. The page polls GET /profile until lastRun.at changes.
  router.post("/run", async (req, res) => {
    try {
      const app = getAdminApp()!;
      const uid = uidOf(req);
      const profileSnap = await profileRef(getFirestore(app), uid).get();
      const profile = profileSnap.data() as DiscoveryProfile | undefined;
      if (!profile?.searchProfile) {
        res.status(400).json({ error: "Save a search profile first." });
        return;
      }
      const lastRunAt = profile.lastRun?.at ? new Date(profile.lastRun.at).getTime() : 0;
      const waitMs = lastRunAt + MANUAL_RUN_COOLDOWN_MS - Date.now();
      if (waitMs > 0) {
        res.status(429).json({ error: `A search ran recently — try again in ${Math.ceil(waitMs / 60000)} min.` });
        return;
      }
      if (!(await claimRun(app, uid, new Date(), false))) {
        res.status(409).json({ error: "A search is already running." });
        return;
      }
      void runDiscoverySearch(app, uid, "manual");
      res.status(202).json({ started: true });
    } catch (e) {
      sendError(res, e);
    }
  });

  router.get("/jobs", async (req, res) => {
    try {
      const app = getAdminApp()!;
      const uid = uidOf(req);
      const now = new Date();
      let jobs = await loadDiscoveredJobs(app, uid);
      const due = jobs.filter((j) => now.getTime() - new Date(j.statusCheckedAt).getTime() > STATUS_MAX_AGE_MS);
      if (due.length) {
        try {
          const { closed, updated } = await recheckStatuses(app, uid, due, now);
          const closedSet = new Set(closed);
          jobs = jobs.filter((j) => !closedSet.has(j.id)).map((j) => (updated.has(j.id) ? { ...j, ...updated.get(j.id) } : j));
        } catch (e) {
          // StillOpen unreachable: still return the list, but don't present unchecked listings as open.
          console.error("[discovery] status re-check failed:", (e as Error).message);
          const dueSet = new Set(due.map((j) => j.id));
          jobs = jobs.map((j) => (dueSet.has(j.id) ? { ...j, status: "unknown" as const } : j));
        }
      }
      res.json({ jobs });
    } catch (e) {
      sendError(res, e);
    }
  });

  // Only proxies listings already in this user's discoveredJobs — never an open proxy onto StillOpen.
  router.get("/jobs/:id/detail", async (req, res) => {
    try {
      const app = getAdminApp()!;
      const uid = uidOf(req);
      const ref = discoveredJobsCol(getFirestore(app), uid).doc(String(req.params.id));
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ error: "That listing isn't in your discovery list." });
        return;
      }
      const d = await getJob(Number(req.params.id));
      if (d.status === "closed" || d.status === "unknown" || d.merged_into) {
        await ref.delete();
        res.status(410).json({ error: "This listing has closed." });
        return;
      }
      const detail: DiscoveredJobDetail = {
        id: String(d.id),
        title: d.title,
        company: d.company,
        canonicalUrl: d.canonical_url ?? null,
        applyUrl: d.apply_url ?? null,
        // description_text has every line break stripped (checked live), which runs headings into
        // paragraphs and leaves nothing for JD segmentation to split on — the HTML keeps the structure.
        descriptionText: d.description_html ? htmlToText(d.description_html) : d.description_text || "",
        skills: d.skills || [],
        employmentType: d.employment_type ?? null,
        salaryText: formatSalary(d.salary),
        locationNotes: formatLocationNotes(d.locations || [], d.employment_type),
        status: d.status,
      };
      res.json(detail);
    } catch (e) {
      sendError(res, e);
    }
  });

  // The Apply stage's "is this still open?" check for a pipeline job that came from StillOpen.
  // Only answers for listings behind one of the caller's own jobs or matches, so it can't be
  // used to probe StillOpen for arbitrary ids. Both lookups are single-field queries (no index).
  router.get("/listings/:id/status", async (req, res) => {
    const id = String(req.params.id);
    if (!/^\d{1,12}$/.test(id)) {
      res.status(400).json({ error: "Invalid listing id." });
      return;
    }
    try {
      const userDoc = getFirestore(getAdminApp()!).collection("users").doc(uidOf(req));
      const [jobHit, matchHit] = await Promise.all([
        userDoc.collection("jobs").where("source.listingId", "==", id).limit(1).get(),
        userDoc.collection("matches").where("externalId", "==", id).limit(1).get(),
      ]);
      if (jobHit.empty && matchHit.empty) {
        res.status(404).json({ error: "That listing isn't linked to any of your jobs." });
        return;
      }
      const [entry] = await checkStatus([Number(id)]);
      const result: ListingStatusResult = {
        // merged_into means StillOpen folded it into another listing — this one is effectively gone.
        status: entry?.merged_into ? "closed" : entry?.status ?? "unknown",
        closedAt: entry?.closed_at ?? null,
        closure: entry?.merged_into ? "merged" : entry?.closure ?? null,
        checkedAt: new Date().toISOString(),
      };
      res.json(result);
    } catch (e) {
      sendError(res, e);
    }
  });

  router.patch("/jobs/:id", async (req, res) => {
    const parsed = DiscoveredJobPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid update." });
      return;
    }
    try {
      const ref = discoveredJobsCol(getFirestore(getAdminApp()!), uidOf(req)).doc(String(req.params.id));
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ error: "That listing isn't in your discovery list." });
        return;
      }
      const fields: Partial<DiscoveredJob> = {};
      if (parsed.data.userState) fields.userState = parsed.data.userState;
      if (parsed.data.matchId) fields.matchId = parsed.data.matchId;
      await ref.update(fields);
      res.json({ ...(snap.data() as DiscoveredJob), ...fields });
    } catch (e) {
      sendError(res, e);
    }
  });

  return router;
}
