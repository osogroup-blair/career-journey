import { geminiSchemaToJsonSchema, type GeminiSchema } from "./geminiSchemaToJsonSchema";

interface GenerateContentParams {
  model: string;
  contents: string;
  config?: {
    responseMimeType?: string;
    responseSchema?: GeminiSchema;
    thinkingConfig?: unknown;
  };
}

interface GenerateContentResult {
  text: string;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Drop-in replacement for the narrow slice of @google/genai's `GoogleGenAI`
 * surface that server.ts's ~19 still-unmigrated direct-Gemini-SDK call sites
 * use (`ai.models.generateContent({model, contents, config})`, then
 * `response.text!` and `response.usageMetadata`) — so redirecting the
 * platform default to Ollama doesn't require rewriting every one of those
 * call sites individually. `thinkingConfig` (Gemini's "thinking budget") has
 * no Ollama equivalent and is silently ignored. The `model` argument each
 * call site hardcodes (a Gemini model id like "gemini-3.7-flash") is also
 * ignored in favor of the configured Ollama model, since none of those call
 * sites know an Ollama tag exists — see getOllamaGenAI's callers in server.ts.
 */
export function createOllamaGenAI(baseUrl: string, model: string) {
  return {
    models: {
      async generateContent(params: GenerateContentParams): Promise<GenerateContentResult> {
        const format = params.config?.responseSchema
          ? geminiSchemaToJsonSchema(params.config.responseSchema)
          : undefined;

        let response: Response;
        try {
          response = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: params.contents }],
              format,
              stream: false,
            }),
          });
        } catch (e: any) {
          throw new Error(`Could not reach the local Ollama server at ${baseUrl} — is "ollama serve" running? (${e.message})`);
        }

        if (!response.ok) {
          throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        const content = data?.message?.content;
        if (!content) {
          throw new Error("Ollama returned an empty response");
        }

        return {
          text: content,
          usageMetadata: {
            promptTokenCount: data.prompt_eval_count || 0,
            candidatesTokenCount: data.eval_count || 0,
            totalTokenCount: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          },
        };
      },
    },
  };
}
