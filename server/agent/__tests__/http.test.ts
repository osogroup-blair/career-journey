import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MemoryRepository } from "../repository";
import { AgentAuth } from "../auth";
import { AgentService } from "../service";
import { createMcpRouter, createPlatformRouter } from "../http";
import { ArtifactExports } from "../artifacts";
import { SCOPES } from "../contracts";

let server: Server,
  url: string,
  repo: MemoryRepository,
  auth: AgentAuth,
  service: AgentService,
  token: string,
  enabled = true,
  artifactExports: ArtifactExports;
const headers = { "Content-Type": "application/json" };
async function human(path: string, body?: any) {
  return fetch(`${url}/api/agent${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...headers, Authorization: "Bearer test-human" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function mcp(body: any, override: Record<string, string> = {}) {
  return fetch(`${url}/mcp`, {
    method: "POST",
    headers: {
      ...headers,
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
      ...override,
    },
    body: JSON.stringify(body),
  });
}
beforeAll(async () => {
  repo = new MemoryRepository();
  auth = new AgentAuth(repo, async () => true);
  service = new AgentService(repo, () => true);
  const files = new Map<string, Buffer>();
  artifactExports = new ArtifactExports(service, {
    putIfAbsent: async (k, b) => {
      if (!files.has(k)) files.set(k, b);
      return files.get(k)!;
    },
    read: async (k) => files.get(k)!,
  });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/mcp",
    createMcpRouter(
      service,
      auth,
      () => enabled,
      () => url,
      artifactExports,
    ),
  );
  // Test-only human verifier; production uses fail-closed Firebase validation.
  app.use(
    "/api/agent",
    (req, res, next) => {
      if (req.headers.authorization !== "Bearer test-human") {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      (req as any).uid = "alice";
      next();
    },
    createPlatformRouter(repo, service, auth, artifactExports),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const c = await (
    await human("/connections", { name: "HTTP test", scopes: SCOPES })
  ).json();
  token = c.token;
  await repo.transaction("alice", async (tx) => {
    tx.set("careerJourney", "current", { person: { name: "Candidate" } });
  });
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
});

describe("real HTTP endpoints before agent onboarding", () => {
  it("rejects missing human identity and agent credentials on human endpoints", async () => {
    for (const path of ["/connections", "/catalog"])
      expect((await fetch(`${url}/api/agent${path}`)).status).toBe(401);
    expect(
      (
        await fetch(`${url}/api/agent/connections`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(401);
  });
  it("creates, lists and revokes a connection without returning stored secrets", async () => {
    const response = await human("/connections", {
      name: "Temporary",
      scopes: ["jobs:read"],
    });
    expect(response.status).toBe(200);
    const c = await response.json();
    const listed = await (await human("/connections")).json();
    expect(
      listed.find((x: any) => x.id === c.connection.id),
    ).not.toHaveProperty("tokenHash");
    expect(
      (await human(`/connections/${c.connection.id}/revoke`, {})).status,
    ).toBe(200);
    expect(
      (
        await mcp(
          { jsonrpc: "2.0", id: 1, method: "tools/list" },
          { Authorization: `Bearer ${c.token}` },
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await human("/connections", {
          name: "Escalate",
          scopes: ["journey:write"],
        })
      ).status,
    ).toBe(400);
  });
  it("lists human command catalog and rejects unknown/invalid commands", async () => {
    expect((await (await human("/catalog")).json()).length).toBeGreaterThan(20);
    expect((await human("/commands/patchJourney", {})).status).toBe(404);
    expect((await human("/commands/create_job", { uid: "bob" })).status).toBe(
      400,
    );
  });
  it("CAS saves and deletes existing UI records; rejects stale versions", async () => {
    const value = {
      id: "ui_job",
      companyName: "Example",
      roleTitle: "Engineer",
      jdText: "Description",
      stage: "Intake",
    };
    const input = {
      collection: "jobs",
      expectedRevision: 0,
      value,
      requestId: "save_1",
    };
    let response = await human("/save", input);
    expect(response.status).toBe(200);
    expect((await response.json()).revision).toBe(1);
    expect((await human("/save", input)).status).toBe(200);
    expect(
      (await human("/save", { ...input, requestId: "save_2" })).status,
    ).toBe(409);
    expect(
      (await human("/save", { ...input, collection: "careerJourney" })).status,
    ).toBe(400);
    expect(
      (
        await human("/delete", {
          collection: "jobs",
          id: value.id,
          expectedRevision: 0,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await human("/delete", {
          collection: "jobs",
          id: value.id,
          expectedRevision: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await human("/delete", {
          collection: "jobs",
          id: value.id,
          expectedRevision: 1,
        })
      ).status,
    ).toBe(404);
  });
  it("MCP rejects unauthenticated, wrong-origin and disabled requests", async () => {
    const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    expect((await mcp(body, { Authorization: "" })).status).toBe(401);
    expect(
      (await mcp(body, { Origin: "https://attacker.example" })).status,
    ).toBe(403);
    enabled = false;
    expect((await mcp(body)).status).toBe(503);
    enabled = true;
    expect(
      (
        await fetch(`${url}/mcp`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(405);
  });
  it("connects a protocol test client, discovers scoped tools and executes workflow", async () => {
    const client = new Client({
      name: "endpoint-test-harness",
      version: "1.0.0",
    });
    const transport = new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.some((t) => t.name === "get_career_journey")).toBe(
      true,
    );
    expect(listed.tools.some((t) => t.name === "patchJourney")).toBe(false);
    const read = await client.callTool({
      name: "get_career_journey",
      arguments: {},
    });
    expect(read.isError).not.toBe(true);
    expect((read.structuredContent as any).data.readOnly).toBe(true);
    const created = await client.callTool({
      name: "create_job",
      arguments: {
        idempotencyKey: "mcp_create",
        details: {
          companyName: "Protocol",
          roleTitle: "Engineer",
          jdText: "Build APIs",
        },
      },
    });
    expect(created.isError).not.toBe(true);
    const invalid = await client.callTool({
      name: "update_job_details",
      arguments: {
        jobId: "missing",
        expectedRevision: 0,
        idempotencyKey: "mcp_edit",
        details: { roleTitle: "Edit" },
      },
    });
    expect(invalid.isError).toBe(true);
    await client.close();
  });
  it("serves private export bytes through both authenticated download endpoints", async () => {
    const invoke = async (name: string, args: any) =>
      (await (await human(`/commands/${name}`, args)).json()).data;
    const job = await invoke("create_job", {
      idempotencyKey: "download_job",
      details: {
        companyName: "Example",
        roleTitle: "Engineer",
        jdText: "Build",
      },
    });
    const artifact = await invoke("create_artifact", {
      idempotencyKey: "download_artifact",
      jobId: job.id,
      document: {
        kind: "cover_letter",
        content: { content: "Dear team, I would like to apply." },
      },
    });
    const file = await invoke("export_artifact", {
      artifactId: artifact.id,
      format: "pdf",
    });
    for (const [path, bearer] of [
      [`/api/agent/exports/${file.id}`, "test-human"],
      [`/mcp/exports/${file.id}`, token],
    ]) {
      const response = await fetch(`${url}${path}`, {
        headers: { Authorization: `Bearer ${bearer}` },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(
        Buffer.from(await response.arrayBuffer())
          .subarray(0, 4)
          .toString(),
      ).toBe("%PDF");
    }
    expect(
      (
        await fetch(`${url}/mcp/exports/missing`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(404);
  });
  it("filters scoped discovery and blocks guessed tool calls", async () => {
    const c = await (
      await human("/connections", { name: "Scoped", scopes: ["journey:read"] })
    ).json();
    const client = new Client({ name: "scope-test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${url}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${c.token}` } },
      }),
    );
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual([
      "get_capabilities",
      "get_career_journey",
      "search_career_evidence",
    ]);
    const bad = await client.callTool({
      name: "create_job",
      arguments: {
        idempotencyKey: "forbidden",
        details: { companyName: "X", roleTitle: "X", jdText: "X" },
      },
    });
    expect(bad.isError).toBe(true);
    await client.close();
  });
});
