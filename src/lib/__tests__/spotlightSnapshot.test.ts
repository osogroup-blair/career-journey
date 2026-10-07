import { describe, it, expect } from 'vitest';
import demo from '../demo/demoCareerJourney.json';
import {
  buildSpotlightSnapshot,
  diffSpotlightSnapshots,
  extractLeadMetric,
  normalizeSpotlightSettings,
  parseYearMonth,
  roleRange,
  suggestOutcomeEvidence,
  suggestSpotlightSlug,
  summarizeSpotlightChanges,
  validateSpotlightSlug,
} from '../spotlightSnapshot';

const NOW = new Date('2026-10-07T12:00:00Z');
const journey = (): any => structuredClone(demo);
const build = (cj: any = journey(), settings: unknown = {}) => buildSpotlightSnapshot(cj, settings, NOW);

/** Adds a private field to every object in the tree, so any spread or pass-through shows up in the output. */
function plantSentinels(node: any, path = 'root'): void {
  if (Array.isArray(node)) node.forEach((x, i) => plantSentinels(x, `${path}.${i}`));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) plantSentinels(v, `${path}.${k}`);
    node.private_note = `SENTINEL ${path}`;
  }
}

function sentinelJourney(): any {
  const cj = journey();
  plantSentinels(cj);
  cj.person.phone = 'SENTINEL_PHONE';
  cj.person.resume_preferences = { page_target: 1, note: 'SENTINEL resume prefs' };
  cj.meta.version_9_9_changes = ['SENTINEL changelog'];
  cj.roles[0].positioning_note = 'SENTINEL positioning note';
  cj.roles[0].resume_company_descriptor = 'SENTINEL resume descriptor';
  cj.roles[0].team_leadership = 'SENTINEL free-text team note';
  cj.roles[1].organization_scale = { note: 'SENTINEL org scale' };
  cj.roles[1].advisory_ps_scope = 'SENTINEL advisory scope';
  cj.education[0].resume_display = 'SENTINEL resume display';
  cj.interview_answers = { answers: [{ question: 'SENTINEL question', version_for_recruiter: 'SENTINEL answer' }] };
  cj.application_artifacts.artifacts[0].positioning = 'SENTINEL artifact';
  cj.vocabularies.maturity_levels.push('SENTINEL level');
  cj.links.keywords.push({ term: 'SENTINEL keyword', entity_id: 'ROLE-001', entity_type: 'role' });
  cj.links.timeline_mappings[0].context = 'SENTINEL mapping context';
  cj.customer_engagements.push({ id: 'CE-999', client: 'SENTINEL hidden client', display: false });
  cj.capabilities[0].functions[0].skills[0].description = 'SENTINEL skill description';
  return cj;
}

describe('extractLeadMetric', () => {
  it.each([
    ['Took a 0-to-1 product to $4M ARR in 18 months.', '$4M', ['$4M']],
    ['Cut onboarding time by 60% by redesigning the funnel.', '60%', ['60%']],
    ['Grew the team from 3 to 11 people.', '3 to 11', ['3', '11']],
    ['App rating rose 2.9 → 4.5.', '2.9 → 4.5', ['2.9', '4.5']],
    ['Raised £1.2 million in seed funding.', '£1.2 million', ['£1.2 million']],
    ['Throughput up 3x after the rewrite.', '3x', ['3x']],
    ['Led the migration from 2019 to 2021, then cut costs 15%.', '15%', ['15%']],
  ])('%s → %s', (text, value, parts) => {
    expect(extractLeadMetric(text)).toEqual({ value, parts });
  });

  it.each([
    'Ran 20+ checkout A/B tests over two years.',
    'Became the #2 revenue driver in 2023.',
    'Improved conversion by 9 percentage points.',
    'Known for pairing rigorous prioritization with execution.',
  ])('finds no figure in %s', (text) => {
    expect(extractLeadMetric(text)).toBeNull();
  });

  it('ignores non-strings', () => {
    expect(extractLeadMetric(undefined)).toBeNull();
    expect(extractLeadMetric(42)).toBeNull();
  });
});

describe('dates', () => {
  it('reads the formats real data uses', () => {
    expect(parseYearMonth('2022-03')).toEqual({ y: 2022, m: 3 });
    expect(parseYearMonth('2022-03-15')).toEqual({ y: 2022, m: 3 });
    expect(parseYearMonth('Mar 2022')).toEqual({ y: 2022, m: 3 });
    expect(parseYearMonth('September 2019')).toEqual({ y: 2019, m: 9 });
    expect(parseYearMonth('03/2022')).toEqual({ y: 2022, m: 3 });
    expect(parseYearMonth('2022')).toEqual({ y: 2022, m: null });
    expect(parseYearMonth('soon')).toBeNull();
  });

  it('treats Present as now and falls back to the legacy dates string', () => {
    expect(roleRange({ start_date: '2022-03', end_date: 'Present' }, NOW)).toEqual({ start: { y: 2022, m: 3 }, end: { y: 2026, m: 10 }, current: true });
    expect(roleRange({ dates: 'Jun 2018 – Feb 2022' }, NOW)).toEqual({ start: { y: 2018, m: 6 }, end: { y: 2022, m: 2 }, current: false });
    expect(roleRange({ dates: '2019 - Present' }, NOW).current).toBe(true);
  });

  it('computes inclusive durations and leaves unknown months as null', () => {
    const { snapshot } = build();
    const byId = Object.fromEntries(snapshot.roles.map((r) => [r.id, r]));
    expect(byId['ROLE-001']).toMatchObject({ start: '2022-03', end: undefined, current: true, durationMonths: 56 });
    expect(byId['ROLE-002']).toMatchObject({ start: '2018-06', end: '2022-02', current: false, durationMonths: 45 });

    const cj = journey();
    cj.roles[2].start_date = '2015';
    expect(build(cj).snapshot.roles.find((r) => r.id === 'ROLE-003')!.durationMonths).toBeNull();
  });
});

describe('buildSpotlightSnapshot on the demo journey', () => {
  const { snapshot, warnings } = build();

  it('fills the introduction from Profile', () => {
    expect(snapshot.person).toMatchObject({
      name: 'Jordan Rivera',
      headline: 'Product leader who ships',
      location: 'Denver, CO (Remote-friendly)',
      availability: 'open_to_select',
      targetRoles: [],
    });
    expect(snapshot.person.roleOrientation).toBeUndefined();
  });

  it('derives the glance facts from the visible roles', () => {
    expect(snapshot.glance).toEqual({
      careerStartYear: 2015,
      organizationCount: 3,
      current: { title: 'Senior Product Manager', organization: 'Meridian Cloudworks' },
      largestTeam: null,
      industries: ['B2B SaaS', 'Logistics', 'E-commerce / Retail'],
    });
  });

  it('orders roles newest first and highlights impacts with a figure', () => {
    expect(snapshot.roles.map((r) => r.id)).toEqual(['ROLE-001', 'ROLE-002', 'ROLE-003']);
    expect(snapshot.roles[0].highlightIds).toEqual(['DEL-001', 'DEL-002']);
    expect(snapshot.roles[0].initiatives[0].deliverables[0].lead).toEqual({ value: '$4M', parts: ['$4M'] });
  });

  it('uses the first three signature outcomes and suggests their evidence', () => {
    expect(snapshot.outcomes.map((o) => o.lead?.value)).toEqual(['$4M', '60%', '3 to 11']);
    expect(snapshot.outcomes[0].evidence).toEqual(
      expect.arrayContaining([{ type: 'deliverable', id: 'DEL-001' }, { type: 'achievement', id: 'ACH-001' }]),
    );
    expect(snapshot.outcomes[1].evidence[0]).toEqual({ type: 'deliverable', id: 'DEL-002' });
    expect(snapshot.outcomes[2].evidence[0]).toEqual({ type: 'achievement', id: 'ACH-002' });
  });

  it('shows a linked achievement once, on its deliverable', () => {
    const meridian = snapshot.roles[0];
    expect(meridian.initiatives[0].deliverables[0].achievementId).toBe('ACH-001');
    expect(meridian.achievementIds).toEqual(['ACH-002']);
    expect(snapshot.achievements.items.find((a) => a.id === 'ACH-001')!.deliverableId).toBe('DEL-001');
  });

  it('features achievements with a figure, most recent role first', () => {
    expect(snapshot.achievements.featuredIds).toEqual(['ACH-001', 'ACH-002', 'ACH-003']);
  });

  it('counts evidence for capabilities and skills from visible deliverables', () => {
    expect(snapshot.capabilities.find((c) => c.id === 'CAP-003')!.deliverableIds).toEqual(['DEL-002', 'DEL-004']);
    expect(snapshot.skills.find((s) => s.id === 'SK-006')).toMatchObject({ years: 7, lastUsed: '2026-07', deliverableIds: ['DEL-002', 'DEL-004'] });
    expect(snapshot.skills.every((s) => s.level === undefined)).toBe(true);
    expect(snapshot.capabilities.every((c) => c.level === undefined)).toBe(true);
  });

  it('flags a summary whose year count contradicts the role dates', () => {
    expect(warnings.map((w) => w.code)).toContain('summary_years_mismatch');
    expect(warnings.find((w) => w.code === 'summary_years_mismatch')!.message).toMatch(/9 years.*2015/);
  });
});

describe('privacy', () => {
  it('publishes no field outside the allowlist, with default settings', () => {
    const json = JSON.stringify(build(sentinelJourney()).snapshot);
    expect(json).not.toContain('SENTINEL');
  });

  it('publishes no field outside the allowlist with every opt-in turned on', () => {
    const settings = {
      showTargetRoles: true,
      showLevels: true,
      contact: { linkedin: true, website: true, github: true, email: true, phone: true },
    };
    const json = JSON.stringify(build(sentinelJourney(), settings).snapshot);
    expect(json).toContain('SENTINEL_PHONE'); // the one private value the owner asked to show
    expect(json.replaceAll('SENTINEL_PHONE', '')).not.toContain('SENTINEL');
  });

  it('keeps contact channels off until allowed, and never writes the email as one string', () => {
    expect(build().snapshot.contact).toEqual({ linkedin: 'linkedin.com/in/jordanrivera-demo' });

    const { snapshot } = build(journey(), { contact: { email: true, linkedin: false } });
    expect(snapshot.contact).toEqual({ email: { user: 'jordan.rivera', domain: 'example.com' } });
    expect(JSON.stringify(snapshot)).not.toContain('jordan.rivera@example.com');
  });

  it('only publishes client engagements marked for display', () => {
    const cj = journey();
    cj.customer_engagements.push({ id: 'CE-002', client: 'Confidential Bank', display: false });
    expect(build(cj).snapshot.engagements.map((e) => e.id)).toEqual(['CE-001']);
  });

  it('never publishes outcome text that is not in the Career Journey', () => {
    const { snapshot, warnings } = build(journey(), { outcomes: [{ text: 'Invented claim: 900% growth' }] });
    expect(snapshot.outcomes).toEqual([]);
    expect(warnings.map((w) => w.code)).toContain('outcome_missing');
  });

  it('omits the data of switched-off sections, not just the flag', () => {
    const { snapshot } = build(journey(), { sections: { capabilities: false, skills: false, howIWork: false, background: false } });
    expect(snapshot.capabilities).toEqual([]);
    expect(snapshot.skills).toEqual([]);
    expect(snapshot.methodologies).toEqual([]);
    expect(snapshot.principles).toEqual([]);
    expect(snapshot.education).toEqual([]);
    expect(snapshot.certifications).toEqual([]);
    expect(snapshot.engagements).toEqual([]);
  });
});

describe('hidden roles', () => {
  it('leave no trace anywhere in the snapshot', () => {
    const { snapshot } = build(journey(), { roles: { 'ROLE-002': 'excluded' } });
    const json = JSON.stringify(snapshot);
    for (const leak of ['ROLE-002', 'Fernbank', 'INIT-002', 'DEL-003', 'ACH-003', 'Logistics']) expect(json).not.toContain(leak);
    expect(snapshot.skills.find((s) => s.id === 'SK-003')!.deliverableIds).toEqual([]);
    expect(snapshot.glance.organizationCount).toBe(2);
  });

  it('move the career start year when the earliest role is hidden', () => {
    expect(build(journey(), { roles: { 'ROLE-003': 'excluded' } }).snapshot.glance.careerStartYear).toBe(2018);
  });

  it('drop pinned achievements and chosen evidence that belong to them, with warnings', () => {
    const settings = {
      roles: { 'ROLE-002': 'excluded' },
      pinnedAchievements: ['ACH-003', 'ACH-001', 'ACH-404'],
      outcomes: [{ text: demo.person.signature_outcomes[0], evidence: ['DEL-001', 'DEL-003'] }],
    };
    const { snapshot, warnings } = build(journey(), settings);
    expect(snapshot.achievements.featuredIds).toEqual(['ACH-001']);
    expect(snapshot.outcomes[0].evidence).toEqual([{ type: 'deliverable', id: 'DEL-001' }]);
    expect(warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['pinned_achievement_hidden', 'pinned_achievement_missing', 'outcome_evidence_missing']),
    );
  });

  it('keep achievements with no role link eligible', () => {
    const cj = journey();
    cj.achievements.push({ id: 'ACH-050', title: 'Spoke at ProductCon 2025', description: 'Talk on pricing migrations.' });
    const { snapshot } = build(cj, { roles: { 'ROLE-001': 'excluded', 'ROLE-002': 'excluded' } });
    expect(snapshot.achievements.items.map((a) => a.id)).toEqual(['ACH-050']);
  });
});

describe('role modes', () => {
  it('start from the résumé default and accept overrides', () => {
    const cj = journey();
    cj.roles[2].resume_default = 'condensed';
    cj.roles[1].resume_default = 'excluded';
    expect(build(cj).snapshot.roles.map((r) => [r.id, r.mode])).toEqual([['ROLE-001', 'full'], ['ROLE-003', 'condensed']]);
    expect(build(cj, { roles: { 'ROLE-002': 'full' } }).snapshot.roles.map((r) => r.id)).toEqual(['ROLE-001', 'ROLE-002', 'ROLE-003']);
  });

  it('warn when every role is hidden', () => {
    const { warnings } = build(journey(), { roles: { 'ROLE-001': 'excluded', 'ROLE-002': 'excluded', 'ROLE-003': 'excluded' } });
    expect(warnings.map((w) => w.code)).toContain('no_visible_roles');
  });

  it('turn structured team data into scope chips but ignore free text', () => {
    const cj = journey();
    cj.roles[0].team_leadership = { team_name: 'Analytics', starting_size: 3, peak_size: '11' };
    cj.roles[1].team_leadership = 'Managed a squad of contractors';
    const { snapshot } = build(cj);
    expect(snapshot.roles[0].scope).toEqual(['Grew team from 3 to 11']);
    expect(snapshot.roles[1].scope).toEqual([]);
    expect(snapshot.glance.largestTeam).toBe(11);
  });
});

describe('settings', () => {
  it('fall back to defaults on garbage input', () => {
    const s = normalizeSpotlightSettings({ visibility: 'everyone', accent: '#ff00ff', sections: 'all', roles: { 'ROLE-001': 'sideways', 'ROLE-404': 'full', 'ROLE-002': 'condensed' } }, journey());
    expect(s.visibility).toBe('unlisted');
    expect(s.accent).toBe('navy');
    expect(s.sections.skills).toBe(true);
    expect(s.roles).toEqual({ 'ROLE-002': 'condensed' });
    expect(normalizeSpotlightSettings('nonsense', journey()).availability).toBe('open_to_select');
  });

  it('cap lists and trim free text', () => {
    const s = normalizeSpotlightSettings(
      {
        headline: `  ${'x'.repeat(300)}  `,
        outcomes: [1, 2, 3, 4].map((n) => ({ text: `Outcome ${n}`, caption: 'c'.repeat(80) })),
        pinnedAchievements: ['A', 'A', 'B', 'C', 'D', 'E', 'F', 'G'],
      },
      journey(),
    );
    expect(s.headline).toHaveLength(160);
    expect(s.outcomes).toHaveLength(3);
    expect(s.outcomes![0].caption).toHaveLength(40);
    expect(s.pinnedAchievements).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('let the owner choose no outcomes or no featured achievements', () => {
    const { snapshot } = build(journey(), { outcomes: [], pinnedAchievements: [] });
    expect(snapshot.outcomes).toEqual([]);
    expect(snapshot.achievements.featuredIds).toEqual([]);
    expect(snapshot.achievements.items).toHaveLength(3);
  });

  it('apply the headline override and show target roles only on request', () => {
    const { snapshot } = build(journey(), { headline: 'Builds products people pay for.', showTargetRoles: true, availability: 'hidden' });
    expect(snapshot.person.headline).toBe('Builds products people pay for.');
    expect(snapshot.person.targetRoles).toEqual(['Senior Product Manager', 'Group Product Manager', 'Director of Product']);
    expect(snapshot.person.availability).toBeNull();
  });
});

describe('suggestOutcomeEvidence', () => {
  it('matches on a shared figure or most of the words, and ignores unrelated work', () => {
    const candidates = [
      { ref: { type: 'deliverable' as const, id: 'A' }, text: 'Shipped a billing system. Revenue up 40%.' },
      { ref: { type: 'deliverable' as const, id: 'B' }, text: 'Redesigned the onboarding funnel for activation.' },
      { ref: { type: 'deliverable' as const, id: 'C' }, text: 'Hired two designers.' },
    ];
    expect(suggestOutcomeEvidence('Grew revenue 40% with new billing', candidates)).toEqual([{ type: 'deliverable', id: 'A' }]);
    expect(suggestOutcomeEvidence('Redesigning onboarding lifted activation', candidates)).toEqual([{ type: 'deliverable', id: 'B' }]);
    expect(suggestOutcomeEvidence('Won an industry award', candidates)).toEqual([]);
  });
});

describe('slugs', () => {
  it('validate shape and reserved words', () => {
    expect(validateSpotlightSlug('Jordan-Rivera')).toEqual({ ok: true, slug: 'jordan-rivera' });
    expect(validateSpotlightSlug('jo')).toEqual({ ok: false, reason: 'too_short' });
    expect(validateSpotlightSlug('a'.repeat(41))).toEqual({ ok: false, reason: 'too_long' });
    expect(validateSpotlightSlug('jordan--rivera')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(validateSpotlightSlug('jordan_rivera')).toEqual({ ok: false, reason: 'invalid_characters' });
    expect(validateSpotlightSlug('admin')).toEqual({ ok: false, reason: 'reserved' });
    expect(validateSpotlightSlug(null)).toEqual({ ok: false, reason: 'too_short' });
  });

  it('suggest one from a name', () => {
    expect(suggestSpotlightSlug('Jordan Rivera')).toBe('jordan-rivera');
    expect(suggestSpotlightSlug('  Zoë O’Brien-Núñez ')).toBe('zoe-o-brien-nunez');
  });
});

describe('diffSpotlightSnapshots', () => {
  it('reports nothing when only the build time differs', () => {
    const a = build().snapshot;
    const b = buildSpotlightSnapshot(journey(), {}, new Date('2026-10-07T18:00:00Z')).snapshot;
    expect(diffSpotlightSnapshots(a, b)).toEqual([]);
    expect(summarizeSpotlightChanges([])).toBe('');
  });

  it('names what changed and where', () => {
    const published = build().snapshot;
    const cj = journey();
    cj.roles[0].initiatives[0].deliverables.push({
      id: 'DEL-009', description: 'Launched usage-based pricing.', impact: 'Expansion revenue up 22%.', capability_alignment: [], skill_ids: [],
    });
    cj.achievements[1].description = 'Built the team from 3 to 11 across PM, design and engineering.';
    cj.roles[2].resume_default = 'excluded';
    const changes = diffSpotlightSnapshots(published, build(cj).snapshot);

    expect(changes).toEqual(
      expect.arrayContaining([
        { kind: 'added', entity: 'deliverable', id: 'DEL-009', label: 'Launched usage-based pricing.', where: 'Senior Product Manager at Meridian Cloudworks' },
        { kind: 'edited', entity: 'achievement', id: 'ACH-002', label: 'Grew product team from 3 to 11' },
        { kind: 'removed', entity: 'role', id: 'ROLE-003', label: 'Associate Product Manager at Hollowell Retail Group' },
      ]),
    );
    const summary = summarizeSpotlightChanges(changes);
    expect(summary).toContain('1 new deliverable in Senior Product Manager at Meridian Cloudworks');
    expect(summary).toContain('1 edited achievement');
    expect(summary).toContain('1 removed role');
  });
});
