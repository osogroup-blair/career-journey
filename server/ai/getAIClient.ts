import type { Request } from "express";
import type { StructuredAIClient, AIProviderId } from "./types";
import { GeminiClient } from "./geminiClient";
import { OpenAIClient } from "./openaiClient";
import { AnthropicClient } from "./anthropicClient";
import { getAdminApp } from "../firebaseAdmin";
import { getBillingState } from "../billing";
import { isByomPlan } from "../../src/types/billing";

let platformClient: GeminiClient | null = null;

function getPlatformClient(): StructuredAIClient {
  if (!platformClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    platformClient = new GeminiClient(process.env.GEMINI_API_KEY);
  }
  return platformClient;
}

/** Thrown when a BYOM-plan request has no usable key — route handlers should turn this into a 400, not a 500. */
export class MissingByomKeyError extends Error {}

export function buildProviderClient(provider: AIProviderId, apiKey: string, model?: string): StructuredAIClient {
  switch (provider) {
    case "gemini":
      return new GeminiClient(apiKey, model);
    case "openai":
      return new OpenAIClient(apiKey, model);
    case "anthropic":
      return new AnthropicClient(apiKey, model);
  }
}

/**
 * Resolves the AI client for a specific request. Free/Pro Monthly (and local
 * dev/unauthenticated fallback) get the platform Gemini client. BYOM tiers
 * get a client built from the key/provider/model carried in request headers
 * — never a server-side lookup, since the key is deliberately never stored
 * (see payment-system-plan.md's Phase 4 key-handling decision). Provider and
 * model fall back to the user's saved *choice* (not the key — see
 * server/billing.ts's byomProvider/byomModel fields) if the headers omit them,
 * so the client doesn't have to resend them on every single request.
 */
export async function getAIClientForRequest(req: Request): Promise<StructuredAIClient> {
  const uid = (req as any).uid as string | undefined;
  const app = getAdminApp();
  if (!app || !uid) {
    return getPlatformClient();
  }

  const billing = await getBillingState(app, uid);
  if (!isByomPlan(billing.plan)) {
    return getPlatformClient();
  }

  const apiKey = req.header("X-BYOM-Key");
  const provider = (req.header("X-BYOM-Provider") || billing.byomProvider) as AIProviderId | undefined;
  const model = req.header("X-BYOM-Model") || billing.byomModel;

  if (!apiKey || !provider) {
    throw new MissingByomKeyError(
      "You're on a BYOM plan but haven't added an API key yet — add one in Settings."
    );
  }
  return buildProviderClient(provider, apiKey, model);
}

/** Non-request-scoped accessor for code paths not yet migrated to per-user BYOM routing — always the platform client. */
export function getAIClient(): StructuredAIClient {
  return getPlatformClient();
}
