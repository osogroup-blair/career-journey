import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { ArtifactExports } from "./artifacts";
import { AgentAuth } from "./auth";
import { AgentService } from "./service";
import { DomainError, id, type Principal } from "./contracts";
import { checkRevision, hash, type Repository } from "./repository";

export function sendError(res: express.Response, e: unknown) {
  if (e instanceof DomainError) {
    res.status(e.status).json({ error: e.message, code: e.code });
    return;
  }
  if (e instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid input", code: "INVALID_INPUT" });
    return;
  }
  console.error(
    "Agent platform request failed",
    e instanceof Error ? e.name : "unknown",
  );
  res.status(500).json({ error: "Request failed", code: "INTERNAL_ERROR" });
}
export function createMcpRouter(
  service: AgentService,
  auth: Pick<AgentAuth, "verify">,
  enabled: () => boolean,
  origin: () => string | undefined,
  exports?: ArtifactExports,
) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    if (!enabled()) {
      res
        .status(503)
        .json({
          error: "Agent access is disabled",
          code: "FEATURE_UNAVAILABLE",
        });
      return;
    }
    // Trust configured canonical host only, never arbitrary forwarded host headers.
    let canonical: URL;
    try {
      canonical = new URL(origin() ?? "");
    } catch {
      res
        .status(503)
        .json({ error: "Canonical application URL is not configured" });
      return;
    }
    if (
      req.headers.host !== canonical.host ||
      (req.headers.origin && req.headers.origin !== canonical.origin)
    ) {
      res.status(403).json({ error: "Untrusted host or origin" });
      return;
    }
    try {
      const bearer = req.headers.authorization;
      if (!bearer?.startsWith("Bearer "))
        throw new DomainError(
          "INVALID_TOKEN",
          "Agent bearer token required",
          401,
        );
      (req as any).agentPrincipal = await auth.verify(bearer.slice(7));
      next();
    } catch (e) {
      if (e instanceof DomainError && e.status === 401)
        res.setHeader("WWW-Authenticate", 'Bearer realm="career-journey"');
      sendError(res, e);
    }
  });
  router.get("/exports/:id", async (req, res) => {
    try {
      if (!exports)
        throw new DomainError(
          "FEATURE_UNAVAILABLE",
          "Artifact storage unavailable",
          503,
        );
      const result = await exports.download(
        (req as any).agentPrincipal,
        id.parse(req.params.id),
      );
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.row.id}.${result.row.format}"`,
      );
      res.type(result.row.mime).send(result.bytes);
    } catch (e) {
      sendError(res, e);
    }
  });
  router.post("/", async (req, res) => {
    const p = (req as any).agentPrincipal as Principal;
    const server = new McpServer({ name: "career-journey", version: "0.1.0" });
    for (const [name, t] of Object.entries(service.tools)) {
      if (t.scope && !p.scopes.includes(t.scope)) continue;
      server.registerTool(
        name,
        {
          description: t.description,
          inputSchema: t.schema,
          annotations: {
            readOnlyHint: !t.write,
            destructiveHint: !!t.write,
            openWorldHint: false,
          },
        },
        async (args: any) => {
          try {
            const output = await service.invoke(p, name, args);
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(output) },
              ],
              structuredContent: output,
            };
          } catch (e) {
            const output = {
              code: e instanceof DomainError ? e.code : "INTERNAL_ERROR",
              error: e instanceof DomainError ? e.message : "Tool failed",
            };
            return {
              isError: true,
              content: [
                { type: "text" as const, text: JSON.stringify(output) },
              ],
            };
          }
        },
      );
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) sendError(res, e);
    }
  });
  router.all("/", (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Use stateless MCP POST requests" });
  });
  return router;
}

/** Human-authenticated API. Caller must provide fail-closed local-session middleware. */
export function createPlatformRouter(
  repo: Repository,
  service: AgentService,
  auth: AgentAuth,
  exports?: ArtifactExports,
) {
  const router = express.Router();
  const user = (req: express.Request): Principal => ({
    type: "user",
    uid: (req as any).uid,
    scopes: [],
  });
  const route = (
    method: "get" | "post",
    path: string,
    run: (req: express.Request) => Promise<any>,
  ) =>
    router[method](path, async (req, res) => {
      try {
        res.json(await run(req));
      } catch (e) {
        sendError(res, e);
      }
    });
  router.get("/exports/:id", async (req, res) => {
    try {
      if (!exports)
        throw new DomainError(
          "FEATURE_UNAVAILABLE",
          "Artifact storage unavailable",
          503,
        );
      const result = await exports.download(user(req), id.parse(req.params.id));
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.row.id}.${result.row.format}"`,
      );
      res.type(result.row.mime).send(result.bytes);
    } catch (e) {
      sendError(res, e);
    }
  });
  route("get", "/connections", (req) => auth.list(user(req).uid));
  route("post", "/connections", (req) => auth.create(user(req).uid, req.body));
  route("post", "/connections/:id/revoke", (req) =>
    auth.revoke(user(req).uid, id.parse(req.params.id)),
  );
  route("get", "/catalog", async () =>
    Object.entries(service.tools).map(([name, t]) => ({
      name,
      scope: t.scope,
      write: !!t.write,
      description: t.description,
    })),
  );
  route("post", "/commands/:name", (req) =>
    service.invoke(user(req), req.params.name, req.body),
  );
  // Compatibility CAS for the current UI; agent credentials cannot enter this router.
  route("post", "/save", async (req) => {
    const a = z
      .object({
        collection: z.enum(["jobs", "matches"]),
        expectedRevision: z.number().int().nonnegative(),
        value: z.record(z.string(), z.unknown()),
        requestId: id,
      })
      .strict()
      .parse(req.body);
    const key = id.parse(a.value.id);
    if (Buffer.byteLength(JSON.stringify(a.value)) > 700_000)
      throw new DomainError("LIMIT_EXCEEDED", "Record exceeds size limit");
    return repo.transaction(user(req).uid, async (tx) => {
      const commandId = hash({ ui: a.requestId }),
        prior = await tx.get("agentCommands", commandId),
        fingerprint = hash(a);
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new DomainError(
            "IDEMPOTENCY_CONFLICT",
            "Request ID reused",
            409,
          );
        return prior.result;
      }
      const previous = await tx.get(a.collection, key);
      checkRevision(previous ?? { revision: 0 }, a.expectedRevision);
      const value: Record<string, any> = {
        ...a.value,
        revision: a.expectedRevision + 1,
        updatedAt: new Date().toISOString(),
      };
      if (a.collection === "jobs") {
        const journey = await tx.get("careerJourney", "current");
        const refs = { ...(previous?.currentArtifactIds ?? {}) };
        for (const [field, kind] of [
          ["resume", "resume"],
          ["coverLetter", "cover_letter"],
        ] as const) {
          if (!value[field]) continue;
          const content =
            kind === "resume"
              ? value[field]
              : { content: value[field].content };
          const contentHash = hash({ kind, content }),
            artifactId = hash({ jobId: key, kind, contentHash });
          const existing = await tx.get("agentArtifacts", artifactId);
          if (!existing)
            tx.set("agentArtifacts", artifactId, {
              id: artifactId,
              jobId: key,
              kind,
              content,
              contentHash,
              familyId: hash({ jobId: key, kind }),
              parentId: refs[kind] ?? null,
              journeyHash: hash(journey),
              jobRevision: a.expectedRevision,
              author: { type: "user" },
              verification: "user_draft",
              createdAt: new Date().toISOString(),
            });
          refs[kind] = artifactId;
        }
        value.currentArtifactIds = refs;
      }
      tx.set(a.collection, key, value);
      tx.set("agentCommands", commandId, {
        fingerprint,
        result: value,
        createdAt: new Date().toISOString(),
      });
      return value;
    });
  });
  route("post", "/delete", async (req) => {
    const a = z
      .object({
        collection: z.enum(["jobs", "matches"]),
        id,
        expectedRevision: z.number().int().nonnegative(),
      })
      .strict()
      .parse(req.body);
    return repo.transaction(user(req).uid, async (tx) => {
      const row = await tx.get(a.collection, a.id);
      if (!row) throw new DomainError("NOT_FOUND", "Record not found", 404);
      checkRevision(row, a.expectedRevision);
      tx.remove(a.collection, a.id);
      return { deleted: true };
    });
  });
  return router;
}
