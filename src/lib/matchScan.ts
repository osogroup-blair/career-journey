import { scanJobMatch } from './aiClient';
import { generateId } from './utils';
import { buildArchiveLearningsSummary } from './archiveLearnings';
import { segmentJdText } from './jdSegments';
import type { JobAnalysis, JobMatch, MatchSource } from '../types';

/**
 * Helpers shared by the two pages that run light scans in bulk — Matches
 * (pasted / Greenhouse / Lever postings) and Discover (StillOpen listings).
 */

/** Runs `worker` over `items`, `concurrency` at a time, reporting progress after each. */
export async function runQueue<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  onProgress?: (progress: { done: number; total: number }) => void,
  concurrency = 3
): Promise<void> {
  let cursor = 0;
  let done = 0;
  onProgress?.({ done: 0, total: items.length });
  const runners = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]);
      done++;
      onProgress?.({ done, total: items.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runners));
}

/** The first excluded keyword (Match Preferences) found in a JD, case-insensitively — a hit skips the AI scan entirely. */
export function findExcludedKeyword(jdText: string, excludedKeywords: string[]): string | null {
  const haystack = jdText.toLowerCase();
  const hit = excludedKeywords.find((k) => k.trim() && haystack.includes(k.trim().toLowerCase()));
  return hit ? hit.trim() : null;
}

export function guessTitleFromText(text: string): string {
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || 'Untitled posting';
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

/** Store actions and inputs a scan needs — passed in so this stays a plain module, not a hook. */
export interface MatchScanDeps {
  addMatch: (match: JobMatch) => void;
  updateMatch: (id: string, updates: Partial<JobMatch>) => void;
  careerJourney: any;
  jobs: Record<string, JobAnalysis>;
  excludedKeywords: string[];
}

export interface PostingMeta {
  source?: MatchSource;
  sourceUrl?: string;
  externalId?: string;
  company?: string;
  title?: string;
  applyUrl?: string;
  compensationRange?: string;
  locationNotes?: string;
}

/** Light-scans an existing match's JD and writes the verdict (or the error) back onto it. */
export async function runMatchScan(deps: MatchScanDeps, matchId: string, jdText: string, known?: { company?: string; title?: string }): Promise<void> {
  try {
    const archiveLearnings = buildArchiveLearningsSummary(deps.jobs);
    const result = await scanJobMatch(jdText, deps.careerJourney, archiveLearnings);
    deps.updateMatch(matchId, {
      companyName: known?.company || result.parse?.company || 'Unknown Company',
      roleTitle: known?.title || result.parse?.roleTitle || 'Unknown Role',
      parse: result.parse,
      matchScore: result.matchScore,
      verdict: result.verdict,
      hardGateRisk: result.hardGateRisk,
      topGaps: result.topGaps,
      leadWith: result.leadWith,
      scanError: undefined,
      dismissReason: undefined,
    });
  } catch (err: any) {
    deps.updateMatch(matchId, {
      companyName: known?.company || 'Scan failed',
      roleTitle: known?.title || 'Scan failed',
      scanError: err?.message || 'Unknown error',
    });
  }
}

/**
 * Creates a match for one posting and scans it — unless the JD hits an
 * excluded keyword, in which case it's saved as Dismissed with the reason and
 * no AI call is made. Returns the new match id.
 */
export async function scanPostingIntoMatch(deps: MatchScanDeps, jdText: string, opts?: PostingMeta): Promise<{ matchId: string; skipped: boolean }> {
  const id = generateId('MATCH');
  const now = new Date().toISOString();
  const source = opts?.source || 'manual-paste';
  const base = {
    id,
    createdAt: now,
    updatedAt: now,
    source,
    sourceUrl: opts?.sourceUrl,
    externalId: opts?.externalId,
    applyUrl: opts?.applyUrl || undefined,
    compensationRange: opts?.compensationRange || undefined,
    locationNotes: opts?.locationNotes || undefined,
    jdText,
  };

  const excludedHit = findExcludedKeyword(jdText, deps.excludedKeywords);
  if (excludedHit) {
    deps.addMatch({
      ...base,
      companyName: opts?.company || 'Not scanned',
      roleTitle: opts?.title || guessTitleFromText(jdText),
      status: 'Dismissed',
      dismissReason: `Skipped before scanning — JD contains excluded keyword "${excludedHit}"`,
    });
    return { matchId: id, skipped: true };
  }

  deps.addMatch({ ...base, companyName: opts?.company || 'Scanning…', roleTitle: opts?.title || 'Scanning…', status: 'New' });
  await runMatchScan(deps, id, jdText, { company: opts?.company, title: opts?.title });
  return { matchId: id, skipped: false };
}

/**
 * The pipeline job a match turns into when promoted (store.promoteMatch).
 * A scanned match skips Intake, and with it the parse step that normally
 * assigns jdSegments — so they're computed here, or Rating would have no JD
 * text to cite. jobLink prefers the employer's apply page over the posting
 * link; a StillOpen listing is also kept as `source` for attribution and the
 * Apply stage's still-open check.
 */
export function buildJobFromMatch(match: JobMatch, jobId: string, now: string): JobAnalysis {
  const job: JobAnalysis = {
    id: jobId,
    createdAt: now,
    updatedAt: now,
    stage: match.parse ? 'Parsed' : 'Intake',
    companyName: match.companyName,
    roleTitle: match.roleTitle,
    jdText: match.jdText,
    jobLink: match.applyUrl || match.sourceUrl,
    parse: match.parse,
  };
  if (match.parse && match.jdText) job.jdSegments = segmentJdText(match.jdText);
  if (match.compensationRange) job.compensationRange = match.compensationRange;
  if (match.locationNotes) job.locationNotes = match.locationNotes;
  if (match.source === 'stillopen' && match.externalId) {
    job.source = { kind: 'stillopen', listingId: match.externalId, listingUrl: match.sourceUrl ?? null };
  }
  return job;
}
