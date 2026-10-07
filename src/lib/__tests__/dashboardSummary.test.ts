import { describe, it, expect } from 'vitest';
import { buildDashboardSummary, stalledDays, nextInterview, STALL_DAYS } from '../dashboardSummary';
import { averageCompleteness } from '../careerJourneyGaps';
import type { JobAnalysis, JobMatch } from '../../types';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
const daysAhead = (n: number) => new Date(NOW + n * 24 * 60 * 60 * 1000).toISOString();

function job(overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return {
    id: 'JOB-1',
    createdAt: daysAgo(30),
    updatedAt: daysAgo(1),
    stage: 'Rating',
    companyName: 'Acme',
    roleTitle: 'Engineer',
    jdText: '',
    ...overrides,
  };
}

function match(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    id: 'M-1',
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    source: 'manual-paste',
    companyName: 'Acme',
    roleTitle: 'Engineer',
    jdText: '',
    status: 'New',
    ...overrides,
  };
}

describe('stalledDays', () => {
  it('flags a job only once it has been untouched for STALL_DAYS', () => {
    expect(stalledDays(job({ updatedAt: daysAgo(STALL_DAYS - 1) }), NOW)).toBeNull();
    expect(stalledDays(job({ updatedAt: daysAgo(STALL_DAYS) }), NOW)).toBe(STALL_DAYS);
  });

  it('measures Apply-stage jobs from appliedAt', () => {
    const j = job({ stage: 'Apply', updatedAt: daysAgo(1), appliedAt: daysAgo(10) });
    expect(stalledDays(j, NOW)).toBe(10);
  });

  it('does not flag an Interview job with an upcoming round', () => {
    const j = job({
      stage: 'Interview',
      updatedAt: daysAgo(20),
      interviews: [{ id: 'R1', roundName: 'Onsite', outcome: 'Scheduled', scheduledAt: daysAhead(2) }],
    });
    expect(stalledDays(j, NOW)).toBeNull();
  });

  it('does not flag an Offer job with a future decision deadline', () => {
    const j = job({ stage: 'Offer', updatedAt: daysAgo(20), offer: { receivedAt: daysAgo(20), decisionDeadline: daysAhead(3) } });
    expect(stalledDays(j, NOW)).toBeNull();
  });

  it('never flags archived jobs', () => {
    expect(stalledDays(job({ stage: 'Archive', updatedAt: daysAgo(60) }), NOW)).toBeNull();
  });
});

describe('nextInterview', () => {
  it('picks the earliest future Scheduled round', () => {
    const j = job({
      stage: 'Interview',
      interviews: [
        { id: 'past', roundName: 'Screen', outcome: 'Scheduled', scheduledAt: daysAgo(1) },
        { id: 'done', roundName: 'Tech', outcome: 'Passed', scheduledAt: daysAhead(1) },
        { id: 'later', roundName: 'Final', outcome: 'Scheduled', scheduledAt: daysAhead(5) },
        { id: 'soon', roundName: 'Onsite', outcome: 'Scheduled', scheduledAt: daysAhead(2) },
      ],
    });
    expect(nextInterview(j, NOW)?.id).toBe('soon');
  });
});

describe('buildDashboardSummary', () => {
  it('excludes archived jobs, counts stages, and puts stalled jobs first', () => {
    const jobs = {
      a: job({ id: 'a', stage: 'Rating', updatedAt: daysAgo(1) }),
      b: job({ id: 'b', stage: 'Parsed', updatedAt: daysAgo(9) }),
      c: job({ id: 'c', stage: 'Rating', updatedAt: daysAgo(14) }),
      d: job({ id: 'd', stage: 'Intake', updatedAt: daysAgo(0) }),
      e: job({ id: 'e', stage: 'Archive', updatedAt: daysAgo(0) }),
    };
    const s = buildDashboardSummary(jobs, {}, 0, NOW);
    expect(s.activeJobs.map((x) => x.job.id)).toEqual(['c', 'b', 'd', 'a']);
    expect(s.stageCounts.Rating).toBe(2);
    expect(s.stageCounts.Intake).toBe(1);
    expect(s.tiles.active).toBe(4);
    expect(s.activeJobs[0].path).toBe('/job/c/rating');
  });

  it('lists only New matches above the score floor, best first, unscored last', () => {
    const matches = {
      low: match({ id: 'low', matchScore: 40 }),
      high: match({ id: 'high', matchScore: 90 }),
      mid: match({ id: 'mid', matchScore: 70 }),
      none: match({ id: 'none' }),
      dismissed: match({ id: 'dismissed', status: 'Dismissed', matchScore: 95 }),
    };
    const s = buildDashboardSummary({}, matches, 50, NOW);
    expect(s.matchesToReview.map((m) => m.id)).toEqual(['high', 'mid', 'none']);
    expect(s.tiles.matchesToReview).toBe(3);
  });
});

describe('averageCompleteness', () => {
  it('is the rounded mean of the three checks', () => {
    const c = {
      achievementsWithMetric: { count: 1, total: 2, pct: 50 },
      skillsWithRecentUse: { count: 1, total: 1, pct: 100 },
      rolesWithFullDescription: { count: 0, total: 1, pct: 0 },
    };
    expect(averageCompleteness(c)).toBe(50);
  });
});
