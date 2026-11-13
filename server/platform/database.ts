import { DatabaseSync, backup } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { App } from "./app";
type Data = Record<string, any>;
const context = new AsyncLocalStorage<boolean>();
export class Timestamp {
  constructor(private value: number) {}
  static fromMillis(value: number) {
    return new Timestamp(value);
  }
  toMillis() {
    return this.value;
  }
  toDate() {
    return new Date(this.value);
  }
  toJSON() {
    return { __timestamp: this.value };
  }
}
export const FieldValue = {
  increment: (value: number) => ({ __operation: "increment", value }),
  delete: () => ({ __operation: "delete" }),
  serverTimestamp: () => Timestamp.fromMillis(Date.now()),
};
function revive(_key: string, value: any) {
  return value && typeof value === "object" && "__timestamp" in value
    ? Timestamp.fromMillis(value.__timestamp)
    : value;
}
function field(row: any, key: string) {
  return key.split(".").reduce((v, k) => v?.[k], row);
}
function merge(old: Data, value: Data): Data {
  const result = { ...old };
  for (const [key, v] of Object.entries(value)) {
    if (v?.__operation === "delete") {
      delete result[key];
      continue;
    }
    if (v?.__operation === "increment") {
      result[key] = (Number(result[key]) || 0) + v.value;
      continue;
    }
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof Timestamp)
    )
      result[key] = merge(
        result[key] && typeof result[key] === "object" ? result[key] : {},
        v,
      );
    else if (v !== undefined) result[key] = v;
  }
  return result;
}
export class DocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  constructor(
    readonly ref: DocumentReference,
    private value: Data | undefined,
  ) {
    this.id = ref.id;
    this.exists = value !== undefined;
  }
  data(): Data | undefined {
    return this.value === undefined
      ? undefined
      : structuredCloneWithDates(this.value);
  }
  get(key: string) {
    return field(this.value, key);
  }
}
function structuredCloneWithDates(value: any): any {
  return JSON.parse(JSON.stringify(value), revive);
}
export class QuerySnapshot {
  readonly size: number;
  readonly empty: boolean;
  constructor(readonly docs: DocumentSnapshot[]) {
    this.size = docs.length;
    this.empty = !docs.length;
  }
  forEach(fn: (doc: DocumentSnapshot) => void) {
    this.docs.forEach(fn);
  }
}
export class Query {
  constructor(
    protected db: DocumentDatabase,
    private base: string,
    private group = false,
    private filters: [string, string, any][] = [],
    private orders: [string, string][] = [],
    private maximum = Infinity,
    private cursor?: string,
  ) {}
  where(key: string, op: string, value: any): Query {
    return new Query(
      this.db,
      this.base,
      this.group,
      [...this.filters, [key, op, value]],
      this.orders,
      this.maximum,
      this.cursor,
    );
  }
  orderBy(key: string, direction = "asc"): Query {
    return new Query(
      this.db,
      this.base,
      this.group,
      this.filters,
      [...this.orders, [key, direction]],
      this.maximum,
      this.cursor,
    );
  }
  limit(n: number): Query {
    return new Query(
      this.db,
      this.base,
      this.group,
      this.filters,
      this.orders,
      n,
      this.cursor,
    );
  }
  startAfter(value: string | DocumentSnapshot): Query {
    return new Query(
      this.db,
      this.base,
      this.group,
      this.filters,
      this.orders,
      this.maximum,
      typeof value === "string" ? value : value.id,
    );
  }
  async get(): Promise<QuerySnapshot> {
    return this.db.read(() => {
      let rows = this.db.sql
        .prepare("SELECT path,body FROM documents ORDER BY path")
        .all()
        .filter((r: any) => {
          const parts = r.path.split("/");
          return this.group
            ? parts.at(-2) === this.base
            : parts.slice(0, -1).join("/") === this.base;
        })
        .map(
          (r: any) =>
            new DocumentSnapshot(
              new DocumentReference(this.db, r.path),
              JSON.parse(r.body, revive),
            ),
        );
      const compare = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);
      for (const [key, op, value] of this.filters)
        rows = rows.filter((row) => {
          const v = key === "__name__" ? row.id : field(row.data(), key);
          switch (op) {
            case "==":
              return JSON.stringify(v) === JSON.stringify(value);
            case "<=":
              return v !== null && v !== undefined && v <= value;
            case ">=":
              return v >= value;
            case "<":
              return v < value;
            case ">":
              return v > value;
            case "in":
              return value.includes(v);
            case "array-contains":
              return Array.isArray(v) && v.includes(value);
            default:
              throw new Error(`Unsupported query operator ${op}`);
          }
        });
      const orders = this.orders.length ? this.orders : [["__name__", "asc"]];
      rows = rows.filter((row) =>
        orders.every(
          ([key]) => key === "__name__" || field(row.data(), key) !== undefined,
        ),
      );
      rows.sort((a, b) => {
        for (const [key, direction] of orders) {
          const n = compare(
            key === "__name__" ? a.id : field(a.data(), key),
            key === "__name__" ? b.id : field(b.data(), key),
          );
          if (n) return direction === "desc" ? -n : n;
        }
        return compare(a.ref.path, b.ref.path);
      });
      if (this.cursor) rows = rows.filter((r) => r.id > this.cursor!);
      return new QuerySnapshot(rows.slice(0, this.maximum));
    });
  }
}
export class CollectionReference extends Query {
  readonly id: string;
  constructor(
    db: DocumentDatabase,
    readonly path: string,
  ) {
    super(db, path);
    this.id = path.split("/").at(-1)!;
  }
  get parent(): DocumentReference | null {
    const parts = this.path.split("/");
    return parts.length === 1
      ? null
      : new DocumentReference(this.db, parts.slice(0, -1).join("/"));
  }
  doc(id: string = randomUUID()): DocumentReference {
    if (!id || id.includes("/")) throw new Error("Invalid document ID");
    return new DocumentReference(this.db, `${this.path}/${id}`);
  }
  async add(value: Data) {
    const ref = this.doc();
    await ref.set(value);
    return ref;
  }
  async listDocuments() {
    return (await this.get()).docs.map((d) => d.ref);
  }
}
export class DocumentReference {
  readonly id: string;
  constructor(
    private db: DocumentDatabase,
    readonly path: string,
  ) {
    const parts = path.split("/");
    if (parts.length % 2 !== 0 || parts.some((p) => !p))
      throw new Error("Invalid document path");
    this.id = parts.at(-1)!;
  }
  get parent() {
    return new CollectionReference(
      this.db,
      this.path.split("/").slice(0, -1).join("/"),
    );
  }
  collection(name: string) {
    if (!name || name.includes("/")) throw new Error("Invalid collection");
    return new CollectionReference(this.db, `${this.path}/${name}`);
  }
  async get(): Promise<DocumentSnapshot> {
    return this.db.read(() => {
      const row = this.db.sql
        .prepare("SELECT body FROM documents WHERE path=?")
        .get(this.path) as any;
      return new DocumentSnapshot(
        this,
        row ? JSON.parse(row.body, revive) : undefined,
      );
    });
  }
  async set(value: Data, options?: { merge?: boolean }) {
    return this.db.write(() => this.writeNow(value, options?.merge ?? false));
  }
  writeNow(value: Data, mergeExisting: boolean) {
    const existing = this.db.sql
      .prepare("SELECT body FROM documents WHERE path=?")
      .get(this.path) as any;
    const previous = existing ? JSON.parse(existing.body, revive) : {};
    const clean = merge(mergeExisting ? previous : {}, value);
    this.db.sql
      .prepare(
        "INSERT INTO documents(path,body) VALUES(?,?) ON CONFLICT(path) DO UPDATE SET body=excluded.body",
      )
      .run(this.path, JSON.stringify(clean));
  }
  async update(value: Data) {
    return this.db.write(() => {
      if (
        !this.db.sql
          .prepare("SELECT 1 FROM documents WHERE path=?")
          .get(this.path)
      )
        throw new Error("Document not found");
      this.writeNow(value, true);
    });
  }
  async delete() {
    return this.db.write(() => {
      this.db.sql.prepare("DELETE FROM documents WHERE path=?").run(this.path);
    });
  }
  async listCollections() {
    return this.db.read(() => {
      const names = new Set<string>();
      for (const r of this.db.sql
        .prepare("SELECT path FROM documents")
        .all() as any[]) {
        if (r.path.startsWith(this.path + "/"))
          names.add(r.path.slice(this.path.length + 1).split("/")[0]);
      }
      return [...names].map((n) => this.collection(n));
    });
  }
}
export class Transaction {
  constructor(private database: DocumentDatabase) {}
  get(ref: DocumentReference): Promise<DocumentSnapshot>;
  get(ref: Query): Promise<QuerySnapshot>;
  get(ref: any): Promise<any> {
    return ref.get();
  }
  set(ref: DocumentReference, value: Data, options?: { merge?: boolean }) {
    ref.writeNow(value, options?.merge ?? false);
    return this;
  }
  update(ref: DocumentReference, value: Data) {
    if (
      !this.database.sql
        .prepare("SELECT 1 FROM documents WHERE path=?")
        .get(ref.path)
    )
      throw new Error("Document not found");
    ref.writeNow(value, true);
    return this;
  }
  delete(ref: DocumentReference) {
    this.database.sql
      .prepare("DELETE FROM documents WHERE path=?")
      .run(ref.path);
    return this;
  }
}
export class WriteBatch {
  private commands: (() => Promise<any>)[] = [];
  constructor(private db: DocumentDatabase) {}
  set(ref: DocumentReference, value: Data, options?: { merge?: boolean }) {
    this.commands.push(() => ref.set(value, options));
    return this;
  }
  update(ref: DocumentReference, value: Data) {
    this.commands.push(() => ref.update(value));
    return this;
  }
  delete(ref: DocumentReference) {
    this.commands.push(() => ref.delete());
    return this;
  }
  async commit() {
    return this.db.runTransaction(async () => {
      for (const command of this.commands) await command();
    });
  }
}
/** SQLite document repository. Familiar reference API keeps existing domain code stable; no cloud SDK is involved. */
export class DocumentDatabase {
  readonly sql: DatabaseSync;
  private tail: Promise<any> = Promise.resolve();
  constructor(filename: string) {
    if (filename !== ":memory:")
      mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.sql = new DatabaseSync(filename);
    if (filename !== ":memory:") chmodSync(filename, 0o600);
    this.sql.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS documents(path TEXT PRIMARY KEY, body TEXT NOT NULL CHECK(json_valid(body))); CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY); INSERT OR IGNORE INTO schema_migrations VALUES(1);",
    );
  }
  collection(name: string) {
    if (!name || name.includes("/")) throw new Error("Invalid collection");
    return new CollectionReference(this, name);
  }
  doc(path: string) {
    return new DocumentReference(this, path);
  }
  collectionGroup(name: string) {
    return new Query(this, name, true);
  }
  batch() {
    return new WriteBatch(this);
  }
  async read<T>(fn: () => T): Promise<T> {
    if (context.getStore()) return fn();
    await this.tail;
    return fn();
  }
  write<T>(fn: () => T): Promise<T> {
    if (context.getStore()) return Promise.resolve(fn());
    return this.runTransaction(async () => fn());
  }
  runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    if (context.getStore()) return fn(new Transaction(this));
    const work = this.tail.then(() =>
      context.run(true, async () => {
        this.sql.exec("BEGIN IMMEDIATE");
        try {
          const result = await fn(new Transaction(this));
          this.sql.exec("COMMIT");
          return result;
        } catch (e) {
          this.sql.exec("ROLLBACK");
          throw e;
        }
      }),
    );
    this.tail = work.catch(() => {});
    return work;
  }
  async recursiveDelete(ref: DocumentReference) {
    return this.write(() => {
      this.sql
        .prepare("DELETE FROM documents WHERE path=? OR substr(path,1,?)=?")
        .run(ref.path, ref.path.length + 1, ref.path + "/");
    });
  }
  async exportRows() {
    return this.read(() =>
      this.sql.prepare("SELECT path,body FROM documents ORDER BY path").all(),
    );
  }
  async backup(filename: string) {
    await this.tail;
    return backup(this.sql, filename);
  }
  close() {
    this.sql.close();
  }
}

const databases = new Map<string, DocumentDatabase>();
export function getDatabase(app: App): DocumentDatabase {
  const filename = path.join(app.dataDir, "career-journey.sqlite");
  let db = databases.get(filename);
  if (!db) {
    db = new DocumentDatabase(filename);
    databases.set(filename, db);
  }
  return db;
}
