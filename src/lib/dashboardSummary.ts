import { InterviewRound, JobAnalysis, JobMatch, JobStage } from '../types';
import { KANBAN_STAGES, STAGE_PATHS } from './jobPipeline';

/** A job with no activity for this long gets flagged on the Dashboard. */
export const STALL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function toTime(value: string | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** When the job last moved. An Apply-stage job is waiting on the employer, so the clock starts at appliedAt. */
export function lastActivityAt(job: JobAnalysis): number | null {
  if (job.stage === 'Apply') return toTime(job.appliedAt) ?? toTime(job.updatedAt);
  return toTime(job.updatedAt);
}

/** The earliest still-scheduled round that hasn't happened yet. */
export function nextInterview(job: JobAnalysis, now: number): InterviewRound | null {
  const upcoming = (job.interviews || [])
    .filter((r) => r.outcome === 'Scheduled')
    .map((r) => ({ r, t: toTime(r.scheduledAt) }))
    .filter((x): x is { r: InterviewRound; t: number } => x.t !== null && x.t >= now)
    .sort((a, b) => a.t - b.t);
  return upcoming[0]?.r ?? null;
}

function hasFutureOfferDeadline(job: JobAnalysis, now: number): boolean {
  const t = toTime(job.offer?.decisionDeadline);
  return t !== null && t >= now;
}

/** Whole days since the job last moved, or null when it isn't stalled. */
export function stalledDays(job: JobAnalysis, now: number): number | null {
  if (job.stage === 'Archive') return null;
  if (job.stage === 'Offer' && hasFutureOfferDeadline(job, now)) return null;
  if (job.stage === 'Interview' && nextInterview(job, now)) return null;
  const last = lastActivityAt(job);
  if (last === null) return null;
  const days = Math.floor((now - last) / DAY_MS);
  return days >= STALL_DAYS ? days : null;
}

export interface DashboardJob {
  job: JobAnalysis;
  stalledDays: number | null;
  nextInterview: InterviewRound | null;
  /** Route to the job's current stage screen. */
  path: string;
}

export interface DashboardSummary {
  stageCounts: Record<JobStage, number>;
  /** Non-archived jobs: stalled first (longest-stalled first), then most recently updated. */
  activeJobs: DashboardJob[];
  /** New matches above the user's score floor, best score first. */
  matchesToReview: JobMatch[];
  tiles: { active: number; interviewing: number; offers: number; matchesToReview: number };
}

export function buildDashboardSummary(
  jobs: Record<string, JobAnalysis>,
  matches: Record<string, JobMatch>,
  minMatchScore: number,
  now: number
): DashboardSummary {
  const stageCounts = Object.fromEntries(KANBAN_STAGES.map((s) => [s, 0])) as Record<JobStage, number>;
  const active: DashboardJob[] = [];

  for (const job of Object.values(jobs)) {
    if (job.stage === 'Archive') continue;
    stageCounts[job.stage] = (stageCounts[job.stage] || 0) + 1;
    active.push({
      job,
      stalledDays: stalledDays(job, now),
      nextInterview: nextInterview(job, now),
      path: `/job/${job.id}/${STAGE_PATHS[job.stage]}`,
    });
  }

  active.sort((a, b) => {
    if (a.stalledDays !== null && b.stalledDays !== null) return b.stalledDays - a.stalledDays;
    if (a.stalledDays !== null) return -1;
    if (b.stalledDays !== null) return 1;
    return (toTime(b.job.updatedAt) ?? 0) - (toTime(a.job.updatedAt) ?? 0);
  });

  // Same score floor as the Matches page, so the counts agree.
  const matchesToReview = Object.values(matches)
    .filter((m) => m.status === 'New' && (m.matchScore == null || m.matchScore >= minMatchScore))
    .sort((a, b) => {
      if (a.matchScore == null && b.matchScore == null) return 0;
      if (a.matchScore == null) return 1;
      if (b.matchScore == null) return -1;
      return b.matchScore - a.matchScore;
    });

  return {
    stageCounts,
    activeJobs: active,
    matchesToReview,
    tiles: {
      active: active.length,
      interviewing: stageCounts.Interview || 0,
      offers: stageCounts.Offer || 0,
      matchesToReview: matchesToReview.length,
    },
  };
}
