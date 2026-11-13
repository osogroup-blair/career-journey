/** Isolated real-provider and HTTP acceptance check. Uses fictional data only. */
import "dotenv/config";
import express from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformApp } from "../platform";
import { getAuth } from "../platform/auth";
import { getDatabase } from "../platform/database";
import { registerPlatformRoutes } from "../platform/routes";
import { registerAssistant } from "../assistant";
import { assistantAuthority } from "../assistant/authority";
import { AgentService } from "../agent/service";
import { SqliteRepository } from "../agent/repository";
import { decisionSchema } from "../assistant/contracts";
import { OllamaClient } from "../ai/ollamaClient";
const dir = mkdtempSync(join(tmpdir(), "career-journey-assistant-verify-"));
process.env.DATA_DIR = dir;
process.env.ASSISTANT_ENABLED = "true";
process.env.ASSISTANT_WRITES_ENABLED = "true";
process.env.ASSISTANT_JOURNEY_PROPOSALS_ENABLED = "true";
process.env.ASSISTANT_TURN_SECONDS = "180";
const platform = getPlatformApp(),
  db = getDatabase(platform),
  auth = getAuth(platform),
  repo = new SqliteRepository(db);
const app = express();
app.use(express.json());
registerPlatformRoutes(app);
const bundle = registerAssistant(
  app,
  platform,
  new AgentService(repo, () => false, assistantAuthority(platform, repo)),
);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
let token = "";
const context = {
  schemaVersion: 1,
  pathname: "/job/job1/intake",
  jobId: "job1",
  contextVersion: 0,
  hasUnsavedChanges: false,
  timezone: "America/Denver",
};
async function api(path: string, body?: any) {
  const response = await fetch(`${base}/api/assistant${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CJ-Request": "1",
      Cookie: `cj_session=${token}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(`${path}: ${response.status} ${value.error}`);
  return value;
}
try {
  const user = await auth.createUser({
    email: "assistant-verification@example.invalid",
    password: "Fictional-verification-Only-2026",
    emailVerified: true,
  });
  token = (await auth.signIn(user.email, "Fictional-verification-Only-2026"))
    .token;
  await repo.transaction(user.uid, async (tx) => {
    tx.set("jobs", "job1", {
      id: "job1",
      companyName: "Fictional Acme",
      roleTitle: "Platform Engineer",
      stage: "Intake",
      revision: 1,
      jdText: "Build reliable TypeScript services.",
    });
    tx.set("careerJourney", "current", {
      meta: { owner: "Fictional Candidate", version: "1.0" },
      person: { name: "Fictional Candidate" },
      roles: [],
      achievements: [],
      skills_index: [],
    });
    tx.set("meta", "billing", { plan: "free", comped: true });
  });
  const thread = await api("/threads", { title: "Isolated acceptance" });
  const readRun = await api(`/threads/${thread.id}/turns`, {
    text: "Read this job, then tell me its company, role, stage, and what the Intake page is for. Do not change any data.",
    context,
    requestId: "read-only",
  });
  const wait = async (runId: string) => {
    const deadline = Date.now() + 190000;
    while (Date.now() < deadline) {
      const snapshot = await api(`/threads/${thread.id}`);
      const run = snapshot.runs.find((r: any) => r.id === runId);
      if (
        run &&
        [
          "succeeded",
          "failed",
          "unknown",
          "needs_input",
          "awaiting_approval",
        ].includes(run.state)
      )
        return { snapshot, run };
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Timed out waiting for assistant");
  };
  const first = await wait(readRun.runId);
  if (first.run.state !== "succeeded")
    throw new Error(
      `Read-only run: ${first.run.state} ${first.run.error?.message ?? ""}`,
    );
  if (!first.snapshot.events.some((e: any) => e.tool === "get_job"))
    throw new Error("Assistant did not read the saved job");
  console.log(
    "PASS: real platform planner -> owned job tool -> grounded answer",
  );
  const archiveRun = await api(`/threads/${thread.id}/turns`, {
    text: "Archive this Fictional Acme job as Position Filled. This is my explicit request to make that routine change.",
    context,
    requestId: "archive",
    allowRoutineChanges: true,
  });
  const second = await wait(archiveRun.runId);
  if (second.run.state !== "succeeded")
    throw new Error(
      `Archive run: ${second.run.state} ${second.run.error?.message ?? ""}`,
    );
  if ((await repo.read(user.uid, "jobs", "job1"))?.stage !== "Archive")
    throw new Error("Job was not archived");
  console.log(
    "PASS: real planner -> revision-checked archive -> persisted state",
  );
  if (process.argv.includes("--ollama")) {
    const client = new OllamaClient(
      process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      process.env.OLLAMA_DEFAULT_MODEL || "qwen3:14b",
    );
    const response = await client.generateStructured({
      systemPrompt:
        "Return a valid assistant decision. No tools are available.",
      prompt:
        "Say hello as an answer. Include kind, message, tool and argumentsJson.",
      schema: decisionSchema,
      signal: AbortSignal.timeout(90000),
      maxOutputTokens: 512,
    });
    if (response.data.kind !== "answer")
      throw new Error("Ollama decision failed");
    console.log("PASS: real Ollama assistant schema");
  }
  console.log(
    "PASS: disposable account, session, SQLite data and provider tool loop. No employers contacted.",
  );
} finally {
  bundle.close();
  await new Promise<void>((r) => server.close(() => r()));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
