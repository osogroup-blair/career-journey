import type { JobMatch, MatchVerdict } from '../types';

/** Which slice of matches the Matches page is showing. "review" is the default: everything still waiting on a decision. */
export type MatchView = 'review' | 'promoted' | 'dismissed' | 'all';
export type MatchSort = 'score' | 'newest' | 'company';
export type VerdictFilter = MatchVerdict | 'any';

export const VIEW_LABEL: Record<MatchView, string> = {
  review: 'To review',
  promoted: 'In pipeline',
  dismissed: 'Dismissed',
  all: 'All',
};

export const SORT_LABEL: Record<MatchSort, string> = {
  score: 'Best match',
  newest: 'Newest',
  company: 'Company A–Z',
};

/** Plain-language names for the scan verdicts; the raw values stay in the data. */
export const VERDICT_LABEL: Record<MatchVerdict, string> = {
  PASS: 'Strong fit',
  BORDERLINE: 'Borderline',
  SKIP: 'Weak fit',
};

/** Still waiting on the AI scan: no result, no error, and not skipped by the keyword prefilter. */
export function isScanPending(m: JobMatch): boolean {
  return !m.verdict && !m.scanError && !m.dismissReason;
}

export type ScoreTier = 'strong' | 'good' | 'fair' | 'low';

export function scoreTier(score: number): ScoreTier {
  if (score >= 80) return 'strong';
  if (score >= 65) return 'good';
  if (score >= 50) return 'fair';
  return 'low';
}

function inView(m: JobMatch, view: MatchView): boolean {
  if (view === 'review') return m.status === 'New';
  if (view === 'promoted') return m.status === 'Promoted';
  if (view === 'dismissed') return m.status === 'Dismissed';
  return true;
}

/** Below the user's minimum score. Promoted and not-yet-scored matches are never hidden. */
function belowFloor(m: JobMatch, minScore: number): boolean {
  return m.status !== 'Promoted' && m.matchScore != null && m.matchScore < minScore;
}

function matchesQuery(m: JobMatch, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [m.roleTitle, m.companyName, m.locationNotes, m.compensationRange]
    .some((field) => field?.toLowerCase().includes(q));
}

const byNewest = (a: JobMatch, b: JobMatch) => (b.createdAt || '').localeCompare(a.createdAt || '');

/** Scans in flight first (so new pastes are visible straight away), then by score, then failed/unscored rows. */
function byScore(a: JobMatch, b: JobMatch): number {
  const rank = (m: JobMatch) => (isScanPending(m) ? 0 : m.matchScore != null ? 1 : 2);
  const r = rank(a) - rank(b);
  if (r !== 0) return r;
  if (a.matchScore != null && b.matchScore != null && a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
  return byNewest(a, b);
}

const SORTERS: Record<MatchSort, (a: JobMatch, b: JobMatch) => number> = {
  score: byScore,
  newest: byNewest,
  company: (a, b) => a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' }) || byScore(a, b),
};

export interface MatchListOptions {
  view: MatchView;
  verdict: VerdictFilter;
  query: string;
  sort: MatchSort;
  minScore: number;
  /** Ignore the minimum-score floor for this view. */
  showBelowFloor: boolean;
}

export interface MatchListResult {
  visible: JobMatch[];
  /** Matches in the current view + search + verdict filter that the score floor is hiding. */
  hiddenByFloor: number;
  /** Per-view counts, after the score floor (so "To review" agrees with the Dashboard tile). */
  viewCounts: Record<MatchView, number>;
  /** Per-verdict counts within the current view and search, so the verdict chips show what they'd return. */
  verdictCounts: Record<VerdictFilter, number>;
}

export function buildMatchList(matches: Record<string, JobMatch> | undefined, opts: MatchListOptions): MatchListResult {
  const all = Object.values(matches || {});
  const floorOk = (m: JobMatch) => opts.showBelowFloor || !belowFloor(m, opts.minScore);

  const viewCounts: Record<MatchView, number> = { review: 0, promoted: 0, dismissed: 0, all: 0 };
  for (const m of all) {
    if (!floorOk(m)) continue;
    viewCounts.all++;
    if (m.status === 'New') viewCounts.review++;
    else if (m.status === 'Promoted') viewCounts.promoted++;
    else if (m.status === 'Dismissed') viewCounts.dismissed++;
  }

  const inScope = all.filter((m) => inView(m, opts.view) && matchesQuery(m, opts.query));

  const verdictCounts: Record<VerdictFilter, number> = { any: 0, PASS: 0, BORDERLINE: 0, SKIP: 0 };
  for (const m of inScope) {
    if (!floorOk(m)) continue;
    verdictCounts.any++;
    if (m.verdict) verdictCounts[m.verdict]++;
  }

  const verdictScoped = inScope.filter((m) => opts.verdict === 'any' || m.verdict === opts.verdict);
  const visible = verdictScoped.filter(floorOk).sort(SORTERS[opts.sort]);

  return {
    visible,
    hiddenByFloor: verdictScoped.length - visible.length,
    viewCounts,
    verdictCounts,
  };
}
