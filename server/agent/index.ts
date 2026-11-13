import { getStorage } from "../platform/storage";
import { ArtifactExports, BucketBlobStore } from "./artifacts";
import { DomainError } from "./contracts";
import { PreparationOperations } from "./operations";
import { PlatformPreparationRunner } from "./preparationRunner";
import type express from "express";
import { OAuthAgentVerifier } from "./oauth";
import { SCOPES } from "./contracts";
import { getAuth } from "../platform/auth";
import { getDatabase } from "../platform/database";
import { getPlatformApp, requireUser } from "../platform";
import { SqliteRepository } from "./repository";
import { AgentAuth } from "./auth";
import { AgentService } from "./service";
import { createMcpRouter, createPlatformRouter } from "./http";

export function registerAgentPlatform(app: express.Express) {
  // Lazy initialization: dotenv is loaded by the host before this function runs.
  const admin = getPlatformApp();
  const repo = new SqliteRepository(getDatabase(admin));
  const auth = new AgentAuth(repo, async (uid) => {
    try {
      const user = await getAuth(admin).getUser(uid);
      return !user.disabled && user.emailVerified;
    } catch {
      return false;
    }
  });
  const oauthConfig =
    process.env.MCP_OAUTH_ISSUER &&
    process.env.MCP_OAUTH_AUDIENCE &&
    process.env.MCP_OAUTH_JWKS_URL
      ? {
          issuer: process.env.MCP_OAUTH_ISSUER,
          audience: process.env.MCP_OAUTH_AUDIENCE,
          jwksUrl: process.env.MCP_OAUTH_JWKS_URL,
        }
      : null;
  const oauth = oauthConfig
    ? new OAuthAgentVerifier(repo, oauthConfig, async (uid) => {
        try {
          const user = await getAuth(admin).getUser(uid);
          return !user.disabled && user.emailVerified;
        } catch {
          return false;
        }
      })
    : null;
  if (oauthConfig) {
    app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
      res.json({
        resource: oauthConfig.audience,
        authorization_servers: [oauthConfig.issuer],
        scopes_supported: SCOPES,
        bearer_methods_supported: ["header"],
      });
    });
  }
  const verifier = {
    verify: (token: string) =>
      token.startsWith("cj_agent.")
        ? auth.verify(token)
        : oauth
          ? oauth.verify(token)
          : Promise.reject(
              new DomainError("INVALID_TOKEN", "OAuth is not configured", 401),
            ),
  };
  const service = new AgentService(
    repo,
    () => process.env.AGENT_WRITES_ENABLED === "true",
  );
  const operations = new PreparationOperations(
    service,
    new PlatformPreparationRunner(admin),
    () => process.env.AGENT_AI_ENABLED === "true",
  );
  // Recovery scans are opt-in with the AI worker; a missing index fails visibly in logs.
  if (process.env.AGENT_AI_ENABLED === "true") {
    let busy = false;
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const db = getDatabase(admin);
        const queued = await db
          .collectionGroup("agentOperations")
          .where("state", "==", "queued")
          .limit(10)
          .get();
        for (const doc of queued.docs) {
          const uid = doc.ref.parent.parent?.id;
          if (uid) await operations.execute(uid, doc.id);
        }
        const running = await db
          .collectionGroup("agentOperations")
          .where("state", "==", "running")
          .limit(25)
          .get();
        for (const doc of running.docs) {
          const uid = doc.ref.parent.parent?.id;
          if (uid) await operations.markInterrupted(uid, doc.id);
        }
      } catch (e) {
        console.error(
          "Agent preparation worker failed",
          e instanceof Error ? e.name : "unknown",
        );
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, 5000);
    timer.unref();
  }
  const exports = new ArtifactExports(
    service,
    new BucketBlobStore(getStorage(admin).bucket()),
  );
  app.use(
    "/mcp",
    createMcpRouter(
      service,
      verifier,
      () => process.env.MCP_ENABLED === "true",
      () => process.env.APP_URL,
      exports,
    ),
  );
  app.use(
    "/api/agent",
    requireUser,
    async (req, res, next) => {
      // Unlike the legacy middleware, this API never allows an absent user in development.
      const uid = (req as any).uid;
      if (!uid) {
        res.status(401).json({ error: "Sign in required" });
        return;
      }
      try {
        const u = await getAuth(admin).getUser(uid);
        if (u.disabled) {
          res.status(403).json({ error: "Account disabled" });
          return;
        }
        next();
      } catch {
        res.status(401).json({ error: "Account unavailable" });
      }
    },
    createPlatformRouter(repo, service, auth, exports),
  );
}
