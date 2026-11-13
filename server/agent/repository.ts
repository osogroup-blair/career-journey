import { createHash } from "node:crypto";
import type { DocumentDatabase, Transaction } from "../platform/database";
import { DomainError } from "./contracts";
export type Row = Record<string, any>;
export interface Unit {
  get(collection: string, id: string): Promise<Row | null>;
  set(collection: string, id: string, value: Row): void;
  remove(collection: string, id: string): void;
}
export type Filters = [string, '==' | '<' | '<=' | '>', unknown][];
export interface Repository {
  query(uid: string, collection: string, filters: Filters, limit: number, order?: {field:string;direction:'asc'|'desc'}): Promise<Row[]>;
  read(uid: string, collection: string, id: string): Promise<Row | null>;
  list(
    uid: string,
    collection: string,
    after: string | undefined,
    limit: number,
  ): Promise<Row[]>;
  transaction<T>(uid: string, run: (tx: Unit) => Promise<T>): Promise<T>;
}
function sorted(value: any): any {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => [k, sorted(value[k])]),
    );
  return value;
}
export const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(sorted(value)))
    .digest("hex");
export class SqliteRepository implements Repository {
  constructor(private db: DocumentDatabase) {}
  private ref(uid: string, collection: string, key: string) {
    return this.db.collection("users").doc(uid).collection(collection).doc(key);
  }
  async read(uid: string, collection: string, key: string) {
    const s = await this.ref(uid, collection, key).get();
    return s.exists ? s.data()! : null;
  }
  async list(
    uid: string,
    collection: string,
    after: string | undefined,
    limit: number,
  ) {
    let q = this.db
      .collection("users")
      .doc(uid)
      .collection(collection)
      .orderBy("__name__")
      .limit(limit);
    if (after) q = q.startAfter(after);
    const result = await q.get();
    return result.docs.map((d) => ({ ...d.data(), id: d.id }));
  }
  async query(uid: string, collection: string, filters: Filters, limit: number, order = {field:'__name__',direction:'asc' as 'asc'|'desc'}): Promise<Row[]> {
    let q = this.db.collection('users').doc(uid).collection(collection).orderBy(order.field,order.direction).limit(limit);
    for (const [field,op,value] of filters) q=q.where(field,op,value);
    return (await q.get()).docs.map(d=>({...d.data(),id:d.id}));
  }
  async transaction<T>(uid: string, run: (tx: Unit) => Promise<T>): Promise<T> {
    return this.db.runTransaction(async (t: Transaction) => {
      // Buffer writes so reads performed later by a command still precede all transactional document writes.
      const writes: (() => void)[] = [];
      const result = await run({
        get: async (c, k) => {
          const s = await t.get(this.ref(uid, c, k));
          return s.exists ? s.data()! : null;
        },
        set: (c, k, v) =>
          writes.push(() => {
            t.set(this.ref(uid, c, k), JSON.parse(JSON.stringify(v)));
          }),
        remove: (c, k) =>
          writes.push(() => {
            t.delete(this.ref(uid, c, k));
          }),
      });
      writes.forEach((w) => w());
      return result;
    });
  }
}
/** Test repository only; production never falls back to volatile storage. */
export class MemoryRepository implements Repository {
  private data = new Map<string, Row>();
  private tail: Promise<any> = Promise.resolve();
  private key(u: string, c: string, k: string) {
    return `${u}/${c}/${k}`;
  }
  async read(u: string, c: string, k: string) {
    return structuredClone(this.data.get(this.key(u, c, k)) ?? null);
  }
  async list(u: string, c: string, after: string | undefined, limit: number): Promise<Row[]> {
    const prefix = `${u}/${c}/`;
    return [...this.data.entries()]
      .filter(
        ([k]) =>
          k.startsWith(prefix) && (!after || k.slice(prefix.length) > after),
      )
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, limit)
      .map(([k, v]) => structuredClone({ ...v, id: k.slice(prefix.length) }));
  }
  async query(u: string, c: string, filters: Filters, limit: number, order = {field:'__name__',direction:'asc' as 'asc'|'desc'}): Promise<Row[]> {
    const rows = await this.list(u,c,undefined,Number.MAX_SAFE_INTEGER);
    return rows.filter(row=>filters.every(([key,op,value])=>op==='=='?JSON.stringify(row[key])===JSON.stringify(value):op==='<'?row[key]<(value as any):op==='>'?row[key]>(value as any):row[key]<=(value as any))).sort((a,b)=>{
      const key=order.field==='__name__'?'id':order.field, x=a[key],y=b[key];
      const delta=x<y?-1:x>y?1:a.id.localeCompare(b.id);return order.direction==='asc'?delta:-delta;
    }).slice(0,limit);
  }
  transaction<T>(u: string, run: (t: Unit) => Promise<T>): Promise<T> {
    const promise = this.tail.then(async () => {
      const copy = new Map(this.data);
      const result = await run({
        get: async (c, k) =>
          structuredClone(copy.get(this.key(u, c, k)) ?? null),
        set: (c, k, v) => {
          copy.set(this.key(u, c, k), structuredClone(v));
        },
        remove: (c, k) => {
          copy.delete(this.key(u, c, k));
        },
      });
      this.data = copy;
      return result;
    });
    this.tail = promise.catch(() => {});
    return promise;
  }
}
export async function required(tx: Unit, collection: string, id: string) {
  const row = await tx.get(collection, id);
  if (!row) throw new DomainError("NOT_FOUND", "Record not found", 404);
  return row;
}
export function checkRevision(row: Row, expected: number) {
  if ((row.revision ?? 0) !== expected)
    throw new DomainError(
      "REVISION_CONFLICT",
      "Record changed. Reload before editing.",
      409,
    );
}
