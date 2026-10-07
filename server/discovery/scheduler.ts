import type { App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getFeatureFlags, isFeatureEnabled, isFeatureKilled } from "../featureFlags";
import { getBillingState } from "../billing";
import { claimRun, deleteAllDiscoveryData, runDiscoverySearch, scheduleRef } from "./runSearch";

/**
 * In-process Job Discovery scheduler. The server is one long-running
 * container (Dockerfile / docker-compose.yml), so a timer is enough — no new
 * dependency, no external cron. Every TICK_MS it picks up users whose
 * discoverySchedules/{uid}.nextRunAt has passed and runs them one at a time
 * (StillOpen's limits are per IP, so running users in parallel would only
 * queue on the shared throttle in stillOpenClient.ts anyway).
 *
 * Safe with more than one replica: each run is claimed with a transaction on
 * lockedUntil (claimRun), so a user is never run twice for the same slot.
 *
 * Off when Firebase Admin isn't configured (nothing to read) or when
 * DISCOVERY_SCHEDULER=off.
 */

const TICK_MS = 15 * 60 * 1000;
const FIRST_TICK_DELAY_MS = 60 * 1000;
const USERS_PER_TICK = 10;

/**
 * Whether this user may still use Job Discovery, decided the same way
 * requireFeature("job_discovery") decides for a request — but from the Auth
 * record's custom claims, since there's no ID token here. Returns null if the
 * check itself failed, so a transient error never reads as "access revoked".
 */
export async function isUserEligible(app: App, uid: string): Promise<boolean | null> {
  try {
    const flags = await getFeatureFlags(app);
    const user = await getAuth(app).getUser(uid);
    if (user.disabled) return false;
    const isAdmin = user.customClaims?.admin === true;
    const billing = await getBillingState(app, uid);
    return isFeatureEnabled(flags, "job_discovery", { plan: billing.plan, comped: billing.comped, isAdmin });
  } catch (e: any) {
    if (e?.code === "auth/user-not-found") return false;
    console.error(`[discovery] eligibility check failed for ${uid}:`, e?.message || e);
    return null;
  }
}

let running = false;

export async function runDueDiscoverySearches(app: App, now = new Date()): Promise<number> {
  if (running) return 0;
  running = true;
  let ran = 0;
  try {
    const flags = await getFeatureFlags(app);
    if (flags.killSwitches.aiPipeline || isFeatureKilled(flags, "job_discovery")) return 0;

    const db = getFirestore(app);
    const due = await db.collection("discoverySchedules").where("nextRunAt", "<=", now.toISOString()).limit(USERS_PER_TICK).get();
    for (const doc of due.docs) {
      const uid = doc.id;
      const eligible = await isUserEligible(app, uid);
      if (eligible === null) continue;
      if (!eligible) {
        // StillOpen's terms only allow keeping listings while the feature is
        // provided to that user — access is gone, so the stored copies go too.
        await deleteAllDiscoveryData(app, uid);
        console.log(`[discovery] ${uid} no longer has access — removed their discovery data`);
        continue;
      }
      if (!(await claimRun(app, uid, new Date(), true))) continue;
      await runDiscoverySearch(app, uid, "schedule");
      ran++;
    }
  } catch (e: any) {
    console.error("[discovery] scheduler tick failed:", e?.message || e);
  } finally {
    running = false;
  }
  return ran;
}

export function startDiscoveryScheduler(getApp: () => App | null): void {
  if (process.env.DISCOVERY_SCHEDULER === "off") {
    console.log("[discovery] scheduler disabled (DISCOVERY_SCHEDULER=off)");
    return;
  }
  const app = getApp();
  if (!app) return; // local-only mode: no server-side user data to search for
  const tick = () => void runDueDiscoverySearches(app);
  setTimeout(tick, FIRST_TICK_DELAY_MS).unref();
  setInterval(tick, TICK_MS).unref();
  console.log(`[discovery] scheduler started (every ${TICK_MS / 60000} min)`);
}

