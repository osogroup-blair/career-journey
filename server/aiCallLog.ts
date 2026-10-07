import type { App } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { LegacyGenAI } from "./ai/legacyGenAIShim";
import type { StructuredAIClient, AIProviderId } from "./ai/types";
import type { ResolvedModel } from "./ai/resolveModelForPrompt";

/**
 * One record per outbound AI call (Oso router, Ollama, or a BYOM provider),
 * success or failure. Unlike users/{uid}/aiUsageLogs (billing — successful,
 * signed-in calls only), this is the operational trail: it includes failures,
 * latency, how the model was resolved, and the router's request id, and lives
 * in one top-level collection so an admin can see every call across users.
 * Only metadata is stored — never prompt or response content.
 */
export interface AiCallLog {
  id?: string;
  timestamp: string;
  promptId: string;
  provider: AIProviderId;
  /** What we asked for (an Oso alias like "oso/fast", or a provider model id). */
  model: string;
  /** Oso only: the physical model the router picked, when it reports one. */
  actualModel?: string;
  requestId?: string;
  /** Where `model` came from — see resolveModelForPrompt. */
  source?: AiCallSource;
  durationMs: number;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
  uid?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type AiCallSource = ResolvedModel["source"] | "adminTestRun";

export interface AiCallContext {
  promptId: string;
  provider: AIProviderId;
  model: string;
  source?: AiCallSource;
  uid?: string;
}

const COLLECTION = "aiCallLogs";
// Written on every doc so a Firestore TTL policy on `expireAt` (enable it once
// in the console/CLI) can age these out; harmless if no policy exists.
const RETENTION_DAYS = 30;

let appProvider: () => App | null = () => null;

/** Called once at server startup — keeps this module free of a firebaseAdmin import so tests can use it without credentials. */
export function configureAiCallLog(getApp: () => App | null): void {
  appProvider = getApp;
}

export function formatAiCallLine(entry: AiCallLog): string {
  const model = entry.actualModel && entry.actualModel !== entry.model ? `${entry.model} -> ${entry.actualModel}` : entry.model;
  const parts = [
    `[ai-call] ${entry.promptId}`,
    model,
    `(${entry.provider}${entry.source ? `, ${entry.source}` : ""})`,
    `${entry.durationMs}ms`,
    entry.ok ? `ok ${entry.totalTokens} tok` : `ERROR ${entry.errorCode || ""}${entry.errorCode && entry.errorMessage ? ": " : ""}${entry.errorMessage || ""}`.trim(),
    `req=${entry.requestId || "-"}`,
    `uid=${entry.uid || "-"}`,
  ];
  return parts.join(" ");
}

export function recordAiCall(entry: AiCallLog): void {
  if (entry.ok) console.log(formatAiCallLine(entry));
  else console.warn(formatAiCallLine(entry));

  const app = appProvider();
  if (!app) return;
  // Firestore rejects `undefined` fields, so drop them rather than writing nulls.
  const doc: Record<string, unknown> = Object.fromEntries(Object.entries(entry).filter(([k, v]) => v !== undefined && k !== "id"));
  doc.expireAt = Timestamp.fromMillis(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);
  // Fire-and-forget: logging must never slow down or fail the user's request.
  getFirestore(app)
    .collection(COLLECTION)
    .add(doc)
    .catch((err) => console.error("Failed to write AI call log:", err));
}

export async function listAiCalls(app: App, limit: number): Promise<AiCallLog[]> {
  const snap = await getFirestore(app).collection(COLLECTION).orderBy("timestamp", "desc").limit(limit).get();
  return snap.docs.map((d) => {
    const { expireAt: _expireAt, ...data } = d.data();
    return { id: d.id, ...(data as Omit<AiCallLog, "id">) };
  });
}

function errorFields(e: any): Pick<AiCallLog, "errorCode" | "errorMessage" | "requestId"> {
  return {
    errorCode: e?.code ? String(e.code) : e?.status ? `HTTP ${e.status}` : undefined,
    errorMessage: String(e?.message || e).slice(0, 300),
    requestId: e?.requestId || undefined,
  };
}

async function timed<T>(
  ctx: AiCallContext,
  run: () => Promise<T>,
  describe: (result: T) => Pick<AiCallLog, "actualModel" | "requestId" | "promptTokens" | "completionTokens" | "totalTokens"> & { model?: string }
): Promise<T> {
  const started = Date.now();
  const base = { timestamp: new Date(started).toISOString(), promptId: ctx.promptId, provider: ctx.provider, model: ctx.model, source: ctx.source, uid: ctx.uid };
  try {
    const result = await run();
    const { model, ...rest } = describe(result);
    recordAiCall({ ...base, ...(model ? { model } : {}), ...rest, durationMs: Date.now() - started, ok: true });
    return result;
  } catch (e) {
    recordAiCall({ ...base, ...errorFields(e), durationMs: Date.now() - started, ok: false, promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    throw e;
  }
}

/** Wraps a legacy (Gemini-shaped) client so every generateContent call is logged with this request's prompt/user context. */
export function instrumentLegacyClient(client: LegacyGenAI, ctx: AiCallContext): LegacyGenAI {
  return {
    models: {
      generateContent: (params) =>
        timed(ctx, () => client.models.generateContent(params), (r) => ({
          actualModel: r.actualModel,
          requestId: r.requestId,
          promptTokens: r.usageMetadata?.promptTokenCount || 0,
          completionTokens: r.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: r.usageMetadata?.totalTokenCount || 0,
        })),
    },
  };
}

/** Same as instrumentLegacyClient, for the provider-agnostic StructuredAIClient. */
export function instrumentStructuredClient(client: StructuredAIClient, ctx: Omit<AiCallContext, "provider" | "model">): StructuredAIClient {
  const full: AiCallContext = { ...ctx, provider: client.provider, model: client.model };
  return {
    provider: client.provider,
    model: client.model,
    generateStructured: (params) =>
      timed(full, () => client.generateStructured(params), (r) => ({
        model: r.model,
        actualModel: r.actualModel,
        requestId: r.requestId,
        promptTokens: r.usage?.promptTokens || 0,
        completionTokens: r.usage?.completionTokens || 0,
        totalTokens: r.usage?.totalTokens || 0,
      })),
  };
}
