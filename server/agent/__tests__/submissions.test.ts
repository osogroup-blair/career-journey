import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRepository, hash } from "../repository";
import { SubmissionCoordinator, type SubmissionAdapter } from "../submissions";
import type { Principal } from "../contracts";
let repo: MemoryRepository,
  coordinator: SubmissionCoordinator,
  adapter: SubmissionAdapter;
const user: Principal = { type: "user", uid: "alice", scopes: [] },
  agent: Principal = {
    type: "agent",
    uid: "alice",
    connectionId: "grant",
    scopes: ["applications:submit"],
  };
beforeEach(async () => {
  repo = new MemoryRepository();
  adapter = {
    id: "controlled-test-only",
    preflight: vi.fn(async () => ({ ready: true, blockers: [] })),
    submit: vi.fn(async () => ({ receipt: "TEST-RECEIPT" })),
  };
  coordinator = new SubmissionCoordinator(
    repo,
    [adapter],
    () => true,
    async () => true,
  );
  await repo.transaction("alice", async (tx) => {
    const journey = { person: { name: "Candidate" } };
    tx.set("careerJourney", "current", journey);
    tx.set("jobs", "job", { id: "job", revision: 1 });
    tx.set("agentConnections", "grant", {
      id: "grant",
      scopes: ["applications:submit"],
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    tx.set("agentPackets", "packet", {
      id: "packet",
      jobId: "job",
      jobRevision: 1,
      journeyHash: hash(journey),
      packetHash: "hash",
      destination: "https://example.org/apply",
      artifactIds: ["doc"],
    });
  });
});
it("requires user approval and reserves concurrent submissions exactly once", async () => {
  await expect(
    coordinator.approve(agent, "packet", adapter.id),
  ).rejects.toMatchObject({ code: "USER_INPUT_REQUIRED" });
  const approval = await coordinator.approve(user, "packet", adapter.id),
    input = {
      packetId: "packet",
      approvalId: approval.id,
      adapterId: adapter.id,
    };
  const attempts = await Promise.all([
    coordinator.submit(agent, input),
    coordinator.submit(agent, input),
  ]);
  expect(attempts[0].id).toBe(attempts[1].id);
  expect(adapter.submit).toHaveBeenCalledTimes(1);
  expect((await repo.read("alice", "jobs", "job"))?.appliedAt).toBeTruthy();
});
it("does not retry ambiguous remote outcomes", async () => {
  adapter.submit = vi.fn(async () => {
    throw new Error("Connection dropped after possible send");
  });
  const approval = await coordinator.approve(user, "packet", adapter.id),
    input = {
      packetId: "packet",
      approvalId: approval.id,
      adapterId: adapter.id,
    };
  expect((await coordinator.submit(agent, input)).state).toBe("unknown");
  expect((await coordinator.submit(agent, input)).state).toBe("unknown");
  expect(adapter.submit).toHaveBeenCalledTimes(1);
  expect((await repo.read("alice", "jobs", "job"))?.appliedAt).toBeUndefined();
});
it("blocks changed inputs after approval and unready destinations", async () => {
  const approval = await coordinator.approve(user, "packet", adapter.id);
  await repo.transaction("alice", async (tx) => {
    tx.set("jobs", "job", { id: "job", revision: 2 });
  });
  await expect(
    coordinator.submit(agent, {
      packetId: "packet",
      approvalId: approval.id,
      adapterId: adapter.id,
    }),
  ).rejects.toMatchObject({ code: "STALE_INPUT" });
  expect(adapter.submit).not.toHaveBeenCalled();
  adapter.preflight = async () => ({
    ready: false,
    blockers: ["CAPTCHA requires user"],
  });
  await expect(
    coordinator.submit(agent, {
      packetId: "packet",
      approvalId: approval.id,
      adapterId: adapter.id,
    }),
  ).rejects.toMatchObject({ code: "USER_INPUT_REQUIRED" });
});
it("is disabled without an enabled verified adapter", async () => {
  const c = new SubmissionCoordinator(
    repo,
    [],
    () => false,
    async () => true,
  );
  expect(c.capabilities().adapters).toEqual([]);
  await expect(
    c.submit(agent, {
      packetId: "packet",
      approvalId: "none",
      adapterId: "none",
    }),
  ).rejects.toMatchObject({ code: "FEATURE_UNAVAILABLE" });
});
