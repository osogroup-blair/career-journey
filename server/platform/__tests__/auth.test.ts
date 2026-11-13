import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getAuth } from "../auth";
import { getDatabase } from "../database";
let app: { dataDir: string };
beforeEach(async () => {
  app = { dataDir: await mkdtemp(path.join(tmpdir(), "cj-auth-")) };
});
afterEach(async () => {
  getDatabase(app).close();
  await rm(app.dataDir, { recursive: true, force: true });
});
it("hashes passwords, issues revocable sessions and rechecks administrator claims", async () => {
  const auth = getAuth(app),
    user = await auth.createUser({
      email: "test@example.org",
      password: "A-strong-local-password",
      emailVerified: true,
    });
  const stored = (
    await getDatabase(app).doc(`authUsers/${user.uid}`).get()
  ).data()!;
  expect(stored.passwordHash).toMatch(/^scrypt:/);
  expect(JSON.stringify(stored)).not.toContain("A-strong-local-password");
  expect(user.passwordHash).toBeUndefined();
  await expect(auth.signIn(user.email, "incorrect")).rejects.toThrow();
  const login = await auth.signIn(user.email, "A-strong-local-password");
  await auth.setCustomUserClaims(user.uid, { admin: true });
  expect((await auth.verifyIdToken(login.token)).admin).toBe(true);
  await auth.signOut(login.token);
  await expect(auth.verifyIdToken(login.token)).rejects.toThrow();
});
it("revokes old sessions after password changes and blocks disabled accounts", async () => {
  const auth = getAuth(app),
    user = await auth.createUser({
      email: "test@example.org",
      password: "A-strong-local-password",
    }),
    login = await auth.signIn(user.email, "A-strong-local-password");
  await auth.updateUser(user.uid, { password: "Another-strong-password" });
  await expect(auth.verifyIdToken(login.token)).rejects.toThrow();
  await auth.updateUser(user.uid, { disabled: true });
  await expect(
    auth.signIn(user.email, "Another-strong-password"),
  ).rejects.toThrow();
});
it("enforces email uniqueness and one-use password reset links", async () => {
  const auth = getAuth(app),
    user = await auth.createUser({
      email: "test@example.org",
      password: "A-strong-local-password",
    });
  await expect(
    auth.createUser({
      email: "TEST@example.org",
      password: "A-strong-local-password",
    }),
  ).rejects.toThrow();
  const link = await auth.generatePasswordResetLink(user.email),
    token = new URLSearchParams(link.split("?")[1]).get("token")!;
  await auth.consumeAction(token, "reset", "New-password-for-reset");
  await expect(
    auth.consumeAction(token, "reset", "Another-password"),
  ).rejects.toThrow();
  expect(
    (await auth.signIn(user.email, "New-password-for-reset")).user.uid,
  ).toBe(user.uid);
});
