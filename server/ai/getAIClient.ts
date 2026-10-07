import type { Request } from "express";
import type { StructuredAIClient, AIProviderId } from "./types";
import { GeminiClient } from "./geminiClient";
import { OpenAIClient } from "./openaiClient";
import { AnthropicClient } from "./anthropicClient";
import { OllamaClient } from "./ollamaClient";
import { OsoClient, OSO_DEFAULT_ALIAS } from "./osoClient";
import { platformProvider } from "./platformProvider";
import { getAdminApp } from "../firebaseAdmin";
import { getBillingState } from "../billing";
import { isByomPlan, isByomProvider } from "../../src/types/billing";
import { resolveModelForPrompt, type ResolvedModel } from "./resolveModelForPrompt";
import { instrumentStructuredClient } from "../aiCallLog";

const platformClients = new Map<string, StructuredAIClient>();

/**
 * `providerOverride`/`model` let a caller that already resolved an admin's
 * per-prompt or global AI-defaults config (resolveModelForPrompt) hand this
 * function the real provider/model to use. Platform traffic goes through the
 * Oso Model Router (or local Ollama); the direct Gemini/OpenAI/Anthropic
 * clients are BYOM-only (buildProviderClient).
 */
function getPlatformClient(model?: string, providerOverride?: AIProviderId): StructuredAIClient {
  const provider = providerOverride || platformProvider();
  const cacheKey = `${provider}:${model || ""}`;
  let client = platformClients.get(cacheKey);
  if (client) return client;

  switch (provider) {
    case "oso":
      client = new OsoClient(model || process.env.OSO_DEFAULT_MODEL || OSO_DEFAULT_ALIAS);
      break;
    case "ollama": {
      const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
      client = new OllamaClient(baseUrl, model || process.env.OLLAMA_DEFAULT_MODEL || "qwen3:14b");
      break;
    }
    default:
      throw new Error(`Platform AI provider "${provider}" is no longer supported — platform traffic goes through Oso. Update the AI default in Admin > AI Defaults.`);
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
    default:
      // "oso" is the platform's own credential — never constructible from user-supplied input.
      throw new MissingByomKeyError(`"${provider}" is not a supported bring-your-own-model provider.`);
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
  const { client, source } = await pickClientForRequest(req, promptId, uid);
  return instrumentStructuredClient(client, { promptId, uid, source });
}

async function pickClientForRequest(req: Request, promptId: string, uid: string | undefined): Promise<{ client: StructuredAIClient; source: ResolvedModel["source"] }> {
  const app = getAdminApp();
  const platformDefault = await resolveModelForPrompt(app, promptId);
  const platform = () => ({ client: getPlatformClient(platformDefault.model, platformDefault.provider), source: platformDefault.source });

  if (!app || !uid) {
    return platform();
  }

  const billing = await getBillingState(app, uid);

  const requestedProvider = req.header("X-BYOM-Provider") as AIProviderId | undefined;
  if (requestedProvider && !isByomProvider(requestedProvider)) {
    throw new MissingByomKeyError(`"${requestedProvider}" is not a supported bring-your-own-model provider.`);
  }
  if (requestedProvider === "ollama") {
    // Local models are free to run and cost the platform nothing, so they're
    // available regardless of plan — unlike cloud BYOM, which stays gated to
    // BYOM plans below.
    const baseUrl = req.header("X-BYOM-Local-Url") || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = req.header("X-BYOM-Model") || billing.byomModel;
    return { client: buildProviderClient("ollama", baseUrl, model || platformDefault.model), source: "byom" };
  }

  if (!isByomPlan(billing.plan)) {
    return platform();
  }

  const apiKey = req.header("X-BYOM-Key");
  const provider = (req.header("X-BYOM-Provider") || billing.byomProvider) as AIProviderId | undefined;
  const model = req.header("X-BYOM-Model") || billing.byomModel;
  if (provider && !isByomProvider(provider)) {
    throw new MissingByomKeyError(`"${provider}" is not a supported bring-your-own-model provider.`);
  }

  if (!apiKey || !provider) {
    throw new MissingByomKeyError(
      "You're on a BYOM plan but haven't added an API key yet — add one in Settings."
    );
  }
  return { client: buildProviderClient(provider, apiKey, model || platformDefault.model), source: "byom" };
}

/** Non-request-scoped accessor for code paths not yet migrated to per-user BYOM routing — always the platform client. */
export function getAIClient(defaultModel?: string): StructuredAIClient {
  return getPlatformClient(defaultModel);
}
