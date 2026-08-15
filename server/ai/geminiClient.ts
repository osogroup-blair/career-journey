import { GoogleGenAI } from "@google/genai";
import type { StructuredAIClient, GenerateStructuredParams, StructuredAIResult } from "./types";
import { zodToGeminiSchema } from "./zodToGeminiSchema";

export class GeminiClient implements StructuredAIClient {
  readonly provider = "gemini" as const;
  private ai: GoogleGenAI;

  constructor(apiKey: string, readonly model: string = "gemini-3.1-pro-preview") {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateStructured<T>({ systemPrompt, prompt, schema }: GenerateStructuredParams<T>): Promise<StructuredAIResult<T>> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: `${systemPrompt}\n\n${prompt}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: zodToGeminiSchema(schema),
      },
    });
    if (!response.text) {
      throw new Error("Gemini returned an empty response");
    }
    // Re-validate against the zod schema rather than trust the API's structured-
    // output guarantee blindly — this app has hit real cases (documented in
    // payment-system-plan.md / prior session history) of Gemini returning `{}`
    // for underspecified nested schemas.
    const data = schema.parse(JSON.parse(response.text));
    const usage = {
      promptTokens: response.usageMetadata?.promptTokenCount || 0,
      completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: response.usageMetadata?.totalTokenCount || 0,
    };
    return { data, usage, model: this.model };
  }
}
