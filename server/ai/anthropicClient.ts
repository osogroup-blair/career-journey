import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { StructuredAIClient, GenerateStructuredParams } from "./types";

const TOOL_NAME = "emit_response";

export class AnthropicClient implements StructuredAIClient {
  readonly provider = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey: string, private model: string = "claude-sonnet-5") {
    this.client = new Anthropic({ apiKey });
  }

  async generateStructured<T>({ systemPrompt, prompt, schema }: GenerateStructuredParams<T>): Promise<T> {
    // Anthropic has no dedicated structured-output mode — the standard pattern
    // is a single forced tool call, where the tool's input_schema IS the
    // response shape and the model's "tool call" is just the JSON we want.
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: TOOL_NAME,
          description: "Emit the response in the required shape.",
          input_schema: z.toJSONSchema(schema) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
    });

    const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (!toolUse) {
      throw new Error("Anthropic did not return a tool_use block");
    }
    return schema.parse(toolUse.input);
  }
}
