import { describe, it, expect } from 'vitest';
import { buildMatchList, isScanPending, scoreTier, type MatchListOptions } from '../matchList';
import type { JobMatch } from '../../types';

function match(overrides: Partial<JobMatch> = {}): JobMatch {
  return {
    id: 'M-1',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    source: 'manual-paste',
    companyName: 'Acme',
    roleTitle: 'Engineer',
    jdText: '',
    status: 'New',
    verdict: 'PASS',
    matchScore: 70,
    ...overrides,
  };
}

const opts = (o: Partial<MatchListOptions> = {}): MatchListOptions => ({
  view: 'review',
  verdict: 'any',
  query: '',
  sort: 'score',
  minScore: 0,
  showBelowFloor: false,
  ...o,
});

const byId = (...ms: JobMatch[]) => Object.fromEntries(ms.map((m) => [m.id, m]));
const ids = (ms: JobMatch[]) => ms.map((m) => m.id);

describe('buildMatchList', () => {
  it('defaults to matches still waiting on a decision', () => {
    const data = byId(
      match({ id: 'new' }),
      match({ id: 'promoted', status: 'Promoted' }),
      match({ id: 'dismissed', status: 'Dismissed' })
    );
    expect(ids(buildMatchList(data, opts()).visible)).toEqual(['new']);
    expect(ids(buildMatchList(data, opts({ view: 'dismissed' })).visible)).toEqual(['dismissed']);
    expect(buildMatchList(data, opts({ view: 'all' })).visible).toHaveLength(3);
  });

  it('sorts in-flight scans first, then by score, then failed scans', () => {
    const data = byId(
      match({ id: 'low', matchScore: 40 }),
      match({ id: 'failed', verdict: undefined, matchScore: undefined, scanError: 'boom' }),
      match({ id: 'high', matchScore: 90 }),
      match({ id: 'pending', verdict: undefined, matchScore: undefined })
    );
    expect(ids(buildMatchList(data, opts()).visible)).toEqual(['pending', 'high', 'low', 'failed']);
  });

  it('hides scored matches below the floor, but never promoted or unscored ones', () => {
    const data = byId(
      match({ id: 'above', matchScore: 80 }),
      match({ id: 'below', matchScore: 30 }),
      match({ id: 'pending', verdict: undefined, matchScore: undefined }),
      match({ id: 'promotedLow', status: 'Promoted', matchScore: 10 })
    );
    const res = buildMatchList(data, opts({ view: 'all', minScore: 60 }));
    expect(ids(res.visible).sort()).toEqual(['above', 'pending', 'promotedLow']);
    expect(res.hiddenByFloor).toBe(1);
    expect(res.viewCounts.review).toBe(2);

    const shown = buildMatchList(data, opts({ view: 'all', minScore: 60, showBelowFloor: true }));
    expect(shown.visible).toHaveLength(4);
    expect(shown.hiddenByFloor).toBe(0);
  });

  it('filters by verdict and search, with verdict counts scoped to the search', () => {
    const data = byId(
      match({ id: 'a', companyName: 'Stripe', verdict: 'PASS' }),
      match({ id: 'b', companyName: 'Stripe', verdict: 'BORDERLINE' }),
      match({ id: 'c', companyName: 'Other', roleTitle: 'Designer', verdict: 'PASS', locationNotes: 'Remote — Canada' })
    );
    const res = buildMatchList(data, opts({ query: 'stripe', verdict: 'PASS' }));
    expect(ids(res.visible)).toEqual(['a']);
    expect(res.verdictCounts).toEqual({ any: 2, PASS: 1, BORDERLINE: 1, SKIP: 0 });
    expect(ids(buildMatchList(data, opts({ query: 'canada' })).visible)).toEqual(['c']);
  });

  it('sorts by newest and company', () => {
    const data = byId(
      match({ id: 'old', companyName: 'Zeta', createdAt: '2026-09-01T00:00:00Z' }),
      match({ id: 'mid', companyName: 'alpha', createdAt: '2026-09-15T00:00:00Z' }),
      match({ id: 'new', companyName: 'Beta', createdAt: '2026-10-01T00:00:00Z' })
    );
    expect(ids(buildMatchList(data, opts({ sort: 'newest' })).visible)).toEqual(['new', 'mid', 'old']);
    expect(ids(buildMatchList(data, opts({ sort: 'company' })).visible)).toEqual(['mid', 'new', 'old']);
  });
});

describe('isScanPending / scoreTier', () => {
  it('treats errors and keyword auto-dismissals as finished', () => {
    expect(isScanPending(match({ verdict: undefined }))).toBe(true);
    expect(isScanPending(match({ verdict: undefined, scanError: 'x' }))).toBe(false);
    expect(isScanPending(match({ verdict: undefined, dismissReason: 'x' }))).toBe(false);
  });

  it('buckets scores', () => {
    expect([85, 70, 55, 20].map(scoreTier)).toEqual(['strong', 'good', 'fair', 'low']);
  });
});
