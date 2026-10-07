import type { App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logAdminAction } from "./auditLog";
import { deleteSpotlightsOwnedBy } from "./spotlight";

/**
 * Deletes users/{uid} and everything under it. Firestore never cascades a
 * document delete to its subcollections, so deleting the user doc alone leaves
 * careerJourney, jobs, matches, matchPreferences, promptConfigs (+ changeLog),
 * meta/billing and aiUsageLogs orphaned. recursiveDelete walks every
 * descendant — including subcollections added after this was written — and
 * batches the deletes itself (BulkWriter), so there's no 500-op batch limit to
 * manage here. It also works when users/{uid} itself was never written.
 *
 * Top-level collections keyed by uid (tickets/, aiCallLogs/) are not touched,
 * except discoverySchedules/{uid}: Job Discovery's scheduler entry, which would
 * otherwise keep a deleted user on the due list (server/discovery/scheduler.ts),
 * and spotlights/{slug}: published Career Spotlight pages, found by ownerUid and
 * deleted first so a public page never outlives the account (server/spotlight.ts).
 */
export async function purgeUserData(app: App, uid: string): Promise<void> {
  if (!uid) throw new Error("purgeUserData requires a uid");
  const db = getFirestore(app);
  await deleteSpotlightsOwnedBy(app, uid);
  await db.recursiveDelete(db.collection("users").doc(uid));
  await db.collection("discoverySchedules").doc(uid).delete();
}

/** DELETE /api/user/account — data first, then the Auth user. */
export async function deleteOwnAccount(app: App, uid: string): Promise<void> {
  await purgeUserData(app, uid);
  await getAuth(app).deleteUser(uid);
}

/** DELETE /api/admin/users/:uid — Auth user first (so they can't sign back in mid-purge), then data, then the audit log. */
export async function adminDeleteUser(app: App, actorUid: string, uid: string): Promise<void> {
  await getAuth(app).deleteUser(uid);
  await purgeUserData(app, uid);
  await logAdminAction(app, {
    actorUid,
    targetUid: uid,
    action: "delete_user",
    details: { deletedAt: new Date().toISOString() },
  });
}
