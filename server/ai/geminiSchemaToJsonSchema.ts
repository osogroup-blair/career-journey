/**
 * Converts the @google/genai `Type`-enum-based schema tree (server.ts's ~19
 * still-unmigrated direct-Gemini-SDK call sites all build one of these for
 * `config.responseSchema`) into a plain JSON Schema, which is what Ollama's
 * `/api/chat` `format` field expects. The two shapes are structurally
 * identical (properties/items/required/description all pass straight
 * through) — the only real difference is Gemini's uppercase type enum
 * ("STRING", "OBJECT", …) versus JSON Schema's lowercase ("string", "object").
 */
export interface GeminiSchema {
  type: string;
  description?: string;
  properties?: Record<string, GeminiSchema>;
  items?: GeminiSchema;
  required?: string[];
}

const TYPE_MAP: Record<string, string> = {
  STRING: "string",
  OBJECT: "object",
  ARRAY: "array",
  NUMBER: "number",
  BOOLEAN: "boolean",
  INTEGER: "integer",
};

export function geminiSchemaToJsonSchema(schema: GeminiSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: TYPE_MAP[schema.type] || schema.type.toLowerCase(),
  };
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, geminiSchemaToJsonSchema(value)])
    );
  }
  if (schema.items) out.items = geminiSchemaToJsonSchema(schema.items);
  if (schema.required) out.required = schema.required;
  return out;
}
