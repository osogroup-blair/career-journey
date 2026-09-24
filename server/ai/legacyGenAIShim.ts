import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { geminiSchemaToJsonSchema, type GeminiSchema } from "./geminiSchemaToJsonSchema";
import { createOllamaGenAI } from "./ollamaPlatformClient";
import type { AIProviderId } from "./types";

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
}

/** The narrow `ai.models.generateContent(...)` surface every one of server.ts's legacy (pre-abstraction) AI endpoints already calls. */
export interface LegacyGenAI {
  models: { generateContent(params: LegacyGenerateContentParams): Promise<LegacyGenerateContentResult> };
}

const TOOL_NAME = "emit_response";

function createOpenAIGenAI(apiKey: string, model: string): LegacyGenAI {
  const client = new OpenAI({ apiKey });
  return {
    models: {
      async generateContent(params) {
        const schema = params.config?.responseSchema ? geminiSchemaToJsonSchema(params.config.responseSchema) : undefined;
        const response = await client.chat.completions.create({
          model,
          messages: [{ role: "user", content: params.contents }],
          // Non-strict, matching openaiClient.ts's existing pilot-endpoint
          // choice — these hand-written Gemini-shaped schemas have genuinely
          // optional fields, which OpenAI's strict:true mode disallows.
          ...(schema
            ? { response_format: { type: "json_schema" as const, json_schema: { name: "response", schema } } }
            : {}),
        });
        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error("OpenAI returned an empty response");
        return {
          text: content,
          usageMetadata: {
            promptTokenCount: response.usage?.prompt_tokens || 0,
            candidatesTokenCount: response.usage?.completion_tokens || 0,
            totalTokenCount: response.usage?.total_tokens || 0,
          },
        };
      },
    },
  };
}

function createAnthropicGenAI(apiKey: string, model: string): LegacyGenAI {
  const client = new Anthropic({ apiKey });
  return {
    models: {
      async generateContent(params) {
        const schema = params.config?.responseSchema ? geminiSchemaToJsonSchema(params.config.responseSchema) : undefined;
        const message = await client.messages.create({
          model,
          max_tokens: 8192,
          messages: [{ role: "user", content: params.contents }],
          // No responseSchema means the call site wants free-form text
          // (applicationAssistant/interviewPrepChat) — skip the forced tool
          // call entirely rather than inventing a schema for it.
          ...(schema
            ? {
                tools: [
                  { name: TOOL_NAME, description: "Emit the response in the required shape.", input_schema: schema as Anthropic.Tool.InputSchema },
                ],
                tool_choice: { type: "tool" as const, name: TOOL_NAME },
              }
            : {}),
        });

        const usageMetadata = {
          promptTokenCount: message.usage?.input_tokens || 0,
          candidatesTokenCount: message.usage?.output_tokens || 0,
          totalTokenCount: (message.usage?.input_tokens || 0) + (message.usage?.output_tokens || 0),
        };

        if (schema) {
          const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
          if (!toolUse) throw new Error("Anthropic did not return a tool_use block");
          return { text: JSON.stringify(toolUse.input), usageMetadata };
        }
        const textBlock = message.content.find((block): block is Anthropic.TextBlock => block.type === "text");
        if (!textBlock) throw new Error("Anthropic returned no text content");
        return { text: textBlock.text, usageMetadata };
      },
    },
  };
}

function createGeminiGenAI(apiKey: string): LegacyGenAI {
  // The real SDK already natively implements this exact `.models.generateContent(...)` surface.
  return new GoogleGenAI({ apiKey }) as unknown as LegacyGenAI;
}

/**
 * Provider dispatcher for server.ts's 17 not-yet-migrated-to-Zod AI endpoints,
 * generalizing ollamaPlatformClient.ts's Ollama-only shim to all 4 providers so
 * those call sites can respect an admin-resolved provider/model (see
 * resolveModelForPrompt.ts) without being rewritten onto the
 * StructuredAIClient/Zod abstraction. Reads platform-level credentials from
 * env — an admin picking "OpenAI" or "Anthropic" here spends the platform's
 * own key (same env vars server/scripts/verifyAiProviders.ts already uses),
 * not any user's BYOM key.
 */
export function createLegacyGenAI(provider: AIProviderId, model: string): LegacyGenAI {
  switch (provider) {
    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
      return createGeminiGenAI(apiKey);
    }
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
      return createOpenAIGenAI(apiKey, model);
    }
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
      return createAnthropicGenAI(apiKey, model);
    }
    case "ollama":
      return createOllamaGenAI(process.env.OLLAMA_BASE_URL || "http://localhost:11434", model);
  }
}
