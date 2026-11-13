import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { AssistantRunner, safeData } from "../runner";
import { MemoryRepository, hash } from "../../agent/repository";
import { AgentService } from "../../agent/service";
import { DomainError, type Principal } from "../../agent/contracts";
import { resolveContext } from "../context";
import {
  applyProposal,
  applyRecipes,
  proposalSchema,
} from "../journeyProposals";
import { PreparationOperations } from "../../agent/operations";
const uid = "alice";
const context = {
  schemaVersion: 1 as const,
  pathname: "/job/job1/intake",
  contextVersion: 0,
  jobId: "job1",
  hasUnsavedChanges: false,
  timezone: "America/Denver",
};
let repo: MemoryRepository,
  service: AgentService,
  runner: AssistantRunner,
  planner: any;
const seed = async (c: string, id: string, v: any) =>
  repo.transaction(uid, async (tx) => tx.set(c, id, v));
const read = (c: string, id: string) => repo.read(uid, c, id);
async function run(extra: any = {}) {
  await seed("assistantRuns", "run1", {
    id: "run1",
    threadId: "thread1",
    state: "queued",
    context,
    deadline: new Date(Date.now() + 60000).toISOString(),
    step: 0,
    tokens: 0,
    createdAt: new Date().toISOString(),
    ...extra,
  });
  await runner.execute(uid, "run1");
  return read("assistantRuns", "run1");
}
const answer = {
  data: { kind: "answer", message: "Done", tool: "", argumentsJson: "" },
  tokens: 10,
};
const tool = (name: string, args: any) => ({
  data: {
    kind: "tool",
    message: "Here is the action",
    tool: name,
    argumentsJson: JSON.stringify(args),
  },
  tokens: 20,
});
const archive = {
  jobId: "job1",
  expectedRevision: 1,
  idempotencyKey: "server",
  reason: "Position Filled",
};
beforeEach(async () => {
  vi.stubEnv("ASSISTANT_ENABLED", "true");
  vi.stubEnv("ASSISTANT_WRITES_ENABLED", "true");
  vi.stubEnv("ASSISTANT_JOURNEY_PROPOSALS_ENABLED", "true");
  repo = new MemoryRepository();
  service = new AgentService(
    repo,
    () => false,
    async (p) => {
      const r = await repo.read(p.uid, "assistantRuns", p.runId!);
      if (
        !r ||
        r.cancelRequested ||
        !["running", "waiting_for_operation"].includes(r.state)
      )
        throw new DomainError("CANCELLED", "Cancelled");
    },
  );
  planner = vi.fn().mockResolvedValue(answer);
  runner = new AssistantRunner(repo, service, planner);
  await seed("assistantThreads", "thread1", { id: "thread1", title: "Test" });
  await seed("jobs", "job1", {
    id: "job1",
    companyName: "Acme",
    roleTitle: "Engineer",
    jdText: "Untrusted job ad",
    stage: "Intake",
    revision: 1,
  });
  await seed("careerJourney", "current", {
    meta: { owner: "Alice", version: "1.0" },
    person: { name: "Alice" },
    roles: [],
    achievements: [],
    skills_index: [],
    futureField: { keep: true },
  });
  await seed("assistantMessages", "user", {
    id: "user",
    threadId: "thread1",
    role: "user",
    content: "Archive this job",
    createdAt: new Date().toISOString(),
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("page context and data minimization", () => {
  it("rejects unknown pages, mismatched and cross-tenant jobs", async () => {
    await expect(
      resolveContext(repo, uid, { ...context, jobId: "other" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(resolveContext(repo, "bob", context)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      resolveContext(repo, uid, { ...context, pathname: "/api/auth/password" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("rejects invalid timezone and extra context fields", async () => {
    await expect(
      resolveContext(repo, uid, { ...context, timezone: "MadeUp/Place" }),
    ).rejects.toThrow();
    await expect(
      resolveContext(repo, uid, { ...context, secret: "x" }),
    ).rejects.toThrow();
  });
  it("projects only job identity and strips internal secrets recursively", async () => {
    await seed("jobs", "job1", {
      id: "job1",
      revision: 1,
      adminNotes: "private",
      apiKey: "private",
      jdText: "secret",
    });
    const c = await resolveContext(repo, uid, context);
    expect(c.job).not.toHaveProperty("jdText");
    expect(
      safeData({
        adminNotes: "hidden",
        nested: { apiKey: "key", sessionHash: "hash", safe: "okay" },
        principal: { uid: "a" },
      }),
    ).toEqual({ nested: { safe: "okay" } });
  });
});
describe("bounded execution and authority", () => {
  it("answers without mutations and preserves canonical data", async () => {
    const before = hash(await read("careerJourney", "current"));
    expect((await run())?.state).toBe("succeeded");
    expect(hash(await read("careerJourney", "current"))).toBe(before);
  });
  it("requires review for writes by default, executes once and rejects replay", async () => {
    planner.mockResolvedValueOnce(tool("archive_job", archive));
    expect((await run())?.state).toBe("awaiting_approval");
    expect((await read("jobs", "job1"))?.stage).toBe("Intake");
    const a = (await repo.list(uid, "assistantApprovals", undefined, 10))[0];
    await runner.approve(uid, a.id, a.payloadHash);
    expect((await read("jobs", "job1"))?.stage).toBe("Archive");
    await expect(
      runner.approve(uid, a.id, a.payloadHash),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await runner.execute(uid, "run1");
    expect((await read("jobs", "job1"))?.revision).toBe(2);
  });
  it("executes an explicitly allowed routine action and only once", async () => {
    planner.mockResolvedValueOnce(tool("archive_job", archive));
    await run({ allowRoutineChanges: true });
    expect((await read("jobs", "job1"))?.stage).toBe("Archive");
    await runner.execute(uid, "run1");
    expect((await read("jobs", "job1"))?.revision).toBe(2);
  });
  it("blocks writes with dirty context and disabled write controls", async () => {
    planner.mockResolvedValueOnce(tool("archive_job", archive));
    await run({
      allowRoutineChanges: true,
      context: { ...context, hasUnsavedChanges: true },
    });
    expect((await read("jobs", "job1"))?.revision).toBe(1);
    vi.stubEnv("ASSISTANT_WRITES_ENABLED", "false");
    planner.mockResolvedValueOnce(tool("archive_job", archive));
    await run({ allowRoutineChanges: true });
    expect((await read("jobs", "job1"))?.revision).toBe(1);
  });
  it("rejects canonical writers, rating finalization and arbitrary tools", async () => {
    for (const name of [
      "apply_patch",
      "finalize_rating",
      "delete_account",
      "saveCareerJourney",
    ]) {
      planner.mockResolvedValueOnce(tool(name, {}));
      expect((await run())?.state).toBe("failed");
    }
  });
  it("does not let a user principal bypass assistant scopes", async () => {
    const p: Principal = { type: "assistant", uid, runId: "run1", scopes: [] };
    await seed("assistantRuns", "run1", {
      id: "run1",
      threadId: "thread1",
      state: "running",
      deadline: new Date(Date.now() + 60000).toISOString(),
    });
    await expect(
      service.invoke(p, "archive_job", archive),
    ).rejects.toMatchObject({ code: "SCOPE_REQUIRED" });
    await expect(
      new AgentService(repo, () => true).invoke(p, "list_jobs", {}),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
  });
  it("does not apply stale reviewed actions", async () => {
    planner.mockResolvedValueOnce(tool("archive_job", archive));
    await run();
    const a = (await repo.list(uid, "assistantApprovals", undefined, 10))[0];
    await seed("jobs", "job1", { id: "job1", stage: "Intake", revision: 2 });
    await expect(
      runner.approve(uid, a.id, a.payloadHash),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect((await read("jobs", "job1"))?.stage).toBe("Intake");
  });
  it("invalidates expired or changed approvals", async () => {
    planner.mockResolvedValueOnce(tool("archive_job", archive));
    await run();
    const a = (await repo.list(uid, "assistantApprovals", undefined, 10))[0];
    await expect(
      runner.approve(uid, a.id, "a".repeat(64)),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await seed("assistantApprovals", a.id, { ...a, expiresAt: "2000-01-01" });
    await expect(
      runner.approve(uid, a.id, a.payloadHash),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  });
  it("bounded loops terminate and ambiguous provider failures become unknown", async () => {
    vi.stubEnv("ASSISTANT_MAX_STEPS", "2");
    planner.mockResolvedValue(tool("list_jobs", {}));
    expect((await run())?.error.code).toBe("LIMIT_EXCEEDED");
    expect(planner).toHaveBeenCalledTimes(2);
    planner.mockRejectedValue(new Error("provider timeout"));
    expect((await run())?.state).toBe("unknown");
  });
  it("does not retry interrupted planning or revive deleted threads", async () => {
    await run({ state: "running", deadline: "2000-01-01" });
    await runner.recover(uid, (await read("assistantRuns", "run1"))!);
    expect((await read("assistantRuns", "run1"))?.state).toBe("unknown");
    expect(planner).not.toHaveBeenCalled();
    await seed("assistantThreads", "thread1", {
      id: "thread1",
      deletedAt: "now",
    });
    await run();
    expect(planner).not.toHaveBeenCalled();
  });
  it("cancellation before result publication prevents tool execution", async () => {
    planner.mockImplementation(async () => {
      await seed("assistantRuns", "run1", {
        ...(await read("assistantRuns", "run1")),
        cancelRequested: true,
      });
      return tool("archive_job", archive);
    });
    await run({ allowRoutineChanges: true });
    expect((await read("jobs", "job1"))?.revision).toBe(1);
  });
});
describe("human-only canonical proposals", () => {
  const input = {
    summary: "Add user supplied achievement",
    operations: [
      {
        kind: "add_achievement",
        fields: {
          title: "Improved reliability",
          description: "User supplied evidence",
        },
        roleIds: [],
      },
    ],
  };
  it("drafts without changing canonical data, applies with version/ID and preserves unknown fields", async () => {
    const before = hash(await read("careerJourney", "current"));
    planner.mockResolvedValueOnce(tool("propose_journey_edit", input));
    await run();
    expect(hash(await read("careerJourney", "current"))).toBe(before);
    const p = (
      await repo.list(uid, "assistantJourneyProposals", undefined, 10)
    )[0];
    const { journey } = await applyProposal(repo, uid, p.id, p.payloadHash);
    expect(journey.achievements[0].id).toBe("ACH-001");
    expect(journey.meta.version).toBe("1.1");
    expect(journey.futureField).toEqual({ keep: true });
    await expect(
      applyProposal(repo, uid, p.id, p.payloadHash),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  });
  it("stale proposals fail and typed recipes reject arbitrary paths/unknown fields", async () => {
    planner.mockResolvedValueOnce(tool("propose_journey_edit", input));
    await run();
    const p = (
      await repo.list(uid, "assistantJourneyProposals", undefined, 10)
    )[0];
    await seed("careerJourney", "current", { person: { name: "Changed" } });
    await expect(
      applyProposal(repo, uid, p.id, p.payloadHash),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    expect(() =>
      proposalSchema.parse({
        summary: "x",
        operations: [{ kind: "add_role", fields: { admin: true } }],
      }),
    ).toThrow();
    expect(() =>
      applyRecipes(
        { roles: [] },
        proposalSchema.parse({
          summary: "x",
          operations: [
            { kind: "update_role", id: "missing", fields: { title: "x" } },
          ],
        }),
      ),
    ).toThrow();
  });
});
describe("linked preparation operations", () => {
  it("waits for one operation, reuses revisions and resumes to an answer", async () => {
    vi.stubEnv("AGENT_AI_ENABLED", "true");
    const generate = vi.fn().mockResolvedValue({
      patch: { parse: { company: "Acme" }, stage: "Parsed" },
    });
    const ops = new PreparationOperations(
      service,
      { authorize: async () => {}, generate },
      () => true,
    );
    planner.mockResolvedValueOnce(
      tool("run_preparation", {
        jobId: "job1",
        kind: "parse",
        expectedRevision: 1,
        idempotencyKey: "server",
      }),
    );
    const r = await run({ allowRoutineChanges: true });
    expect(r?.state).toBe("waiting_for_operation");
    await ops.execute(uid, r!.operationId);
    await runner.execute(uid, "run1");
    expect((await read("assistantRuns", "run1"))?.state).toBe("succeeded");
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await read("jobs", "job1"))?.stage).toBe("Parsed");
  });
});
it("serializes duplicate worker claims and does not replay historical navigation", async () => {
  await seed("assistantRuns", "run1", {
    id: "run1",
    threadId: "thread1",
    state: "queued",
    context,
    deadline: new Date(Date.now() + 60000).toISOString(),
    step: 0,
    tokens: 0,
  });
  await Promise.all([runner.execute(uid, "run1"), runner.execute(uid, "run1")]);
  expect(planner).toHaveBeenCalledTimes(1);
  planner.mockResolvedValueOnce(
    tool("navigate", { pathname: "/applications" }),
  );
  await run();
  expect((await read("assistantRuns", "run1"))?.state).toBe("succeeded");
  expect(
    (await repo.list(uid, "assistantEvents", undefined, 100)).some(
      (e) => e.result?.navigate === "/applications",
    ),
  ).toBe(true);
});
