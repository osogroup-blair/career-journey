import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import { htmlToText } from '../htmlToText';
import { segmentJdText } from '../../src/lib/jdSegments';
import { buildJobFromMatch } from '../../src/lib/matchScan';
import { formatLocationNotes, formatSalary } from '../../src/lib/discoveryFormat';
import { DetailSchema } from '../discovery/stillOpenClient';
import type { JobMatch } from '../../src/types';

// --- Mocks for the status route: a signed-in user with Firebase Admin "configured". ---
const ownedJobListingIds = new Set<string>();
const ownedMatchExternalIds = new Set<string>();
const mockCheckStatus = vi.fn();

vi.mock('../firebaseAdmin', () => ({ getAdminApp: () => ({}) }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({
        collection: (name: string) => ({
          where: (field: string, _op: string, value: string) => ({
            limit: () => ({
              get: async () => {
                const owned = name === 'jobs' && field === 'source.listingId' ? ownedJobListingIds : name === 'matches' && field === 'externalId' ? ownedMatchExternalIds : new Set();
                return { empty: !owned.has(value) };
              },
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('../discovery/stillOpenClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../discovery/stillOpenClient')>();
  return { ...actual, checkStatus: (ids: number[]) => mockCheckStatus(ids) };
});

describe('htmlToText', () => {
  it('keeps paragraphs and list items as separate lines', () => {
    const html = '<div><p><strong>About the company</strong></p>\n<p>We build APIs.</p><h3>You will</h3><ul><li>Own the roadmap</li><li>Talk to customers</li></ul></div>';
    expect(htmlToText(html)).toBe('About the company\n\nWe build APIs.\n\nYou will\n\n- Own the roadmap\n- Talk to customers');
  });

  it('does not turn literal escaped text into tags unless asked to decode first', () => {
    expect(htmlToText('<p>Use &lt;b&gt; tags &amp; more</p>')).toBe('Use <b> tags & more');
    // Greenhouse/Lever content arrives escaped: decoding first is what exposes the tags.
    expect(htmlToText('&lt;p&gt;Hello&lt;/p&gt;&lt;p&gt;World&lt;/p&gt;', { decodeEntitiesFirst: true })).toBe('Hello\n\nWorld');
  });

  it('drops script and style content', () => {
    expect(htmlToText('<style>p{color:red}</style><p>Hi</p><script>alert(1)</script>')).toBe('Hi');
  });
});

describe('segmentJdText', () => {
  it('splits on blank lines when there are enough paragraphs', () => {
    expect(segmentJdText('A\n\nB\n\nC\n\nD')).toEqual([
      { id: 'jd-0', text: 'A' },
      { id: 'jd-1', text: 'B' },
      { id: 'jd-2', text: 'C' },
      { id: 'jd-3', text: 'D' },
    ]);
  });

  it('falls back to line breaks for a JD with few paragraphs', () => {
    expect(segmentJdText('Intro\n- one\n- two').map((s) => s.text)).toEqual(['Intro', '- one', '- two']);
  });
});

describe('StillOpen display strings', () => {
  it('formats salary and location notes', () => {
    expect(formatSalary({ min: 120000, max: 150000, currency: 'USD', period: 'year' })).toBe('USD 120k–150k');
    expect(formatSalary(null)).toBe('');
    expect(formatLocationNotes(['United Kingdom', 'Ireland', 'Spain', 'Portugal'], 'FULL_TIME')).toBe('Remote — United Kingdom, Ireland, Spain +1 · Full-time');
    expect(formatLocationNotes([], null)).toBe('Remote');
  });

  it('accepts description_html on the listing detail', () => {
    const parsed = DetailSchema.parse({ id: 1, status: 'open', title: 't', company: 'c', locations: [], description_html: '<p>x</p>' });
    expect(parsed.description_html).toBe('<p>x</p>');
  });
});

describe('buildJobFromMatch', () => {
  const NOW = '2026-10-07T00:00:00.000Z';
  const match = (over: Partial<JobMatch> = {}): JobMatch => ({
    id: 'MATCH-1',
    createdAt: NOW,
    updatedAt: NOW,
    source: 'stillopen',
    externalId: '260291',
    sourceUrl: 'https://stillopen.work/job/260291-x',
    applyUrl: 'https://job-boards.greenhouse.io/acme/jobs/1',
    compensationRange: 'USD 120k–150k',
    locationNotes: 'Remote — United Kingdom · Full-time',
    companyName: 'Acme',
    roleTitle: 'Senior PM',
    jdText: 'Senior PM — Acme\n\nAbout\n\nYou will\n\n- Own things',
    status: 'New',
    parse: { company: 'Acme', roleTitle: 'Senior PM' } as any,
    ...over,
  });

  it('uses the employer apply link and keeps the StillOpen listing as the source', () => {
    const job = buildJobFromMatch(match(), 'JOB-1', NOW);
    expect(job).toMatchObject({
      id: 'JOB-1',
      stage: 'Parsed',
      jobLink: 'https://job-boards.greenhouse.io/acme/jobs/1',
      compensationRange: 'USD 120k–150k',
      locationNotes: 'Remote — United Kingdom · Full-time',
      source: { kind: 'stillopen', listingId: '260291', listingUrl: 'https://stillopen.work/job/260291-x' },
    });
  });

  it('gives a scanned match JD segments, since it skips the parse step', () => {
    const job = buildJobFromMatch(match(), 'JOB-1', NOW);
    expect(job.jdSegments?.map((s) => s.text)).toEqual(['Senior PM — Acme', 'About', 'You will', '- Own things']);
  });

  it('falls back to the posting link and sets no source for non-StillOpen matches', () => {
    const job = buildJobFromMatch(match({ source: 'greenhouse', applyUrl: undefined, sourceUrl: 'https://boards.greenhouse.io/acme/jobs/1', compensationRange: undefined, locationNotes: undefined }), 'JOB-2', NOW);
    expect(job.jobLink).toBe('https://boards.greenhouse.io/acme/jobs/1');
    expect(job.source).toBeUndefined();
    expect('compensationRange' in job).toBe(false);
  });

  it('starts an unscanned match at Intake with no segments', () => {
    const job = buildJobFromMatch(match({ parse: undefined }), 'JOB-3', NOW);
    expect(job.stage).toBe('Intake');
    expect(job.jdSegments).toBeUndefined();
  });
});

describe('GET /api/discovery/listings/:id/status', () => {
  let base = '';
  let server: ReturnType<ReturnType<typeof express>['listen']>;

  beforeAll(async () => {
    const { createDiscoveryRouter } = await import('../discovery/routes');
    const app = express();
    app.use((req, _res, next) => {
      (req as any).uid = 'user-1';
      next();
    });
    app.use('/api/discovery', createDiscoveryRouter());
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server?.close();
  });
  beforeEach(() => {
    ownedJobListingIds.clear();
    ownedMatchExternalIds.clear();
    mockCheckStatus.mockReset();
  });

  it("refuses listings that aren't behind one of the user's jobs or matches", async () => {
    const res = await fetch(`${base}/api/discovery/listings/123/status`);
    expect(res.status).toBe(404);
    expect(mockCheckStatus).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric id', async () => {
    const res = await fetch(`${base}/api/discovery/listings/abc/status`);
    expect(res.status).toBe(400);
  });

  it("returns StillOpen's status for the user's own job", async () => {
    ownedJobListingIds.add('123');
    mockCheckStatus.mockResolvedValueOnce([{ id: 123, status: 'closed', closed_at: '2026-10-05T00:00:00Z', closure: 'observed' }]);
    const res = await fetch(`${base}/api/discovery/listings/123/status`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'closed', closedAt: '2026-10-05T00:00:00Z', closure: 'observed' });
    expect(mockCheckStatus).toHaveBeenCalledWith([123]);
  });

  it('treats a merged listing as closed', async () => {
    ownedMatchExternalIds.add('77');
    mockCheckStatus.mockResolvedValueOnce([{ id: 77, status: 'open', merged_into: 78 }]);
    const body = await (await fetch(`${base}/api/discovery/listings/77/status`)).json();
    expect(body).toMatchObject({ status: 'closed', closure: 'merged' });
  });
});
