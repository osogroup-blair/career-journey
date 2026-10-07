import { describe, it, expect } from 'vitest';
import {
  buildResumeConstraintsBlock, computeBulletBudget, defaultBuildOptions, enforceResumeConstraints, normalizeResumeBuildOptions,
  parseOutcome, resumeFormat, resumeUnits, sanitizeResumeFormat, unitDates, DEFAULT_RESUME_FORMAT,
} from '../../src/lib/resumeBuild';
import { moveOutcome, removeOutcome, updateBulletLead, updateNarrative, updateOutcome } from '../../src/lib/resumeEdits';
import { resumeToPlainText } from '../../src/lib/resumeScore';
import type { GeneratedResume, KeywordSignal, ResumeBuildOptions } from '../../src/types';

const NOW = new Date('2026-10-07T00:00:00Z');

function careerJourney(): any {
  return {
    person: { name: 'Pat Doe', email: 'pat@example.com', resume_preferences: { page_target: 2 } },
    roles: [
      { id: 'OSO', organization: 'Oso Group', title: 'Founder', start_date: '2026-03', end_date: 'Present' },
      { id: 'IT', organization: 'Nymbl', title: 'IT Manager', start_date: '2024-01', end_date: '2026-03' },
      { id: 'CSO', organization: 'Nymbl', title: 'Chief Strategy Officer', start_date: '2022-02', end_date: '2026-03' },
      { id: 'SA', organization: 'Nymbl, Inc.', title: 'Solution Architect', start_date: '2022-01', end_date: '2024-12' },
      { id: 'GLOO', organization: 'Gloo', title: 'Enterprise Architect', start_date: '2017-01', end_date: '2020-08' },
    ],
    achievements: [{ id: 'ACH-1', role_ids: ['CSO'] }, { id: 'ACH-2', role_ids: ['CSO'] }],
  };
}

const kw = (phrase: string, refs: any[], critical = false): KeywordSignal =>
  ({ id: phrase, phrase, category: 'Critical skill', jdImportance: 'High', evidenceStatus: 'EVIDENCED', evidenceRefs: refs, jdRefs: [], whatCouldCount: '', recognitionPrompt: '', resumePriority: '', isTopCritical: critical }) as KeywordSignal;
const keywords = [kw('POCs', [{ type: 'achievement', id: 'ACH-1' }], true), kw('Demos', [{ type: 'achievement', id: 'ACH-2' }])];

const opts = (format: ResumeBuildOptions['format'] = {}, roles: ResumeBuildOptions['roles'] = { IT: { mode: 'excluded' }, GLOO: { mode: 'condensed' } }): ResumeBuildOptions =>
  ({ pageTarget: 2, roles, format });

function resume(experience: GeneratedResume['experience'], extra: Partial<GeneratedResume> = {}): GeneratedResume {
  return { name: 'x', contactInfo: '', summary: 's', skills: [], experience, education: [], ...extra };
}
const entry = (roleId: string, company: string, title: string, bullets: any[], extra: any = {}) => ({ roleId, company, title, dates: '', location: 'Remote', bullets, ...extra });
const cited = (text: string, lead?: string) => ({ text, ...(lead !== undefined ? { lead } : {}), evidenceRefs: [{ type: 'achievement' as const, id: 'ACH-1' }] });

describe('format options', () => {
  it('defaults combine on and everything else off', () => {
    expect(resumeFormat(undefined)).toEqual(DEFAULT_RESUME_FORMAT);
    expect(DEFAULT_RESUME_FORMAT).toMatchObject({ combineEmployerRoles: true, selectedOutcomes: false, roleNarratives: false, boldLeads: false, skillsPosition: 'top' });
  });

  it('keeps only valid fields', () => {
    expect(sanitizeResumeFormat({ boldLeads: true, roleNarratives: 'yes', skillsPosition: 'middle', junk: 1 })).toEqual({ boldLeads: true });
    expect(sanitizeResumeFormat(null)).toEqual({});
  });

  it('starts from the saved preference and lets a request override it', () => {
    const cj = careerJourney();
    cj.person.resume_preferences.format = { selectedOutcomes: true, skillsPosition: 'bottom' };
    expect(defaultBuildOptions(cj, NOW).format).toEqual({ selectedOutcomes: true, skillsPosition: 'bottom' });
    expect(normalizeResumeBuildOptions({ pageTarget: 2, roles: {} }, cj).format).toEqual({ selectedOutcomes: true, skillsPosition: 'bottom' });
    expect(normalizeResumeBuildOptions({ pageTarget: 2, roles: {}, format: { boldLeads: true } }, cj).format).toEqual({ boldLeads: true });
  });
});

describe('employer units', () => {
  it('combines full roles at the same employer under the most relevant one', () => {
    const units = resumeUnits(opts(), careerJourney(), keywords);
    expect(units).toEqual([
      { primaryId: 'OSO', roleIds: ['OSO'], company: 'Oso Group' },
      { primaryId: 'CSO', roleIds: ['CSO', 'SA'], company: 'Nymbl' }, // "Nymbl, Inc." matches; IT is excluded
    ]);
  });

  it('falls back to the most recent role when nothing is scored, and keeps roles separate when combining is off', () => {
    expect(resumeUnits(opts(), careerJourney())[1].primaryId).toBe('CSO');
    expect(resumeUnits(opts({ combineEmployerRoles: false }), careerJourney()).map((u) => u.roleIds)).toEqual([['OSO'], ['CSO'], ['SA']]);
  });

  it('gives a combined entry one budget, with an extra bullet per extra role', () => {
    expect(computeBulletBudget(opts(), careerJourney(), keywords)).toEqual({ CSO: 7, OSO: 5 });
    expect(computeBulletBudget(opts({ combineEmployerRoles: false }), careerJourney(), keywords)).toEqual({ CSO: 6, OSO: 5, SA: 4 });
  });

  it('takes a bullet per entry for each of outcomes and narratives, never below 2', () => {
    expect(computeBulletBudget(opts({ selectedOutcomes: true }), careerJourney(), keywords)).toEqual({ CSO: 6, OSO: 4 });
    expect(computeBulletBudget(opts({ selectedOutcomes: true, roleNarratives: true }), careerJourney(), keywords)).toEqual({ CSO: 5, OSO: 3 });
    const onePage: ResumeBuildOptions = { ...opts({ selectedOutcomes: true, roleNarratives: true }), pageTarget: 1 };
    expect(Math.min(...Object.values(computeBulletBudget(onePage, careerJourney(), keywords)))).toBeGreaterThanOrEqual(2);
  });

  it('spans a combined entry from earliest start to latest end', () => {
    expect(unitDates(['CSO', 'SA'], careerJourney())).toBe('January 2022 – March 2026');
    expect(unitDates(['OSO'], careerJourney())).toBe('March 2026 – Present');
  });

  it('describes combined entries and each format choice in the constraints', () => {
    const block = buildResumeConstraintsBlock(opts({ roleNarratives: true, boldLeads: true, selectedOutcomes: true }), careerJourney(), 'resume', keywords);
    expect(block).toContain('roleId CSO, ONE combined entry for Nymbl covering roleIds [CSO, SA]');
    expect(block).toContain('at most 5 bullets'); // 7, less one each for outcomes and narratives
    expect(block).toContain('Summary: at most 80 words');
    expect(block).toContain('Never compute a new figure from others');
    expect(block).toContain('at most 35 words');
    expect(block).toContain('at most 20 words');
    expect(block).toContain('Give every experience entry a narrative');
    expect(block).toContain('a lead: a 2–5 word label');
    expect(block).toContain('Fill selectedOutcomes from the Resume Strategy');
    const off = buildResumeConstraintsBlock(opts({ combineEmployerRoles: false }), careerJourney(), 'resume');
    expect(off).not.toContain('combined entry');
    expect(off).toContain("Leave every experience entry's narrative empty.");
    expect(off).toContain("Leave every bullet's lead empty.");
    expect(off).toContain('Leave selectedOutcomes empty.');
    expect(buildResumeConstraintsBlock(opts({ selectedOutcomes: true }), careerJourney(), 'strategy')).toContain('selectedOutcomes: 4–5 entries');
  });
});

describe('enforcement with formats', () => {
  const generated = () => resume([
    entry('CSO', 'Nymbl', 'Head of Solution Consulting | Chief Strategy Officer', [cited('Scaled revenue', '**Revenue growth:**'), { text: 'filler' }], { narrative: ' Led consulting. ', roleIds: ['bogus'] }),
    entry('SA', 'Nymbl', 'Solution Architect', [cited('Designed APIs', 'API design')]),
    entry('OSO', 'Oso Group', 'Founder', [cited('Built AppSimple')]),
  ], { selectedOutcomes: [{ lead: 'Model', text: 'written' }], skillsPosition: 'bottom' });

  it('merges a combined employer\'s separate entries and strips layout fields that are off', () => {
    const { resume: out, warnings } = enforceResumeConstraints(generated(), opts(), careerJourney(), keywords);
    expect(out.experience.map((e) => e.roleId)).toEqual(['OSO', 'CSO']);
    const nymbl = out.experience[1];
    expect(nymbl).toMatchObject({ roleIds: ['CSO', 'SA'], dates: 'January 2022 – March 2026', title: 'Head of Solution Consulting | Chief Strategy Officer' });
    expect(nymbl.bullets.map((b) => b.text)).toEqual(['Scaled revenue', 'filler', 'Designed APIs']);
    expect(nymbl.bullets.some((b) => 'lead' in b)).toBe(false);
    expect(nymbl.narrative).toBeUndefined();
    expect(out.selectedOutcomes).toBeUndefined();
    expect(out.skillsPosition).toBeUndefined();
    expect(warnings.some((w) => w.includes('Combined a separate "Solution Architect"'))).toBe(true);
  });

  it('keeps and tidies narratives, leads and outcomes when they are on', () => {
    const strategy = { selectedOutcomes: ['**Revenue Growth:** Scaled services revenue from $1.5M to $9.2M', 'No label here, just a sentence: with a late colon that is too far in to be a label at all'] };
    const { resume: out } = enforceResumeConstraints(generated(), opts({ roleNarratives: true, boldLeads: true, selectedOutcomes: true, skillsPosition: 'bottom' }), careerJourney(), keywords, strategy);
    const nymbl = out.experience[1];
    expect(nymbl.narrative).toBe('Led consulting.');
    expect(nymbl.bullets[0].lead).toBe('Revenue growth');
    expect(nymbl.bullets[2].lead).toBe('API design');
    expect(out.selectedOutcomes).toEqual([{ lead: 'Model', text: 'written' }]); // the writer's structured outcomes win
    expect(out.skillsPosition).toBe('bottom');
    // With no structured outcomes from the writer, the strategy's lines are parsed instead.
    const bare = { ...generated(), selectedOutcomes: [{ lead: '**Nope:**', text: '  ' }] };
    expect(enforceResumeConstraints(bare, opts({ selectedOutcomes: true }), careerJourney(), keywords, strategy).resume.selectedOutcomes).toEqual([
      { lead: 'Revenue Growth', text: 'Scaled services revenue from $1.5M to $9.2M' },
      { lead: '', text: 'No label here, just a sentence: with a late colon that is too far in to be a label at all' },
    ]);
  });

  it('caps bold labels at 5 per entry and never labels every bullet', () => {
    const many = resume([entry('CSO', 'Nymbl', 'CSO', Array.from({ length: 7 }, (_, i) => cited(`c${i}`, `L${i}`)))]);
    const leads = enforceResumeConstraints(many, opts({ boldLeads: true }), careerJourney(), keywords).resume.experience[0].bullets.map((b) => b.lead);
    expect(leads).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', undefined, undefined]);
    const four = resume([entry('CSO', 'Nymbl', 'CSO', Array.from({ length: 4 }, (_, i) => cited(`c${i}`, `L${i}`)))]);
    expect(enforceResumeConstraints(four, opts({ boldLeads: true }), careerJourney(), keywords).resume.experience[0].bullets.map((b) => b.lead)).toEqual(['L0', 'L1', 'L2', undefined]);
  });

  it('keeps existing outcomes when there is no strategy (section regenerate)', () => {
    const { resume: out } = enforceResumeConstraints(generated(), opts({ selectedOutcomes: true }), careerJourney(), keywords);
    expect(out.selectedOutcomes).toEqual([{ lead: 'Model', text: 'written' }]);
  });

  it('caps a combined entry to its shared budget, uncited bullets first', () => {
    const many = resume([entry('CSO', 'Nymbl', 'CSO', [...Array.from({ length: 6 }, (_, i) => cited(`c${i}`)), { text: 'u1' }, { text: 'u2' }])]);
    const { resume: out } = enforceResumeConstraints(many, opts(), careerJourney(), keywords);
    expect(out.experience[0].bullets.map((b) => b.text)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'u1']);
  });
});

describe('malformed model output', () => {
  it('drops a non-experience item filed under experience and tolerates missing bullets', () => {
    const r = resume([
      { institution: 'MSOE', degree: 'ME coursework', graduationDate: '2010' } as any,
      { roleId: 'OSO', company: 'Oso Group', title: 'Founder', dates: '', location: '' } as any,
    ]);
    const { resume: out, warnings } = enforceResumeConstraints(r, opts(), careerJourney());
    expect(out.experience.map((e) => e.roleId)).toEqual(['OSO']);
    expect(out.experience[0].bullets).toEqual([]);
    expect(warnings).toContain('Dropped a malformed experience entry.');
  });

  it('fills education from the Career Journey when the model returns none', () => {
    const cj = careerJourney();
    cj.education = [
      { institution: 'Milwaukee School of Engineering', program: 'Mechanical Engineering', degree_type: 'Coursework (program not completed)', start: '2005', end: '2010' },
      { institution: 'Colorado State University', program: 'B.S. Business Administration', degree_type: "Bachelor's", start: '2011-08', end: '2015-05', completion_status: 'Completed' },
      { institution: 'State U', program: 'Computer Science', degree_type: 'Master of Science', end: '2018' },
    ];
    const { resume: out } = enforceResumeConstraints(resume([]), opts(), cj);
    expect(out.education).toEqual([
      { institution: 'Milwaukee School of Engineering', degree: 'Mechanical Engineering coursework', graduationDate: '2005 – 2010' },
      { institution: 'Colorado State University', degree: 'B.S. Business Administration', graduationDate: 'May 2015' },
      { institution: 'State U', degree: 'Master of Science, Computer Science', graduationDate: '2018' },
    ]);
  });
});

describe('outcome parsing', () => {
  it('splits a bold or plain label from its sentence', () => {
    expect(parseOutcome('**POC Delivery:** Ran POCs')).toEqual({ lead: 'POC Delivery', text: 'Ran POCs' });
    expect(parseOutcome('POC Delivery: Ran POCs')).toEqual({ lead: 'POC Delivery', text: 'Ran POCs' });
    expect(parseOutcome('Ran POCs for Boeing')).toEqual({ lead: '', text: 'Ran POCs for Boeing' });
  });
});

describe('format edits and plain text', () => {
  const base = () => resume([entry('CSO', 'Nymbl', 'CSO', [{ text: 'b1' }], { narrative: 'Scope' })], { selectedOutcomes: [{ lead: 'A', text: 'one' }, { lead: 'B', text: 'two' }] });

  it('edits leads, narratives and outcomes immutably', () => {
    const r = base();
    const snapshot = JSON.stringify(r);
    expect(updateBulletLead(r, 0, 0, ' POCs ').experience[0].bullets[0]).toEqual({ text: 'b1', lead: 'POCs' });
    expect(updateBulletLead(updateBulletLead(r, 0, 0, 'POCs'), 0, 0, '').experience[0].bullets[0]).toEqual({ text: 'b1' });
    expect(updateNarrative(r, 0, '').experience[0].narrative).toBeUndefined();
    expect(updateOutcome(r, 1, { text: 'TWO' }).selectedOutcomes![1]).toEqual({ lead: 'B', text: 'TWO' });
    expect(moveOutcome(r, 1, -1).selectedOutcomes!.map((o) => o.lead)).toEqual(['B', 'A']);
    expect(removeOutcome(removeOutcome(r, 0), 0).selectedOutcomes).toBeUndefined();
    expect(JSON.stringify(r)).toBe(snapshot);
  });

  it('includes outcomes, narratives and leads in the text the keyword gate reads', () => {
    const r = updateBulletLead(base(), 0, 0, 'Post-sale adoption');
    const text = resumeToPlainText(r);
    expect(text).toContain('A\none');
    expect(text).toContain('Scope');
    expect(text).toContain('Post-sale adoption b1');
  });
});
