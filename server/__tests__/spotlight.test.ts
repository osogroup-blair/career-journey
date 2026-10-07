import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import demo from '../../src/lib/demo/demoCareerJourney.json';

// ---------- an in-memory Firestore: docs by path, subcollections, where ==, transactions ----------

const store = new Map<string, any>();
const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

function docRef(path: string): any {
  return {
    path,
    id: path.split('/').pop(),
    get: async () => snap(path),
    set: async (data: any, opts?: { merge?: boolean }) => write(path, data, opts),
    delete: async () => void store.delete(path),
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}
function snap(path: string) {
  const data = store.get(path);
  return { exists: data !== undefined, data: () => clone(data), ref: docRef(path), id: path.split('/').pop() };
}
// Like the real SDK, refuse undefined anywhere in a write.
const hasUndefined = (v: any): boolean =>
  v === undefined || (v !== null && typeof v === 'object' && Object.values(v).some(hasUndefined));
const isIncrement = (v: any) => v && typeof v === 'object' && '__inc' in v;
const isPlainObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v) && !isIncrement(v);
function mergeDeep(target: any, patch: any): any {
  const out = { ...(target ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (isIncrement(v)) out[k] = (Number(out[k]) || 0) + (v as any).__inc;
    else if (isPlainObject(v)) out[k] = mergeDeep(out[k], v);
    else out[k] = Buffer.isBuffer(v) ? v : clone(v);
  }
  return out;
}
function write(path: string, data: any, opts?: { merge?: boolean }) {
  if (hasUndefined(data)) throw new Error(`Cannot use undefined as a Firestore value (${path})`);
  store.set(path, opts?.merge ? mergeDeep(store.get(path), data) : mergeDeep({}, data));
}
function collectionRef(path: string): any {
  return {
    doc: (id: string) => docRef(`${path}/${id}`),
    where: (field: string, _op: '==', value: unknown) => ({
      get: async () => ({
        docs: [...store.keys()]
          .filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/') && store.get(k)?.[field] === value)
          .map(snap),
      }),
    }),
  };
}
const fakeDb = {
  collection: (name: string) => collectionRef(name),
  runTransaction: async (fn: (tx: any) => Promise<any>) => {
    const writes: (() => void)[] = [];
    const tx = {
      get: async (ref: any) => snap(ref.path),
      set: (ref: any, data: any, opts?: { merge?: boolean }) => writes.push(() => write(ref.path, data, opts)),
      delete: (ref: any) => writes.push(() => store.delete(ref.path)),
    };
    const result = await fn(tx);
    writes.forEach((w) => w());
    return result;
  },
};

let adminConfigured = true;
let flags = { killSwitches: { matches: false, aiPipeline: false, discovery: false, spotlight: false } };
let plan = 'free';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => fakeDb, FieldValue: { increment: (n: number) => ({ __inc: n }) } }));

// Chromium renders, stubbed: the real ones are exercised by hand (see career-spotlight-plan.md).
const renders = { image: 0, pdf: 0, failPdf: false };
vi.mock('../pdfRenderer', () => ({
  renderSpotlightImage: async () => {
    renders.image++;
    return Buffer.from('JPEG-BYTES');
  },
  renderSpotlightPdf: async () => {
    renders.pdf++;
    if (renders.failPdf) throw new Error('No Chrome/Chromium found');
    return Buffer.from('%PDF-1.7 test');
  },
}));
vi.mock('../firebaseAdmin', () => ({ getAdminApp: () => (adminConfigured ? {} : null) }));
vi.mock('../featureFlags', () => ({ getFeatureFlags: async () => flags }));
vi.mock('../billing', () => ({
  getBillingState: async () => ({ plan, comped: false }),
  isPaidPlan: (p: string) => p !== 'free',
}));

const {
  createSpotlightRouter,
  createPublicSpotlightRouter,
  registerSpotlightPage,
  renderSpotlightHtml,
  deleteSpotlightsOwnedBy,
  exportSpotlight,
  ipRateLimit,
  scriptJson,
  refreshSpotlightImage,
  summarizeViews,
} = await import('../spotlight');

const TEMPLATE = '<html><head><!--spotlight-head--></head><body><div id="root"></div><!--spotlight-data--></body></html>';

// ---------- an app wired like server.ts, with a test header standing in for the verified token ----------

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/spotlight', (req, _res, next) => {
    const uid = req.header('x-test-uid');
    if (uid) (req as any).uid = uid;
    next();
  }, createSpotlightRouter({ renderOrigin: 'http://render.test' }));
  app.use('/api/public/spotlights', createPublicSpotlightRouter());
  registerSpotlightPage(app, async () => TEMPLATE, { renderOrigin: 'http://render.test' });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

beforeEach(() => {
  store.clear();
  adminConfigured = true;
  plan = 'free';
  flags = { killSwitches: { matches: false, aiPipeline: false, discovery: false, spotlight: false } };
  store.set('users/alice/careerJourney/current', structuredClone(demo));
  Object.assign(renders, { image: 0, pdf: 0, failPdf: false });
});

/** The image renders after the publish response; wait for it to land. */
async function imageReady(slug: string) {
  for (let i = 0; i < 50 && !store.get(`spotlights/${slug}`)?.imageVersion; i++) await new Promise((r) => setTimeout(r, 10));
  return store.get(`spotlights/${slug}`)?.imageVersion as string | undefined;
}
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15' };

const as = (uid: string) => ({ 'x-test-uid': uid, 'Content-Type': 'application/json' });
const publish = (uid: string, body: unknown) => fetch(`${base}/api/spotlight/publish`, { method: 'POST', headers: as(uid), body: JSON.stringify(body) });
const publicGet = (slug: string) => fetch(`${base}/api/public/spotlights/${slug}`);

describe('publishing', () => {
  it('builds the page from the stored Career Journey, owned by the token’s uid, whatever the body says', async () => {
    const res = await publish('alice', {
      uid: 'mallory',
      ownerUid: 'mallory',
      snapshot: { person: { name: 'Injected' } },
      careerJourney: { person: { name: 'Injected' } },
      settings: { slug: 'jordan-rivera' },
    });
    expect(res.status).toBe(200);
    const page = store.get('spotlights/jordan-rivera');
    expect(page.ownerUid).toBe('alice');
    expect(page.snapshot.person.name).toBe('Jordan Rivera');
    expect(JSON.stringify(page)).not.toContain('Injected');
    expect(store.get('users/alice/spotlight/settings')).toMatchObject({ publishedSlug: 'jordan-rivera', settings: { slug: 'jordan-rivera' } });
  });

  it('suggests an address from the name when none is set', async () => {
    expect((await publish('alice', { settings: {} })).status).toBe(200);
    expect(store.has('spotlights/jordan-rivera')).toBe(true);
  });

  it('refuses an address another account holds, and leaves that page alone', async () => {
    store.set('spotlights/jordan-rivera', { ownerUid: 'bob', slug: 'jordan-rivera', snapshot: { person: { name: 'Bob' } } });
    const res = await publish('alice', { settings: { slug: 'jordan-rivera' } });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('taken');
    expect(store.get('spotlights/jordan-rivera').ownerUid).toBe('bob');
  });

  it('rejects malformed and reserved addresses', async () => {
    expect((await publish('alice', { settings: { slug: 'admin' } })).status).toBe(400);
    expect((await publish('alice', { settings: { slug: '../etc' } })).status).toBe(400);
  });

  it('moves the page when the address changes, and keeps the first publish date on republish', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    await publish('alice', { settings: { slug: 'jordan' } });
    expect(store.has('spotlights/jordan-rivera')).toBe(false);
    expect(store.get('spotlights/jordan').ownerUid).toBe('alice');

    store.get('spotlights/jordan').publishedAt = '2020-01-01T00:00:00.000Z';
    await publish('alice', { settings: { slug: 'jordan', headline: 'New headline' } });
    const page = store.get('spotlights/jordan');
    expect(page.publishedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(page.updatedAt).not.toBe(page.publishedAt);
    expect(page.snapshot.person.headline).toBe('New headline');
  });

  it('keeps the footer mark on the Free plan and lets paid plans remove it', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera', showBadge: false } });
    expect(store.get('spotlights/jordan-rivera').snapshot.style.showBadge).toBe(true);
    plan = 'pro_monthly';
    await publish('alice', { settings: { slug: 'jordan-rivera', showBadge: false } });
    expect(store.get('spotlights/jordan-rivera').snapshot.style.showBadge).toBe(false);
  });

  it('asks for a Career Journey first', async () => {
    const res = await publish('carol', { settings: { slug: 'carol' } });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('no_journey');
  });

  it('unpublishes only the owner’s page', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    await fetch(`${base}/api/spotlight/publish`, { method: 'DELETE', headers: as('bob') });
    expect(store.has('spotlights/jordan-rivera')).toBe(true);
    await fetch(`${base}/api/spotlight/publish`, { method: 'DELETE', headers: as('alice') });
    expect(store.has('spotlights/jordan-rivera')).toBe(false);
    expect(store.get('users/alice/spotlight/settings').publishedSlug).toBeNull();
  });

  it('returns 501 without Firebase, rather than acting as no one', async () => {
    adminConfigured = false;
    expect((await publish('alice', { settings: {} })).status).toBe(501);
    adminConfigured = true;
    expect((await fetch(`${base}/api/spotlight`, { headers: { 'Content-Type': 'application/json' } })).status).toBe(501);
  });
});

describe('owner reads and settings', () => {
  it('returns saved settings and the published summary', async () => {
    await fetch(`${base}/api/spotlight/settings`, { method: 'PUT', headers: as('alice'), body: JSON.stringify({ settings: { headline: 'Hi', roles: { 'ROLE-404': 'excluded' } } }) });
    let body = await (await fetch(`${base}/api/spotlight`, { headers: as('alice') })).json();
    expect(body.settings.headline).toBe('Hi');
    expect(body.settings.roles).toEqual({});
    expect(body.published).toBeNull();

    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    body = await (await fetch(`${base}/api/spotlight`, { headers: as('alice') })).json();
    expect(body.published).toMatchObject({ slug: 'jordan-rivera', visibility: 'unlisted' });
    expect(body.published.snapshot.person.name).toBe('Jordan Rivera');
  });

  it('checks addresses: shape, reserved, taken by someone else, or yours', async () => {
    store.set('spotlights/bobs-page', { ownerUid: 'bob' });
    store.set('spotlights/alices-page', { ownerUid: 'alice' });
    const check = async (slug: string) => (await fetch(`${base}/api/spotlight/slug/${slug}`, { headers: as('alice') })).json();
    expect(await check('bobs-page')).toEqual({ ok: false, reason: 'taken' });
    expect(await check('alices-page')).toEqual({ ok: true, slug: 'alices-page' });
    expect(await check('ab')).toEqual({ ok: false, reason: 'too_short' });
    expect(await check('settings')).toEqual({ ok: false, reason: 'reserved' });
  });
});

describe('the public page', () => {
  it('serves a published page with noindex while unlisted', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    const res = await publicGet('jordan-rivera');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['snapshot']);
    expect(JSON.stringify(body)).not.toContain('alice');
  });

  it('lets a public page be indexed', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera', visibility: 'public' } });
    expect((await publicGet('jordan-rivera')).headers.get('x-robots-tag')).toBeNull();
  });

  it('gives missing, unpublished, switched-off and malformed addresses the same 404', async () => {
    const bodies: string[] = [];
    const expect404 = async (slug: string) => {
      const res = await publicGet(slug);
      expect(res.status).toBe(404);
      bodies.push(await res.text());
    };
    await expect404('nobody-here');
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    await fetch(`${base}/api/spotlight/publish`, { method: 'DELETE', headers: as('alice') });
    await expect404('jordan-rivera');
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    flags.killSwitches.spotlight = true;
    await expect404('jordan-rivera');
    flags.killSwitches.spotlight = false;
    await expect404('Jordan-Rivera');
    await expect404('jordan%20rivera');
    expect(new Set(bodies).size).toBe(1);
  });

  it('renders /s/:slug with its metadata and inline data, and a not-found page otherwise', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    const res = await fetch(`${base}/s/jordan-rivera`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<title>Jordan Rivera — Product leader who ships</title>');
    expect(html).toContain('<meta property="og:url" content="http://localhost:47293/s/jordan-rivera" />');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).toContain('<script id="spotlight-data" type="application/json">{"schemaVersion":1');
    expect(html).not.toContain('<!--spotlight-');

    const missing = await fetch(`${base}/s/nobody-here`);
    expect(missing.status).toBe(404);
    const missingHtml = await missing.text();
    expect(missingHtml).toContain('<title>Page not found</title>');
    expect(missingHtml).toContain('>null</script>');
  });
});

describe('renderSpotlightHtml', () => {
  it('escapes owner text in metadata and can’t be broken out of in the inline data', async () => {
    const hostile = '</script><script>alert(1)</script>"><img src=x onerror=alert(2)>';
    const page = {
      ownerUid: 'alice',
      slug: 'x-page',
      visibility: 'unlisted' as const,
      publishedAt: '',
      updatedAt: '',
      snapshot: { person: { name: hostile, headline: hostile, summary: hostile, targetRoles: [] } } as any,
    };
    const html = renderSpotlightHtml(TEMPLATE, page, 'https://example.com');
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(JSON.parse(scriptJson({ a: hostile }))).toEqual({ a: hostile });
  });
});

describe('ipRateLimit', () => {
  it('answers 429 once a client passes the limit', async () => {
    const app = express();
    app.get('/x', ipRateLimit(2), (_req, res) => res.send('ok'));
    const s = app.listen(0);
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/x`;
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await fetch(url)).status);
    s.close();
    expect(codes).toEqual([200, 200, 429]);
  });
});

describe('account deletion and export', () => {
  it('deletes every page the account owns and nobody else’s', async () => {
    store.set('spotlights/a1', { ownerUid: 'alice' });
    store.set('spotlights/a2', { ownerUid: 'alice' });
    store.set('spotlights/b1', { ownerUid: 'bob' });
    await deleteSpotlightsOwnedBy({} as any, 'alice');
    expect([...store.keys()].filter((k) => k.startsWith('spotlights/'))).toEqual(['spotlights/b1']);
  });

  it('exports settings and published pages', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera', headline: 'Hi' } });
    const out = await exportSpotlight({} as any, 'alice');
    expect(out.settings?.headline).toBe('Hi');
    expect(out.published.map((p) => p.slug)).toEqual(['jordan-rivera']);
  });
});

describe('link-preview image', () => {
  it('is rendered after publishing and advertised in the page metadata', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    const version = await imageReady('jordan-rivera');
    expect(version).toBe(store.get('spotlights/jordan-rivera').updatedAt);
    expect(store.get('users/alice/spotlight/ogImage')).toMatchObject({ contentType: 'image/jpeg', version, slug: 'jordan-rivera' });

    const html = await (await fetch(`${base}/s/jordan-rivera`, { headers: BROWSER })).text();
    expect(html).toContain(`<meta property="og:image" content="http://localhost:47293/s/jordan-rivera/og.jpg?v=${Date.parse(version!)}" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');

    const img = await fetch(`${base}/s/jordan-rivera/og.jpg`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await img.arrayBuffer()).toString()).toBe('JPEG-BYTES');
  });

  it('falls back to a plain card until the image exists', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    await imageReady('jordan-rivera');
    delete store.get('spotlights/jordan-rivera').imageVersion;
    const html = await (await fetch(`${base}/s/jordan-rivera`)).text();
    expect(html).not.toContain('og:image');
    expect(html).toContain('<meta name="twitter:card" content="summary" />');
    expect((await fetch(`${base}/s/jordan-rivera/og.jpg`)).status).toBe(404);
  });

  it('is not written for a publish that a newer one has replaced', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    await imageReady('jordan-rivera');
    const before = renders.image;
    await refreshSpotlightImage({} as any, 'alice', 'jordan-rivera', '1999-01-01T00:00:00.000Z', { renderOrigin: 'x', appUrl: 'http://localhost:47293' });
    expect(renders.image).toBe(before);
  });

  it('goes away with the page', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    await imageReady('jordan-rivera');
    await fetch(`${base}/api/spotlight/publish`, { method: 'DELETE', headers: as('alice') });
    expect(store.has('users/alice/spotlight/ogImage')).toBe(false);
    expect((await fetch(`${base}/s/jordan-rivera/og.jpg`)).status).toBe(404);
  });
});

describe('PDF download', () => {
  it('renders once per published version and downloads with a readable name', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    const first = await fetch(`${base}/s/jordan-rivera/pdf`);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('application/pdf');
    expect(first.headers.get('content-disposition')).toBe('attachment; filename="Jordan-Rivera-Spotlight.pdf"');
    expect(first.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    await fetch(`${base}/s/jordan-rivera/pdf`);
    expect(renders.pdf).toBe(1);
  });

  it('says so when the server can’t render, and 404s for a missing page', async () => {
    renders.failPdf = true;
    await publish('alice', { settings: { slug: 'jordan', headline: 'A version not yet rendered' } });
    expect((await fetch(`${base}/s/jordan/pdf`)).status).toBe(503);
    expect((await fetch(`${base}/s/nobody-here/pdf`)).status).toBe(404);
  });
});

describe('view counts', () => {
  it('counts people reading the page, not previews, scripts or the owner’s own check', async () => {
    await publish('alice', { settings: { slug: 'jordan-rivera' } });
    await fetch(`${base}/s/jordan-rivera`, { headers: BROWSER });
    await fetch(`${base}/s/jordan-rivera`, { headers: BROWSER });
    await fetch(`${base}/s/jordan-rivera`, { headers: { 'User-Agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' } });
    await fetch(`${base}/s/jordan-rivera`, { headers: { 'User-Agent': 'LinkedInBot/1.0' } });
    await fetch(`${base}/s/jordan-rivera`, { headers: { 'User-Agent': 'curl/8.4.0' } });
    await fetch(`${base}/s/jordan-rivera?from=editor`, { headers: BROWSER });
    await fetch(`${base}/s/nobody-here`, { headers: BROWSER });
    await new Promise((r) => setTimeout(r, 20));

    const stats = store.get('users/alice/spotlight/stats');
    expect(stats.total).toBe(2);
    expect(Object.values(stats.days)).toEqual([2]);
    expect(JSON.stringify(stats)).not.toMatch(/127\.0\.0\.1|Mozilla/);

    const body = await (await fetch(`${base}/api/spotlight`, { headers: as('alice') })).json();
    expect(body.views).toMatchObject({ total: 2, last7: 2, last30: 2 });
    expect(body.views.days).toHaveLength(30);
  });

  it('summarizes the last 7 and 30 days', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    const v = summarizeViews({ total: 50, days: { '2026-10-07': 3, '2026-10-01': 4, '2026-09-20': 5, '2026-08-01': 38 } }, now);
    expect(v).toMatchObject({ total: 50, last7: 7, last30: 12 });
    expect(v.days[0]).toEqual({ date: '2026-09-08', count: 0 });
    expect(v.days.at(-1)).toEqual({ date: '2026-10-07', count: 3 });
    expect(summarizeViews(null, now)).toMatchObject({ total: 0, last7: 0, last30: 0 });
  });
});
