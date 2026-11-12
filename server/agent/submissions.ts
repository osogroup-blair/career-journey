import { randomUUID } from "node:crypto";
import { DomainError, requireScope, type Principal } from "./contracts";
import { hash, required, type Repository, type Row } from "./repository";
export interface SubmissionAdapter {
  id: string;
  /** Adapter must verify posting identity, allowed destination, required fields and packet suitability. */
  preflight(packet: Row): Promise<{ ready: boolean; blockers: string[] }>;
  submit(
    packet: Row,
    context: { attemptId: string; idempotencyKey: string; signal: AbortSignal },
  ): Promise<{ receipt: string; confirmationUrl?: string }>;
  reconcile?(
    attempt: Row,
  ): Promise<{ state: "submitted" | "failed" | "unknown"; receipt?: string }>;
}
/** No production adapter is registered until actual employer access is verified. */
export class SubmissionCoordinator {
  constructor(
    private repo: Repository,
    private adapters: readonly SubmissionAdapter[],
    private enabled: () => boolean,
    private accountActive: (uid: string) => Promise<boolean>,
  ) {}
  capabilities() {
    return {
      enabled: this.enabled(),
      adapters: this.adapters.map((a) => a.id),
    };
  }
  async approve(p: Principal, packetId: string, adapterId: string) {
    if (p.type !== "user")
      throw new DomainError(
        "USER_INPUT_REQUIRED",
        "Only the user can approve submission in the platform",
        403,
      );
    if (!this.adapters.some((a) => a.id === adapterId))
      throw new DomainError("FEATURE_UNAVAILABLE", "Adapter unavailable");
    return this.repo.transaction(p.uid, async (tx) => {
      const packet = await required(tx, "agentPackets", packetId),
        job = await required(tx, "jobs", packet.jobId),
        journey = await required(tx, "careerJourney", "current");
      if (
        job.archivedAt ||
        (job.revision ?? 0) !== packet.jobRevision ||
        hash(journey) !== packet.journeyHash
      )
        throw new DomainError("STALE_INPUT", "Packet must be rebuilt", 409);
      const key = randomUUID(),
        row = {
          id: key,
          packetId,
          packetHash: packet.packetHash,
          adapterId,
          expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
          createdAt: new Date().toISOString(),
          usedAt: null,
        };
      tx.set("agentSubmissionApprovals", key, row);
      return row;
    });
  }
  async submit(
    p: Principal,
    input: { packetId: string; approvalId: string; adapterId: string },
  ): Promise<Row> {
    requireScope(p, "applications:submit");
    if (!this.enabled())
      throw new DomainError(
        "FEATURE_UNAVAILABLE",
        "Managed submissions are disabled",
        503,
      );
    const adapter = this.adapters.find((a) => a.id === input.adapterId);
    if (!adapter)
      throw new DomainError(
        "FEATURE_UNAVAILABLE",
        "Employer adapter unavailable",
      );
    if (!(await this.accountActive(p.uid)))
      throw new DomainError("INVALID_TOKEN", "Account unavailable", 401);
    const packet = await this.repo.read(p.uid, "agentPackets", input.packetId);
    if (!packet) throw new DomainError("NOT_FOUND", "Packet not found", 404);
    const preflight = await adapter.preflight(packet);
    if (!preflight.ready)
      throw new DomainError(
        "USER_INPUT_REQUIRED",
        preflight.blockers.join("; "),
      );
    const attempt = await this.repo.transaction<Row>(p.uid, async (tx) => {
      const current = await required(tx, "agentPackets", input.packetId),
        job = await required(tx, "jobs", current.jobId),
        journey = await required(tx, "careerJourney", "current");
      const reservationKey = hash({
          jobId: current.jobId,
          destination: current.destination,
        }),
        existing = await tx.get("agentSubmissionReservations", reservationKey);
      if (existing) {
        const previous = await required(
          tx,
          "agentSubmissionAttempts",
          existing.attemptId,
        );
        if (previous.packetHash !== current.packetHash)
          throw new DomainError(
            "POLICY_BLOCKED",
            "Application already reserved for another packet; reconcile before reapplying",
            409,
          );
        return { ...previous, existing: true };
      }
      if (p.type === "agent") {
        const g = await required(tx, "agentConnections", p.connectionId!);
        if (
          g.revokedAt ||
          Date.parse(g.expiresAt) <= Date.now() ||
          !g.scopes.includes("applications:submit")
        )
          throw new DomainError("INVALID_TOKEN", "Connection unavailable", 401);
      }
      const approval = await required(
        tx,
        "agentSubmissionApprovals",
        input.approvalId,
      );
      if (
        approval.packetId !== input.packetId ||
        approval.packetHash !== current.packetHash ||
        approval.adapterId !== adapter.id ||
        approval.usedAt ||
        Date.parse(approval.expiresAt) <= Date.now()
      )
        throw new DomainError(
          "POLICY_BLOCKED",
          "A current user approval for this exact packet is required",
          403,
        );
      if (
        job.archivedAt ||
        (job.revision ?? 0) !== current.jobRevision ||
        hash(journey) !== current.journeyHash
      )
        throw new DomainError("STALE_INPUT", "Application inputs changed", 409);
      const key = randomUUID(),
        row = {
          id: key,
          jobId: current.jobId,
          packetId: input.packetId,
          packetHash: current.packetHash,
          adapterId: adapter.id,
          approvalId: approval.id,
          destination: current.destination,
          artifactIds: current.artifactIds,
          exportIds: current.exportIds ?? [],
          state: "submitting",
          createdAt: new Date().toISOString(),
          actor: { type: p.type, connectionId: p.connectionId ?? null },
        };
      tx.set("agentSubmissionApprovals", approval.id, {
        ...approval,
        usedAt: new Date().toISOString(),
      });
      tx.set("agentSubmissionAttempts", key, row);
      tx.set("agentSubmissionReservations", reservationKey, { attemptId: key });
      return { ...row, existing: false };
    });
    if (attempt.existing) return attempt;
    // Once intent is durable, any ambiguous failure is unknown; never blindly call submit again.
    let outcome: Row;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    try {
      if (!(await this.accountActive(p.uid)))
        throw new Error("Account revoked");
      if (p.type === "agent") {
        const grant = await this.repo.read(
          p.uid,
          "agentConnections",
          p.connectionId!,
        );
        if (
          !grant ||
          grant.revokedAt ||
          Date.parse(grant.expiresAt) <= Date.now()
        )
          throw new Error("Grant revoked");
      }
      const receipt = await Promise.race([
        adapter.submit(packet, {
          attemptId: attempt.id,
          idempotencyKey: attempt.id,
          signal: controller.signal,
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Submission timed out"));
          }, 30_000);
        }),
      ]);
      if (!receipt.receipt) throw new Error("Confirmation missing");
      outcome = {
        state: "submitted",
        receipt: receipt.receipt,
        confirmationUrl: receipt.confirmationUrl ?? null,
        verification: "adapter_confirmed",
      };
    } catch {
      outcome = {
        state: "unknown",
        verification: "unconfirmed",
        error: "Submission outcome is uncertain. Reconcile before any retry.",
      };
    } finally {
      clearTimeout(timer!);
    }
    return this.repo.transaction(p.uid, async (tx) => {
      const current = await required(tx, "agentSubmissionAttempts", attempt.id),
        job = await required(tx, "jobs", attempt.jobId);
      const row: Row = {
        ...current,
        ...outcome,
        finishedAt: new Date().toISOString(),
      };
      tx.set("agentSubmissionAttempts", attempt.id, row);
      if (row.state === "submitted")
        tx.set("jobs", attempt.jobId, {
          ...job,
          appliedAt: job.appliedAt ?? row.finishedAt,
          applicationMethod: `Managed ${adapter.id}`,
          revision: (job.revision ?? 0) + 1,
        });
      const eventId = randomUUID();
      tx.set("agentEvents", eventId, {
        id: eventId,
        jobId: attempt.jobId,
        action: `submission.${row.state}`,
        attemptId: attempt.id,
        actor: attempt.actor,
        createdAt: new Date().toISOString(),
      });
      return row;
    });
  }
}
