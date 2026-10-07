import { describe, it, expect } from 'vitest';
import { jobMatchesQuery, matchScoresByJob, sortJobs } from '../trackerList';
import type { JobAnalysis, JobMatch } from '../../types';

function job(id: string, overrides: Partial<JobAnalysis> = {}): JobAnalysis {
  return {
    id,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    stage: 'Rating',
    companyName: 'Acme',
    roleTitle: 'Engineer',
    jdText: '',
    ...overrides,
  };
}

const ids = (js: JobAnalysis[]) => js.map((j) => j.id);

describe('trackerList', () => {
  it('maps promoted match scores onto their jobs', () => {
    const matches = {
      a: { promotedJobId: 'J1', matchScore: 82 } as JobMatch,
      b: { matchScore: 70 } as JobMatch,
      c: { promotedJobId: 'J2' } as JobMatch,
    };
    expect(matchScoresByJob(matches)).toEqual({ J1: 82 });
  });

  it('searches title, company and location', () => {
    const j = job('J', { roleTitle: 'Staff Engineer', companyName: 'Stripe', locationNotes: 'Remote — Canada' });
    expect(['staff', 'STRIPE', 'canada', ''].map((q) => jobMatchesQuery(j, q))).toEqual([true, true, true, true]);
    expect(jobMatchesQuery(j, 'designer')).toBe(false);
  });

  it('sorts by update time, stage, company and match score', () => {
    const jobs = [
      job('old-offer', { stage: 'Offer', companyName: 'zeta', updatedAt: '2026-09-01T00:00:00Z' }),
      job('new-intake', { stage: 'Intake', companyName: 'Alpha', updatedAt: '2026-10-05T00:00:00Z' }),
      job('mid-apply', { stage: 'Apply', companyName: 'beta', updatedAt: '2026-09-20T00:00:00Z' }),
    ];
    expect(ids(sortJobs(jobs, 'updated'))).toEqual(['new-intake', 'mid-apply', 'old-offer']);
    expect(ids(sortJobs(jobs, 'stage'))).toEqual(['old-offer', 'mid-apply', 'new-intake']);
    expect(ids(sortJobs(jobs, 'company'))).toEqual(['new-intake', 'mid-apply', 'old-offer']);
    expect(ids(sortJobs(jobs, 'score', { 'mid-apply': 60, 'old-offer': 90 }))).toEqual(['old-offer', 'mid-apply', 'new-intake']);
  });
});
