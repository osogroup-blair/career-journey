import type { JobMatch } from '../types';
import type { DiscoveredJob } from '../types/discovery';

export type DiscoverView = 'review' | 'scanned' | 'dismissed' | 'all';
export type DiscoverSort = 'relevance' | 'score' | 'newest';

export const DISCOVER_VIEW_LABEL: Record<DiscoverView, string> = {
  review: 'To review',
  scanned: 'Scanned',
  dismissed: 'Dismissed',
  all: 'All',
};

export const DISCOVER_SORT_LABEL: Record<DiscoverSort, string> = {
  relevance: 'Most relevant',
  score: 'Best match',
  newest: 'Newest posted',
};

/** A listing with its no-AI relevance score from rankDiscoveredJobs, already in relevance order. */
export interface RankedListing {
  job: DiscoveredJob;
  score: number;
}

function viewOf(job: DiscoveredJob): Exclude<DiscoverView, 'all'> {
  if (job.userState === 'dismissed') return 'dismissed';
  if (job.userState === 'scanned' || job.userState === 'promoted') return 'scanned';
  return 'review';
}

function matchesQuery(job: DiscoveredJob, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [job.title, job.company, ...job.locations, ...job.matchedQueries].some((f) => f?.toLowerCase().includes(q));
}

const time = (iso?: string | null) => (iso ? Date.parse(iso) || 0 : 0);

export function buildDiscoverList(
  ranked: RankedListing[],
  matches: Record<string, JobMatch> | undefined,
  opts: { view: DiscoverView; query: string; sort: DiscoverSort }
): { visible: RankedListing[]; counts: Record<DiscoverView, number> } {
  const counts: Record<DiscoverView, number> = { review: 0, scanned: 0, dismissed: 0, all: ranked.length };
  for (const { job } of ranked) counts[viewOf(job)]++;

  const visible = ranked.filter(({ job }) => (opts.view === 'all' || viewOf(job) === opts.view) && matchesQuery(job, opts.query));

  const matchScore = (r: RankedListing) => (r.job.matchId ? matches?.[r.job.matchId]?.matchScore : undefined);
  if (opts.sort === 'score') {
    // Scanned listings by AI score; unscanned keep their relevance order underneath (sort is stable).
    visible.sort((a, b) => {
      const sa = matchScore(a);
      const sb = matchScore(b);
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    });
  } else if (opts.sort === 'newest') {
    visible.sort((a, b) => time(b.job.postedAt || b.job.firstSeenAt) - time(a.job.postedAt || a.job.firstSeenAt));
  }
  return { visible, counts };
}
