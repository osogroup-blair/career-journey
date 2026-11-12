import { beforeEach, expect, it, vi } from "vitest";
import { FirestoreDataStore } from "../FirestoreDataStore";
vi.mock("../../lib/aiClient", () => ({
  authHeaders: async () => ({ Authorization: "Bearer human" }),
}));
vi.mock("firebase/firestore", () => ({
  doc: (...args: any[]) => args.join("/"),
  collection: (...args: any[]) => args.join("/"),
  getDocs: async () => ({
    forEach: (fn: any) =>
      fn({ id: "job", data: () => ({ id: "job", revision: 4 }) }),
  }),
  getDoc: async () => ({ exists: () => false }),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));
let store: FirestoreDataStore, fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubGlobal("window", new EventTarget());
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  store = new FirestoreDataStore({} as any, "alice");
  await store.listJobs();
});
it("serializes queued saves with the last server acknowledged revision", async () => {
  const inputs: any[] = [];
  fetchMock.mockImplementation(async (_path: string, init: any) => {
    const input = JSON.parse(init.body);
    inputs.push(input);
    await Promise.resolve();
    return {
      ok: true,
      json: async () => ({
        ...input.value,
        revision: input.expectedRevision + 1,
      }),
    };
  });
  await Promise.all([
    store.saveJob({ id: "job", roleTitle: "First" } as any),
    store.saveJob({ id: "job", roleTitle: "Second" } as any),
  ]);
  expect(inputs.map((x) => x.expectedRevision)).toEqual([4, 5]);
  expect(inputs.map((x) => x.value.roleTitle)).toEqual(["First", "Second"]);
  expect(store.hasPendingWrites()).toBe(false);
});
it("reports conflicts and blocks stale queued successors", async () => {
  const errors: any[] = [];
  window.addEventListener("career-journey:save-error", (e: any) =>
    errors.push(e.detail),
  );
  fetchMock.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ error: "Record changed" }),
  });
  const results = await Promise.allSettled([
    store.saveJob({ id: "job" } as any),
    store.saveJob({ id: "job" } as any),
  ]);
  expect(results.every((r) => r.status === "rejected")).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(errors[0].conflict).toBe(true);
});
it("uses CAS for deletions instead of the direct Firebase SDK", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ deleted: true }),
  });
  await store.deleteJob("job");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    collection: "jobs",
    id: "job",
    expectedRevision: 4,
  });
});
