import { describe, it, expect, vi, afterEach } from "vitest";
import { OllamaClient } from "../../ai/ollamaClient";
import { decisionSchema } from "../contracts";
afterEach(() => vi.unstubAllGlobals());
describe("assistant structured output provider boundary", () => {
  it("bounds output, forwards cancellation and validates Ollama output", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            kind: "answer",
            message: "Hello",
            tool: "",
            argumentsJson: "",
          }),
        },
        prompt_eval_count: 4,
        eval_count: 2,
      }),
    });
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    const result = await new OllamaClient(
      "http://localhost:11434",
      "fixture",
    ).generateStructured({
      systemPrompt: "Instructions",
      prompt: "Data",
      schema: decisionSchema,
      signal,
      maxOutputTokens: 512,
    });
    expect(result.usage.totalTokens).toBe(6);
    expect(fetch.mock.calls[0][1].signal).toBe(signal);
    expect(JSON.parse(fetch.mock.calls[0][1].body).options.num_predict).toBe(
      512,
    );
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content:
            '{"kind":"tool","message":"bad","tool":"shell","extra":true}',
        },
      }),
    });
    await expect(
      new OllamaClient("http://localhost:11434").generateStructured({
        systemPrompt: "x",
        prompt: "x",
        schema: decisionSchema,
      }),
    ).rejects.toThrow();
  });
});
