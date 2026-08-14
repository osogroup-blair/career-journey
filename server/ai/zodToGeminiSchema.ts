import { z, ZodType } from "zod";
import { Type } from "@google/genai";

/**
 * Converts a zod schema into Gemini's response-schema format (Type.OBJECT/
 * Type.STRING/etc, not standard JSON Schema — a different sub-format despite
 * looking similar). Goes through zod v4's built-in z.toJSONSchema() first
 * rather than hand-writing a zod-AST walker, then maps the JSON Schema shape
 * onto Gemini's enum-based type system.
 *
 * Verified against this app's actual schema shapes (nested objects, arrays,
 * optional fields, reused sub-schemas) before relying on it: z.toJSONSchema()
 * inlines every nested object rather than extracting $defs/$ref, even when
 * the same zod object instance is reused across multiple properties — so
 * this converter deliberately does NOT handle $ref/$defs. If a future schema
 * ever produces one (e.g. a genuinely recursive type), this will need
 * extending rather than silently producing a broken Gemini schema.
 */
export function zodToGeminiSchema<T>(schema: ZodType<T>): any {
  const jsonSchema = z.toJSONSchema(schema);
  if ("$ref" in jsonSchema || "$defs" in jsonSchema) {
    throw new Error(
      "zodToGeminiSchema: schema produced $ref/$defs (likely a reused or recursive sub-schema), which this converter doesn't handle — inline the sub-schema instead."
    );
  }
  return convertNode(jsonSchema);
}

function convertNode(node: any): any {
  if (node.enum) {
    return { type: Type.STRING, description: node.description, enum: node.enum };
  }
  switch (node.type) {
    case "object": {
      const properties: Record<string, any> = {};
      for (const [key, value] of Object.entries<any>(node.properties || {})) {
        properties[key] = convertNode(value);
      }
      return {
        type: Type.OBJECT,
        properties,
        ...(node.required?.length ? { required: node.required } : {}),
        ...(node.description ? { description: node.description } : {}),
      };
    }
    case "array":
      return {
        type: Type.ARRAY,
        items: convertNode(node.items),
        ...(node.description ? { description: node.description } : {}),
      };
    case "string":
      return { type: Type.STRING, ...(node.description ? { description: node.description } : {}) };
    case "number":
    case "integer":
      return { type: Type.NUMBER, ...(node.description ? { description: node.description } : {}) };
    case "boolean":
      return { type: Type.BOOLEAN, ...(node.description ? { description: node.description } : {}) };
    default:
      throw new Error(`zodToGeminiSchema: unsupported JSON Schema node type "${node.type}" — this app's schemas only use object/array/string/number/boolean/enum.`);
  }
}
