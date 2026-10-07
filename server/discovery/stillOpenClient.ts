import { z } from "zod";
import {
  StillOpenAreaSchema,
  StillOpenLevelSchema,
  StillOpenLocSchema,
  StillOpenPaySchema,
} from "../../src/types/discovery";

/**
 * Thin client for StillOpen's public job API (https://stillopen.work/agents).
 * No API key; limits are per IP — 60/min on each of /jobs, /jobs/{id} and
 * /jobs/status, plus a shared 10 req/s edge cap — and since every user's
 * scheduled run goes out from this one server's IP, all calls share the single
 * module-level throttle below rather than each caller pacing itself.
 *
 * Licensing: StillOpen's terms require a written licence for any use by or
 * for an organisation. Until one exists the whole feature is admin-only — see
 * isDiscoveryLicensed() in server/featureFlags.ts.
 */

export class StillOpenError extends Error {
  constructor(message: string, readonly status?: number, readonly problems?: string[]) {
    super(message);
    this.name = "StillOpenError";
  }
}

function baseUrl(): string {
  return (process.env.STILLOPEN_API_URL || "https://stillopen.work/api/v1").replace(/\/+$/, "");
}

const USER_AGENT = "CareerJourney/1.0 (+job-discovery; personal use)";
const REQUEST_TIMEOUT_MS = 10_000;

// ~40/min with a 2/s floor between calls: comfortably under the 60/min
// per-endpoint and 10/s edge limits even when the scheduler and a "Search
// now" click overlap. One chain for the whole process.
const MIN_INTERVAL_MS = 1_500;
let throttleChain: Promise<void> = Promise.resolve();
let lastCallAt = 0;

function throttle(): Promise<void> {
  const next = throttleChain.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  throttleChain = next.catch(() => {});
  return next;
}

/** Test hook — resets the shared throttle so tests don't wait out real intervals. */
export function _resetStillOpenThrottle(): void {
  throttleChain = Promise.resolve();
  lastCallAt = 0;
}

const MAX_RETRY_AFTER_S = 30;

async function request(path: string, init?: RequestInit, retried = false): Promise<unknown> {
  await throttle();
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...(init?.headers || {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e: any) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    throw new StillOpenError(timedOut ? "StillOpen did not respond in time." : `Could not reach StillOpen: ${e?.message || e}`);
  }

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After")) || 5;
    if (!retried && retryAfter <= MAX_RETRY_AFTER_S) {
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return request(path, init, true);
    }
    throw new StillOpenError("StillOpen is rate-limiting requests — try again in a minute.", 429);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const problems: string[] = Array.isArray((body as any)?.problems) ? (body as any).problems : [];
    throw new StillOpenError(problems[0] ? `StillOpen refused the search: ${problems.join("; ")}` : `StillOpen returned HTTP ${res.status}.`, res.status, problems);
  }
  return body;
}

const SalarySchema = z
  .object({
    min: z.number().nullish(),
    max: z.number().nullish(),
    currency: z.string().nullish(),
    period: z.string().nullish(),
    source: z.string().nullish(),
  })
  .passthrough();

const EvidenceTypeSchema = z.enum(["ats_verified", "board_verified", "employer_board", "employer_attested", "age_inferred"]);
const StatusSchema = z.enum(["open", "unconfirmed", "closed", "unknown"]);

export const StillOpenListingSchema = z
  .object({
    id: z.number().int(),
    status: StatusSchema,
    title: z.string(),
    company: z.string(),
    company_slug: z.string().nullish(),
    canonical_url: z.string().nullish(),
    locations: z.array(z.string()).default([]),
    level: z.string().nullish(),
    salary: SalarySchema.nullish(),
    posted_at: z.string().nullish(),
    last_seen_at: z.string().nullish(),
    verified_at: z.string().nullish(),
    // Unknown future evidence types degrade to null rather than failing the whole page.
    evidence_type: EvidenceTypeSchema.nullish().catch(null),
    promoted: z.boolean().optional(),
  })
  .passthrough();
export type StillOpenListing = z.infer<typeof StillOpenListingSchema>;

const SearchResponseSchema = z
  .object({
    jobs: z.array(StillOpenListingSchema),
    total: z.number().optional(),
    next_cursor: z.string().nullish(),
  })
  .passthrough();

const DetailSchema = StillOpenListingSchema.extend({
  description_text: z.string().nullish(),
  skills: z.array(z.string()).nullish(),
  apply_url: z.string().nullish(),
  employment_type: z.string().nullish(),
  closed_at: z.string().nullish(),
  closure: z.string().nullish(),
  merged_into: z.number().nullish(),
});
export type StillOpenDetail = z.infer<typeof DetailSchema>;

const StatusEntrySchema = z
  .object({
    id: z.number().int(),
    status: StatusSchema,
    evidence_type: EvidenceTypeSchema.nullish().catch(null),
    verified_at: z.string().nullish(),
    last_seen_at: z.string().nullish(),
    closed_at: z.string().nullish(),
    closure: z.string().nullish(),
    merged_into: z.number().nullish(),
  })
  .passthrough();
export type StillOpenStatusEntry = z.infer<typeof StatusEntrySchema>;

export const SearchParamsSchema = z.object({
  q: z.string().trim().min(1).max(200),
  loc: StillOpenLocSchema.optional(),
  level: StillOpenLevelSchema.optional(),
  area: StillOpenAreaSchema.optional(),
  pay: StillOpenPaySchema.optional(),
  cursor: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});
export type SearchParams = z.input<typeof SearchParamsSchema>;

function parseOrThrow<T>(schema: z.ZodType<T>, body: unknown, what: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.error(`StillOpen ${what}: unexpected response shape`, parsed.error.issues.slice(0, 3));
    throw new StillOpenError(`StillOpen returned an unexpected ${what} response.`);
  }
  return parsed.data;
}

/**
 * One page of search results (at most 20). Params are validated before
 * anything goes over the wire — StillOpen 400s on any filter value it doesn't
 * recognise, and a bad value would otherwise burn a rate-limited call.
 */
export async function searchJobs(params: SearchParams): Promise<{ jobs: StillOpenListing[]; total?: number; nextCursor: string | null }> {
  const p = SearchParamsSchema.parse(params);
  const qs = new URLSearchParams({ q: p.q });
  if (p.loc) qs.set("loc", p.loc);
  if (p.level) qs.set("level", p.level);
  if (p.area) qs.set("area", p.area);
  if (p.pay) qs.set("pay", String(p.pay));
  if (p.cursor) qs.set("cursor", p.cursor);
  qs.set("limit", String(p.limit ?? 20));
  const body = parseOrThrow(SearchResponseSchema, await request(`/jobs?${qs}`), "search");
  return { jobs: body.jobs, total: body.total, nextCursor: body.next_cursor ?? null };
}

/** The full listing, including the employer's ad text — never stored, only passed through for a scan. */
export async function getJob(id: number): Promise<StillOpenDetail> {
  if (!Number.isInteger(id) || id <= 0) throw new StillOpenError("Invalid listing id.");
  return parseOrThrow(DetailSchema, await request(`/jobs/${id}`), "listing");
}

const STATUS_BATCH = 100;

/** Batch status re-check — POST with a JSON body, as StillOpen recommends, 100 ids per call. */
export async function checkStatus(ids: number[]): Promise<StillOpenStatusEntry[]> {
  const out: StillOpenStatusEntry[] = [];
  for (let i = 0; i < ids.length; i += STATUS_BATCH) {
    const batch = ids.slice(i, i + STATUS_BATCH);
    const body = await request("/jobs/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: batch }),
    });
    out.push(...parseOrThrow(z.object({ jobs: z.array(StatusEntrySchema) }).passthrough(), body, "status").jobs);
  }
  return out;
}
