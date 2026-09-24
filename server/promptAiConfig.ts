import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { AIProviderId } from "./ai/types";
import { ALL_KNOWLEDGE_FILE_NAMES } from "./knowledge";
import { DEFAULT_PROMPTS } from "./promptStore";

export interface PromptAiConfig {
  /** null = inherit the global AI default (server/aiDefaults.ts). */
  modelOverride: { provider: AIProviderId; model: string } | null;
  /** null = include this prompt's default knowledge-file set (all pipeline files, or the Builder file for Builder-stage prompts) — see knowledgePreamble.ts. */
  includedKnowledge: string[] | null;
}

export type PromptAiConfigMap = Record<string, PromptAiConfig>;

function emptyConfig(): PromptAiConfig {
  return { modelOverride: null, includedKnowledge: null };
}

// Same 30s cache pattern as featureFlags.ts/aiDefaults.ts.
let cache: { configs: PromptAiConfigMap; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

function docRef(app: App) {
  return getFirestore(app).collection("config").doc("promptAiConfig");
}

export async function getPromptAiConfigMap(app: App | null): Promise<PromptAiConfigMap> {
  if (!app) return {};

  const now = Date.now();
  if (cache && now < cache.expiresAt) return cache.configs;

  const snap = await docRef(app).get();
  const stored = (snap.exists ? snap.data() : {}) as PromptAiConfigMap;
  cache = { configs: stored, expiresAt: now + CACHE_TTL_MS };
  return stored;
}

export async function getPromptAiConfigFor(app: App | null, id: string): Promise<PromptAiConfig> {
  const map = await getPromptAiConfigMap(app);
  return { ...emptyConfig(), ...(map[id] || {}) };
}

export function _resetPromptAiConfigCache(): void {
  cache = null;
}

const VALID_PROVIDERS: AIProviderId[] = ["gemini", "openai", "anthropic", "ollama"];

export function validatePromptAiConfigUpdate(id: string, input: unknown): void {
  if (!(id in DEFAULT_PROMPTS)) {
    throw new Error(`Unknown prompt "${id}"`);
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Prompt AI config update must be an object.");
  }
  const updates = input as Record<string, unknown>;

  if ("modelOverride" in updates && updates.modelOverride !== null) {
    const override = updates.modelOverride;
    if (typeof override !== "object" || override === null || Array.isArray(override)) {
      throw new Error("modelOverride must be an object or null.");
    }
    const { provider, model } = override as Record<string, unknown>;
    if (!VALID_PROVIDERS.includes(provider as AIProviderId)) {
      throw new Error(`Unknown provider "${provider}".`);
    }
    if (typeof model !== "string" || !model.trim()) {
      throw new Error("modelOverride.model must be a non-empty string.");
    }
  }

  if ("includedKnowledge" in updates && updates.includedKnowledge !== null) {
    const files = updates.includedKnowledge;
    if (!Array.isArray(files) || !files.every((f) => typeof f === "string")) {
      throw new Error("includedKnowledge must be an array of strings or null.");
    }
    for (const f of files) {
      if (!ALL_KNOWLEDGE_FILE_NAMES.includes(f)) {
        throw new Error(`Unknown knowledge file "${f}".`);
      }
    }
  }

  const allowedKeys = new Set(["modelOverride", "includedKnowledge"]);
  for (const key of Object.keys(updates)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown prompt-AI-config field "${key}".`);
    }
  }
}

/**
 * `.set({[id]: merged}, {merge:true})` only touches this prompt's top-level
 * key in the doc — Firestore's merge writes each given top-level field
 * wholesale rather than deep-merging, which is exactly what's wanted here
 * since `merged` was already computed by spreading over the current value.
 * Two admins editing different prompts' config around the same time won't
 * clobber each other's keys the way a bare `.set(updates, {merge:true})`
 * against the whole doc could if it raced with unrelated keys — see
 * featureFlags.ts for the simpler single-object version this extends.
 */
export async function setPromptAiConfigFor(app: App, id: string, updates: Partial<PromptAiConfig>): Promise<PromptAiConfig> {
  const current = await getPromptAiConfigFor(app, id);
  const merged: PromptAiConfig = { ...current, ...updates };
  await docRef(app).set({ [id]: merged }, { merge: true });
  cache = null; // next read picks up the change immediately instead of waiting out the TTL
  return merged;
}
