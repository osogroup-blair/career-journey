import type { App } from "../platform/app";
import { getDatabase } from "../platform/database";
import { getAuth } from "../platform/auth";
import type { Principal } from "../agent/contracts";
import { DomainError } from "../agent/contracts";
import type { Repository } from "../agent/repository";
import { enabled } from "./contracts";
import { getFeatureFlags, isFeatureEnabled } from "../featureFlags";
import { getBillingState } from "../billing";
export async function authorizeSession(
  app: App,
  uid: string,
  sessionHash: string,
) {
  if (!enabled())
    throw new DomainError("FEATURE_UNAVAILABLE", "Assistant is disabled", 503);
  const session = (
    await getDatabase(app).collection("authSessions").doc(sessionHash).get()
  ).data();
  const user = await getAuth(app)
    .getUser(uid)
    .catch(() => null);
  if (
    !session ||
    session.uid !== uid ||
    session.expiresAt <= Date.now() ||
    !user ||
    user.disabled ||
    !user.emailVerified
  )
    throw new DomainError("INVALID_TOKEN", "Sign in again to continue", 401);
  if ((await getFeatureFlags(app)).killSwitches.aiPipeline)
    throw new DomainError(
      "FEATURE_UNAVAILABLE",
      "AI is temporarily disabled",
      503,
    );
}
export function assistantAuthority(app: App, repo: Repository) {
  return async (p: Principal, toolName?: string) => {
    if (p.type !== "assistant" || !p.runId)
      throw new DomainError(
        "POLICY_BLOCKED",
        "Invalid assistant principal",
        403,
      );
    const run = await repo.read(p.uid, "assistantRuns", p.runId);
    const thread =
      run && (await repo.read(p.uid, "assistantThreads", run.threadId));
    if (
      !run ||
      !thread ||
      thread.deletedAt ||
      run.cancelRequested ||
      !["running", "waiting_for_operation"].includes(run.state) ||
      Date.parse(run.deadline) <= Date.now()
    )
      throw new DomainError(
        "CANCELLED",
        "Assistant run is no longer active",
        409,
      );
    await authorizeSession(app, p.uid, run.sessionHash);
    if (
      toolName &&
      [
        "list_matches",
        "create_match",
        "dismiss_match",
        "promote_match",
      ].includes(toolName)
    ) {
      const [billing, flags, user] = await Promise.all([
        getBillingState(app, p.uid),
        getFeatureFlags(app),
        getAuth(app).getUser(p.uid),
      ]);
      if (
        !isFeatureEnabled(flags, "job_matches", {
          plan: billing.plan,
          comped: billing.comped,
          isAdmin: user.customClaims?.admin === true,
        })
      )
        throw new DomainError(
          "FEATURE_UNAVAILABLE",
          "Job matches are not enabled for this account",
          403,
        );
    }
  };
}
