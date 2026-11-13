// One-time read-only export. firebase-admin is a development-only migration dependency.
import "dotenv/config";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { mkdir, writeFile, open } from "node:fs/promises";
import path from "node:path";
const directory = path.resolve(process.argv[2] || "migration-export");
if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  throw new Error(
    "Export needs the old FIREBASE_SERVICE_ACCOUNT_JSON only on this machine",
  );
await mkdir(directory, { recursive: true, mode: 0o700 });
const output = await open(path.join(directory, "records.jsonl"), "wx", 0o600);
const app = initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)),
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
});
const db = getFirestore(app);
function normalize(value) {
  if (value?.toMillis instanceof Function)
    return { __timestamp: value.toMillis() };
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalize(v)]),
    );
  return value;
}
let documents = 0,
  users = 0,
  files = 0;
const write = async (row) => output.write(JSON.stringify(row) + "\n");
try {
  async function walk(collection) {
    // Include missing ancestor documents so subcollections are not silently omitted.
    for (const ref of await collection.listDocuments()) {
      const document = await ref.get();
      if (document.exists) {
        await write({
          type: "document",
          path: ref.path,
          data: normalize(document.data()),
        });
        documents++;
      }
      for (const child of await ref.listCollections()) await walk(child);
    }
  }
  for (const collection of await db.listCollections()) await walk(collection);
  let token;
  do {
    const page = await getAuth(app).listUsers(1000, token);
    for (const user of page.users) {
      await write({
        type: "user",
        data: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || "",
          photoURL: user.photoURL || null,
          emailVerified: user.emailVerified,
          disabled: user.disabled,
          customClaims: user.customClaims || {},
          metadata: user.metadata.toJSON(),
        },
      });
      users++;
    }
    token = page.pageToken;
  } while (token);
  if (process.env.VITE_FIREBASE_STORAGE_BUCKET) {
    const [objects] = await getStorage(app).bucket().getFiles();
    for (const object of objects) {
      const destination = path.resolve(directory, "files", object.name);
      if (!destination.startsWith(path.join(directory, "files") + path.sep))
        throw new Error("Invalid object path");
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await object.download({ destination });
      files++;
    }
  }
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify(
      {
        format: 1,
        documents,
        users,
        files,
        exportedAt: new Date().toISOString(),
        passwords: "Not migrated; reset local passwords before cutover",
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    `Exported ${documents} documents, ${users} accounts and ${files} private files. Source Firebase data was not changed.`,
  );
} finally {
  await output.close();
}
