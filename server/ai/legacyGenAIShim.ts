import OpenAI from "openai";
import { geminiSchemaToJsonSchema, type GeminiSchema } from "./geminiSchemaToJsonSchema";
import { createOllamaGenAI } from "./ollamaPlatformClient";
import type { AIProviderId } from "./types";
import { createOsoOpenAI, osoRoutingFields, osoResponseMeta, toOsoError, jsonInstruction, extractJson, withOsoRetry } from "./osoClient";

export interface LegacyGenerateContentParams {
  model: string;
  contents: string;
  config?: {
    responseMimeType?: string;
    responseSchema?: GeminiSchema;
    thinkingConfig?: unknown;
  };
}

export interface LegacyGenerateContentResult {
  text: string;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  /** Oso only: the physical model that answered, and the router's request id. */
  actualModel?: string;
  requestId?: string;
}

/** The narrow `ai.models.generateContent(...)` surface every one of server.ts's legacy (pre-abstraction) AI endpoints already calls. */
export interface LegacyGenAI {
  models: { generateContent(params: LegacyGenerateContentParams): Promise<LegacyGenerateContentResult> };
}

/**
 * The Oso router speaks the OpenAI chat-completions dialect. Requests are kept
 * minimal (see osoRoutingFields): the Gemini-style response schema is turned
 * into a prompt instruction rather than `response_format`, and the reply is
 * cleaned of code fences before the callers' own JSON.parse. One retry on a
 * 5xx/429 or an unparseable reply (withOsoRetry).
 */
function createOsoGenAI(model: string): LegacyGenAI {
  const client = createOsoOpenAI();

  async function attempt(params: LegacyGenerateContentParams): Promise<LegacyGenerateContentResult> {
    const schema = params.config?.responseSchema ? geminiSchemaToJsonSchema(params.config.responseSchema) : undefined;
    let data: OpenAI.Chat.ChatCompletion;
    let headers: Headers;
    try {
      const r = await client.chat.completions
        .create({
          model,
          messages: [{ role: "user", content: schema ? params.contents + jsonInstruction(schema) : params.contents }],
          ...osoRoutingFields(),
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming)
        .withResponse();
      data = r.data;
      headers = r.response.headers;
    } catch (e) {
      throw toOsoError(e);
    }
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error("Oso returned an empty response");
    return {
      text: schema ? extractJson(content) : content,
      usageMetadata: {
        promptTokenCount: data.usage?.prompt_tokens || 0,
        candidatesTokenCount: data.usage?.completion_tokens || 0,
        totalTokenCount: data.usage?.total_tokens || 0,
      },
      ...osoResponseMeta(headers),
    };
  }

  return { models: { generateContent: (params) => withOsoRetry(() => attempt(params)) } };
}

/**
 * Provider dispatcher for server.ts's 17 not-yet-migrated-to-Zod AI endpoints,
 * so those call sites respect an admin-resolved provider/model (see
 * resolveModelForPrompt.ts) without being rewritten onto the
 * StructuredAIClient/Zod abstraction. Platform traffic is "oso" (the Oso Model
 * Router, credential from env) or "ollama"; the direct gemini/openai/anthropic
 * providers are BYOM-only, and BYOM does not reach these endpoints.
 */
export function createLegacyGenAI(provider: AIProviderId, model: string): LegacyGenAI {
  switch (provider) {
    case "oso":
      return createOsoGenAI(model);
    case "ollama":
      return createOllamaGenAI(process.env.OLLAMA_BASE_URL || "http://localhost:11434", model);
    default:
      throw new Error(`Platform AI provider "${provider}" is no longer supported — platform traffic goes through Oso. Update the AI default in Admin > AI Defaults.`);
  }
}
