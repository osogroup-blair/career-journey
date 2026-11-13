import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DocumentDatabase, FieldValue, Timestamp } from "../database";
let directory: string, db: DocumentDatabase;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "cj-db-"));
  db = new DocumentDatabase(path.join(directory, "test.sqlite"));
});
afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});
it("persists documents across connections and preserves timestamp behavior", async () => {
  const ref = db.collection("users").doc("alice").collection("jobs").doc("job");
  await ref.set({ n: 1, expireAt: Timestamp.fromMillis(123) });
  db.close();
  db = new DocumentDatabase(path.join(directory, "test.sqlite"));
  const row = (await db.doc(ref.path).get()).data()!;
  expect(row.n).toBe(1);
  expect(row.expireAt.toMillis()).toBe(123);
});
it("atomically merges nested increments and deletes fields", async () => {
  const ref = db.doc("config/usage");
  await ref.set({ count: 1, days: { today: 1 }, remove: "x" });
  await ref.set(
    {
      count: FieldValue.increment(2),
      days: { today: FieldValue.increment(4) },
      remove: FieldValue.delete(),
    },
    { merge: true },
  );
  expect((await ref.get()).data()).toEqual({ count: 3, days: { today: 5 } });
});
it("serializes transactions and rolls back errors", async () => {
  const ref = db.doc("config/counter");
  await ref.set({ count: 0 });
  await Promise.all(
    Array.from({ length: 20 }, () =>
      db.runTransaction(async (tx) => {
        const row = (await tx.get(ref)).data()!;
        await Promise.resolve();
        tx.update(ref, { count: row.count + 1 });
      }),
    ),
  );
  expect((await ref.get()).data()?.count).toBe(20);
  await expect(
    db.runTransaction(async (tx) => {
      tx.set(ref, { count: 999 });
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect((await ref.get()).data()?.count).toBe(20);
});
it("supports tenant-scoped queries, collection groups and cursor pagination", async () => {
  await db
    .doc("users/alice/jobs/a")
    .set({ score: 3, source: { listingId: "x" } });
  await db.doc("users/bob/jobs/b").set({ score: 9 });
  await db.doc("users/alice/jobs/c").set({ score: 5 });
  const jobs = db.collection("users").doc("alice").collection("jobs");
  expect((await jobs.where("source.listingId", "==", "x").get()).size).toBe(1);
  expect((await jobs.orderBy("score", "desc").limit(1).get()).docs[0].id).toBe(
    "c",
  );
  expect(
    (await jobs.orderBy("__name__").startAfter("a").get()).docs[0].id,
  ).toBe("c");
  expect(
    (await db.collectionGroup("jobs").where("score", ">=", 5).get()).size,
  ).toBe(2);
});
it("batches changes and deletes descendants without crossing a tenant boundary", async () => {
  await db.doc("users/alice/jobs/a").set({ x: 1 });
  await db.doc("users/alice/jobs/a/notes/n").set({ x: 2 });
  await db.doc("users/alice2/jobs/b").set({ x: 3 });
  await db.recursiveDelete(db.doc("users/alice"));
  expect(
    (await db.collectionGroup("jobs").get()).docs.map((d) => d.id),
  ).toEqual(["b"]);
});
it("creates a restorable SQLite snapshot", async () => {
  await db.doc("config/a").set({ value: "saved" });
  await db.backup(path.join(directory, "backup.sqlite"));
  const restored = new DocumentDatabase(path.join(directory, "backup.sqlite"));
  expect((await restored.doc("config/a").get()).data()?.value).toBe("saved");
  restored.close();
});
