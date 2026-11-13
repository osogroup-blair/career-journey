import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { applySeed, generateSeed, seedSchema } from "../seed";
import { getAuth } from "../auth";
import { getDatabase } from "../database";
let app: { dataDir: string };
beforeEach(async () => {
  app = { dataDir: await mkdtemp(path.join(tmpdir(), "cj-seed-")) };
});
afterEach(async () => {
  getDatabase(app).close();
  await rm(app.dataDir, { recursive: true, force: true });
});
it("creates a sign-in-ready administrator and no career/job data", async () => {
  const seed = generateSeed("admin@example.org"),
    result = await applySeed(app, seed);
  expect(result.created).toBe(true);
  const login = await getAuth(app).signIn(
    seed.administrator.email,
    seed.administrator.password,
  );
  expect(login.user.emailVerified).toBe(true);
  expect(login.user.customClaims.admin).toBe(true);
  expect((await getDatabase(app).collection("users").get()).size).toBe(0);
});
it("reruns without changing existing passwords or records", async () => {
  const first = generateSeed("admin@example.org");
  await applySeed(app, first);
  const user = await getAuth(app).getUserByEmail(first.administrator.email);
  await getDatabase(app)
    .doc(`users/${user.uid}/careerJourney/current`)
    .set({ person: { name: "Human profile" } });
  const result = await applySeed(app, generateSeed(first.administrator.email));
  expect(result.created).toBe(false);
  await expect(
    getAuth(app).signIn(
      first.administrator.email,
      first.administrator.password,
    ),
  ).resolves.toBeTruthy();
  expect(
    (
      await getDatabase(app)
        .doc(`users/${user.uid}/careerJourney/current`)
        .get()
    ).data()?.person.name,
  ).toBe("Human profile");
});
it("does not promote an existing ordinary account or create another initial admin", async () => {
  const auth = getAuth(app);
  await auth.createUser({
    email: "user@example.org",
    password: "A-strong-user-password",
  });
  await expect(
    applySeed(app, generateSeed("user@example.org")),
  ).rejects.toThrow("not an administrator");
  await expect(
    applySeed(app, generateSeed("other@example.org")),
  ).rejects.toThrow("Accounts already exist");
});
it("rejects the public placeholder and generates unique strong secrets", () => {
  const a = generateSeed("admin@example.org"),
    b = generateSeed("admin@example.org");
  expect(a.administrator.password.length).toBeGreaterThanOrEqual(32);
  expect(a.administrator.password).not.toBe(b.administrator.password);
  expect(() =>
    seedSchema.parse({
      ...a,
      administrator: {
        ...a.administrator,
        password: "GENERATE_WITH_SEED_INIT",
      },
    }),
  ).toThrow();
});
