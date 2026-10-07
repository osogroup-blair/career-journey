import { describe, it, expect } from 'vitest';
import {
  buildResumeConstraintsBlock,
  computeBulletBudget,
  condensedRoleDates,
  defaultBuildOptions,
  enforceResumeConstraints,
  formatResumeDate,
  formatRoleDates,
  keywordsAtRisk,
  normalizeResumeBuildOptions,
  projectCareerJourneyForResume,
  resolveExperienceRoleId,
  rolesRecentFirst,
  trimBullets,
} from '../../src/lib/resumeBuild';
import { formatPhone } from '../../src/lib/utils';
import { addBullet, condenseRole, moveBullet, removeBullet, replaceRoleEntry, restoreEarlier, updateBullet } from '../../src/lib/resumeEdits';
import type { GeneratedResume, KeywordSignal, ResumeBuildOptions } from '../../src/types';

const NOW = new Date('2026-09-30T00:00:00Z');

function careerJourney(): any {
  return {
    person: { name: 'Pat Doe', resume_preferences: { page_target: 2 } },
    roles: [
      // Deliberately out of order — recency must come from dates, not array position.
      { id: 'ROLE-003', organization: 'Hollowell Retail', title: 'Associate PM', start_date: '2015-07', end_date: '2018-05', initiatives: [] },
      { id: 'ROLE-001', organization: 'Meridian Cloudworks', title: 'Senior PM', start_date: '2022-03', end_date: 'Present', initiatives: [{ id: 'INIT-1', deliverables: [{ id: 'DEL-1', description: 'Analytics launch' }] }] },
      { id: 'ROLE-002', organization: 'Fernbank Logistics', title: 'PM', start_date: '2018-06', end_date: '2022-02', initiatives: [{ id: 'INIT-2', deliverables: [{ id: 'DEL-2', description: 'Routing rebuild' }] }] },
      { id: 'ROLE-000', organization: 'Old Co', title: 'Analyst', start_date: '2005-01', end_date: '2009-12', initiatives: [] },
    ],
    achievements: [
      { id: 'ACH-1', role_ids: ['ROLE-001'] },
      { id: 'ACH-2', role_ids: ['ROLE-002'] },
      { id: 'ACH-3' }, // unlinked
      { id: 'ACH-4' }, // linked only via timeline_mappings
    ],
    links: { timeline_mappings: [{ entity_type: 'achievement', entity_id: 'ACH-4', role_id: 'ROLE-002' }] },
  };
}

const bullets = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `b${i + 1}` }));

function resume(experience: GeneratedResume['experience']): GeneratedResume {
  return { name: 'Pat', contactInfo: '', summary: 's', skills: [], experience, education: [] };
}

describe('roles and defaults', () => {
  it('orders roles most recent first regardless of array order', () => {
    expect(rolesRecentFirst(careerJourney()).map((r) => r.id)).toEqual(['ROLE-001', 'ROLE-002', 'ROLE-003', 'ROLE-000']);
  });

  it('condenses roles that ended more than 10 years ago when no preference is saved', () => {
    const cj = careerJourney();
    cj.person.resume_preferences = {};
    cj.roles.push({ id: 'ROLE-OLD', organization: 'Stark', title: 'Dev', start_date: '2012-01', end_date: '2014-12', initiatives: [] });
    const opts = defaultBuildOptions(cj, NOW);
    expect(opts.pageTarget).toBe(2);
    expect(opts.roles['ROLE-000'].mode).toBe('condensed');
    expect(opts.roles['ROLE-OLD'].mode).toBe('condensed'); // ended 12 years ago
    expect(opts.roles['ROLE-003'].mode).toBe('full'); // ended 8 years ago
  });

  it('prefers a role resume_default, then the condense-before-year preference', () => {
    const cj = careerJourney();
    cj.person.resume_preferences = { page_target: 1, condense_roles_ended_before: '2019' };
    cj.roles.find((r: any) => r.id === 'ROLE-002').resume_default = 'excluded';
    cj.roles.find((r: any) => r.id === 'ROLE-000').resume_default = 'bogus';
    const opts = defaultBuildOptions(cj, NOW);
    expect(opts.pageTarget).toBe(1);
    expect(opts.roles['ROLE-002'].mode).toBe('excluded');
    expect(opts.roles['ROLE-003'].mode).toBe('condensed'); // ended 2018 < 2019
    expect(opts.roles['ROLE-000'].mode).toBe('condensed'); // invalid default ignored, falls to the year rule
    expect(opts.roles['ROLE-001'].mode).toBe('full');
  });

  it('formats condensed dates year-only', () => {
    expect(condensedRoleDates({ start_date: '2015-07', end_date: '2018-05' })).toBe('2015 – 2018');
    expect(condensedRoleDates({ start_date: '2022-03', end_date: 'Present' })).toBe('2022 – Present');
    expect(condensedRoleDates({ dates: 'Jun 2018 – Feb 2022' })).toBe('2018 – 2022');
  });
});

describe('normalizeResumeBuildOptions', () => {
  it('drops unknown role ids, fixes bad modes and clamps bullet overrides', () => {
    const opts = normalizeResumeBuildOptions(
      { pageTarget: 7, roles: { 'ROLE-001': { mode: 'full', maxBullets: 99 }, 'ROLE-002': { mode: 'nonsense', maxBullets: -3 }, 'ROLE-FAKE': { mode: 'excluded' } }, guidance: '  lead with X  ' },
      careerJourney()
    );
    expect(opts.pageTarget).toBe(2);
    expect(opts.roles['ROLE-001']).toEqual({ mode: 'full', maxBullets: 8 });
    expect(opts.roles['ROLE-002']).toEqual({ mode: 'full', maxBullets: 0 });
    expect(opts.roles['ROLE-FAKE']).toBeUndefined();
    expect(opts.guidance).toBe('lead with X');
  });

  it('falls back to the candidate defaults when the body has no options', () => {
    expect(normalizeResumeBuildOptions(undefined, careerJourney()).roles['ROLE-001'].mode).toBe('full');
  });
});

describe('computeBulletBudget', () => {
  const all = (pageTarget: 1 | 2): ResumeBuildOptions => ({ pageTarget, roles: {} });

  it('tapers from the most recent role for 2 pages', () => {
    expect(computeBulletBudget(all(2), careerJourney())).toEqual({ 'ROLE-001': 6, 'ROLE-002': 5, 'ROLE-003': 4, 'ROLE-000': 4 });
  });

  it('is tighter for 1 page and skips non-full roles', () => {
    const opts: ResumeBuildOptions = { pageTarget: 1, roles: { 'ROLE-002': { mode: 'excluded' }, 'ROLE-000': { mode: 'condensed' } } };
    expect(computeBulletBudget(opts, careerJourney())).toEqual({ 'ROLE-001': 5, 'ROLE-003': 4 });
  });

  it('gives the top rungs to the roles that evidence the most JD keywords', () => {
    const kw = (phrase: string, refs: any[], critical = false, status = 'EVIDENCED'): KeywordSignal =>
      ({ id: phrase, phrase, category: 'Critical skill', jdImportance: 'High', evidenceStatus: status, evidenceRefs: refs, jdRefs: [], whatCouldCount: '', recognitionPrompt: '', resumePriority: '', isTopCritical: critical }) as KeywordSignal;
    const keywords = [
      kw('Routing', [{ type: 'deliverable', id: 'DEL-2' }], true),
      kw('Ops', [{ type: 'achievement', id: 'ACH-4' }]),
      kw('Analytics', [{ type: 'deliverable', id: 'DEL-1' }]),
      kw('Unsupported', [{ type: 'role', id: 'ROLE-003' }, { type: 'role', id: 'ROLE-000' }], true, 'NOT SUPPORTED'),
    ];
    // ROLE-002 scores 3, ROLE-001 scores 1; the rest tie at 0 and keep recency order.
    expect(computeBulletBudget(all(2), careerJourney(), keywords)).toEqual({ 'ROLE-002': 6, 'ROLE-001': 5, 'ROLE-003': 4, 'ROLE-000': 4 });
    expect(computeBulletBudget(all(2), careerJourney(), [])).toEqual(computeBulletBudget(all(2), careerJourney()));
  });

  it('honors a per-role override', () => {
    const opts: ResumeBuildOptions = { pageTarget: 2, roles: { 'ROLE-001': { mode: 'full', maxBullets: 2 } } };
    expect(computeBulletBudget(opts, careerJourney())['ROLE-001']).toBe(2);
  });
});

describe('projectCareerJourneyForResume', () => {
  it('removes non-full roles, their deliverables and achievements tied only to them', () => {
    const cj = careerJourney();
    const opts: ResumeBuildOptions = { pageTarget: 2, roles: { 'ROLE-002': { mode: 'excluded' }, 'ROLE-000': { mode: 'condensed' } } };
    const projected = projectCareerJourneyForResume(cj, opts);
    expect(projected.roles.map((r: any) => r.id).sort()).toEqual(['ROLE-001', 'ROLE-003']);
    expect(JSON.stringify(projected)).not.toContain('DEL-2');
    expect(projected.achievements.map((a: any) => a.id)).toEqual(['ACH-1', 'ACH-3']);
    expect(projected.links).toBeUndefined();
    expect(projected.person.resume_preferences).toBeUndefined();
    // The input is untouched.
    expect(cj.roles).toHaveLength(4);
    expect(cj.person.resume_preferences).toBeDefined();
  });
});

describe('projectCareerJourneyForResume noise stripping', () => {
  it('folds timeline-linked roles into achievements, then drops the links graph and meta changelogs', () => {
    const cj = careerJourney();
    cj.meta = { version: '3.54', owner: 'Pat', version_3_2_changes: ['x'], version_3_54_changes: ['y'] };
    cj.links.keywords = [{ term: 'SQL', entity_id: 'ROLE-001' }];
    cj.links.deliverable_achievement = [{ achievement_id: 'ACH-1', deliverable_id: 'DEL-1' }];
    const projected = projectCareerJourneyForResume(cj, { pageTarget: 2, roles: {} });
    expect(projected.meta).toEqual({ version: '3.54', owner: 'Pat' });
    expect(projected.links).toEqual({ deliverable_achievement: [{ achievement_id: 'ACH-1', deliverable_id: 'DEL-1' }] });
    expect(projected.achievements.find((a: any) => a.id === 'ACH-4').role_ids).toEqual(['ROLE-002']);
    expect(projected.achievements.find((a: any) => a.id === 'ACH-3').role_ids).toBeUndefined();
    expect(cj.links.timeline_mappings).toHaveLength(1); // input untouched
  });
});

describe('dates, contact line and trimming', () => {
  it('formats Career Journey dates as full month-year', () => {
    expect(formatResumeDate('2026-03')).toBe('March 2026');
    expect(formatResumeDate('2015-07-14')).toBe('July 2015');
    expect(formatResumeDate('2015')).toBe('2015');
    expect(formatResumeDate('Present')).toBe('Present');
    expect(formatResumeDate('2015-13')).toBeNull();
    expect(formatResumeDate('Spring 2015')).toBeNull();
    expect(formatRoleDates({ start_date: '2022-02', end_date: '2026-03' })).toBe('February 2022 – March 2026');
    expect(formatRoleDates({ start_date: '2026-03', end_date: 'Present' })).toBe('March 2026 – Present');
    expect(formatRoleDates({ dates: 'Jun 2018 – Feb 2022' })).toBeNull();
  });

  it('formats bare 10-digit US phone numbers and leaves others alone', () => {
    expect(formatPhone('6165401669')).toBe('616.540.1669');
    expect(formatPhone('+1 (616) 540-1669')).toBe('616.540.1669');
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(formatPhone('555-0100 ext 2')).toBe('555-0100 ext 2');
  });

  it('drops uncited bullets before cited ones when trimming', () => {
    const b = [
      { text: 'a', evidenceRefs: [{ type: 'achievement' as const, id: 'ACH-1' }] },
      { text: 'filler 1' },
      { text: 'c', evidenceRefs: [{ type: 'achievement' as const, id: 'ACH-2' }] },
      { text: 'filler 2' },
    ];
    expect(trimBullets(b, 3).map((x) => x.text)).toEqual(['a', 'filler 1', 'c']);
    expect(trimBullets(b, 2).map((x) => x.text)).toEqual(['a', 'c']);
    expect(trimBullets(b, 1).map((x) => x.text)).toEqual(['a']);
    expect(trimBullets(b, 9)).toHaveLength(4);
  });

  it('rewrites dates, name and contact line from the Career Journey', () => {
    const cj = careerJourney();
    Object.assign(cj.person, { location: 'Telluride, CO', phone: '6165401669', email: 'pat@example.com' });
    const generated = {
      ...resume([{ roleId: 'ROLE-001', company: 'Meridian Cloudworks', title: 'Senior PM', dates: '2022-03 - Present', location: '', bullets: bullets(1) }]),
      contactInfo: 'whatever the model wrote',
      education: [{ institution: 'MSOE', degree: 'BS', graduationDate: '2010-05' }, { institution: 'X', degree: 'Y', graduationDate: '2005 - 2010' }],
    };
    const { resume: out } = enforceResumeConstraints(generated, { pageTarget: 2, roles: {} }, cj);
    expect(out.name).toBe('Pat Doe');
    expect(out.contactInfo).toBe('Telluride, CO  •  616.540.1669  •  pat@example.com');
    expect(out.experience[0].dates).toBe('March 2022 – Present');
    expect(out.education.map((e) => e.graduationDate)).toEqual(['May 2010', '2005 - 2010']);
  });
});

describe('enforceResumeConstraints', () => {
  const opts: ResumeBuildOptions = { pageTarget: 1, roles: { 'ROLE-002': { mode: 'excluded' }, 'ROLE-000': { mode: 'condensed' } } };

  it('strips excluded and condensed roles even when the model returns them, and caps bullets', () => {
    const generated = resume([
      { roleId: 'ROLE-003', company: 'Hollowell Retail', title: 'APM', dates: '', location: '', bullets: bullets(9) },
      { roleId: 'ROLE-002', company: 'Fernbank Logistics', title: 'PM', dates: '', location: '', bullets: bullets(3) },
      { company: 'Old Co', title: 'Analyst', dates: '', location: '', bullets: bullets(2) }, // no roleId: matched by company
      { roleId: 'ROLE-001', company: 'Meridian Cloudworks', title: 'Senior PM', dates: '', location: '', bullets: bullets(7) },
      { roleId: 'ROLE-001', company: 'Meridian Cloudworks', title: 'dup', dates: '', location: '', bullets: bullets(1) },
    ]);
    const { resume: out, warnings } = enforceResumeConstraints(generated, opts, careerJourney());
    expect(out.experience.map((e) => e.roleId)).toEqual(['ROLE-001', 'ROLE-003']); // recency order
    expect(out.experience[0].bullets).toHaveLength(5);
    expect(out.experience[1].bullets.map((b) => b.text)).toEqual(['b1', 'b2', 'b3', 'b4']); // trimmed from the end
    expect(out.earlierExperience).toEqual([{ roleId: 'ROLE-000', company: 'Old Co', title: 'Analyst', dates: '2005 – 2009' }]);
    expect(warnings.some((w) => w.includes('Fernbank'))).toBe(true);
    expect(warnings.some((w) => w.includes('duplicate'))).toBe(true);
  });

  it('keeps an entry it cannot match to any role, with a warning', () => {
    const { resume: out, warnings } = enforceResumeConstraints(
      resume([{ company: 'Mystery Inc', title: 'X', dates: '', location: '', bullets: bullets(1) }]),
      opts,
      careerJourney()
    );
    expect(out.experience).toHaveLength(1);
    expect(warnings[0]).toContain('Mystery Inc');
  });

  it('matches legacy entries by company name', () => {
    expect(resolveExperienceRoleId({ company: 'Fernbank Logistics, Inc.' }, careerJourney())).toBe('ROLE-002');
    expect(resolveExperienceRoleId({ roleId: 'ROLE-FAKE', company: 'Meridian Cloudworks' }, careerJourney())).toBe('ROLE-001');
  });
});

describe('buildResumeConstraintsBlock', () => {
  it('lists only full roles with budgets and names condensed ones separately', () => {
    const opts: ResumeBuildOptions = { pageTarget: 2, roles: { 'ROLE-002': { mode: 'excluded' }, 'ROLE-000': { mode: 'condensed' } }, guidance: 'Lead with analytics' };
    const block = buildResumeConstraintsBlock(opts, careerJourney(), 'resume');
    expect(block).toContain('roleId ROLE-001');
    expect(block).toContain('at most 6 bullets');
    expect(block).not.toContain('Fernbank');
    expect(block).toContain('Analyst, Old Co');
    expect(block).toContain('Lead with analytics');
    expect(block).toContain('ceilings, not targets');
    expect(block).toContain('at most 110 words');
    expect(block).toContain('implied first person');
    expect(buildResumeConstraintsBlock(opts, careerJourney(), 'strategy')).not.toContain('ceilings, not targets');
  });
});

describe('keywordsAtRisk', () => {
  const kw = (phrase: string, refs: any[], critical = false): KeywordSignal =>
    ({ id: phrase, phrase, category: 'Critical skill', jdImportance: 'High', evidenceStatus: 'EVIDENCED', evidenceRefs: refs, jdRefs: [], whatCouldCount: '', recognitionPrompt: '', resumePriority: '', isTopCritical: critical }) as KeywordSignal;

  it('flags keywords whose only evidence is in the dropped role', () => {
    const keywords = [
      kw('Routing', [{ type: 'deliverable', id: 'DEL-2' }], true),
      kw('Analytics', [{ type: 'deliverable', id: 'DEL-1' }, { type: 'achievement', id: 'ACH-2' }]),
      kw('SQL', [{ type: 'achievement', id: 'ACH-2' }, { type: 'skill', id: 'SK-1' }]),
    ];
    const opts: ResumeBuildOptions = { pageTarget: 2, roles: { 'ROLE-002': { mode: 'excluded' } } };
    expect(keywordsAtRisk(keywords, careerJourney(), opts, 'ROLE-002')).toEqual([{ phrase: 'Routing', critical: true }]);
  });
});

describe('resumeEdits', () => {
  const base = () =>
    resume([
      { roleId: 'ROLE-001', company: 'Meridian Cloudworks', title: 'Senior PM', dates: '', location: '', bullets: bullets(3) },
      { roleId: 'ROLE-003', company: 'Hollowell Retail', title: 'APM', dates: '', location: '', bullets: bullets(2) },
    ]);

  it('never mutates the resume it is given', () => {
    const original = base();
    const snapshot = JSON.stringify(original);
    updateBullet(original, 0, 0, 'changed');
    removeBullet(original, 0, 1);
    moveBullet(original, 0, 0, 1);
    addBullet(original, 1);
    condenseRole(original, 1, careerJourney());
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('moves, removes and edits bullets', () => {
    expect(moveBullet(base(), 0, 0, 1).experience[0].bullets.map((b) => b.text)).toEqual(['b2', 'b1', 'b3']);
    expect(moveBullet(base(), 0, 0, -1).experience[0].bullets.map((b) => b.text)).toEqual(['b1', 'b2', 'b3']);
    expect(removeBullet(base(), 0, 1).experience[0].bullets.map((b) => b.text)).toEqual(['b1', 'b3']);
    expect(updateBullet(base(), 1, 0, 'new').experience[1].bullets[0].text).toBe('new');
  });

  it('condenses a role and restores it unchanged', () => {
    const condensed = condenseRole(base(), 1, careerJourney());
    expect(condensed.experience.map((e) => e.roleId)).toEqual(['ROLE-001']);
    expect(condensed.earlierExperience?.[0]).toMatchObject({ roleId: 'ROLE-003', title: 'Associate PM', dates: '2015 – 2018' });
    const restored = restoreEarlier(condensed, 0, careerJourney());
    expect(restored.experience).toEqual(base().experience);
    expect(restored.earlierExperience).toEqual([]);
  });

  it('replaceRoleEntry inserts a previously condensed role by recency', () => {
    const start = { ...resume([{ roleId: 'ROLE-001', company: 'Meridian Cloudworks', title: 'x', dates: '', location: '', bullets: [] }]), earlierExperience: [{ roleId: 'ROLE-002', company: 'Fernbank', title: 'PM', dates: '2018 – 2022' }] };
    const next = replaceRoleEntry(start, 'ROLE-002', { company: 'Fernbank Logistics', title: 'PM', dates: '', location: '', bullets: bullets(2) }, careerJourney());
    expect(next.experience.map((e) => e.roleId)).toEqual(['ROLE-001', 'ROLE-002']);
    expect(next.earlierExperience).toEqual([]);
  });
});
