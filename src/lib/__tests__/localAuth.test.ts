import { beforeEach, it, expect, vi } from "vitest";
beforeEach(() => {
  vi.resetModules();
});
const user = {
  uid: "alice",
  email: "alice@example.org",
  displayName: "Alice",
  emailVerified: true,
  customClaims: {},
  metadata: {},
};
it("does not let a stale initial session response undo a later successful sign-in", async () => {
  let resolve: (value: any) => void;
  const pending = new Promise((r) => {
    resolve = r;
  });
  const fetchMock = vi
    .fn()
    .mockReturnValueOnce(pending)
    .mockResolvedValue({ ok: true, json: async () => ({ user }) });
  vi.stubGlobal("fetch", fetchMock);
  const module = await import("../auth"),
    listener = vi.fn(),
    unsubscribe = module.onAuthStateChanged(module.auth, listener);
  await module.signInWithEmailAndPassword(
    module.auth,
    user.email,
    "Password-not-sent-to-a-real-server",
  );
  resolve!({
    ok: false,
    json: async () => ({ error: "Expired initial session" }),
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(module.auth.currentUser?.uid).toBe("alice");
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
});
it("updates display name without rehydrating and racing a Career Journey save", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => user })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...user, displayName: "Updated" }),
    });
  vi.stubGlobal("fetch", fetchMock);
  const module = await import("../auth"),
    listener = vi.fn(),
    unsubscribe = module.onAuthStateChanged(module.auth, listener);
  await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce());
  listener.mockClear();
  await module.updateProfile(module.auth.currentUser!, {
    displayName: "Updated",
  });
  expect(module.auth.currentUser?.displayName).toBe("Updated");
  expect(listener).not.toHaveBeenCalled();
  unsubscribe();
});
