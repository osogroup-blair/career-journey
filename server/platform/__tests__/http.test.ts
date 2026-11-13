import { beforeAll, afterAll, it, expect } from "vitest";
import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { getAuth } from "../auth";
import { getDatabase } from "../database";
let server: Server,
  url: string,
  directory: string,
  platform: any,
  cookie: string;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "cj-http-"));
  process.env.DATA_DIR = directory;
  process.env.ALLOW_HTTP_LOCAL = "true";
  const { getPlatformApp } = await import("../../platform");
  platform = getPlatformApp();
  await getAuth(platform).createUser({
    email: "alice@example.org",
    password: "Alice-local-password",
    emailVerified: true,
    customClaims: { admin: true },
  });
  const { registerPlatformRoutes } = await import("../routes");
  const app = express();
  app.use(express.json());
  registerPlatformRoutes(app);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.APP_URL = url;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  getDatabase(platform).close();
  await rm(directory, { recursive: true, force: true });
});
async function request(
  route: string,
  body?: any,
  headers: Record<string, string> = {},
) {
  return fetch(url + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CJ-Request": "1",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
it("uses HttpOnly SameSite sessions; protected data requires a signed-in user", async () => {
  expect((await request("/api/data/read", { collection: "jobs" })).status).toBe(
    401,
  );
  const login = await request("/api/auth/login", {
    email: "alice@example.org",
    password: "Alice-local-password",
  });
  expect(login.status).toBe(200);
  const set = login.headers.get("set-cookie")!;
  expect(set).toContain("HttpOnly");
  expect(set).toContain("SameSite=Strict");
  cookie = set.split(";")[0];
  const me = await (await request("/api/auth/session")).json();
  expect(me.email).toBe("alice@example.org");
  expect(me).not.toHaveProperty("passwordHash");
});
it("enforces CSRF and tenant-safe data routes", async () => {
  expect(
    (
      await request(
        "/api/data/write",
        {
          collection: "careerJourney",
          id: "current",
          value: { person: { name: "Alice" } },
        },
        { Origin: "https://evil.example" },
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/api/data/write",
        {
          collection: "careerJourney",
          id: "current",
          value: { person: { name: "Alice" } },
        },
        { "X-CJ-Request": "" },
      )
    ).status,
  ).toBe(403);
  expect(
    (await request("/api/data/read", { collection: "authUsers" })).status,
  ).toBe(400);
  expect(
    (await request("/api/data/read", { collection: "meta", id: "secrets" }))
      .status,
  ).toBe(400);
  expect(
    (
      await request("/api/data/write", {
        collection: "careerJourney",
        id: "current",
        value: { person: { name: "Alice" } },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await (
        await request("/api/data/read", {
          collection: "careerJourney",
          id: "current",
        })
      ).json()
    ).person.name,
  ).toBe("Alice");
  expect(
    (
      await request("/api/data/write", {
        uid: "bob",
        collection: "careerJourney",
        id: "current",
        value: {},
      })
    ).status,
  ).toBe(400);
});
it("revokes cookie sessions on logout and rejects agent credentials on canonical writer", async () => {
  expect(
    (
      await request(
        "/api/data/write",
        { collection: "careerJourney", id: "current", value: {} },
        { Authorization: "Bearer cj_agent.fake" },
      )
    ).status,
  ).toBe(401);
  expect((await request("/api/auth/logout", {})).status).toBe(200);
  expect((await request("/api/auth/session")).status).toBe(401);
});
