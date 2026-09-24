import { z } from "zod";
import type { StructuredAIClient, GenerateStructuredParams, StructuredAIResult } from "./types";

export class OllamaClient implements StructuredAIClient {
  readonly provider = "ollama" as const;

  constructor(private baseUrl: string, readonly model: string = "qwen3:14b") {}

  async generateStructured<T>({ systemPrompt, prompt, schema }: GenerateStructuredParams<T>): Promise<StructuredAIResult<T>> {
    // Ollama's native /api/chat accepts a JSON Schema directly via `format` —
    // the documented, stable way to get structured output (its OpenAI-
    // compatible endpoint's structured-output support has been inconsistent
    // across versions).
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          format: z.toJSONSchema(schema),
          stream: false,
        }),
      });
    } catch (e: any) {
      throw new Error(`Could not reach the local Ollama server at ${this.baseUrl} — is "ollama serve" running? (${e.message})`);
    }

    if (!response.ok) {
      throw new Error(`Local model server returned ${response.status}: ${await response.text()}`);
    }

    const body = await response.json();
    const content = body?.message?.content;
    if (!content) {
      throw new Error("Ollama returned an empty response");
    }
    // Re-validate against zod like every other provider client — never trust
    // a model's structured-output guarantee blindly.
    const data = schema.parse(JSON.parse(content));
    const usage = {
      promptTokens: body.prompt_eval_count || 0,
      completionTokens: body.eval_count || 0,
      totalTokens: (body.prompt_eval_count || 0) + (body.eval_count || 0),
    };
    return { data, usage, model: this.model };
  }
}
