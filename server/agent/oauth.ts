import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { DomainError, id, type Principal } from "./contracts";
import type { Repository } from "./repository";
export interface OAuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
}
/** Resource-server verification only. The configured authorization server owns login, consent and PKCE. */
export class OAuthAgentVerifier {
  private key: JWTVerifyGetKey;
  constructor(
    private repo: Repository,
    private config: OAuthConfig,
    private accountActive: (uid: string) => Promise<boolean>,
    key?: JWTVerifyGetKey,
  ) {
    for (const url of [config.issuer, config.audience, config.jwksUrl])
      if (new URL(url).protocol !== "https:")
        throw new Error("OAuth URLs must use HTTPS");
    this.key = key ?? createRemoteJWKSet(new URL(config.jwksUrl));
  }
  async verify(token: string): Promise<Principal> {
    let payload;
    try {
      payload = (
        await jwtVerify(token, this.key, {
          issuer: this.config.issuer,
          audience: this.config.audience,
          algorithms: ["RS256", "ES256"],
          requiredClaims: [
            "sub",
            "exp",
            "iat",
            "cj_uid",
            "cj_connection_id",
            "client_id",
          ],
        })
      ).payload;
    } catch {
      throw new DomainError(
        "INVALID_TOKEN",
        "OAuth token invalid or expired",
        401,
      );
    }
    const uid = id.safeParse(payload.cj_uid),
      connectionId = id.safeParse(payload.cj_connection_id);
    if (
      !uid.success ||
      !connectionId.success ||
      typeof payload.scope !== "string"
    )
      throw new DomainError(
        "INVALID_TOKEN",
        "Missing delegated grant binding",
        401,
      );
    if (!(await this.accountActive(uid.data)))
      throw new DomainError("INVALID_TOKEN", "Account unavailable", 401);
    return this.repo.transaction(uid.data, async (tx) => {
      const grant = await tx.get("agentConnections", connectionId.data);
      if (
        !grant ||
        grant.revokedAt ||
        Date.parse(grant.expiresAt) <= Date.now() ||
        grant.oauthSubject !== payload.sub ||
        grant.oauthClientId !== payload.client_id
      )
        throw new DomainError("INVALID_TOKEN", "OAuth grant unavailable", 401);
      const minute = Math.floor(Date.now() / 60000),
        count = grant.rateMinute === minute ? (grant.rateCount ?? 0) : 0;
      if (count >= 60)
        throw new DomainError(
          "RATE_LIMITED",
          "Connection request limit reached",
          429,
        );
      tx.set("agentConnections", connectionId.data, {
        ...grant,
        rateMinute: minute,
        rateCount: count + 1,
        lastUsedAt: new Date().toISOString(),
      });
      return {
        type: "agent",
        uid: uid.data,
        connectionId: connectionId.data,
        scopes: payload.scope
          .split(" ")
          .filter((scope: string) => grant.scopes.includes(scope)),
      };
    });
  }
}
