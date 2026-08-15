import type { ZodType } from "zod";
import type { AIProviderId } from "../../src/types/billing";

export type { AIProviderId };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StructuredAIResult<T> {
  data: T;
  usage: TokenUsage;
  model: string;
}

export interface GenerateStructuredParams<T> {
  /** Instructions/reference material that applies to the whole call — prepended once, not per-turn. */
  systemPrompt: string;
  /** The actual task + data for this specific call. */
  prompt: string;
  /** Single source of truth for the response shape — every provider implementation converts this into its own native structured-output format. */
  schema: ZodType<T>;
}

/**
 * Provider-agnostic structured-output client. Each implementation (Gemini/
 * OpenAI/Anthropic) converts the zod schema into that provider's own
 * structured-output mechanism (Gemini response schema, OpenAI json_schema
 * response format, Anthropic forced tool-use) and re-validates the parsed
 * result against the same zod schema before returning — never trust a
 * provider's structured-output guarantee blindly, they've all been known to
 * return subtly malformed shapes under nested/nullable schemas.
 */
export interface StructuredAIClient {
  readonly provider: AIProviderId;
  readonly model: string;
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<StructuredAIResult<T>>;
}
