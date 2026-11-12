import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { AddressInfo } from "node:net";
import { MemoryRepository, hash } from "../repository";
import { AgentService } from "../service";
import { AgentAuth } from "../auth";
import { SCOPES, type Principal } from "../contracts";
import { createMcpRouter, createPlatformRouter } from "../http";

const uid = "alice",
  human: Principal = { type: "user", uid, scopes: [] };
const details = {
  companyName: "Example",
  roleTitle: "Engineer",
  jdText: "Build reliable products",
  jobLink: "https://example.org/jobs/1",
};
const resume = {
  name: "Example Candidate",
  contactInfo: "candidate@example.org",
  summary: "Engineer",
  skills: [],
  experience: [],
  education: [],
};
let repo: MemoryRepository,
  service: AgentService,
  auth: AgentAuth,
  p: Principal;
let serial = 0;
const key = () => `request_${++serial}`;
async function call(name: string, args: any = {}) {
  return (await service.invoke(p, name, args)).data;
}
async function createJob() {
  return call("create_job", { idempotencyKey: key(), details });
}
async function seed(c: string, id: string, row: any) {
  await repo.transaction(uid, async (tx) => {
    tx.set(c, id, row);
  });
}
async function artifact(jobId: string, kind = "resume") {
  return call("create_artifact", {
    idempotencyKey: key(),
    jobId,
    document:
      kind === "resume"
        ? { kind, content: resume }
        : kind === "cover_letter"
          ? { kind, content: { content: "Hello" } }
          : {
              kind: "form_answers",
              content: {
                answers: [
                  { field: "Why this company?", answer: "Product focus" },
                ],
              },
            },
  });
}

beforeEach(async () => {
  repo = new MemoryRepository();
  service = new AgentService(repo, () => true);
  auth = new AgentAuth(repo, async () => true);
  const created = await auth.create(uid, {
    name: "Test agent",
    scopes: SCOPES,
    expiresInDays: 1,
  });
  p = await auth.verify(created.token);
  await seed("careerJourney", "current", {
    person: { name: "Example Candidate" },
    roles: [],
    skills_index: [],
    meta: { version: "1.0" },
  });
});

describe("agent authorization and canonical immutability", () => {
  it("stores only the token hash and shows the secret once", async () => {
    const c = await auth.create(uid, {
      name: "Read only",
      scopes: ["journey:read"],
    });
    expect((await auth.list(uid)).some((x) => "tokenHash" in x)).toBe(false);
    expect(
      JSON.stringify(await repo.read(uid, "agentConnections", c.connection.id)),
    ).not.toContain(c.token.split(".").at(-1));
    const reader = await auth.verify(c.token);
    await expect(
      service.invoke(reader, "create_job", { idempotencyKey: key(), details }),
    ).rejects.toMatchObject({ code: "SCOPE_REQUIRED" });
  });
  it("rejects tampered, malformed and revoked tokens", async () => {
    const c = await auth.create(uid, { name: "Test", scopes: ["jobs:read"] });
    await expect(
      auth.verify(c.token.slice(0, -3) + "bad"),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(auth.verify("invalid")).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
    await auth.revoke(uid, c.connection.id);
    await expect(auth.verify(c.token)).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });
  it("checks disabled accounts and expiry", async () => {
    const c = await auth.create(uid, { name: "Test", scopes: ["jobs:read"] });
    await expect(
      new AgentAuth(repo, async () => false).verify(c.token),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    const row = await repo.read(uid, "agentConnections", c.connection.id);
    await seed("agentConnections", c.connection.id, {
      ...row,
      expiresAt: "2000-01-01T00:00:00.000Z",
    });
    await expect(auth.verify(c.token)).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });
  it("revocation invalidates an already authenticated principal before a write", async () => {
    await auth.revoke(uid, p.connectionId!);
    await expect(createJob()).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
  it("bounds requests per persisted connection", async () => {
    const c = await auth.create(uid, { name: "Rate", scopes: ["jobs:read"] });
    for (let i = 0; i < 60; i++) await auth.verify(c.token);
    await expect(auth.verify(c.token)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
  it("allows no canonical writer or dangerous scope", async () => {
    await expect(
      auth.create(uid, { name: "Bad", scopes: ["journey:write"] }),
    ).rejects.toThrow();
    for (const name of [
      "patchJourney",
      "saveCareerJourney",
      "refineFromInterviewAnswer",
      "submit_application",
    ])
      await expect(call(name)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await call("get_capabilities")).journeyWritable).toBe(false);
  });
  it("rejects nested unknown fields and tenant injection", async () => {
    for (const extra of [
      { uid: "bob" },
      { pendingCareerJourneyUpdate: {} },
      { resumeClaimDecisions: { fake: "kept" } },
    ])
      await expect(
        call("create_job", { idempotencyKey: key(), details, ...extra }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      call("create_job", {
        idempotencyKey: key(),
        details: { ...details, person: { name: "fake" } },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("fails closed on write feature flag but permits reads", async () => {
    const disabled = new AgentService(repo);
    await expect(
      disabled.invoke(p, "create_job", { idempotencyKey: key(), details }),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
    expect(
      (await disabled.invoke(p, "get_career_journey", {})).data.readOnly,
    ).toBe(true);
  });
});

describe("all domain tools and workflows", () => {
  it("reads filtered canonical evidence with a stable hash", async () => {
    const read = await call("get_career_journey", { sections: ["person"] });
    expect(Object.keys(read.content)).toEqual(["person"]);
    expect(read.sourceHash).toHaveLength(64);
  });
  it("creates, edits, archives, restores and transitions jobs with CAS", async () => {
    let job = await createJob();
    expect(job.revision).toBe(1);
    job = await call("update_job_details", {
      jobId: job.id,
      expectedRevision: 1,
      idempotencyKey: key(),
      details: { recruiterNotes: "Agent note" },
    });
    await expect(
      call("transition_job", {
        jobId: job.id,
        expectedRevision: 1,
        idempotencyKey: key(),
        stage: "Parsed",
      }),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    job = await call("transition_job", {
      jobId: job.id,
      expectedRevision: 2,
      idempotencyKey: key(),
      stage: "Rating",
    });
    await expect(
      call("finalize_rating", {
        jobId: job.id,
        expectedRevision: 3,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "USER_INPUT_REQUIRED" });
    await seed("jobs", job.id, { ...job, fitAnalysis: {}, hardGateAudit: {} });
    job = await call("finalize_rating", {
      jobId: job.id,
      expectedRevision: 3,
      idempotencyKey: key(),
    });
    job = await call("transition_job", {
      jobId: job.id,
      expectedRevision: 4,
      idempotencyKey: key(),
      stage: "Tailored Application",
    });
    job = await call("archive_job", {
      jobId: job.id,
      expectedRevision: 5,
      idempotencyKey: key(),
      reason: "Withdrawn",
    });
    expect(job.stage).toBe("Archive");
    job = await call("restore_job", {
      jobId: job.id,
      expectedRevision: 6,
      idempotencyKey: key(),
    });
    expect(job.stage).toBe("Tailored Application");
    expect((await call("get_job", { jobId: job.id })).revision).toBe(7);
    expect((await call("list_jobs")).items).toHaveLength(1);
  });
  it("does not expose canonical patch objects in job reads or lists", async () => {
    const job = await createJob();
    await seed("jobs", job.id, {
      ...job,
      pendingCareerJourneyUpdate: { secret: "staged" },
      careerJourneyPatch: { secret: "staged" },
    });
    expect(await call("get_job", { jobId: job.id })).not.toHaveProperty(
      "pendingCareerJourneyUpdate",
    );
    expect((await call("list_jobs")).items[0]).not.toHaveProperty(
      "careerJourneyPatch",
    );
  });
  it("deduplicates identical retries and rejects key reuse", async () => {
    const args = { idempotencyKey: key(), details };
    const [a, b] = await Promise.all([
      call("create_job", args),
      call("create_job", args),
    ]);
    expect(a.id).toBe(b.id);
    await expect(
      call("create_job", {
        ...args,
        details: { ...details, roleTitle: "Changed" },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await call("list_jobs")).items).toHaveLength(1);
  });
  it("allows only one concurrent revision update", async () => {
    const job = await createJob();
    const results = await Promise.allSettled(
      [1, 2].map((n) =>
        call("update_job_details", {
          jobId: job.id,
          expectedRevision: 1,
          idempotencyKey: key(),
          details: { roleTitle: `Edit ${n}` },
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("manages matches, promotion, dismissal and cursor pages", async () => {
    const match = await call("create_match", {
      idempotencyKey: key(),
      details,
    });
    const args = {
      matchId: match.id,
      expectedRevision: 1,
      idempotencyKey: key(),
    };
    const promoted = await call("promote_match", args);
    expect((await call("get_job", { jobId: promoted.jobId })).companyName).toBe(
      "Example",
    );
    expect(await call("promote_match", args)).toEqual(promoted);
    const second = await call("create_match", {
      idempotencyKey: key(),
      details,
    });
    await call("dismiss_match", {
      matchId: second.id,
      expectedRevision: 1,
      idempotencyKey: key(),
    });
    const page = await call("list_matches", { limit: 1 });
    expect(page.nextCursor).toBeTruthy();
    expect(
      (await call("list_matches", { limit: 1, after: page.nextCursor })).items,
    ).toHaveLength(1);
  });
  it("keeps immutable artifact lineage and packet snapshots", async () => {
    const job = await createJob(),
      a = await artifact(job.id),
      b = await artifact(job.id, "cover_letter"),
      c = await artifact(job.id, "form_answers");
    const revised = await call("create_artifact", {
      idempotencyKey: key(),
      jobId: job.id,
      parentId: a.id,
      document: { kind: "resume", content: { ...resume, summary: "Revised" } },
    });
    expect(revised.familyId).toBe(a.familyId);
    expect(
      (await call("get_artifact", { artifactId: a.id })).content.summary,
    ).toBe("Engineer");
    const packet = await call("prepare_application", {
      idempotencyKey: key(),
      jobId: job.id,
      destination: details.jobLink,
      artifactIds: [a.id, b.id, c.id],
    });
    expect(
      (await call("preflight_application", { packetId: packet.id }))
        .canManagedSubmit,
    ).toBe(false);
    const report = {
      idempotencyKey: key(),
      packetId: packet.id,
      submittedAt: new Date().toISOString(),
      receipt: "Employer confirmation ABC",
    };
    const application = await call("record_external_application", report);
    expect(application.verification).toBe("agent_reported");
    expect(application.artifactIds).toContain(a.id);
    const repeated = await call("record_external_application", {
      ...report,
      idempotencyKey: key(),
    });
    expect(repeated.id).toBe(application.id);
    expect((await call("list_applications")).items).toHaveLength(1);
    expect((await call("list_artifacts")).items).toHaveLength(4);
    expect((await call("list_application_packets")).items).toHaveLength(1);
  });
  it("rejects stale journeys, wrong-job parents and cross-tenant records", async () => {
    const job = await createJob(),
      a = await artifact(job.id),
      other = await createJob();
    await expect(
      call("create_artifact", {
        idempotencyKey: key(),
        jobId: other.id,
        parentId: a.id,
        document: { kind: "resume", content: resume },
      }),
    ).rejects.toMatchObject({ code: "POLICY_BLOCKED" });
    await seed("careerJourney", "current", { person: { name: "Updated" } });
    await expect(
      call("prepare_application", {
        idempotencyKey: key(),
        jobId: job.id,
        destination: details.jobLink,
        artifactIds: [a.id],
      }),
    ).rejects.toMatchObject({ code: "STALE_INPUT" });
    for (const [name, args] of [
      ["get_job", { jobId: job.id }],
      ["get_artifact", { artifactId: a.id }],
    ] as const)
      await expect(
        service.invoke({ ...p, uid: "bob" }, name, args),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("writes follow-ups, interviews, offers and evidence requests without changing Career Journey", async () => {
    const before = hash(await repo.read(uid, "careerJourney", "current"));
    let job = await createJob();
    const question = await call("request_clarification", {
      idempotencyKey: key(),
      jobId: job.id,
      question: "Please confirm experience",
    });
    expect(question.editUrl).toBe("#/edit");
    const follow = await call("schedule_follow_up", {
      idempotencyKey: key(),
      jobId: job.id,
      dueAt: new Date().toISOString(),
      note: "Follow up",
    });
    await call("complete_follow_up", {
      idempotencyKey: key(),
      followUpId: follow.id,
      expectedRevision: 1,
    });
    job = await call("record_interview", {
      jobId: job.id,
      expectedRevision: 1,
      idempotencyKey: key(),
      interview: { id: "round1", roundName: "Technical", outcome: "Scheduled" },
    });
    await call("record_offer", {
      jobId: job.id,
      expectedRevision: 2,
      idempotencyKey: key(),
      offer: { receivedAt: new Date().toISOString(), baseSalary: "120000" },
    });
    expect((await call("list_follow_ups")).items[0].completedAt).toBeTruthy();
    expect((await call("list_clarifications")).items).toHaveLength(1);
    expect(
      (await call("list_application_events")).items.length,
    ).toBeGreaterThan(4);
    expect(hash(await repo.read(uid, "careerJourney", "current"))).toBe(before);
  });
  it("selects an external draft into the existing job UI projection", async () => {
    const job = await createJob(),
      a = await artifact(job.id),
      before = hash(await repo.read(uid, "careerJourney", "current"));
    const updated = await call("select_job_artifact", {
      jobId: job.id,
      expectedRevision: 1,
      idempotencyKey: key(),
      artifactId: a.id,
    });
    expect(updated.resume.name).toBe(resume.name);
    expect(updated.currentArtifactIds.resume).toBe(a.id);
    expect(hash(await repo.read(uid, "careerJourney", "current"))).toBe(before);
  });
  it("searches evidence and saves job-only resume settings", async () => {
    await seed("careerJourney", "current", {
      roles: [{ id: "ROLE-1", title: "Python Engineer" }],
      person: { name: "Candidate" },
    });
    expect(
      (await call("search_career_evidence", { query: "python" })).items[0]
        .entity.id,
    ).toBe("ROLE-1");
    const before = hash(await repo.read(uid, "careerJourney", "current")),
      job = await createJob();
    const updated = await call("set_resume_build_options", {
      jobId: job.id,
      expectedRevision: 1,
      idempotencyKey: key(),
      options: {
        pageTarget: 1,
        roles: { "ROLE-1": { mode: "full", maxBullets: 3 } },
        format: { boldLeads: true },
      },
    });
    expect(updated.resumeBuildOptions.pageTarget).toBe(1);
    expect(hash(await repo.read(uid, "careerJourney", "current"))).toBe(before);
  });
  it("blocks non-HTTPS destinations and invalid pagination", async () => {
    await expect(
      call("create_job", {
        idempotencyKey: key(),
        details: { ...details, jobLink: "file:///etc/passwd" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(call("list_jobs", { limit: 10000 })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});
