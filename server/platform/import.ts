import "dotenv/config";
import { readFile, cp, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { initializeApp } from "./app";
import { getDatabase, Timestamp } from "./database";
const source = path.resolve(process.argv[2] || "migration-export"),
  apply = process.argv.includes("--apply");
const app = initializeApp(),
  db = getDatabase(app);
function revive(_key: string, value: any) {
  return value &&
    typeof value === "object" &&
    typeof value.__timestamp === "number"
    ? Timestamp.fromMillis(value.__timestamp)
    : value;
}
const manifest = JSON.parse(
  await readFile(path.join(source, "manifest.json"), "utf8"),
);
if (manifest.format !== 1)
  throw new Error("Unsupported migration export format");
const rows = (await readFile(path.join(source, "records.jsonl"), "utf8"))
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line, revive));
const paths = new Set<string>();
let documents = 0,
  users = 0;
for (const row of rows) {
  if (row.type === "document") {
    if (
      typeof row.path !== "string" ||
      row.path.split("/").some((s: string) => !s || s === "." || s === "..") ||
      row.path.split("/").length % 2
    )
      throw new Error("Invalid exported document path");
    if (paths.has(row.path)) throw new Error("Duplicate document path");
    paths.add(row.path);
    documents++;
  } else if (row.type === "user") {
    if (!/^[\w-]{1,128}$/.test(row.data.uid))
      throw new Error("Invalid user UID");
    users++;
  } else throw new Error("Unknown exported record type");
}
if (documents !== manifest.documents || users !== manifest.users)
  throw new Error("Incomplete export; counts do not match manifest");
if ((await db.exportRows()).length)
  throw new Error(
    "Import requires an empty target database. Use a fresh DATA_DIR/volume; existing data is never overwritten.",
  );
if (!apply) {
  console.log(
    `Dry run valid: ${documents} documents, ${users} users. Re-run with --apply to import into ${app.dataDir}.`,
  );
} else {
  await db.runTransaction(async (tx) => {
    for (const row of rows) {
      if (row.type === "document") tx.set(db.doc(row.path), row.data);
      else
        tx.set(db.collection("authUsers").doc(row.data.uid), {
          ...row.data,
          passwordHash: null,
        });
    }
  });
  if (manifest.files) {
    await mkdir(path.join(app.dataDir, "files"), {
      recursive: true,
      mode: 0o700,
    });
    await cp(path.join(source, "files"), path.join(app.dataDir, "files"), {
      recursive: true,
      errorOnExist: true,
      force: false,
      dereference: false,
    });
  }
  console.log(
    `Imported ${documents} documents and ${users} accounts with original UIDs. Set local passwords before deployment; Firebase password hashes and sessions are deliberately not reused.`,
  );
}
