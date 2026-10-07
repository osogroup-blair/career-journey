import { describe, it, expect } from 'vitest';
import { extractNumbers, flagResumeClaims, flagItemKey, openClaimFlags, removeSkillTerm } from '../resumeClaims';
import type { ExperienceContext, GeneratedResume, KeywordSignal } from '../../types';

const careerJourney = {
  roles: [
    { id: 'CSO', organization: 'Nymbl', title: 'Chief Strategy Officer', resume_title: 'Chief Strategy Officer | Head of Solution Consulting' },
    { id: 'SA', organization: 'Nymbl', title: 'Solution Architect' },
  ],
  achievements: [
    { id: 'ACH-1', description: 'Scaled services revenue from $1.5M to $9.2M; cut intake-to-proposal from 2 weeks to 3 days; 6x growth' },
    { id: 'ACH-2', description: 'Ran the POC for an $11 million defense deal' },
  ],
};
const jdText = 'Deliver compelling demos that convert technical curiosity into commercial momentum. Drive post-sale adoption and expansion across teams.';
const kw = (phrase: string, patch: Partial<KeywordSignal> = {}): KeywordSignal => ({
  id: phrase, phrase, category: 'Secondary keyword', jdImportance: 'Medium', evidenceStatus: 'EVIDENCED',
  evidenceRefs: [], jdRefs: [], whatCouldCount: '', recognitionPrompt: '', resumePriority: '', isTopCritical: false, ...patch,
});
const keywords = [kw('Post-sale adoption'), kw('Expansion'), kw('Demos'), kw('PCI DSS', { evidenceStatus: 'NOT SUPPORTED' }), kw('Kubernetes', { evidenceStatus: 'MISSING / POSSIBLE' })];
const cite = [{ type: 'achievement' as const, id: 'ACH-1' }];

function resume(patch: Partial<GeneratedResume> = {}): GeneratedResume {
  return {
    name: 'Pat', contactInfo: '', summary: 'Scaled revenue from $1.5M to $9.2M (6x) for Fortune 500 clients.', skills: [{ category: 'Platforms', terms: 'Docker, PCI DSS, GCP' }],
    experience: [{
      roleId: 'CSO', roleIds: ['CSO', 'SA'], company: 'Nymbl', title: 'Chief Strategy Officer | Head of Solution Consulting', dates: '', location: '',
      bullets: [
        { text: 'Cut intake-to-proposal time from 2 weeks to 3 days.', evidenceRefs: cite },
        { text: 'Grew expansion revenue 30% across 20+ accounts.', evidenceRefs: cite },
        { text: 'Delivered demos that converted technical curiosity into commercial momentum.', evidenceRefs: cite },
        { text: 'Drove post-sale adoption and expansion across teams.', evidenceRefs: cite },
        { text: 'Closed the $11M defense deal.', evidenceRefs: [{ type: 'achievement' as const, id: 'ACH-404' }] },
        { text: 'Owned delivery.' },
      ],
    }],
    education: [],
    ...patch,
  };
}

const run = (r = resume(), extra: { contextEntries?: Record<string, ExperienceContext> } = {}) =>
  flagResumeClaims({ resume: r, careerJourney, keywords, jdText, ...extra });
const of = (flags: ReturnType<typeof run>, kind: string) => flags.filter((f) => f.kind === kind);

describe('numbers', () => {
  it('extracts metrics, skipping years, single digits and named lists', () => {
    expect(extractNumbers('From 2022, grew 1 to 4 people, 30% faster, $1.5 M, 6x, 20+ accounts, Fortune 500 and S&P 500 clients, 1,200 users')).toEqual(['30%', '$1.5m', '6x', '20+', '1200']);
  });

  it('flags figures the Career Journey never states, including derived ones', () => {
    const flags = of(run(), 'invented-number');
    // "$11M" is stated as "$11 million" and "6x", "$1.5M", "2 weeks"/"3 days" are all in the Career Journey; "30%" and "20+" aren't.
    expect(flags.map((f) => f.detail)).toEqual(['30%', '20+']);
    expect(flags[0]).toMatchObject({ severity: 'high', location: { section: 'bullet', roleIndex: 0, bulletIndex: 1 } });
  });

  it('accepts figures from the candidate\'s confirmed Rating-stage context', () => {
    const contextEntries = { Expansion: { approvalStatus: 'Approved for patch', experienceText: 'Expansion revenue grew 30% year over year', measurableOutcome: '' } as ExperienceContext };
    expect(of(run(resume(), { contextEntries }), 'invented-number').map((f) => f.detail)).toEqual(['20+']);
  });
});

describe('copied JD wording', () => {
  it('flags phrases lifted from the JD but not keyword mirroring', () => {
    const flags = of(run(), 'jd-copy');
    expect(flags.map((f) => f.detail)).toEqual(['technical curiosity into commercial momentum']);
  });

  it('ignores wording the Career Journey itself uses', () => {
    const cj = { ...careerJourney, achievements: [...careerJourney.achievements, { id: 'ACH-3', description: 'turned technical curiosity into commercial momentum' }] };
    expect(of(flagResumeClaims({ resume: resume(), careerJourney: cj, keywords, jdText }), 'jd-copy')).toEqual([]);
  });
});

describe('terms, evidence and titles', () => {
  it('flags unsupported and unconfirmed keywords the Career Journey never mentions', () => {
    const flags = of(run(resume({ summary: 'Kubernetes expert.' })), 'unsupported-term');
    expect(flags.map((f) => [f.detail, f.location.section])).toEqual([['Kubernetes', 'summary'], ['PCI DSS', 'skills']]);
  });

  it('flags missing and unknown evidence ids', () => {
    expect(of(run(), 'unknown-evidence').map((f) => f.detail)).toEqual(['ACH-404']);
    expect(of(run(), 'no-evidence').map((f) => f.location)).toEqual([{ section: 'bullet', roleIndex: 0, bulletIndex: 5 }]);
  });

  it('accepts real and resume_title segments and flags invented ones', () => {
    expect(of(run(), 'title-reframe')).toEqual([]);
    const r = resume();
    r.experience[0].title = 'Chief Strategy Officer | VP of Global Sales';
    expect(of(run(r), 'title-reframe').map((f) => f.detail)).toEqual(['VP of Global Sales']);
  });

  it('orders flags worst first', () => {
    expect(run().map((f) => f.severity)).toEqual([...run().map((f) => f.severity)].sort((a, b) => ['high', 'medium', 'low'].indexOf(a) - ['high', 'medium', 'low'].indexOf(b)));
  });
});

describe('decisions and helpers', () => {
  it('hides kept flags until the text changes', () => {
    const flags = run();
    const decisions = { [flags[0].key]: 'kept' as const };
    expect(openClaimFlags(flags, decisions)).toHaveLength(flags.length - 1);
    const edited = resume();
    edited.experience[0].bullets[1] = { ...edited.experience[0].bullets[1], text: 'Grew expansion revenue 30% across key accounts.' };
    expect(openClaimFlags(run(edited), decisions).some((f) => f.kind === 'invented-number')).toBe(true);
  });

  it('builds highlight keys and removes a term from a skills row', () => {
    expect(flagItemKey({ section: 'bullet', roleIndex: 1, bulletIndex: 2 })).toBe('b:1:2');
    expect(flagItemKey({ section: 'summary' })).toBeNull();
    expect(removeSkillTerm(resume(), 0, ['PCI DSS']).skills[0].terms).toBe('Docker, GCP');
    expect(removeSkillTerm(resume({ skills: [{ category: 'X', terms: 'A • PCI DSS • B' }] }), 0, ['pci dss']).skills[0].terms).toBe('A • B');
  });
});
