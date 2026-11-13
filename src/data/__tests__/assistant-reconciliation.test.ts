import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("../../lib/aiClient", () => ({
  authHeaders: async () => ({ "X-CJ-Request": "1" }),
}));
import { HttpDataStore } from "../HttpDataStore";
let fetchMock: any;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const response = (body: any) => ({ ok: true, json: async () => body });
it("rejects stale refresh snapshots after a newer save completes without lowering the CAS revision", async () => {
  const store = new HttpDataStore();
  fetchMock.mockResolvedValueOnce(response([{ id: "job1", revision: 1 }]));
  await store.listJobs();
  fetchMock.mockResolvedValueOnce(response({ id: "job1", revision: 2 }));
  await store.saveJob({ id: "job1" } as any);
  expect(() =>
    store.acceptAssistantSnapshot({
      jobs: { job1: { id: "job1", revision: 1 } },
      matches: {},
    }),
  ).toThrow("newer save");
  fetchMock.mockResolvedValueOnce(response({ id: "job1", revision: 3 }));
  await store.saveJob({ id: "job1" } as any);
  expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).expectedRevision).toBe(
    2,
  );
});
it("reading a remote snapshot does not adopt revisions until the store can safely merge", async () => {
  const store = new HttpDataStore();
  fetchMock.mockResolvedValueOnce(response([{ id: "job1", revision: 1 }]));
  await store.listJobs();
  fetchMock.mockImplementation(async (path: string, options: any) => {
    const body = JSON.parse(options.body);
    return response(
      body.collection === "jobs"
        ? [{ id: "job1", revision: 4 }]
        : body.collection === "matches"
          ? []
          : { person: { name: "Fixture" } },
    );
  });
  const snapshot = await store.readAssistantSnapshot();
  expect(snapshot.jobs.job1.revision).toBe(4);
  fetchMock.mockResolvedValueOnce(response({ id: "job1", revision: 2 }));
  await store.saveJob({ id: "job1" } as any);
  expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).expectedRevision).toBe(
    1,
  );
  expect(() => store.acceptAssistantSnapshot(snapshot)).toThrow("save occurred");
  store.acceptAssistantSnapshot(await store.readAssistantSnapshot());
  fetchMock.mockResolvedValueOnce(response({ id: "job1", revision: 5 }));
  await store.saveJob({ id: "job1" } as any);
  expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body).expectedRevision).toBe(
    4,
  );
});
it("does not adopt refreshed revisions during pending writes", async () => {
  const store = new HttpDataStore();
  let finish: any;
  fetchMock.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const pending = store.saveJob({ id: "job1" } as any);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(() =>
    store.acceptAssistantSnapshot({ jobs: {}, matches: {} }),
  ).toThrow("save is in progress");
  finish(response({ id: "job1", revision: 1 }));
  await pending;
  expect(store.hasPendingWrites()).toBe(false);
});
it("rejects a snapshot missing a job created while its read was in flight", async () => {
  const store = new HttpDataStore();
  let finish: any;
  fetchMock.mockImplementation(async (path: string, options: any) => {
    if (path === "/api/agent/save")
      return response({ id: "new-job", revision: 1 });
    const { collection } = JSON.parse(options.body);
    if (collection === "jobs")
      return new Promise((resolve) => {
        finish = resolve;
      });
    return response(
      collection === "matches" ? [] : { person: { name: "Fixture" } },
    );
  });
  const reading = store.readAssistantSnapshot();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  await store.saveJob({ id: "new-job" } as any);
  finish(response([]));
  const snapshot = await reading;
  expect(() => store.acceptAssistantSnapshot(snapshot)).toThrow(
    "save occurred",
  );
});
