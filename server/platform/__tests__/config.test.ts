import { it, expect } from "vitest";
import { validateBootstrapConfig } from "../config";
it("permits seed-only provisioning and strong explicit bootstrap credentials", () => {
  expect(() =>
    validateBootstrapConfig({ ADMIN_EMAIL: "", ADMIN_PASSWORD: "" }),
  ).not.toThrow();
  expect(() =>
    validateBootstrapConfig({
      ADMIN_EMAIL: "admin@example.org",
      ADMIN_PASSWORD: "A-strong-bootstrap-password",
    }),
  ).not.toThrow();
});
it("rejects short or partial bootstrap settings without exposing the password", () => {
  const password = "secret";
  expect(() =>
    validateBootstrapConfig({
      ADMIN_EMAIL: "admin@example.org",
      ADMIN_PASSWORD: password,
    }),
  ).toThrow("12–256");
  try {
    validateBootstrapConfig({
      ADMIN_EMAIL: "admin@example.org",
      ADMIN_PASSWORD: password,
    });
  } catch (error) {
    expect(String(error)).not.toContain(password);
  }
  expect(() =>
    validateBootstrapConfig({ ADMIN_EMAIL: "admin@example.org" }),
  ).toThrow("both");
});
