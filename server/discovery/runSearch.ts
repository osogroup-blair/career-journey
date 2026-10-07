import type { App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  SCHEDULE_INTERVAL_MS,
  type DiscoveredJob,
  type DiscoveryProfile,
  type DiscoveryRunSummary,
  type DiscoverySchedule,
  type DiscoverySearchProfile,
} from "../../src/types/discovery";
import { searchJobs, checkStatus, StillOpenError, type SearchParams, type StillOpenListing, type StillOpenStatusEntry } from "./stillOpenClient";

/**
 * One Job Discovery run for one user: run the saved searches against
 * StillOpen, merge what comes back into users/{uid}/discoveredJobs, re-check
 * the status of everything already stored, drop what's closed or stale, and
 * schedule the next run. No AI calls — the expensive, quota-tracked step (a
 * scan) only happens when the user picks listings on the Discover page.
 *
 * Firestore layout (server-written only, via the Admin SDK):
 *   users/{uid}/discovery/profile    DiscoveryProfile minus nextRunAt
 *   users/{uid}/discoveredJobs/{id}  DiscoveredJob, keyed by StillOpen id
 *   discoverySchedules/{uid}         { uid, nextRunAt, lockedUntil } — top level so the
 *                                    scheduler can query it without a collection-group index
 */

/** Hard ceiling on StillOpen calls one run may make (each at most 20 listings). */
export const MAX_SEARCH_CALLS = 24;
/** Below this many query/filter combinations, each gets a second page. */
const TWO_PAGE_COMBO_LIMIT = 8;
/** A listing none of our searches has returned for this long is dropped, unless the user acted on it. */
export const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
/** How long a claimed run holds its lock — long enough for a slow run, short enough to recover from a crash. */
export const RUN_LOCK_MS = 10 * 60 * 1000;
/** Spreads users who saved their schedule at the same moment across the next scheduler ticks. */
const MAX_JITTER_MS = 30 * 60 * 1000;

export function profileRef(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("discovery").doc("profile");
}
export function discoveredJobsCol(db: Firestore, uid: string) {
  return db.collection("users").doc(uid).collection("discoveredJobs");
}
export function scheduleRef(db: Firestore, uid: string) {
  return db.collection("discoverySchedules").doc(uid);
}

export function computeNextRunAt(schedule: DiscoverySchedule, from: Date, jitterMs = Math.random() * MAX_JITTER_MS): string | null {
  if (schedule === "off") return null;
  return new Date(from.getTime() + SCHEDULE_INTERVAL_MS[schedule] + jitterMs).toISOString();
}

/** Every StillOpen call one run will make, in order. Queries are the outer loop so a truncated plan still covers every query once. */
export function buildSearchPlan(profile: DiscoverySearchProfile): { params: SearchParams; query: string }[] {
  const locs: (string | undefined)[] = profile.loc.length ? profile.loc : [undefined];
  const levels: (DiscoverySearchProfile["level"][number] | undefined)[] = profile.level.length ? profile.level : [undefined];
  const areas: (DiscoverySearchProfile["area"][number] | undefined)[] = profile.area.length ? profile.area : [undefined];

  const combos: { params: SearchParams; query: string }[] = [];
  for (const q of profile.queries) {
    for (const loc of locs) {
      for (const level of levels) {
        for (const area of areas) {
          combos.push({ query: q, params: { q, loc, level, area, pay: profile.payMin ?? undefined } });
        }
      }
    }
  }
  // Interleave so truncation drops the tail of every query's combinations, not whole queries.
  const byQuery = profile.queries.map((q) => combos.filter((c) => c.query === q));
  const interleaved: typeof combos = [];
  for (let i = 0; byQuery.some((list) => i < list.length); i++) {
    for (const list of byQuery) if (i < list.length) interleaved.push(list[i]);
  }
  return interleaved.slice(0, MAX_SEARCH_CALLS);
}

export function pagesPerCombo(comboCount: number): number {
  return comboCount <= TWO_PAGE_COMBO_LIMIT ? 2 : 1;
}

function listingToFields(l: StillOpenListing) {
  return {
    title: l.title,
    company: l.company,
    companySlug: l.company_slug ?? null,
    canonicalUrl: l.canonical_url ?? null,
    locations: l.locations || [],
    level: l.level ?? null,
    salary: l.salary ?? null,
    postedAt: l.posted_at ?? null,
    verifiedAt: l.verified_at ?? null,
    lastSeenAt: l.last_seen_at ?? null,
    evidenceType: l.evidence_type ?? null,
    status: l.status,
    promoted: l.promoted ?? false,
  };
}

/**
 * Merges this run's search hits into what's stored. New listings start as
 * 'new'; existing ones get fresh listing fields and query attribution, but
 * their userState (dismissed/scanned/promoted) and matchId are never touched.
 */
export function mergeFound(
  existing: Map<string, DiscoveredJob>,
  found: { listing: StillOpenListing; query: string }[],
  now: string
): { upserts: DiscoveredJob[]; newCount: number } {
  const merged = new Map<string, DiscoveredJob>();
  let newCount = 0;
  for (const { listing, query } of found) {
    const id = String(listing.id);
    const prior = merged.get(id) ?? existing.get(id);
    if (!prior) newCount++;
    merged.set(id, {
      ...(prior || { id, firstSeenAt: now, userState: "new", matchedQueries: [] }),
      ...listingToFields(listing),
      id,
      matchedQueries: Array.from(new Set([...(prior?.matchedQueries || []), query])),
      lastFoundAt: now,
      statusCheckedAt: now,
    } as DiscoveredJob);
  }
  return { upserts: Array.from(merged.values()), newCount };
}

/**
 * Applies a status re-check: returns field updates for listings still around,
 * and ids to delete — closed, unknown to StillOpen, or merged into another id
 * (the surviving listing turns up through search on its own).
 */
export function applyStatusEntries(
  entries: StillOpenStatusEntry[],
  now: string
): { updates: { id: string; fields: Partial<DiscoveredJob> }[]; deletes: string[] } {
  const updates: { id: string; fields: Partial<DiscoveredJob> }[] = [];
  const deletes: string[] = [];
  for (const e of entries) {
    const id = String(e.id);
    if (e.status === "closed" || e.status === "unknown" || e.merged_into) {
      deletes.push(id);
      continue;
    }
    updates.push({
      id,
      fields: {
        status: e.status,
        evidenceType: e.evidence_type ?? null,
        verifiedAt: e.verified_at ?? null,
        lastSeenAt: e.last_seen_at ?? null,
        statusCheckedAt: now,
      },
    });
  }
  return { updates, deletes };
}

/** Listings to drop for staleness: not returned by any search for STALE_AFTER_MS, and nothing the user has acted on. */
export function staleIds(jobs: DiscoveredJob[], now: Date): string[] {
  return jobs
    .filter((j) => (j.userState === "new" || j.userState === "seen" || j.userState === "dismissed") && now.getTime() - new Date(j.lastFoundAt).getTime() > STALE_AFTER_MS)
    .map((j) => j.id);
}

type WriteOp = { kind: "set"; id: string; data: object } | { kind: "update"; id: string; data: object } | { kind: "delete"; id: string };

async function commitOps(db: Firestore, uid: string, ops: WriteOp[]): Promise<void> {
  const col = discoveredJobsCol(db, uid);
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 450)) {
      const ref = col.doc(op.id);
      if (op.kind === "set") batch.set(ref, op.data, { merge: true });
      else if (op.kind === "update") batch.update(ref, op.data);
      else batch.delete(ref);
    }
    await batch.commit();
  }
}

/**
 * Re-checks the status of the given stored listings and removes closed ones.
 * Used by every run and by GET /api/discovery/jobs, so nothing is shown as
 * open on a status older than the caller's threshold — StillOpen's terms
 * require a re-check before presenting a cached listing as open.
 */
export async function recheckStatuses(app: App, uid: string, jobs: DiscoveredJob[], now = new Date()): Promise<{ closed: string[]; updated: Map<string, Partial<DiscoveredJob>> }> {
  const ids = jobs.map((j) => Number(j.id)).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return { closed: [], updated: new Map() };
  const entries = await checkStatus(ids);
  const { updates, deletes } = applyStatusEntries(entries, now.toISOString());
  await commitOps(getFirestore(app), uid, [
    ...updates.map((u) => ({ kind: "update" as const, id: u.id, data: u.fields })),
    ...deletes.map((id) => ({ kind: "delete" as const, id })),
  ]);
  return { closed: deletes, updated: new Map(updates.map((u) => [u.id, u.fields])) };
}

export async function loadDiscoveredJobs(app: App, uid: string): Promise<DiscoveredJob[]> {
  const snap = await discoveredJobsCol(getFirestore(app), uid).get();
  return snap.docs.map((d) => d.data() as DiscoveredJob);
}

export async function deleteAllDiscoveryData(app: App, uid: string): Promise<void> {
  const db = getFirestore(app);
  const jobs = await discoveredJobsCol(db, uid).listDocuments();
  await commitOps(db, uid, jobs.map((ref) => ({ kind: "delete" as const, id: ref.id })));
  await profileRef(db, uid).delete();
  await scheduleRef(db, uid).delete();
}

/**
 * Takes the per-user run lock (discoverySchedules/{uid}.lockedUntil) so the
 * scheduler and a "Search now" click — or two server replicas — never run the
 * same user at once. `requireDue` is the scheduler's extra check that nobody
 * already ran this user since it read the due list.
 */
export async function claimRun(app: App, uid: string, now: Date, requireDue: boolean): Promise<boolean> {
  const db = getFirestore(app);
  const ref = scheduleRef(db, uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as { nextRunAt?: string | null; lockedUntil?: string | null }) : {};
    if (data.lockedUntil && new Date(data.lockedUntil).getTime() > now.getTime()) return false;
    if (requireDue && (!data.nextRunAt || new Date(data.nextRunAt).getTime() > now.getTime())) return false;
    tx.set(ref, { uid, lockedUntil: new Date(now.getTime() + RUN_LOCK_MS).toISOString() }, { merge: true });
    return true;
  });
}

/** Runs one discovery search for a user who already holds the run lock (claimRun). Never throws — failures land in lastRun. */
export async function runDiscoverySearch(app: App, uid: string, trigger: DiscoveryRunSummary["trigger"]): Promise<DiscoveryRunSummary> {
  const db = getFirestore(app);
  const started = new Date();
  const nowIso = started.toISOString();
  let summary: DiscoveryRunSummary = { at: nowIso, status: "ok", newCount: 0, foundCount: 0, closedCount: 0, trigger };
  let schedule: DiscoverySchedule = "off";

  try {
    const profileSnap = await profileRef(db, uid).get();
    const profile = profileSnap.exists ? (profileSnap.data() as DiscoveryProfile) : null;
    schedule = profile?.schedule || "off";
    if (!profile?.searchProfile || profile.searchProfile.queries.length === 0) {
      throw new StillOpenError("No search profile saved yet — set one up on the Discover page.");
    }

    const plan = buildSearchPlan(profile.searchProfile);
    const pages = pagesPerCombo(plan.length);
    const found: { listing: StillOpenListing; query: string }[] = [];
    const refused: string[] = [];
    for (const { params, query } of plan) {
      let cursor: string | undefined;
      for (let page = 0; page < pages; page++) {
        try {
          const res = await searchJobs({ ...params, cursor });
          for (const listing of res.jobs) found.push({ listing, query });
          if (!res.nextCursor) break;
          cursor = res.nextCursor;
        } catch (e) {
          // A refused filter value only sinks that one combination; rate limiting or an outage sinks the run.
          if (e instanceof StillOpenError && e.status === 400) {
            refused.push(e.message);
            break;
          }
          throw e;
        }
      }
    }
    if (found.length === 0 && refused.length > 0) throw new StillOpenError(refused[0]);

    const stored = await loadDiscoveredJobs(app, uid);
    const existing = new Map(stored.map((j) => [j.id, j]));
    const { upserts, newCount } = mergeFound(existing, found, nowIso);
    await commitOps(db, uid, upserts.map((j) => ({ kind: "set" as const, id: j.id, data: j })));

    // Anything stored that this run's searches didn't return gets an explicit status check.
    const foundIds = new Set(upserts.map((j) => j.id));
    const notFound = stored.filter((j) => !foundIds.has(j.id));
    const { closed } = await recheckStatuses(app, uid, notFound, started);
    const closedSet = new Set(closed);
    const stale = staleIds(notFound.filter((j) => !closedSet.has(j.id)), started);
    await commitOps(db, uid, stale.map((id) => ({ kind: "delete" as const, id })));

    summary = { ...summary, newCount, foundCount: found.length, closedCount: closed.length + stale.length };
    if (refused.length) summary.error = `Some searches were refused: ${refused[0]}`;
  } catch (e: any) {
    console.error(`[discovery] run failed for ${uid}:`, e?.message || e);
    summary = { ...summary, status: "error", error: e instanceof StillOpenError ? e.message : "The search failed — try again later." };
  }

  const nextRunAt = computeNextRunAt(schedule, started);
  await profileRef(db, uid).set({ lastRun: summary }, { merge: true });
  await scheduleRef(db, uid).set({ uid, nextRunAt, lockedUntil: null }, { merge: true });
  console.log(`[discovery] ${trigger} run for ${uid}: ${summary.status}, ${summary.newCount} new, ${summary.foundCount} found, ${summary.closedCount} removed (${Date.now() - started.getTime()}ms)`);
  return summary;
}
