import type { Request } from "express";
import type { StructuredAIClient, AIProviderId } from "./types";
import { GeminiClient } from "./geminiClient";
import { OpenAIClient } from "./openaiClient";
import { AnthropicClient } from "./anthropicClient";
import { OllamaClient } from "./ollamaClient";
import { getAdminApp } from "../firebaseAdmin";
import { getBillingState } from "../billing";
import { isByomPlan } from "../../src/types/billing";
import { resolveModelForPrompt } from "./resolveModelForPrompt";

const platformClients = new Map<string, StructuredAIClient>();

/**
 * Env-only fallback provider, used when there's no admin config doc to read
 * (local dev without Firebase) or no providerOverride is given. Defaults to
 * "ollama" — a local model costs nothing to run and keeps user data off any
 * third-party API — but can be switched via env var without a code change.
 */
function platformProvider(): "ollama" | "gemini" {
  return (process.env.AI_PLATFORM_PROVIDER || "ollama").toLowerCase() === "gemini" ? "gemini" : "ollama";
}

/**
 * `providerOverride`/`model` let a caller that already resolved an admin's
 * per-prompt or global AI-defaults config (resolveModelForPrompt) hand this
 * function the real provider/model to use, instead of falling back to the
 * env-var-only platformProvider() — the only way admin config for OpenAI/
 * Anthropic platform defaults can ever take effect, since env vars alone
 * only distinguish "ollama" vs "gemini".
 */
function getPlatformClient(model?: string, providerOverride?: AIProviderId): StructuredAIClient {
  const provider = providerOverride || platformProvider();
  const cacheKey = `${provider}:${model || ""}`;
  let client = platformClients.get(cacheKey);
  if (client) return client;

  switch (provider) {
    case "ollama": {
      const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
      client = new OllamaClient(baseUrl, model || process.env.OLLAMA_DEFAULT_MODEL || "qwen3:14b");
      break;
    }
    case "openai": {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
      client = new OpenAIClient(process.env.OPENAI_API_KEY, model);
      break;
    }
    case "anthropic": {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
      client = new AnthropicClient(process.env.ANTHROPIC_API_KEY, model);
      break;
    }
    default: {
      if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
      client = new GeminiClient(process.env.GEMINI_API_KEY, model || "gemini-3.5-flash-lite");
    }
  }
  platformClients.set(cacheKey, client);
  return client;
}

/** Thrown when a BYOM-plan request has no usable key — route handlers should turn this into a 400, not a 500. */
export class MissingByomKeyError extends Error {}

/**
 * `apiKey` carries the local server's base URL, not a real API key, when
 * provider is "ollama" — local models don't need one (see
 * local-model-implementation-plan.md).
 */
export function buildProviderClient(provider: AIProviderId, apiKey: string, model?: string): StructuredAIClient {
  switch (provider) {
    case "gemini":
      return new GeminiClient(apiKey, model);
    case "openai":
      return new OpenAIClient(apiKey, model);
    case "anthropic":
      return new AnthropicClient(apiKey, model);
    case "ollama":
      return new OllamaClient(apiKey, model);
  }
}

/**
 * Resolves the AI client for a specific request/prompt. Free/Pro Monthly (and
 * local dev/unauthenticated fallback) get the platform client — provider and
 * model resolved from the admin's per-prompt override or global default
 * (resolveModelForPrompt), falling back to env vars with no admin config doc
 * present. BYOM tiers get a client built from the key/provider/model carried
 * in request headers — never a server-side lookup, since the key is
 * deliberately never stored (see payment-system-plan.md's Phase 4 key-
 * handling decision). Provider and model fall back to the user's saved
 * *choice* (not the key — see server/billing.ts's byomProvider/byomModel
 * fields), then the admin-resolved platform default, if the headers omit them.
 */
export async function getAIClientForRequest(req: Request, promptId: string): Promise<StructuredAIClient> {
  const uid = (req as any).uid as string | undefined;
  const app = getAdminApp();
  const platformDefault = await resolveModelForPrompt(app, promptId);

  if (!app || !uid) {
    return getPlatformClient(platformDefault.model, platformDefault.provider);
  }

  const billing = await getBillingState(app, uid);

  const requestedProvider = req.header("X-BYOM-Provider") as AIProviderId | undefined;
  if (requestedProvider === "ollama") {
    // Local models are free to run and cost the platform nothing, so they're
    // available regardless of plan — unlike cloud BYOM, which stays gated to
    // BYOM plans below.
    const baseUrl = req.header("X-BYOM-Local-Url") || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = req.header("X-BYOM-Model") || billing.byomModel;
    return buildProviderClient("ollama", baseUrl, model || platformDefault.model);
  }

  if (!isByomPlan(billing.plan)) {
    return getPlatformClient(platformDefault.model, platformDefault.provider);
  }

  const apiKey = req.header("X-BYOM-Key");
  const provider = (req.header("X-BYOM-Provider") || billing.byomProvider) as AIProviderId | undefined;
  const model = req.header("X-BYOM-Model") || billing.byomModel;

  if (!apiKey || !provider) {
    throw new MissingByomKeyError(
      "You're on a BYOM plan but haven't added an API key yet — add one in Settings."
    );
  }
  return buildProviderClient(provider, apiKey, model || platformDefault.model);
}

/** Non-request-scoped accessor for code paths not yet migrated to per-user BYOM routing — always the platform client. */
export function getAIClient(defaultModel?: string): StructuredAIClient {
  return getPlatformClient(defaultModel);
}
