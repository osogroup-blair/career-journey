import type { App } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * Admin-set context-window overrides, layered on top of the built-in
 * static/introspected values in server/ai/contextWindows.ts — same
 * precedence idea as server/promptAiConfig.ts overriding a prompt's default
 * model. Lets an admin correct a stale/missing static figure (or cap a model
 * more conservatively) without a code change.
 */
export interface ContextWindowOverride {
  contextWindow: number;
  maxOutputTokens?: number;
  updatedAt: string;
}

export type ContextWindowOverrideMap = Record<string, ContextWindowOverride>;

// Same 30s cache pattern as aiDefaults.ts/promptAiConfig.ts.
let cache: { overrides: ContextWindowOverrideMap; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

function docRef(app: App) {
  return getFirestore(app).collection("config").doc("modelContextWindows");
}

export function overrideKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

export async function getContextWindowOverrides(app: App | null): Promise<ContextWindowOverrideMap> {
  if (!app) return {};

  const now = Date.now();
  if (cache && now < cache.expiresAt) return cache.overrides;

  const snap = await docRef(app).get();
  const stored = (snap.exists ? snap.data() : {}) as ContextWindowOverrideMap;
  cache = { overrides: stored, expiresAt: now + CACHE_TTL_MS };
  return stored;
}

export async function getContextWindowOverrideFor(app: App | null, provider: string, model: string): Promise<ContextWindowOverride | null> {
  const overrides = await getContextWindowOverrides(app);
  return overrides[overrideKey(provider, model)] ?? null;
}

export function _resetContextWindowOverrideCache(): void {
  cache = null;
}

export function validateContextWindowUpdate(input: unknown): { contextWindow: number; maxOutputTokens?: number } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Context window update must be an object.");
  }
  const updates = input as Record<string, unknown>;

  if (typeof updates.contextWindow !== "number" || !Number.isFinite(updates.contextWindow) || updates.contextWindow <= 0) {
    throw new Error("contextWindow must be a positive number.");
  }

  let maxOutputTokens: number | undefined;
  if ("maxOutputTokens" in updates && updates.maxOutputTokens !== null && updates.maxOutputTokens !== undefined) {
    if (typeof updates.maxOutputTokens !== "number" || !Number.isFinite(updates.maxOutputTokens) || updates.maxOutputTokens <= 0) {
      throw new Error("maxOutputTokens must be a positive number or null.");
    }
    maxOutputTokens = updates.maxOutputTokens;
  }

  const allowedKeys = new Set(["contextWindow", "maxOutputTokens"]);
  for (const key of Object.keys(updates)) {
    if (!allowedKeys.has(key)) throw new Error(`Unknown context-window field "${key}".`);
  }

  return { contextWindow: updates.contextWindow, maxOutputTokens };
}

export async function setContextWindowOverride(
  app: App,
  provider: string,
  model: string,
  updates: { contextWindow: number; maxOutputTokens?: number }
): Promise<ContextWindowOverride> {
  const saved: ContextWindowOverride = {
    contextWindow: updates.contextWindow,
    ...(updates.maxOutputTokens ? { maxOutputTokens: updates.maxOutputTokens } : {}),
    updatedAt: new Date().toISOString(),
  };
  await docRef(app).set({ [overrideKey(provider, model)]: saved }, { merge: true });
  cache = null;
  return saved;
}

export async function clearContextWindowOverride(app: App, provider: string, model: string): Promise<void> {
  await docRef(app).set({ [overrideKey(provider, model)]: FieldValue.delete() }, { merge: true });
  cache = null;
}
