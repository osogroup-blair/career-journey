import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { App } from "./app";
import { getAuth } from "./auth";
import { getDatabase } from "./database";

export const seedSchema = z
  .object({
    version: z.literal(1),
    administrator: z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .max(254)
          .transform((value) => value.toLowerCase()),
        displayName: z.string().trim().min(1).max(200),
        password: z
          .string()
          .min(12)
          .max(256)
          .refine(
            (value) => value !== "GENERATE_WITH_SEED_INIT",
            "Generate a private seed file; do not apply the example password",
          ),
      })
      .strict(),
  })
  .strict();
export function generateSeed(email: string, displayName = "Administrator") {
  return seedSchema.parse({
    version: 1,
    administrator: {
      email,
      displayName,
      password: randomBytes(32).toString("base64url"),
    },
  });
}
/** Initial administrator only: never overwrite passwords, promote existing users, or touch canonical career data. */
export async function applySeed(app: App, input: unknown) {
  const seed = seedSchema.parse(input),
    auth = getAuth(app),
    db = getDatabase(app);
  return db.runTransaction(async () => {
    const users = await auth.listUsers(1);
    if (users.users.length) {
      let existing;
      try {
        existing = await auth.getUserByEmail(seed.administrator.email);
      } catch {
        throw new Error(
          "Accounts already exist. Initial seeding is disabled; use explicit account maintenance instead.",
        );
      }
      if (existing.customClaims?.admin !== true)
        throw new Error(
          "The matching account is not an administrator; seeding will not grant it administrator access.",
        );
      return { created: false, email: existing.email, uid: existing.uid };
    }
    const user = await auth.createUser({
      ...seed.administrator,
      emailVerified: true,
      customClaims: { admin: true },
    });
    return { created: true, email: user.email, uid: user.uid };
  });
}
