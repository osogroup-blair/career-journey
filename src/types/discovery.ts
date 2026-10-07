import { z } from 'zod';

/**
 * Job Discovery (StillOpen) — shared between the server (validation, Firestore
 * shapes) and the Discover page (editor dropdowns). The filter enums mirror
 * StillOpen's own documented values exactly: its API rejects an unrecognised
 * filter value outright rather than ignoring it, so anything we send has to be
 * one of these. See https://stillopen.work/api/v1/jobs (no params) for the
 * live list.
 */

export const STILLOPEN_LEVELS = ['junior', 'mid', 'senior', 'lead', 'manager', 'head'] as const;
export const STILLOPEN_AREAS = [
  'consulting', 'content', 'customer', 'design', 'engineering', 'finance',
  'healthcare', 'legal', 'operations', 'people', 'product', 'sales_marketing',
] as const;
export const STILLOPEN_PAY_STEPS = [40000, 60000, 80000, 100000, 120000, 150000, 200000] as const;
// Country codes are 2 letters, but not strictly ISO: StillOpen takes "uk" and
// rejects "gb" (checked live 2026-10-07). It doesn't publish its full list, so
// country codes are validated by shape here and checked against the live API
// when a profile is saved (server/discovery/routes.ts). The regions below were
// probed live too — "americas", "europe", "eu" and "north_america" are refused.
export const STILLOPEN_REGIONS = ['worldwide', 'emea', 'apac', 'latam', 'na'] as const;
export const STILLOPEN_REGION_LABEL: Record<(typeof STILLOPEN_REGIONS)[number], string> = {
  worldwide: 'Worldwide (no location restriction)',
  emea: 'EMEA',
  apac: 'APAC',
  latam: 'Latin America',
  na: 'North America',
};
const LOC_ALIASES: Record<string, string> = { gb: 'uk' };

export function normalizeStillOpenLoc(raw: string): string {
  const s = raw.trim().toLowerCase();
  return LOC_ALIASES[s] ?? s;
}

export const StillOpenLevelSchema = z.enum(STILLOPEN_LEVELS);
export const StillOpenAreaSchema = z.enum(STILLOPEN_AREAS);
export const StillOpenLocSchema = z
  .string()
  .transform(normalizeStillOpenLoc)
  .refine((s) => /^[a-z]{2}$/.test(s) || (STILLOPEN_REGIONS as readonly string[]).includes(s), {
    message: `Location must be a 2-letter country code (e.g. "uk", "de") or one of ${STILLOPEN_REGIONS.join(', ')}.`,
  });
export const StillOpenPaySchema = z
  .number()
  .refine((n) => (STILLOPEN_PAY_STEPS as readonly number[]).includes(n), { message: `Pay must be one of ${STILLOPEN_PAY_STEPS.join(', ')}.` });

export type StillOpenLevel = z.infer<typeof StillOpenLevelSchema>;
export type StillOpenArea = z.infer<typeof StillOpenAreaSchema>;

export const DISCOVERY_SCHEDULES = ['daily', 'every_3_days', 'weekly', 'off'] as const;
export type DiscoverySchedule = (typeof DISCOVERY_SCHEDULES)[number];

export const SCHEDULE_INTERVAL_MS: Record<Exclude<DiscoverySchedule, 'off'>, number> = {
  daily: 24 * 60 * 60 * 1000,
  every_3_days: 3 * 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export const SCHEDULE_LABEL: Record<DiscoverySchedule, string> = {
  daily: 'Daily',
  every_3_days: 'Every 3 days',
  weekly: 'Weekly',
  off: 'Off (manual only)',
};

export const MAX_DISCOVERY_QUERIES = 6;

/**
 * What one scheduled run searches for. Each query runs once per location (or
 * once with no location), with the level/area/pay filters applied to all of
 * them — StillOpen takes one value per filter per call, so multiple levels or
 * areas fan out into more calls (see server/discovery/runSearch.ts).
 */
export const DiscoverySearchProfileSchema = z.object({
  queries: z.array(z.string().trim().min(1).max(80)).min(1).max(MAX_DISCOVERY_QUERIES),
  loc: z.array(StillOpenLocSchema).max(3).default([]),
  level: z.array(StillOpenLevelSchema).max(3).default([]),
  area: z.array(StillOpenAreaSchema).max(2).default([]),
  payMin: StillOpenPaySchema.nullable().default(null),
});
export type DiscoverySearchProfile = z.infer<typeof DiscoverySearchProfileSchema>;

export interface DiscoveryRunSummary {
  at: string;
  status: 'ok' | 'error';
  /** Listings seen for the first time on this run. */
  newCount: number;
  /** Total listings returned across every query on this run (before de-dup against stored). */
  foundCount: number;
  closedCount: number;
  trigger: 'schedule' | 'manual';
  error?: string;
}

export interface DiscoveryProfile {
  cvText: string;
  cvGeneratedAt: string | null;
  searchProfile: DiscoverySearchProfile | null;
  /** One-line explanation from the AI of why it picked these queries — shown under the chips. */
  searchProfileRationale?: string;
  schedule: DiscoverySchedule;
  lastRun?: DiscoveryRunSummary;
  nextRunAt?: string | null;
  updatedAt: string;
}

export const DiscoveryProfileUpdateSchema = z.object({
  cvText: z.string().max(40_000).optional(),
  cvGeneratedAt: z.string().nullable().optional(),
  searchProfile: DiscoverySearchProfileSchema.nullable().optional(),
  searchProfileRationale: z.string().max(1000).optional(),
  schedule: z.enum(DISCOVERY_SCHEDULES).optional(),
});
export type DiscoveryProfileUpdate = z.infer<typeof DiscoveryProfileUpdateSchema>;

export type EvidenceType = 'ats_verified' | 'board_verified' | 'employer_board' | 'employer_attested' | 'age_inferred';
export type ListingStatus = 'open' | 'unconfirmed' | 'closed' | 'unknown';
export type DiscoveredJobState = 'new' | 'seen' | 'dismissed' | 'scanned' | 'promoted';

export interface StillOpenSalary {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  period?: string | null;
  source?: string | null;
}

/**
 * One StillOpen listing as stored per user at users/{uid}/discoveredJobs/{id}.
 * Summary fields only — the employer's ad text is never stored here (StillOpen
 * doesn't license it onward); it's fetched on demand when the user scans.
 */
export interface DiscoveredJob {
  id: string;
  title: string;
  company: string;
  companySlug?: string | null;
  canonicalUrl: string | null;
  locations: string[];
  level?: string | null;
  salary?: StillOpenSalary | null;
  postedAt?: string | null;
  verifiedAt?: string | null;
  lastSeenAt?: string | null;
  evidenceType?: EvidenceType | null;
  status: ListingStatus;
  promoted?: boolean;
  matchedQueries: string[];
  firstSeenAt: string;
  /** When one of our searches last returned this listing — drives retention. */
  lastFoundAt: string;
  statusCheckedAt: string;
  userState: DiscoveredJobState;
  matchId?: string;
}

export interface DiscoveredJobDetail {
  id: string;
  title: string;
  company: string;
  canonicalUrl: string | null;
  /** The employer's own application page — becomes the job's jobLink when promoted. */
  applyUrl: string | null;
  /** The ad as plain text with paragraph breaks kept (built from description_html — StillOpen's description_text has none). */
  descriptionText: string;
  skills: string[];
  employmentType?: string | null;
  /** Display string for the job's compensationRange, or "" when no salary was published. */
  salaryText: string;
  /** Display string for the job's locationNotes, e.g. "Remote — United Kingdom, Ireland · Full-time". */
  locationNotes: string;
  status: ListingStatus;
}

/** Whether a listing behind a pipeline job is still open — the Apply stage's check (GET /api/discovery/listings/:id/status). */
export interface ListingStatusResult {
  status: ListingStatus;
  closedAt: string | null;
  /** observed = a source said it's gone; inferred = it aged out; employer = the employer closed it. */
  closure: string | null;
  checkedAt: string;
}

export const DiscoveredJobPatchSchema = z.object({
  userState: z.enum(['new', 'seen', 'dismissed', 'scanned', 'promoted']).optional(),
  matchId: z.string().max(100).optional(),
});

export const STILLOPEN_ATTRIBUTION = { text: 'Data provided by StillOpen', url: 'https://stillopen.work' };

/** Only these two mean StillOpen actually re-checked the posting — the rest must not be presented as verified. */
export const INDEPENDENTLY_VERIFIED: EvidenceType[] = ['ats_verified', 'board_verified'];
