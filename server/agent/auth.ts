import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { connectionInput, DomainError, type Principal } from "./contracts";
import { hash, type Repository } from "./repository";

/** Explicit manual bearer connection for the private beta. Not an OAuth authorization server. */
export class AgentAuth {
  constructor(
    private repo: Repository,
    private accountActive: (uid: string) => Promise<boolean>,
  ) {}
  async create(uid: string, input: unknown) {
    const a = connectionInput.parse(input);
    if (Boolean(a.oauthSubject) !== Boolean(a.oauthClientId))
      throw new DomainError(
        "INVALID_INPUT",
        "OAuth subject and client must be supplied together",
      );
    const key = randomUUID(),
      secret = randomBytes(32).toString("base64url");
    const connection = {
      id: key,
      name: a.name,
      scopes: [...new Set(a.scopes)],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(
        Date.now() + a.expiresInDays * 86400000,
      ).toISOString(),
      revokedAt: null,
      ...(a.oauthSubject
        ? { oauthSubject: a.oauthSubject, oauthClientId: a.oauthClientId }
        : {}),
    };
    await this.repo.transaction(uid, async (tx) => {
      tx.set("agentConnections", key, {
        ...connection,
        tokenHash: hash(secret),
      });
    });
    // UID is routing information only; only the random secret authenticates the connection.
    return {
      connection,
      token: `cj_agent.${Buffer.from(uid).toString("base64url")}.${key}.${secret}`,
    };
  }
  async verify(token: string): Promise<Principal> {
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "cj_agent")
      throw new DomainError("INVALID_TOKEN", "Invalid agent token", 401);
    const uid = Buffer.from(parts[1], "base64url").toString("utf8"),
      key = parts[2],
      secret = parts[3];
    if (
      !/^[\w-]{1,120}$/.test(uid) ||
      !/^[\w-]{1,120}$/.test(key) ||
      !/^[\w-]{43}$/.test(secret)
    )
      throw new DomainError("INVALID_TOKEN", "Invalid agent token", 401);
    if (!(await this.accountActive(uid)))
      throw new DomainError("INVALID_TOKEN", "Account unavailable", 401);
    return this.repo.transaction(uid, async (tx) => {
      const grant = await tx.get("agentConnections", key),
        digest = hash(secret);
      if (
        !grant ||
        typeof grant.tokenHash !== "string" ||
        grant.tokenHash.length !== digest.length ||
        !timingSafeEqual(Buffer.from(grant.tokenHash), Buffer.from(digest)) ||
        grant.revokedAt ||
        Date.parse(grant.expiresAt) <= Date.now()
      )
        throw new DomainError(
          "INVALID_TOKEN",
          "Connection invalid or expired",
          401,
        );
      const minute = Math.floor(Date.now() / 60000);
      const count = grant.rateMinute === minute ? (grant.rateCount ?? 0) : 0;
      if (count >= 60)
        throw new DomainError(
          "RATE_LIMITED",
          "Connection request limit reached",
          429,
        );
      tx.set("agentConnections", key, {
        ...grant,
        rateMinute: minute,
        rateCount: count + 1,
        lastUsedAt: new Date().toISOString(),
      });
      return { type: "agent", uid, connectionId: key, scopes: grant.scopes };
    });
  }
  async list(uid: string) {
    const rows = await this.repo.list(uid, "agentConnections", undefined, 100);
    return rows.map(({ tokenHash, rateMinute, rateCount, ...safe }) => safe);
  }
  async revoke(uid: string, key: string) {
    return this.repo.transaction(uid, async (tx) => {
      const row = await tx.get("agentConnections", key);
      if (!row) throw new DomainError("NOT_FOUND", "Connection not found", 404);
      tx.set("agentConnections", key, {
        ...row,
        revokedAt: new Date().toISOString(),
      });
      return { revoked: true };
    });
  }
}
