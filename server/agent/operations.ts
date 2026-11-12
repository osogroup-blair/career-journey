import { flagResumeClaims } from "../../src/lib/resumeClaims";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { DomainError, id, mutation, type Principal } from "./contracts";
import { hash, required, checkRevision, type Row } from "./repository";
import type { AgentService } from "./service";
export const PREPARATION_KINDS = [
  "parse",
  "keywords",
  "fitScore",
  "auditGates",
  "resumeStrategy",
  "generateResume",
  "coverLetter",
] as const;
export type PreparationKind = (typeof PREPARATION_KINDS)[number];
export interface PreparationRunner {
  authorize(p: Principal, kind: PreparationKind): Promise<void>;
  generate(
    p: Principal,
    kind: PreparationKind,
    job: Row,
    journey: Row,
  ): Promise<{ patch: Row; usage?: unknown }>;
}
/** Durable single-step operations. In-flight operations are never automatically resubmitted to a paid AI provider. */
export class PreparationOperations {
  constructor(
    private service: AgentService,
    private runner: PreparationRunner,
    private enabled: () => boolean,
  ) {
    service.tools.run_preparation = {
      description:
        "Queue one platform AI preparation step using stored Career Journey evidence. Returns an operation ID; poll get_operation. Unknown outcomes require explicit review, never automatic paid retry.",
      scope: "ai:run",
      write: true,
      schema: z
        .object({
          ...mutation,
          jobId: id,
          expectedRevision: z.number().int().nonnegative(),
          kind: z.enum(PREPARATION_KINDS),
        })
        .strict(),
      run: (p, a) => this.enqueue(p, a),
    };
    service.tools.get_operation = {
      description:
        "Read preparation operation state, input revisions and errors.",
      scope: "jobs:read",
      schema: z.object({ operationId: id }).strict(),
      run: async (p, a) => {
        const op = await service.repo.read(
          p.uid,
          "agentOperations",
          a.operationId,
        );
        if (!op) throw new DomainError("NOT_FOUND", "Operation not found", 404);
        const { principal, ...safe } = op;
        return safe;
      },
    };
    service.tools.cancel_operation = {
      description:
        "Cancel queued work or request that an in-flight result not be published. Does not reverse AI spend.",
      scope: "ai:run",
      write: true,
      schema: z.object({ operationId: id }).strict(),
      run: (p, a) =>
        service.repo.transaction(p.uid, async (tx) => {
          if (p.type === "agent") {
            const g = await required(tx, "agentConnections", p.connectionId!);
            if (g.revokedAt || Date.parse(g.expiresAt) <= Date.now())
              throw new DomainError(
                "INVALID_TOKEN",
                "Connection unavailable",
                401,
              );
          }
          const op = await required(tx, "agentOperations", a.operationId);
          if (["queued", "running"].includes(op.state))
            tx.set("agentOperations", a.operationId, {
              ...op,
              cancelRequested: true,
              ...(op.state === "queued" ? { state: "cancelled" } : {}),
            });
          return { cancelRequested: true };
        }),
    };
  }
  private async enqueue(p: Principal, a: any) {
    if (!this.enabled())
      throw new DomainError(
        "FEATURE_UNAVAILABLE",
        "Agent platform AI is disabled",
        503,
      );
    await this.runner.authorize(p, a.kind);
    return this.service.repo.transaction(p.uid, async (tx) => {
      if (p.type === "agent") {
        const g = await required(tx, "agentConnections", p.connectionId!);
        if (
          g.revokedAt ||
          Date.parse(g.expiresAt) <= Date.now() ||
          !g.scopes.includes("ai:run")
        )
          throw new DomainError("INVALID_TOKEN", "Connection unavailable", 401);
      }
      const key = hash({
          actor: p.connectionId ?? "user",
          key: a.idempotencyKey,
        }),
        previous = await tx.get("agentOperations", key),
        fingerprint = hash(a);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new DomainError(
            "IDEMPOTENCY_CONFLICT",
            "Operation key reused",
            409,
          );
        return { operationId: key, state: previous.state };
      }
      const job = await required(tx, "jobs", a.jobId),
        journey = await required(tx, "careerJourney", "current");
      checkRevision(job, a.expectedRevision);
      if (a.kind !== "parse" && !job.parse)
        throw new DomainError("USER_INPUT_REQUIRED", "Parse the job first");
      if (
        ["resumeStrategy", "generateResume"].includes(a.kind) &&
        !job.ratingFinalizedAt
      )
        throw new DomainError("USER_INPUT_REQUIRED", "Finalize rating first");
      if (a.kind === "generateResume" && !job.resumeStrategy)
        throw new DomainError("USER_INPUT_REQUIRED", "Generate strategy first");
      tx.set("agentOperations", key, {
        id: key,
        jobId: a.jobId,
        kind: a.kind,
        fingerprint,
        principal: p,
        inputRevision: job.revision ?? 0,
        journeyHash: hash(journey),
        state: "queued",
        createdAt: new Date().toISOString(),
        cancelRequested: false,
      });
      return { operationId: key, state: "queued" };
    });
  }
  async execute(uid: string, key: string) {
    if (!this.enabled()) return;
    const claimed = await this.service.repo.transaction<Row | null>(
      uid,
      async (tx) => {
        const op = await tx.get("agentOperations", key);
        if (!op || op.state !== "queued" || op.cancelRequested) return null;
        const lease = randomUUID();
        tx.set("agentOperations", key, {
          ...op,
          state: "running",
          lease,
          startedAt: new Date().toISOString(),
        });
        return { ...op, lease };
      },
    );
    if (!claimed) return;
    try {
      const p = claimed.principal as Principal;
      if (p.type === "agent") {
        const grant = await this.service.repo.read(
          uid,
          "agentConnections",
          p.connectionId!,
        );
        if (
          !grant ||
          grant.revokedAt ||
          Date.parse(grant.expiresAt) <= Date.now() ||
          !grant.scopes.includes("ai:run")
        )
          throw new DomainError("INVALID_TOKEN", "Connection unavailable", 401);
      }
      await this.runner.authorize(p, claimed.kind);
      const job = await this.service.repo.read(uid, "jobs", claimed.jobId),
        journey = await this.service.repo.read(uid, "careerJourney", "current");
      if (
        !job ||
        !journey ||
        (job.revision ?? 0) !== claimed.inputRevision ||
        hash(journey) !== claimed.journeyHash
      )
        throw new DomainError(
          "STALE_INPUT",
          "Inputs changed before execution",
          409,
        );
      // Any crash from here on is ambiguous. Recovery marks it unknown and never recharges automatically.
      const result = await this.runner.generate(p, claimed.kind, job, journey);
      await this.service.repo.transaction(uid, async (tx) => {
        const op = await required(tx, "agentOperations", key),
          latest = await required(tx, "jobs", claimed.jobId),
          current = await required(tx, "careerJourney", "current");
        if (op.lease !== claimed.lease || op.state !== "running") return;
        const grant =
          p.type === "agent"
            ? await tx.get("agentConnections", p.connectionId!)
            : null;
        const revoked =
          p.type === "agent" &&
          (!grant ||
            grant.revokedAt ||
            Date.parse(grant.expiresAt) <= Date.now() ||
            !grant.scopes.includes("ai:run"));
        const stale =
          (latest.revision ?? 0) !== claimed.inputRevision ||
          hash(current) !== claimed.journeyHash;
        const state =
          op.cancelRequested || revoked
            ? "cancelled"
            : stale
              ? "stale"
              : "succeeded";
        tx.set("agentOperations", key, {
          ...op,
          state,
          finishedAt: new Date().toISOString(),
          result,
          ...(stale
            ? {
                error: {
                  code: "STALE_INPUT",
                  message: "Result retained without updating job",
                },
              }
            : {}),
        });
        if (state === "succeeded") {
          const updated = {
            ...latest,
            ...result.patch,
            revision: (latest.revision ?? 0) + 1,
            updatedAt: new Date().toISOString(),
          };
          tx.set("jobs", claimed.jobId, updated);
          // Freeze generated materials in the library in the same transaction as the UI projection.
          const kind = result.patch.resume
            ? "resume"
            : result.patch.coverLetter
              ? "cover_letter"
              : null;
          if (kind) {
            const content =
              kind === "resume"
                ? result.patch.resume
                : { content: result.patch.coverLetter.content };
            const artifactId = hash({ operation: key });
            tx.set("agentArtifacts", artifactId, {
              id: artifactId,
              jobId: claimed.jobId,
              kind,
              content,
              contentHash: hash({ kind, content }),
              familyId: artifactId,
              parentId: null,
              journeyHash: claimed.journeyHash,
              jobRevision: claimed.inputRevision,
              author: { type: p.type, connectionId: p.connectionId ?? null },
              verification: "unverified_draft",
              claimFlags:
                kind === "resume"
                  ? flagResumeClaims({
                      resume: content as any,
                      careerJourney: current,
                      keywords: latest.keywords ?? [],
                      contextEntries: latest.contextEntries ?? {},
                      jdText: latest.jdText ?? "",
                    })
                  : [],
              createdAt: new Date().toISOString(),
              operationId: key,
            });
          }
          const eventId = randomUUID();
          tx.set("agentEvents", eventId, {
            id: eventId,
            jobId: claimed.jobId,
            action: `preparation.${claimed.kind}`,
            actor: { type: p.type, connectionId: p.connectionId ?? null },
            createdAt: new Date().toISOString(),
          });
        }
      });
    } catch (e) {
      await this.service.repo.transaction(uid, async (tx) => {
        const op = await required(tx, "agentOperations", key);
        if (op.lease === claimed.lease && op.state === "running")
          tx.set("agentOperations", key, {
            ...op,
            state: "failed",
            finishedAt: new Date().toISOString(),
            error: {
              code: e instanceof DomainError ? e.code : "UPSTREAM_ERROR",
              message:
                e instanceof DomainError
                  ? e.message
                  : "Preparation failed; review usage before retrying",
            },
          });
      });
    }
  }
  async markInterrupted(uid: string, key: string) {
    return this.service.repo.transaction(uid, async (tx) => {
      const op = await tx.get("agentOperations", key);
      if (
        op?.state === "running" &&
        Date.parse(op.startedAt) < Date.now() - 15 * 60000
      )
        tx.set("agentOperations", key, {
          ...op,
          state: "unknown",
          error: {
            code: "INTERRUPTED",
            message:
              "Execution interrupted. Check provider usage before starting a new operation.",
          },
        });
    });
  }
}
