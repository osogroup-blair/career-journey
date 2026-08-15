import OpenAI from "openai";
import { z } from "zod";
import type { StructuredAIClient, GenerateStructuredParams, StructuredAIResult } from "./types";

export class OpenAIClient implements StructuredAIClient {
  readonly provider = "openai" as const;
  private client: OpenAI;

  constructor(apiKey: string, readonly model: string = "gpt-5.6-terra") {
    this.client = new OpenAI({ apiKey });
  }

  async generateStructured<T>({ systemPrompt, prompt, schema }: GenerateStructuredParams<T>): Promise<StructuredAIResult<T>> {
    // Non-strict json_schema mode: strict:true requires every property to be
    // listed in `required` (optional fields would need converting to nullable
    // unions instead) — this app's existing schemas have genuinely optional
    // fields, so non-strict is the simpler fit for this pilot. Worth
    // revisiting for stricter enforcement during Phase 4's full migration.
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "response", schema: z.toJSONSchema(schema) as Record<string, unknown> },
      },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response");
    }
    const data = schema.parse(JSON.parse(content));
    const usage = {
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
    };
    return { data, usage, model: this.model };
  }
}
