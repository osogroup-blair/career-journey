import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { App } from "./app";
import { getDatabase } from "./database";
const derive = (password: string, salt: string, length: number, options: any) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, length, options, (e, key) =>
      e ? reject(e) : resolve(key),
    ),
  );
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
async function passwordHash(password: string) {
  if (password.length < 12 || password.length > 256)
    throw new Error("Use a password of 12–256 characters");
  const salt = randomBytes(16).toString("hex");
  const key = (await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}
async function verifyPassword(password: string, stored: string) {
  if (password.length > 256) return false;
  const [kind, salt, value] = stored.split(":");
  if (kind !== "scrypt" || !salt || !value) return false;
  const key = (await derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return (
    value.length === 128 && timingSafeEqual(key, Buffer.from(value, "hex"))
  );
}
export class LocalAuth {
  constructor(private app: App) {}
  private get db() {
    return getDatabase(this.app);
  }
  private clean(row: any) {
    const { passwordHash, ...safe } = row;
    return safe;
  }
  async getUser(uid: string): Promise<any> {
    const s = await this.db.collection("authUsers").doc(uid).get();
    if (!s.exists)
      throw Object.assign(new Error("User not found"), {
        code: "auth/user-not-found",
      });
    return this.clean(s.data());
  }
  async getUserByEmail(email: string) {
    const s = await this.db
      .collection("authUsers")
      .where("email", "==", email.trim().toLowerCase())
      .limit(1)
      .get();
    if (s.empty)
      throw Object.assign(new Error("User not found"), {
        code: "auth/user-not-found",
      });
    return this.clean(s.docs[0].data());
  }
  async createUser(input: any) {
    const uid = input.uid || randomUUID(),
      email = (input.email || `${uid}@local.invalid`).trim().toLowerCase();
    const hash = input.password ? await passwordHash(input.password) : null;
    return this.db.runTransaction(async (tx) => {
      const users = await this.db
        .collection("authUsers")
        .where("email", "==", email)
        .limit(1)
        .get();
      const existing = await tx.get(this.db.collection("authUsers").doc(uid));
      if (!users.empty || existing.exists)
        throw Object.assign(new Error("Account already exists"), {
          code: "auth/email-already-in-use",
        });
      const row = {
        uid,
        email,
        displayName: input.displayName || "",
        emailVerified: input.emailVerified === true,
        disabled: input.disabled === true,
        customClaims: input.customClaims || {},
        passwordHash: hash,
        metadata: {
          creationTime: new Date().toISOString(),
          lastSignInTime: null,
        },
      };
      tx.set(this.db.collection("authUsers").doc(uid), row);
      return this.clean(row);
    });
  }
  async updateUser(uid: string, fields: any) {
    const safe = { ...fields };
    if (safe.password) {
      safe.passwordHash = await passwordHash(safe.password);
      delete safe.password;
    }
    await this.db.collection("authUsers").doc(uid).update(safe);
    if (fields.password || fields.disabled) await this.revokeRefreshTokens(uid);
    return this.getUser(uid);
  }
  async setCustomUserClaims(uid: string, claims: any) {
    await this.db
      .collection("authUsers")
      .doc(uid)
      .update({ customClaims: claims });
  }
  async listUsers(max = 1000, pageToken?: string) {
    let q = this.db
      .collection("authUsers")
      .orderBy("__name__")
      .limit(max + 1);
    if (pageToken) q = q.startAfter(pageToken);
    const rows = (await q.get()).docs;
    return {
      users: rows.slice(0, max).map((d) => this.clean(d.data())),
      pageToken: rows.length > max ? rows[max - 1].id : undefined,
    };
  }
  async getUsers(identifiers: { uid: string }[]) {
    const users: any[] = [],
      notFound: any[] = [];
    for (const input of identifiers) {
      try {
        users.push(await this.getUser(input.uid));
      } catch {
        notFound.push(input);
      }
    }
    return { users, notFound };
  }
  async deleteUser(uid: string) {
    await this.revokeRefreshTokens(uid);
    const actions = await this.db
      .collection("authActions")
      .where("uid", "==", uid)
      .get();
    const batch = this.db.batch();
    for (const action of actions.docs) batch.delete(action.ref);
    await batch.commit();
    await this.db.collection("authUsers").doc(uid).delete();
  }
  async revokeRefreshTokens(uid: string) {
    const rows = await this.db
      .collection("authSessions")
      .where("uid", "==", uid)
      .get();
    const batch = this.db.batch();
    for (const d of rows.docs) batch.delete(d.ref);
    await batch.commit();
  }
  async signIn(email: string, password: string) {
    const rows = await this.db
      .collection("authUsers")
      .where("email", "==", email.trim().toLowerCase())
      .limit(1)
      .get();
    const row = rows.docs[0]?.data();
    const valid = await verifyPassword(
      password,
      row?.passwordHash || "scrypt:invalid:" + "0".repeat(128),
    );
    if (!row || row.disabled || !valid)
      throw Object.assign(new Error("Incorrect email or password"), {
        code: "auth/invalid-credential",
      });
    const token = randomBytes(32).toString("base64url");
    await this.db
      .collection("authSessions")
      .doc(digest(token))
      .set({
        uid: row.uid,
        expiresAt: Date.now() + 7 * 86400000,
        createdAt: Date.now(),
      });
    await this.db
      .collection("authUsers")
      .doc(row.uid)
      .update({
        metadata: { ...row.metadata, lastSignInTime: new Date().toISOString() },
      });
    return { token, user: await this.getUser(row.uid) };
  }
  async verifyIdToken(token: string): Promise<any> {
    if (!/^[\w-]{43}$/.test(token)) throw new Error("Invalid session");
    const ref = this.db.collection("authSessions").doc(digest(token)),
      session = (await ref.get()).data();
    if (!session || session.expiresAt <= Date.now())
      throw new Error("Session expired");
    const user = await this.getUser(session.uid);
    if (user.disabled) throw new Error("Account disabled");
    return {
      ...user.customClaims,
      uid: user.uid,
      email: user.email,
      auth_time: session.createdAt,
      email_verified: user.emailVerified,
    };
  }
  async signOut(token: string) {
    if (token)
      await this.db.collection("authSessions").doc(digest(token)).delete();
  }
  async generatePasswordResetLink(email: string) {
    const user = await this.getUserByEmail(email);
    return this.actionLink(user.uid, "reset");
  }
  async generateEmailVerificationLink(email: string) {
    const user = await this.getUserByEmail(email);
    return this.actionLink(user.uid, "verify");
  }
  private async actionLink(uid: string, kind: string) {
    const token = randomBytes(32).toString("base64url");
    await this.db
      .collection("authActions")
      .doc(digest(token))
      .set({ uid, kind, expiresAt: Date.now() + 30 * 60000 });
    return `${process.env.APP_URL || "http://localhost:47293"}/#/${kind === "reset" ? "reset-password" : "verify-email"}?token=${token}`;
  }
  async consumeAction(token: string, kind: string, password?: string) {
    const newHash = password ? await passwordHash(password) : null;
    const uid = await this.db.runTransaction(async (tx) => {
      const ref = this.db.collection("authActions").doc(digest(token)),
        row = (await tx.get(ref)).data();
      if (!row || row.kind !== kind || row.expiresAt < Date.now())
        throw new Error("Link expired or invalid");
      tx.update(
        this.db.collection("authUsers").doc(row.uid),
        kind === "reset" ? { passwordHash: newHash } : { emailVerified: true },
      );
      tx.delete(ref);
      return row.uid;
    });
    if (kind === "reset") await this.revokeRefreshTokens(uid);
  }
}
export function getAuth(app: App) {
  return new LocalAuth(app);
}
export async function bootstrapAdmin(app: App) {
  const email = process.env.ADMIN_EMAIL,
    password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const auth = getAuth(app);
  const existing = await getDatabase(app)
    .collection("authUsers")
    .limit(1)
    .get();
  if (!existing.empty) return;
  await auth.createUser({
    email,
    password,
    emailVerified: true,
    customClaims: { admin: true },
  });
  console.log(
    "Initial local administrator created. Remove ADMIN_PASSWORD from runtime configuration after first login.",
  );
}
