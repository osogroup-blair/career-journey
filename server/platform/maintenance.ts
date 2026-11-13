import "dotenv/config";
import { applySeed } from "./seed";
import { readFileSync } from "node:fs";
import { initializeApp } from "./app";
import { getAuth } from "./auth";
import { getDatabase } from "./database";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
const app = initializeApp(),
  db = getDatabase(app),
  command = process.argv[2];
if (command === "seed") {
  const input = JSON.parse(
    process.argv[3]
      ? await readFile(process.argv[3], "utf8")
      : readFileSync(0, "utf8"),
  );
  const result = await applySeed(app, input);
  console.log(
    result.created
      ? `Created initial administrator ${result.email}. No Career Journey or job records were changed.`
      : `Administrator ${result.email} already exists; password, permissions and data were preserved.`,
  );
} else if (command === "create-user" || command === "set-password") {
  const email = process.env.ADMIN_EMAIL,
    password = process.env.ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment");
  const auth = getAuth(app);
  if (command === "create-user") {
    const user = await auth.createUser({
      email,
      password,
      emailVerified: true,
      customClaims: { admin: process.env.CREATE_ADMIN === "true" },
    });
    console.log(`Created local account ${user.email}`);
  } else {
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
    console.log("Password updated; all prior sessions revoked");
  }
} else if (command === "backup") {
  const target = path.resolve(
    process.argv[3] ||
      path.join(
        app.dataDir,
        "backups",
        new Date().toISOString().replace(/[:.]/g, "-"),
      ),
  );
  await mkdir(target, { recursive: true, mode: 0o700 });
  await db.backup(path.join(target, "career-journey.sqlite"));
  console.log(
    `Database snapshot saved to ${target}. Copy the private files and signing key while the app is stopped for a complete backup.`,
  );
} else {
  throw new Error(
    "Usage: maintenance seed [file] | create-user | set-password | backup [directory]",
  );
}
