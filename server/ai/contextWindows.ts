import type { App } from "firebase-admin/app";
import type { AIProviderId } from "./types";
import { getContextWindowOverrideFor } from "../modelContextWindows";

/**
 * Static context-window sizes (input tokens) for cloud models, sourced from
 * each provider's published docs as of this file's authoring — NOT
 * introspectable at runtime the way Ollama's /api/show is (see below).
 * Re-verify against current provider docs before trusting an exact figure;
 * treat these as reasonable defaults for the "does this fit" warning, not a
 * billing-grade guarantee. Unknown model ids fall back to a conservative default.
 */
const CLOUD_CONTEXT_WINDOWS: Record<string, number> = {
  "gemini-3.5-flash-lite": 1_000_000,
  "gemini-3.7-flash": 1_000_000,
  "gemini-3.1-pro-preview": 1_000_000,
  "gpt-5.6-terra": 400_000,
  "claude-sonnet-5": 200_000,
  "claude-opus-5-5": 200_000,
  "claude-fable-5-1": 200_000,
};

const CLOUD_DEFAULT_CONTEXT_WINDOW: Record<Exclude<AIProviderId, "ollama">, number> = {
  gemini: 1_000_000,
  openai: 400_000,
  anthropic: 200_000,
};

const ollamaContextWindowCache = new Map<string, number | null>();

/** Ollama's /api/show reports a model's real context length — the one provider here with a live introspection API. */
export async function getOllamaContextWindow(baseUrl: string, model: string): Promise<number | null> {
  const cacheKey = `${baseUrl}:${model}`;
  if (ollamaContextWindowCache.has(cacheKey)) return ollamaContextWindowCache.get(cacheKey)!;

  try {
    const res = await fetch(`${baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    if (!res.ok) {
      ollamaContextWindowCache.set(cacheKey, null);
      return null;
    }
    const data = await res.json();
    const modelInfo = data?.model_info || {};
    // The context-length key is namespaced by architecture, e.g. "qwen3.context_length".
    const key = Object.keys(modelInfo).find((k) => k.endsWith(".context_length"));
    const value = key ? Number(modelInfo[key]) : null;
    const result = Number.isFinite(value) && value! > 0 ? value : null;
    ollamaContextWindowCache.set(cacheKey, result);
    return result;
  } catch {
    ollamaContextWindowCache.set(cacheKey, null);
    return null;
  }
}

export async function getContextWindow(provider: AIProviderId, model: string, ollamaBaseUrl?: string): Promise<number | null> {
  if (provider === "ollama") {
    return getOllamaContextWindow(ollamaBaseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434", model);
  }
  return CLOUD_CONTEXT_WINDOWS[model] ?? CLOUD_DEFAULT_CONTEXT_WINDOW[provider];
}

export interface ResolvedContextWindow {
  contextWindow: number | null;
  maxOutputTokens: number | null;
  source: "admin" | "builtin";
}

/**
 * Override-aware entry point: an admin-set value (server/modelContextWindows.ts)
 * beats the static table/live Ollama introspection this file falls back to.
 * Callers that don't need admin overrides (there are none left — even the
 * contextSize estimator wants overrides honored) can still call
 * getContextWindow directly for the raw built-in figure.
 */
export async function resolveContextWindow(
  app: App | null,
  provider: AIProviderId,
  model: string,
  ollamaBaseUrl?: string
): Promise<ResolvedContextWindow> {
  const override = await getContextWindowOverrideFor(app, provider, model);
  if (override) {
    return { contextWindow: override.contextWindow, maxOutputTokens: override.maxOutputTokens ?? null, source: "admin" };
  }
  const contextWindow = await getContextWindow(provider, model, ollamaBaseUrl);
  return { contextWindow, maxOutputTokens: null, source: "builtin" };
}
