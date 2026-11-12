import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentService } from "../service";
import { AgentAuth } from "../auth";
import { MemoryRepository, hash } from "../repository";
import {
  PreparationOperations,
  PREPARATION_KINDS,
  type PreparationRunner,
} from "../operations";
import { SCOPES, type Principal } from "../contracts";
let repo: MemoryRepository,
  service: AgentService,
  operations: PreparationOperations,
  p: Principal,
  runner: PreparationRunner,
  auth: AgentAuth;
const patches: any = {
  parse: { parse: { roleTitle: "Engineer" }, stage: "Parsed" },
  keywords: { keywords: [] },
  fitScore: { fitAnalysis: {} },
  auditGates: { hardGateAudit: {} },
  resumeStrategy: { resumeStrategy: {} },
  generateResume: {
    resume: {
      name: "Candidate",
      contactInfo: "email",
      summary: "Summary",
      skills: [],
      experience: [],
      education: [],
    },
  },
  coverLetter: {
    coverLetter: { content: "Dear team", approvalStatus: "Draft" },
  },
};
beforeEach(async () => {
  repo = new MemoryRepository();
  service = new AgentService(repo, () => true);
  auth = new AgentAuth(repo, async () => true);
  runner = {
    authorize: vi.fn(async () => {}),
    generate: vi.fn(async (_p, k) => ({ patch: patches[k] })),
  };
  operations = new PreparationOperations(service, runner, () => true);
  const c = await auth.create("alice", { name: "Preparation", scopes: SCOPES });
  p = await auth.verify(c.token);
  await repo.transaction("alice", async (tx) => {
    tx.set("careerJourney", "current", { person: { name: "Candidate" } });
    tx.set("jobs", "job", {
      id: "job",
      revision: 1,
      parse: { roleTitle: "Engineer" },
      ratingFinalizedAt: new Date().toISOString(),
      resumeStrategy: {},
    });
  });
});
const run = async (n: string, a: any) => (await service.invoke(p, n, a)).data;
async function enqueue(kind: string, key = kind) {
  return run("run_preparation", {
    idempotencyKey: key,
    jobId: "job",
    expectedRevision: 1,
    kind,
  });
}
describe("durable platform preparation operations", () => {
  for (const kind of PREPARATION_KINDS)
    it(`executes and persists ${kind} exactly once`, async () => {
      const before = hash(await repo.read("alice", "careerJourney", "current")),
        a = await enqueue(kind);
      expect(a.state).toBe("queued");
      await Promise.all([
        operations.execute("alice", a.operationId),
        operations.execute("alice", a.operationId),
      ]);
      const result = await run("get_operation", { operationId: a.operationId });
      expect(result.state).toBe("succeeded");
      expect(result).not.toHaveProperty("principal");
      expect(runner.generate).toHaveBeenCalledTimes(1);
      expect(hash(await repo.read("alice", "careerJourney", "current"))).toBe(
        before,
      );
      expect((await enqueue(kind)).operationId).toBe(a.operationId);
      if (kind === "generateResume" || kind === "coverLetter")
        expect(
          await repo.list("alice", "agentArtifacts", undefined, 10),
        ).toHaveLength(1);
    });
  it("cancels before generation", async () => {
    const a = await enqueue("parse");
    await run("cancel_operation", { operationId: a.operationId });
    await operations.execute("alice", a.operationId);
    expect(runner.generate).not.toHaveBeenCalled();
  });
  it("does not publish stale results", async () => {
    const a = await enqueue("parse");
    runner.generate = async () => {
      await repo.transaction("alice", async (tx) => {
        tx.set("jobs", "job", {
          id: "job",
          revision: 2,
          roleTitle: "Human edit",
        });
      });
      return { patch: { parse: {} } };
    };
    await operations.execute("alice", a.operationId);
    expect(
      (await run("get_operation", { operationId: a.operationId })).state,
    ).toBe("stale");
    expect((await repo.read("alice", "jobs", "job"))?.roleTitle).toBe(
      "Human edit",
    );
  });
  it("rechecks grant before generation and publication", async () => {
    const a = await enqueue("parse");
    runner.generate = async () => {
      await auth.revoke("alice", p.connectionId!);
      return { patch: { parse: {} } };
    };
    await operations.execute("alice", a.operationId);
    expect(
      (await repo.read("alice", "agentOperations", a.operationId))?.state,
    ).toBe("cancelled");
    expect((await repo.read("alice", "jobs", "job"))?.revision).toBe(1);
  });
  it("records failures without automatic retries", async () => {
    const a = await enqueue("parse");
    runner.generate = vi.fn(async () => {
      throw new Error("secret upstream message");
    });
    await operations.execute("alice", a.operationId);
    await operations.execute("alice", a.operationId);
    const op = await run("get_operation", { operationId: a.operationId });
    expect(op.state).toBe("failed");
    expect(JSON.stringify(op)).not.toContain("secret upstream");
    expect(runner.generate).toHaveBeenCalledTimes(1);
  });
  it("marks interrupted operations unknown, never queued for paid retry", async () => {
    const a = await enqueue("parse");
    await repo.transaction("alice", async (tx) => {
      const op = await tx.get("agentOperations", a.operationId);
      tx.set("agentOperations", a.operationId, {
        ...op,
        state: "running",
        startedAt: "2000-01-01T00:00:00.000Z",
      });
    });
    await operations.markInterrupted("alice", a.operationId);
    await operations.execute("alice", a.operationId);
    expect(
      (await run("get_operation", { operationId: a.operationId })).state,
    ).toBe("unknown");
    expect(runner.generate).not.toHaveBeenCalled();
  });
  it("rejects invalid types, stale prerequisites and cross-tenant operations", async () => {
    await expect(enqueue("patchJourney")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const a = await enqueue("parse");
    await expect(
      service.invoke({ ...p, uid: "bob" }, "get_operation", {
        operationId: a.operationId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
