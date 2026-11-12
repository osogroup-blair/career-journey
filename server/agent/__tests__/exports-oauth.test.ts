import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { ArtifactExports, type BlobStore } from "../artifacts";
import { MemoryRepository, hash } from "../repository";
import { AgentService } from "../service";
import { AgentAuth } from "../auth";
import { OAuthAgentVerifier } from "../oauth";
import type { Principal } from "../contracts";
let repo: MemoryRepository,
  service: AgentService,
  exports: ArtifactExports,
  p: Principal,
  files: Map<string, Buffer>;
beforeEach(async () => {
  repo = new MemoryRepository();
  service = new AgentService(repo, () => true);
  files = new Map();
  const blobs: BlobStore = {
    putIfAbsent: async (path, bytes) => {
      if (!files.has(path)) files.set(path, bytes);
      return files.get(path)!;
    },
    read: async (path) => files.get(path)!,
  };
  exports = new ArtifactExports(service, blobs);
  const auth = new AgentAuth(repo, async () => true),
    c = await auth.create("alice", {
      name: "Export test",
      scopes: [
        "artifacts:read",
        "artifacts:write",
        "jobs:write",
        "applications:prepare",
      ],
    });
  p = await auth.verify(c.token);
  await repo.transaction("alice", async (tx) => {
    tx.set("careerJourney", "current", { person: { name: "Alice" } });
  });
});
async function run(n: string, a: any) {
  return (await service.invoke(p, n, a)).data;
}
async function draft(kind: "resume" | "cover_letter") {
  const job = await run("create_job", {
    idempotencyKey: `job_${kind}`,
    details: { companyName: "Example", roleTitle: "Engineer", jdText: "Build" },
  });
  const content =
    kind === "resume"
      ? {
          name: "Alice",
          contactInfo: "alice@example.org",
          summary: "Engineer",
          skills: [],
          experience: [],
          education: [],
        }
      : { content: "Dear hiring team,\n\nI would like to apply." };
  return run("create_artifact", {
    idempotencyKey: `artifact_${kind}`,
    jobId: job.id,
    document: { kind, content },
  });
}
describe("immutable private exports", () => {
  for (const kind of ["resume", "cover_letter"] as const)
    for (const format of ["pdf", "docx"] as const)
      it(`renders and retrieves ${kind} ${format}`, async () => {
        const a = await draft(kind),
          args = { artifactId: a.id, format, template: "classic" };
        const file = await run("export_artifact", args);
        expect(file.byteHash).toHaveLength(64);
        expect(file.size).toBeGreaterThan(500);
        const bytes = await exports.download(p, file.id);
        expect(
          bytes.bytes.subarray(0, format === "pdf" ? 4 : 2).toString(),
        ).toBe(format === "pdf" ? "%PDF" : "PK");
        expect((await run("export_artifact", args)).id).toBe(file.id);
        expect(files.size).toBe(1);
        expect(
          (await run("get_artifact_download", { exportId: file.id }))
            .downloadPath,
        ).toBe(`/mcp/exports/${file.id}`);
        await expect(
          exports.download({ ...p, uid: "bob" }, file.id),
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      });
  it("rejects modified stored bytes", async () => {
    const a = await draft("resume"),
      file = await run("export_artifact", { artifactId: a.id, format: "pdf" });
    files.set(`agentArtifacts/alice/${file.id}.pdf`, Buffer.from("tampered"));
    await expect(exports.download(p, file.id)).rejects.toMatchObject({
      code: "INTEGRITY_ERROR",
    });
  });
  it("pins exact exported bytes into a packet", async () => {
    const a = await draft("resume"),
      file = await run("export_artifact", { artifactId: a.id, format: "docx" });
    const packet = await run("prepare_application", {
      idempotencyKey: "packet",
      jobId: a.jobId,
      destination: "https://example.org/apply",
      artifactIds: [a.id],
      exportIds: [file.id],
    });
    expect(packet.exportHashes).toEqual([file.byteHash]);
  });
});

describe("OAuth resource-server token verification", () => {
  it("requires issuer, audience, client/subject/grant binding, expiry, scopes and active account", async () => {
    const keys = await generateKeyPair("RS256");
    const jwk = await exportJWK(keys.publicKey);
    jwk.kid = "test";
    const resolver = createLocalJWKSet({ keys: [jwk] }),
      config = {
        issuer: "https://auth.example.org",
        audience: "https://app.example.org/mcp",
        jwksUrl: "https://auth.example.org/jwks",
      };
    const auth = new AgentAuth(repo, async () => true),
      c = await auth.create("alice", {
        name: "OAuth",
        scopes: ["journey:read"],
        oauthSubject: "provider-subject",
        oauthClientId: "trusted-client",
      });
    const token = async (extra: any = {}) =>
      new SignJWT({
        cj_uid: "alice",
        cj_connection_id: c.connection.id,
        client_id: "trusted-client",
        scope: "journey:read jobs:write",
        ...extra,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test" })
        .setIssuer(config.issuer)
        .setAudience(config.audience)
        .setSubject("provider-subject")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(keys.privateKey);
    const verifier = new OAuthAgentVerifier(
      repo,
      config,
      async () => true,
      resolver,
    );
    expect((await verifier.verify(await token())).scopes).toEqual([
      "journey:read",
    ]);
    await expect(
      verifier.verify(await token({ client_id: "attacker" })),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(
      verifier.verify(await token({ cj_uid: "bob" })),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(
      new OAuthAgentVerifier(
        repo,
        { ...config, audience: "https://wrong.example/mcp" },
        async () => true,
        resolver,
      ).verify(await token()),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(
      new OAuthAgentVerifier(repo, config, async () => false, resolver).verify(
        await token(),
      ),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await auth.revoke("alice", c.connection.id);
    await expect(verifier.verify(await token())).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });
});
