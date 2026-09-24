import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { AIProviderId } from "./ai/types";

export interface AiDefaults {
  provider: AIProviderId;
  model: string;
}

/**
 * Same starting point as today's env-var-only behavior (server/ai/getAIClient.ts's
 * platformProvider()/server.ts's module-level client) — a fresh deploy with no
 * Firestore doc yet, or local dev with no Firebase configured, keeps working
 * exactly as it did before this file existed.
 */
export function defaultAiDefaults(): AiDefaults {
  const provider = (process.env.AI_PLATFORM_PROVIDER || "ollama").toLowerCase() === "gemini" ? "gemini" : "ollama";
  const model =
    provider === "ollama"
      ? process.env.OLLAMA_DEFAULT_MODEL || "qwen3:14b"
      : "gemini-3.5-flash-lite";
  return { provider: provider as AIProviderId, model };
}

// Same 30s staleness window as featureFlags.ts — cheap enough to read on every
// AI call, fast enough that a global default change feels live to an admin.
let cache: { defaults: AiDefaults; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

function docRef(app: App) {
  return getFirestore(app).collection("config").doc("aiDefaults");
}

export async function getAiDefaults(app: App | null): Promise<AiDefaults> {
  if (!app) return defaultAiDefaults();

  const now = Date.now();
  if (cache && now < cache.expiresAt) return cache.defaults;

  const snap = await docRef(app).get();
  const stored = snap.exists ? (snap.data() as Partial<AiDefaults>) : {};
  const defaults: AiDefaults = { ...defaultAiDefaults(), ...stored };
  cache = { defaults, expiresAt: now + CACHE_TTL_MS };
  return defaults;
}

export function _resetAiDefaultsCache(): void {
  cache = null;
}

const VALID_PROVIDERS: AIProviderId[] = ["gemini", "openai", "anthropic", "ollama"];

export function validateAiDefaultsUpdate(input: unknown): void {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("AI defaults update must be an object.");
  }
  const updates = input as Record<string, unknown>;

  if ("provider" in updates && !VALID_PROVIDERS.includes(updates.provider as AIProviderId)) {
    throw new Error(`Unknown provider "${updates.provider}".`);
  }
  if ("model" in updates && (typeof updates.model !== "string" || !updates.model.trim())) {
    throw new Error("model must be a non-empty string.");
  }

  const allowedKeys = new Set(["provider", "model"]);
  for (const key of Object.keys(updates)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown AI-defaults field "${key}".`);
    }
  }
}

export async function setAiDefaults(app: App, updates: Partial<AiDefaults>): Promise<AiDefaults> {
  await docRef(app).set(updates, { merge: true });
  cache = null; // next read picks up the change immediately instead of waiting out the TTL
  return getAiDefaults(app);
}
