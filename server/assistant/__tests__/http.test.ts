import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { getPlatformApp } from "../../platform";
import { getDatabase } from "../../platform/database";
import { getAuth, digest } from "../../platform/auth";
import { SqliteRepository } from "../../agent/repository";
import { AgentService } from "../../agent/service";
import { registerAssistant } from "../index";
import { assistantAuthority } from "../authority";
import { registerPlatformRoutes } from "../../platform/routes";
import { checkAndConsumeAiQuota, recordAiUsage } from "../../billing";
import { _resetFeatureFlagsCache } from "../../featureFlags";
let server: Server,
  base: string,
  dir: string,
  platform: any,
  bundle: ReturnType<typeof registerAssistant>,
  token: string,
  other: string,
  uid: string,
  repo: SqliteRepository;
const context = {
  schemaVersion: 1,
  pathname: "/",
  contextVersion: 0,
  hasUnsavedChanges: false,
  timezone: "America/Denver",
};
async function api(path: string, body?: any, options: any = {}) {
  const response = await fetch(`${base}/api/assistant${path}`, {
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      "X-CJ-Request": "1",
      Cookie: `cj_session=${options.token ?? token}`,
      ...options.headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "career-assistant-http-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.stubEnv("ASSISTANT_ENABLED", "true");
  vi.stubEnv("ASSISTANT_WRITES_ENABLED", "true");
  platform = getPlatformApp();
  repo = new SqliteRepository(getDatabase(platform));
  const app = express();
  app.use(express.json());
  registerPlatformRoutes(app);
  const service = new AgentService(
    repo,
    () => false,
    assistantAuthority(platform, repo),
  );
  bundle = registerAssistant(app, platform, service);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
  bundle.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  getDatabase(platform).close();
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  _resetFeatureFlagsCache();
  const auth = getAuth(platform);
  const email = `${crypto.randomUUID()}@example.invalid`;
  const user = await auth.createUser({
    email,
    password: "fictional-password-only",
    emailVerified: true,
  });
  uid = user.uid;
  token = (await auth.signIn(email, "fictional-password-only")).token;
  const email2 = `${crypto.randomUUID()}@example.invalid`;
  await auth.createUser({
    email: email2,
    password: "fictional-password-only",
    emailVerified: true,
  });
  other = (await auth.signIn(email2, "fictional-password-only")).token;
});
it("isolates threads and rejects bearer agents, missing CSRF headers and bad origins", async () => {
  const t = (await api("/threads", {})).data;
  expect(
    (await api(`/threads/${t.id}`, undefined, { token: other })).status,
  ).toBe(404);
  expect(
    (
      await api("/threads", undefined, {
        headers: { Authorization: "Bearer cj_agent.fake" },
      })
    ).status,
  ).toBe(401);
  expect(
    (await api("/threads", {}, { headers: { "X-CJ-Request": "" } })).status,
  ).toBe(403);
  expect(
    (await api("/threads", {}, { headers: { Origin: "https://evil.example" } }))
      .status,
  ).toBe(403);
});
it("deduplicates turns, rejects payload mismatches, and blocks concurrent user runs", async () => {
  const t = (await api("/threads", {})).data;
  const input = {
    text: "What page is this?",
    context,
    requestId: "same-request",
  };
  const a = await api(`/threads/${t.id}/turns`, input),
    b = await api(`/threads/${t.id}/turns`, input);
  expect(a.data).toEqual(b.data);
  expect(
    (await api(`/threads/${t.id}/turns`, { ...input, text: "Changed" })).status,
  ).toBe(409);
  expect(
    (await api(`/threads/${t.id}/turns`, { ...input, requestId: "another" }))
      .status,
  ).toBe(409);
  await api(`/runs/${a.data.runId}/cancel`, {});
  expect(
    (await api(`/threads/${t.id}/turns`, { ...input, requestId: "another" }))
      .status,
  ).toBe(200);
  expect(JSON.stringify((await api(`/threads/${t.id}`)).data)).not.toContain(
    digest(token),
  );
});
it("deleting a conversation removes content and prevents new work", async () => {
  const t = (await api("/threads", {})).data;
  await api(`/threads/${t.id}/turns`, {
    text: "Private text",
    context,
    requestId: "delete-me",
  });
  expect(
    (await api(`/threads/${t.id}`, undefined, { method: "DELETE" })).status,
  ).toBe(200);
  expect((await api(`/threads/${t.id}`)).status).toBe(404);
  expect(
    (await repo.list(uid, "assistantMessages", undefined, 20)).length,
  ).toBe(0);
  expect(
    (
      await api(`/threads/${t.id}/turns`, {
        text: "Again",
        context,
        requestId: "later",
      })
    ).status,
  ).toBe(404);
});
it("logout revokes an already captured assistant identity", async () => {
  const t = (await api("/threads", {})).data;
  const r = (
    await api(`/threads/${t.id}/turns`, {
      text: "Hello",
      context,
      requestId: "logout",
    })
  ).data;
  await repo.transaction(uid, async (tx) => {
    const run = await tx.get("assistantRuns", r.runId);
    tx.set("assistantRuns", r.runId, { ...run, state: "running" });
  });
  const p = { type: "assistant" as const, uid, runId: r.runId, scopes: [] };
  await assistantAuthority(platform, repo)(p);
  await getAuth(platform).signOut(token);
  await expect(assistantAuthority(platform, repo)(p)).rejects.toMatchObject({
    code: "INVALID_TOKEN",
  });
  expect((await api("/capabilities")).status).toBe(401);
});
it("quota reservation and usage settlement are idempotent under concurrency", async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      checkAndConsumeAiQuota(platform, uid, "one-step"),
    ),
  );
  expect(results.every((r) => r.allowed)).toBe(true);
  const billingRef = getDatabase(platform)
    .collection("users")
    .doc(uid)
    .collection("meta")
    .doc("billing");
  expect((await billingRef.get()).data()?.freeAiActionsUsed).toBe(1);
  const usage = {
    endpoint: "platformAssistant",
    model: "fixture",
    provider: "oso" as const,
    promptTokens: 5,
    completionTokens: 3,
    totalTokens: 8,
    isByom: false,
  };
  await Promise.all(
    Array.from({ length: 5 }, () =>
      recordAiUsage(platform, uid, usage, "one-step"),
    ),
  );
  const billing = (await billingRef.get()).data();
  expect(billing?.lifetimeAiTokensUsed).toBe(8);
  expect(billing?.freeAiTokensUsed).toBe(8);
});
it("archive undo is revision checked and cannot undo another account’s action", async () => {
  const t = (await api("/threads", {})).data;
  await repo.transaction(uid, async (tx) => {
    tx.set("jobs", "undo-job", {
      id: "undo-job",
      stage: "Archive",
      archivedFromStage: "Intake",
      revision: 2,
    });
    tx.set("assistantSteps", "undo-step", {
      id: "undo-step",
      threadId: t.id,
      tool: "archive_job",
      state: "succeeded",
      result: { id: "undo-job", revision: 2 },
    });
  });
  expect(
    (
      await api(
        "/steps/undo-step/undo",
        { hasUnsavedChanges: false },
        { token: other },
      )
    ).status,
  ).toBe(409);
  expect(
    (await api("/steps/undo-step/undo", { hasUnsavedChanges: true })).status,
  ).toBe(409);
  expect(
    (await api("/steps/undo-step/undo", { hasUnsavedChanges: false })).status,
  ).toBe(200);
  expect((await repo.read(uid, "jobs", "undo-job"))?.stage).toBe("Intake");
  await api("/steps/undo-step/undo", { hasUnsavedChanges: false });
  expect((await repo.read(uid, "jobs", "undo-job"))?.revision).toBe(3);
});
it("message pagination never returns another thread’s messages", async () => {
  const t = (await api("/threads", {})).data,
    otherThread = (await api("/threads", {})).data;
  await repo.transaction(uid, async (tx) => {
    for (let n = 0; n < 6; n++)
      tx.set("assistantMessages", `message${n}`, {
        id: `message${n}`,
        threadId: t.id,
        createdAt: `2026-11-13T00:00:0${n}.000Z`,
        content: `Message ${n}`,
      });
    tx.set("assistantMessages", "private-message", {
      id: "private-message",
      threadId: otherThread.id,
      createdAt: "2026-11-13T00:00:09.000Z",
      content: "Other thread",
    });
  });
  const first = (await api(`/threads/${t.id}/messages?limit=2`)).data;
  expect(first.items.map((m: any) => m.id)).toEqual(["message4", "message5"]);
  const next = (
    await api(`/threads/${t.id}/messages?limit=2&before=${first.nextCursor}`)
  ).data;
  expect(next.items.map((m: any) => m.id)).toEqual(["message2", "message3"]);
  expect(
    (await api(`/threads/${t.id}/messages?before=private-message`)).status,
  ).toBe(404);
});
