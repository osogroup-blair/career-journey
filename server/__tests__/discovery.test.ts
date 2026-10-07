import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchJobs, getJob, checkStatus, StillOpenError, _resetStillOpenThrottle } from '../discovery/stillOpenClient';
import {
  buildSearchPlan,
  pagesPerCombo,
  mergeFound,
  applyStatusEntries,
  staleIds,
  computeNextRunAt,
  MAX_SEARCH_CALLS,
  STALE_AFTER_MS,
} from '../discovery/runSearch';
import { sanitizeAiSearchProfile } from '../discovery/searchProfile';
import { isFeatureEnabled } from '../featureFlags';
import { getDefaultFeatureMatrix, type FeatureFlags } from '../../src/types/featureFlags';
import { careerJourneyToText } from '../../src/lib/careerJourneyText';
import { rankDiscoveredJobs, describeEvidence } from '../../src/lib/discoveryRank';
import { DiscoverySearchProfileSchema, type DiscoveredJob } from '../../src/types/discovery';
import demoCareerJourney from '../../src/lib/demo/demoCareerJourney.json';

const listing = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  status: 'open',
  title: `Product Manager ${id}`,
  company: 'Acme',
  company_slug: 'acme',
  canonical_url: `https://stillopen.work/job/${id}`,
  locations: ['United Kingdom'],
  location_conflict: [],
  level: 'unspecified',
  posting_class: 'standard',
  salary: null,
  posted_at: '2026-10-01T00:00:00Z',
  last_seen_at: '2026-10-06T00:00:00Z',
  verified_at: '2026-10-06T00:00:00Z',
  evidence_type: 'ats_verified',
  postings: 1,
  sources: ['greenhouse'],
  direct_posted: false,
  promoted: false,
  ...extra,
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}

describe('stillOpenClient', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    _resetStillOpenThrottle();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('rejects a filter value StillOpen would refuse, before making a call', async () => {
    await expect(searchJobs({ q: 'pm', level: 'principal' as any })).rejects.toThrow();
    await expect(searchJobs({ q: 'pm', pay: 75000 })).rejects.toThrow();
    await expect(searchJobs({ q: 'pm', loc: 'europe' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps gb to uk and sends the validated params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ jobs: [listing(1)], total: 1, next_cursor: 'abc' }));
    const res = await searchJobs({ q: 'product manager', loc: 'GB', level: 'senior', pay: 100000 });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v1/jobs');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'product manager', loc: 'uk', level: 'senior', pay: '100000', limit: '20' });
    expect(res.jobs[0].id).toBe(1);
    expect(res.nextCursor).toBe('abc');
  });

  it('waits out Retry-After on a 429 and retries once', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(jsonResponse({ jobs: [], total: 0, next_cursor: null }));
    const pending = searchJobs({ q: 'pm' });
    await vi.advanceTimersByTimeAsync(1_900);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toMatchObject({ jobs: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up on a second 429', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }));
    const pending = searchJobs({ q: 'pm' }).catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await pending;
    expect(err).toBeInstanceOf(StillOpenError);
    expect(err.status).toBe(429);
  });

  it('turns a timeout into a readable error', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    await expect(getJob(5)).rejects.toThrow('did not respond in time');
  });

  it("surfaces StillOpen's own 400 problems", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ problems: ["not a value this endpoint accepts — loc: 'zz'"] }, 400));
    const err = await searchJobs({ q: 'pm', loc: 'zz' }).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.message).toContain("loc: 'zz'");
  });

  it('degrades an unknown evidence type to null instead of failing the page', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ jobs: [listing(1, { evidence_type: 'brand_new_kind' })], total: 1 }));
    const res = await searchJobs({ q: 'pm' });
    expect(res.jobs[0].evidence_type).toBeNull();
  });

  it('checks status with a POSTed JSON body, 100 ids per call', async () => {
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const ids: number[] = JSON.parse(String(init.body)).ids;
      return jsonResponse({ jobs: ids.map((id) => ({ id, status: 'open' })) });
    });
    const pending = checkStatus(Array.from({ length: 150 }, (_, i) => i + 1));
    await vi.runAllTimersAsync();
    const entries = await pending;
    expect(entries).toHaveLength(150);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).ids).toHaveLength(100);
  });
});

describe('search plan', () => {
  const profile = (over: Partial<Parameters<typeof DiscoverySearchProfileSchema.parse>[0]> = {}) =>
    DiscoverySearchProfileSchema.parse({ queries: ['product manager'], ...over });

  it('fans out queries × locations × levels × areas', () => {
    const plan = buildSearchPlan(profile({ queries: ['a', 'b'], loc: ['uk', 'worldwide'], level: ['senior'] }));
    expect(plan).toHaveLength(4);
    expect(plan.map((p) => `${p.params.q}/${p.params.loc}`)).toEqual(['a/uk', 'b/uk', 'a/worldwide', 'b/worldwide']);
  });

  it('caps the plan but still covers every query', () => {
    const plan = buildSearchPlan(
      profile({ queries: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], loc: ['uk', 'us', 'de'], level: ['senior', 'lead'], area: ['product', 'design'] })
    );
    expect(plan).toHaveLength(MAX_SEARCH_CALLS);
    expect(new Set(plan.map((p) => p.query)).size).toBe(6);
  });

  it('gives small plans a second page', () => {
    expect(pagesPerCombo(4)).toBe(2);
    expect(pagesPerCombo(20)).toBe(1);
  });

  it('schedules the next run one interval out, or not at all when off', () => {
    const from = new Date('2026-10-06T00:00:00Z');
    expect(computeNextRunAt('daily', from, 0)).toBe('2026-10-07T00:00:00.000Z');
    expect(computeNextRunAt('weekly', from, 0)).toBe('2026-10-13T00:00:00.000Z');
    expect(computeNextRunAt('off', from, 0)).toBeNull();
  });
});

describe('merging and retention', () => {
  const NOW = '2026-10-06T00:00:00.000Z';
  const stored = (id: string, over: Partial<DiscoveredJob> = {}): DiscoveredJob => ({
    id,
    title: 'Old title',
    company: 'Acme',
    canonicalUrl: null,
    locations: [],
    status: 'open',
    matchedQueries: ['old query'],
    firstSeenAt: '2026-09-01T00:00:00.000Z',
    lastFoundAt: '2026-09-01T00:00:00.000Z',
    statusCheckedAt: '2026-09-01T00:00:00.000Z',
    userState: 'new',
    ...over,
  });

  it('counts only unseen listings as new and keeps the user’s state on existing ones', () => {
    const existing = new Map([['1', stored('1', { userState: 'dismissed', matchId: 'MATCH-1' })]]);
    const { upserts, newCount } = mergeFound(
      existing,
      [
        { listing: listing(1) as any, query: 'pm' },
        { listing: listing(2) as any, query: 'pm' },
        { listing: listing(2) as any, query: 'product lead' },
      ],
      NOW
    );
    expect(newCount).toBe(1);
    const one = upserts.find((j) => j.id === '1')!;
    expect(one).toMatchObject({ userState: 'dismissed', matchId: 'MATCH-1', title: 'Product Manager 1', lastFoundAt: NOW, firstSeenAt: '2026-09-01T00:00:00.000Z' });
    expect(one.matchedQueries).toEqual(['old query', 'pm']);
    const two = upserts.find((j) => j.id === '2')!;
    expect(two).toMatchObject({ userState: 'new', firstSeenAt: NOW });
    expect(two.matchedQueries).toEqual(['pm', 'product lead']);
  });

  it('never writes undefined fields (Firestore rejects them)', () => {
    const { upserts } = mergeFound(new Map(), [{ listing: { id: 9, status: 'open', title: 't', company: 'c', locations: [] } as any, query: 'q' }], NOW);
    expect(Object.values(upserts[0]).some((v) => v === undefined)).toBe(false);
  });

  it('deletes closed, unknown and merged listings on a status check', () => {
    const { updates, deletes } = applyStatusEntries(
      [
        { id: 1, status: 'open', evidence_type: 'board_verified' },
        { id: 2, status: 'closed' },
        { id: 3, status: 'unknown' },
        { id: 4, status: 'open', merged_into: 99 },
        { id: 5, status: 'unconfirmed' },
      ] as any,
      NOW
    );
    expect(deletes).toEqual(['2', '3', '4']);
    expect(updates.map((u) => u.id)).toEqual(['1', '5']);
    expect(updates[0].fields).toMatchObject({ status: 'open', evidenceType: 'board_verified', statusCheckedAt: NOW });
  });

  it('drops stale listings unless the user scanned or promoted them', () => {
    const now = new Date(NOW);
    const old = new Date(now.getTime() - STALE_AFTER_MS - 1000).toISOString();
    const recent = new Date(now.getTime() - 1000).toISOString();
    const ids = staleIds(
      [
        stored('a', { lastFoundAt: old }),
        stored('b', { lastFoundAt: old, userState: 'dismissed' }),
        stored('c', { lastFoundAt: old, userState: 'scanned' }),
        stored('d', { lastFoundAt: old, userState: 'promoted' }),
        stored('e', { lastFoundAt: recent }),
      ],
      now
    );
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('sanitizeAiSearchProfile', () => {
  it('keeps valid values and reports what it dropped', () => {
    const { searchProfile, dropped } = sanitizeAiSearchProfile({
      queries: ['Senior Product Manager', 'senior product manager', '"growth" (product)', ''],
      loc: ['GB', 'worldwide', 'europe'],
      level: ['senior', 'principal'],
      area: ['Sales & Marketing', 'product', 'astrology'],
      payMin: 95000,
    });
    expect(searchProfile).toEqual({
      queries: ['Senior Product Manager', 'growth product'],
      loc: ['uk', 'worldwide'],
      level: ['senior'],
      area: ['sales_marketing', 'product'],
      payMin: null,
    });
    expect(dropped).toEqual(expect.arrayContaining(['location "europe"', 'level "principal"', 'area "astrology"', 'minimum pay 95000']));
  });

  it('returns null when nothing usable came back', () => {
    expect(sanitizeAiSearchProfile({ queries: [] }).searchProfile).toBeNull();
  });
});

describe('job_discovery access', () => {
  const flags = (over: Partial<FeatureFlags> = {}): FeatureFlags => ({
    freeLifetimeLimit: 20,
    proMonthlyLimit: 100,
    byomBurstPerMinute: 30,
    byomDailyLimit: 500,
    killSwitches: { matches: false, aiPipeline: false, discovery: false },
    features: getDefaultFeatureMatrix(),
    ...over,
  });
  const original = process.env.STILLOPEN_LICENSED;
  afterEach(() => {
    process.env.STILLOPEN_LICENSED = original;
  });

  it('is admin-only while unlicensed, even for comped accounts or an enabled plan', () => {
    delete process.env.STILLOPEN_LICENSED;
    const matrix = getDefaultFeatureMatrix();
    matrix.job_discovery.pro_monthly = true;
    expect(isFeatureEnabled(flags(), 'job_discovery', { plan: 'free', isAdmin: true })).toBe(true);
    expect(isFeatureEnabled(flags(), 'job_discovery', { plan: 'pro_monthly', comped: true })).toBe(false);
    expect(isFeatureEnabled(flags({ features: matrix }), 'job_discovery', { plan: 'pro_monthly' })).toBe(false);
  });

  it('follows the plan matrix once licensed', () => {
    process.env.STILLOPEN_LICENSED = 'true';
    const matrix = getDefaultFeatureMatrix();
    matrix.job_discovery.pro_monthly = true;
    expect(isFeatureEnabled(flags({ features: matrix }), 'job_discovery', { plan: 'pro_monthly' })).toBe(true);
    expect(isFeatureEnabled(flags({ features: matrix }), 'job_discovery', { plan: 'free' })).toBe(false);
  });

  it('honours the discovery kill switch, even for admins', () => {
    expect(isFeatureEnabled(flags({ killSwitches: { matches: false, aiPipeline: false, discovery: true } }), 'job_discovery', { isAdmin: true })).toBe(false);
    // and it doesn't touch other features
    expect(isFeatureEnabled(flags({ killSwitches: { matches: false, aiPipeline: false, discovery: true } }), 'job_matches', { plan: 'pro_monthly' })).toBe(true);
  });
});

describe('careerJourneyToText', () => {
  const text = careerJourneyToText(demoCareerJourney);

  it('covers who the candidate is and what they target, newest role first', () => {
    expect(text.startsWith('Jordan Rivera')).toBe(true);
    expect(text).toContain('TARGET ROLES\nSenior Product Manager; Group Product Manager; Director of Product');
    expect(text).toContain('Preference: Remote or hybrid');
    const experience = text.slice(text.indexOf('EXPERIENCE'));
    expect(experience.indexOf('Meridian Cloudworks')).toBeLessThan(experience.indexOf('EDUCATION') === -1 ? Infinity : experience.indexOf('EDUCATION'));
    expect(text).toContain('$4M ARR');
  });

  it('leaves out contact details', () => {
    expect(text).not.toContain('jordan.rivera@example.com');
    expect(text).not.toContain('555-010-2938');
    expect(text).not.toContain('linkedin.com');
  });

  it('is deterministic and tolerates an empty journey', () => {
    expect(careerJourneyToText(demoCareerJourney)).toBe(text);
    expect(careerJourneyToText(null)).toBe('');
    expect(careerJourneyToText({})).toBe('');
  });
});

describe('discovery ranking', () => {
  const now = new Date('2026-10-06T00:00:00Z');
  const job = (id: string, title: string, over: Partial<DiscoveredJob> = {}): DiscoveredJob => ({
    id,
    title,
    company: 'Acme',
    canonicalUrl: null,
    locations: [],
    status: 'open',
    matchedQueries: ['pm'],
    firstSeenAt: '2026-10-01T00:00:00Z',
    lastFoundAt: '2026-10-01T00:00:00Z',
    statusCheckedAt: '2026-10-05T00:00:00Z',
    userState: 'new',
    postedAt: '2026-10-05T00:00:00Z',
    evidenceType: 'ats_verified',
    ...over,
  });

  it('puts titles that match a target role above unrelated ones', () => {
    const ranked = rankDiscoveredJobs(
      [job('1', 'Backend Engineer'), job('2', 'Senior Product Manager (100% remote)')],
      { targetRoles: ['Senior Product Manager'], skills: [] },
      now
    );
    expect(ranked[0].job.id).toBe('2');
  });

  it('ranks age-only evidence below an independently re-checked listing', () => {
    const ranked = rankDiscoveredJobs(
      [job('1', 'Product Manager', { evidenceType: 'age_inferred' }), job('2', 'Product Manager', { evidenceType: 'board_verified' })],
      { targetRoles: ['Product Manager'], skills: [] },
      now
    );
    expect(ranked.map((r) => r.job.id)).toEqual(['2', '1']);
  });

  it('never words unverified evidence as verified', () => {
    expect(describeEvidence({ evidenceType: 'age_inferred', status: 'open' }, now)).toMatchObject({ label: 'Not recently confirmed', tone: 'warning' });
    expect(describeEvidence({ evidenceType: 'employer_attested', status: 'open' }, now).label).toContain('unverified');
    expect(describeEvidence({ evidenceType: 'ats_verified', verifiedAt: '2026-10-04T00:00:00Z', status: 'open' }, now).label).toBe("Checked on employer's ATS 2 days ago");
    expect(describeEvidence({ evidenceType: 'ats_verified', status: 'unknown' }, now).tone).toBe('warning');
  });
});
