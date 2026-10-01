import OpenAI from "openai";
import { z } from "zod";
import type { StructuredAIClient, GenerateStructuredParams, StructuredAIResult } from "./types";

/**
 * Oso Model Router (https://models.oso.group) — an OpenAI-compatible gateway
 * in front of open-weight Vertex models, Gemini, Anthropic and OpenAI. The
 * platform's credential for it (OSO_AI_API_KEY) never leaves the server and is
 * never a user-selectable BYOM provider.
 */

export interface OsoConfig {
  baseUrl: string;
  apiKey: string;
  /** Empty = send no `routing` object at all and let the router apply its own defaults. */
  dataClassification: string;
}

// oso/general has been the slow/flaky one (long latencies, 503 routing_failed from an open circuit breaker), so the default is oso/reasoning.
export const OSO_DEFAULT_ALIAS = "oso/reasoning";

export function isOsoConfigured(): boolean {
  return !!process.env.OSO_AI_API_KEY;
}

export function osoConfig(): OsoConfig {
  const apiKey = process.env.OSO_AI_API_KEY;
  if (!apiKey) throw new Error("OSO_AI_API_KEY is not configured");
  return {
    baseUrl: (process.env.OSO_ROUTER_URL || "https://models.oso.group").replace(/\/+$/, ""),
    apiKey,
    dataClassification: process.env.OSO_DATA_CLASSIFICATION?.trim() || "",
  };
}

/** The SDK's own retries are off: withOsoRetry below is the single retry policy (the router already does multi-hop fallback). */
export function createOsoOpenAI(): OpenAI {
  const { baseUrl, apiKey } = osoConfig();
  return new OpenAI({ baseURL: `${baseUrl}/v1`, apiKey, maxRetries: 0 });
}

/**
 * Optional fields to spread into the request body. By default NOTHING is sent
 * beyond model + messages: no `routing` object, and no `response_format`,
 * `tools` or `task_type` — the router turns each of those into a required
 * model capability or an eligibility filter, and rejects/narrows targets
 * accordingly (422 `unsupported_capability`; with data_classification=
 * confidential only one slow Vertex model was eligible and its circuit
 * breaker kept opening). JSON output is requested in the prompt instead (see
 * jsonInstruction) and validated on our side. Set OSO_DATA_CLASSIFICATION to
 * opt back in to sending `routing.data_classification`.
 */
export function osoRoutingFields(): { routing?: { data_classification: string } } {
  const { dataClassification } = osoConfig();
  return dataClassification ? { routing: { data_classification: dataClassification } } : {};
}

/** Prompt suffix asking for a bare JSON object matching `jsonSchema`, since no response_format is sent. */
export function jsonInstruction(jsonSchema: unknown): string {
  return `\n\nRespond with ONLY a single valid JSON value that conforms to this JSON Schema. No prose, no markdown code fences.\nJSON Schema:\n${JSON.stringify(jsonSchema)}`;
}

/** The model replied, but not with parseable JSON — retryable, since a second sample usually fixes it. */
export class OsoInvalidJsonError extends Error {
  constructor() {
    super("Oso returned a reply that isn't valid JSON");
    this.name = "OsoInvalidJsonError";
  }
}

/** Pulls the JSON value out of a model reply that may be wrapped in ```json fences or surrounded by prose. */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  const valid = (t: string) => {
    try {
      JSON.parse(t);
      return true;
    } catch {
      return false;
    }
  };
  if (valid(candidate)) return candidate;
  const start = candidate.search(/[\[{]/);
  const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
  if (start >= 0 && end > start) {
    const slice = candidate.slice(start, end + 1);
    if (valid(slice)) return slice;
  }
  throw new OsoInvalidJsonError();
}

/** A normalized router failure — carries the fields handleAiRouteError needs and never the raw upstream message for end users. */
export class OsoRouterError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly retryAfter?: number
  ) {
    super(message);
    this.name = "OsoRouterError";
  }
}

/** Converts an openai-SDK APIError (whose body is the Oso error envelope) into an OsoRouterError; anything else passes through. */
export function toOsoError(err: unknown): unknown {
  if (err instanceof OpenAI.APIError) {
    const body = (err.error ?? {}) as { code?: string; type?: string; request_id?: string; message?: string };
    const retryAfterRaw = err.headers?.["retry-after"];
    const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : undefined;
    return new OsoRouterError(
      body.message || err.message,
      err.status ?? 502,
      body.code || body.type || "router_error",
      body.request_id || err.headers?.["x-request-id"],
      Number.isFinite(retryAfter) ? retryAfter : undefined
    );
  }
  return err;
}

/**
 * Single retry policy for Oso calls: one extra attempt on a rate limit, a 5xx
 * router/provider failure, or a reply that isn't valid JSON / doesn't match the
 * schema. Anything else (auth, 4xx policy errors, empty reply) fails fast.
 */
export async function withOsoRetry<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const routerRetryable = e instanceof OsoRouterError && (e.status === 429 || e.status >= 500);
    const outputRetryable = e instanceof OsoInvalidJsonError || e instanceof z.ZodError;
    if (!routerRetryable && !outputRetryable) throw e;
    if (e instanceof OsoRouterError) await sleep(Math.min((e.retryAfter ?? 1) * 1000, 5_000));
    return fn();
  }
}

export function osoResponseMeta(headers: Headers): { actualModel?: string; requestId?: string } {
  return {
    actualModel: headers.get("x-oso-actual-model") || undefined,
    requestId: headers.get("x-request-id") || undefined,
  };
}

export class OsoClient implements StructuredAIClient {
  readonly provider = "oso" as const;
  private client: OpenAI;

  constructor(readonly model: string = OSO_DEFAULT_ALIAS) {
    this.client = createOsoOpenAI();
  }

  async generateStructured<T>({ systemPrompt, prompt, schema }: GenerateStructuredParams<T>): Promise<StructuredAIResult<T>> {
    return withOsoRetry(async () => {
      let data, response;
      try {
        ({ data, response } = await this.client.chat.completions
          .create({
            model: this.model,
            messages: [
              { role: "system", content: systemPrompt + jsonInstruction(z.toJSONSchema(schema)) },
              { role: "user", content: prompt },
            ],
            ...osoRoutingFields(),
          } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming)
          .withResponse());
      } catch (e) {
        throw toOsoError(e);
      }
      const content = data.choices[0]?.message?.content;
      if (!content) throw new Error("Oso returned an empty response");
      return {
        data: schema.parse(JSON.parse(extractJson(content))),
        usage: {
          promptTokens: data.usage?.prompt_tokens || 0,
          completionTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        model: this.model,
        ...osoResponseMeta(response.headers),
      };
    });
  }
}

export interface OsoModelInfo {
  id: string;
  capabilities: string[];
  contextLength: number | null;
  maxOutputTokens: number | null;
}

/** GET /v1/models — the aliases this key may call, with limits and capabilities. */
export async function fetchOsoModels(): Promise<OsoModelInfo[]> {
  const { baseUrl, apiKey } = osoConfig();
  const res = await fetch(`${baseUrl}/v1/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Oso GET /v1/models failed with HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ id: string; capabilities?: string[]; context_length?: number; max_output_tokens?: number }> };
  return (body.data || []).map((m) => ({
    id: m.id,
    capabilities: m.capabilities || [],
    contextLength: m.context_length ?? null,
    maxOutputTokens: m.max_output_tokens ?? null,
  }));
}

export interface OsoStatus {
  configured: boolean;
  baseUrl: string;
  dataClassification: string;
  health: { ok: boolean; version?: string; gitSha?: string; error?: string };
  models: { ok: boolean; count?: number; error?: string };
}

/** Admin-facing router status: /health (public) plus an authenticated /v1/models reachability check. */
export async function fetchOsoStatus(): Promise<OsoStatus> {
  const baseUrl = (process.env.OSO_ROUTER_URL || "https://models.oso.group").replace(/\/+$/, "");
  const status: OsoStatus = {
    configured: isOsoConfigured(),
    baseUrl,
    dataClassification: process.env.OSO_DATA_CLASSIFICATION?.trim() || "",
    health: { ok: false },
    models: { ok: false },
  };
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) });
    const body = (await res.json()) as { status?: string; version?: string; gitSha?: string };
    status.health = { ok: res.ok && body.status === "ok", version: body.version, gitSha: body.gitSha?.slice(0, 7) };
  } catch (e: any) {
    status.health = { ok: false, error: e.message };
  }
  if (status.configured) {
    try {
      status.models = { ok: true, count: (await fetchOsoModels()).length };
    } catch (e: any) {
      status.models = { ok: false, error: e.message };
    }
  }
  return status;
}
