import type { JobAnalysis, JobMatch, JobStage } from '../types';
import { STAGE_ORDER } from './jobPipeline';

export type TrackerView = 'board' | 'list' | 'archived';
export type TrackerSort = 'updated' | 'stage' | 'company' | 'score';
export type StageFilter = JobStage | 'any';

export const TRACKER_VIEW_LABEL: Record<TrackerView, string> = {
  board: 'Board',
  list: 'List',
  archived: 'Archived',
};

export const TRACKER_SORT_LABEL: Record<TrackerSort, string> = {
  updated: 'Recently updated',
  stage: 'Furthest along',
  company: 'Company A–Z',
  score: 'Best match',
};

/** Match scores for jobs promoted from Matches/Discover, keyed by job id. */
export function matchScoresByJob(matches: Record<string, JobMatch> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of Object.values(matches || {})) {
    if (m.promotedJobId && m.matchScore != null) out[m.promotedJobId] = m.matchScore;
  }
  return out;
}

export function jobMatchesQuery(job: JobAnalysis, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [job.roleTitle, job.companyName, job.locationNotes].some((f) => f?.toLowerCase().includes(q));
}

const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);
const byUpdated = (a: JobAnalysis, b: JobAnalysis) => time(b.updatedAt) - time(a.updatedAt);

export function sortJobs(jobs: JobAnalysis[], sort: TrackerSort, scores: Record<string, number> = {}): JobAnalysis[] {
  const list = [...jobs];
  if (sort === 'updated') return list.sort(byUpdated);
  if (sort === 'stage') return list.sort((a, b) => STAGE_ORDER.indexOf(b.stage) - STAGE_ORDER.indexOf(a.stage) || byUpdated(a, b));
  if (sort === 'company') return list.sort((a, b) => a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' }) || byUpdated(a, b));
  return list.sort((a, b) => {
    const sa = scores[a.id];
    const sb = scores[b.id];
    if (sa == null && sb == null) return byUpdated(a, b);
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sb - sa || byUpdated(a, b);
  });
}
