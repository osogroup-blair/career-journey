import { describe, it, expect } from 'vitest';
import { buildDiscoverList, type RankedListing } from '../discoverList';
import type { JobMatch } from '../../types';
import type { DiscoveredJob } from '../../types/discovery';

function listing(id: string, overrides: Partial<DiscoveredJob> = {}, score = 50): RankedListing {
  return {
    score,
    job: {
      id,
      title: 'Product Manager',
      company: 'Acme',
      canonicalUrl: null,
      locations: ['Remote — UK'],
      status: 'open',
      matchedQueries: ['product manager'],
      firstSeenAt: '2026-10-01T00:00:00Z',
      lastFoundAt: '2026-10-01T00:00:00Z',
      statusCheckedAt: '2026-10-01T00:00:00Z',
      userState: 'new',
      ...overrides,
    } as DiscoveredJob,
  };
}

const ids = (rs: RankedListing[]) => rs.map((r) => r.job.id);
const base = { view: 'all' as const, query: '', sort: 'relevance' as const };

describe('buildDiscoverList', () => {
  it('groups listings into views and counts them', () => {
    const ranked = [
      listing('new'),
      listing('seen', { userState: 'seen' }),
      listing('scanned', { userState: 'scanned' }),
      listing('promoted', { userState: 'promoted' }),
      listing('dismissed', { userState: 'dismissed' }),
    ];
    const res = buildDiscoverList(ranked, {}, { ...base, view: 'review' });
    expect(ids(res.visible)).toEqual(['new', 'seen']);
    expect(res.counts).toEqual({ review: 2, scanned: 2, dismissed: 1, all: 5 });
    expect(ids(buildDiscoverList(ranked, {}, { ...base, view: 'scanned' }).visible)).toEqual(['scanned', 'promoted']);
  });

  it('keeps relevance order by default and searches title, company, location and query', () => {
    const ranked = [listing('a', { company: 'Stripe' }), listing('b', { locations: ['Remote — Canada'] }), listing('c', { title: 'Designer' })];
    expect(ids(buildDiscoverList(ranked, {}, base).visible)).toEqual(['a', 'b', 'c']);
    expect(ids(buildDiscoverList(ranked, {}, { ...base, query: 'stripe' }).visible)).toEqual(['a']);
    expect(ids(buildDiscoverList(ranked, {}, { ...base, query: 'canada' }).visible)).toEqual(['b']);
    expect(ids(buildDiscoverList(ranked, {}, { ...base, query: 'design' }).visible)).toEqual(['c']);
  });

  it('sorts scanned listings by match score above unscanned ones', () => {
    const ranked = [listing('unscanned'), listing('low', { matchId: 'm1' }), listing('high', { matchId: 'm2' })];
    const matches = { m1: { matchScore: 40 } as JobMatch, m2: { matchScore: 90 } as JobMatch };
    expect(ids(buildDiscoverList(ranked, matches, { ...base, sort: 'score' }).visible)).toEqual(['high', 'low', 'unscanned']);
  });

  it('sorts by posting date, falling back to when it was first seen', () => {
    const ranked = [
      listing('old', { postedAt: '2026-09-01T00:00:00Z' }),
      listing('undated', { postedAt: null, firstSeenAt: '2026-09-20T00:00:00Z' }),
      listing('new', { postedAt: '2026-10-05T00:00:00Z' }),
    ];
    expect(ids(buildDiscoverList(ranked, {}, { ...base, sort: 'newest' }).visible)).toEqual(['new', 'undated', 'old']);
  });
});
