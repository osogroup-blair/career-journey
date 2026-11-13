/** Explicit isolated cloud verification. Never reads or changes a real user's career data. */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { getAuth } from "../platform/auth";
import { getDatabase } from "../platform/database";
import { getStorage } from "../platform/storage";
import { getPlatformApp } from "../platform";
import { registerAgentPlatform } from "../agent";
import { SqliteRepository, hash } from "../agent/repository";
import { AgentService } from "../agent/service";
import { PreparationOperations, PREPARATION_KINDS } from "../agent/operations";
import { PlatformPreparationRunner } from "../agent/preparationRunner";
import {
  getSampleCareerJourney,
  SAMPLE_INPUTS,
} from "../ai/promptSampleInputs";
import { SCOPES } from "../agent/contracts";

if (!process.argv.includes("--live"))
  throw new Error(
    "Use --live to create and remove an isolated self-hosted test account. --ai additionally makes seven real platform AI calls.",
  );
const admin = getPlatformApp();
if (!admin) throw new Error("self-hosted Admin configuration required");
const uid = `mcp-verify-${randomUUID()}`,
  db = getDatabase(admin),
  localAuth = getAuth(admin);
let server: ReturnType<express.Express["listen"]> | undefined;
let created = false;
const report: string[] = [];
try {
  await localAuth.createUser({
    uid,
    displayName: "Temporary MCP verification account",
    emailVerified: true,
    email: `${uid}@example.invalid`,
    password: `Test-${uid}-secret`,
  });
  created = true;
  const journey = getSampleCareerJourney("generateResume");
  await db
    .collection("users")
    .doc(uid)
    .collection("careerJourney")
    .doc("current")
    .set(journey);
  const originalHash = hash(journey);
  const {token:idToken}=await localAuth.signIn(`${uid}@example.invalid`,`Test-${uid}-secret`);
  process.env.MCP_ENABLED = "true";
  process.env.AGENT_WRITES_ENABLED = "true";
  process.env.AGENT_AI_ENABLED = "false";
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.APP_URL = url;
  registerAgentPlatform(app);
  const request = async (path: string, body: any, token = idToken) => {
    const response = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok)
      throw new Error(
        `Verification endpoint ${path} failed (${response.status})`,
      );
    return response.json() as Promise<any>;
  };
  const connection = await request("/api/agent/connections", {
    name: "Isolated endpoint test harness",
    scopes: SCOPES,
    expiresInDays: 1,
  });
  report.push("Local account authentication and scoped connection creation");
  const mcp = async (name: string, args: any = {}) => {
    const response = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${connection.token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    if (!response.ok)
      throw new Error(`MCP ${name} failed (${response.status})`);
    const result = (await response.json()) as any;
    if (result.error || result.result?.isError)
      throw new Error(`MCP ${name} returned tool/protocol error`);
    return result.result.structuredContent.data;
  };
  await mcp("get_career_journey");
  report.push("Authenticated MCP canonical read");
  const job = await mcp("create_job", {
    idempotencyKey: "create",
    details: {
      companyName: "Verification Example",
      roleTitle: "Senior Engineer",
      jdText:
        "Senior Software Engineer. Requires Python, backend services, and a Computer Science degree.",
      jobLink: "https://example.org/jobs/test",
    },
  });
  const content = {
    name: "Sample Candidate",
    contactInfo: "sample@example.com",
    summary: "Software engineer",
    skills: [],
    experience: [],
    education: [],
  };
  const artifact = await mcp("create_artifact", {
    idempotencyKey: "artifact",
    jobId: job.id,
    document: { kind: "resume", content },
  });
  report.push("SQLite transactional job and immutable artifact writes");
  for (const format of ["pdf", "docx"]) {
    const file = await mcp("export_artifact", {
      artifactId: artifact.id,
      format,
    });
    const response = await fetch(`${url}${file.downloadPath}`, {
      headers: { Authorization: `Bearer ${connection.token}` },
    });
    if (!response.ok) throw new Error(`Private ${format} download failed`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== file.size) throw new Error("Export size mismatch");
    report.push(`Private storage ${format} render and authenticated download`);
  }
  const packet = await mcp("prepare_application", {
    idempotencyKey: "packet",
    jobId: job.id,
    destination: "https://example.org/apply",
    artifactIds: [artifact.id],
  });
  await mcp("preflight_application", { packetId: packet.id });
  await mcp("record_external_application", {
    idempotencyKey: "report",
    packetId: packet.id,
    submittedAt: new Date().toISOString(),
    receipt: "Synthetic test receipt; no employer contacted",
  });
  report.push("Application packet, preflight and synthetic report");
  if (process.argv.includes("--ai")) {
    const repo = new SqliteRepository(db),
      service = new AgentService(repo, () => true),
      operations = new PreparationOperations(
        service,
        new PlatformPreparationRunner(admin),
        () => true,
      );
    const principal = { type: "user" as const, uid, scopes: [] };
    for (const kind of PREPARATION_KINDS) {
      let current = await repo.read(uid, "jobs", job.id);
      if (
        ["resumeStrategy", "generateResume"].includes(kind) &&
        !current!.ratingFinalizedAt
      ) {
        await service.invoke(principal, "finalize_rating", {
          jobId: job.id,
          expectedRevision: current!.revision,
          idempotencyKey: "finalize",
        });
        current = await repo.read(uid, "jobs", job.id);
      }
      const response = await service.invoke(principal, "run_preparation", {
        jobId: job.id,
        expectedRevision: current!.revision,
        kind,
        idempotencyKey: `live_${kind}`,
      });
      await operations.execute(uid, response.data.operationId);
      const result = await service.invoke(principal, "get_operation", {
        operationId: response.data.operationId,
      });
      if (result.data.state !== "succeeded")
        throw new Error(
          `Real AI ${kind} did not succeed: ${result.data.error?.code}`,
        );
      report.push(`Real platform AI: ${kind}`);
      console.log(`Verified AI step: ${kind}`);
    }
  }
  if (
    hash(
      (
        await db
          .collection("users")
          .doc(uid)
          .collection("careerJourney")
          .doc("current")
          .get()
      ).data(),
    ) !== originalHash
  )
    throw new Error("Canonical Career Journey changed");
  report.push("Canonical Career Journey unchanged");
  await request(
    `/api/agent/connections/${connection.connection.id}/revoke`,
    {},
  );
  const revoked = await fetch(`${url}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.token}`,
    },
    body: "{}",
  });
  if (revoked.status !== 401) throw new Error("Revoked connection accepted");
  report.push("Connection revocation enforced");
  console.log(report.map((s) => `PASS ${s}`).join("\n"));
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  if (created) {
    if (true)
      await getStorage(admin)
        .bucket()
        .deleteFiles({ prefix: `agentArtifacts/${uid}/` });
    await db.recursiveDelete(db.collection("users").doc(uid));
    await localAuth.deleteUser(uid);
    console.log("Removed isolated verification account and files");
  }
}
