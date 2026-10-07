import { describe, it, expect } from 'vitest';
import { keywordFixInstruction, planKeywordFixes } from '../resumeKeywordFix';
import type { GeneratedResume, KeywordSignal } from '../../types';

const careerJourney = {
  roles: [
    { id: 'OSO', organization: 'Oso Group', title: 'Founder' },
    { id: 'CSO', organization: 'Nymbl', title: 'Chief Strategy Officer' },
    { id: 'SA', organization: 'Nymbl', title: 'Solution Architect' },
  ],
  achievements: [{ id: 'ACH-1', role_ids: ['SA'] }, { id: 'ACH-2', role_ids: ['OSO'] }, { id: 'ACH-9', role_ids: ['GONE'] }],
};
const kw = (phrase: string, refs: any[] = [], critical = false): KeywordSignal => ({
  id: phrase, phrase, category: 'Secondary keyword', jdImportance: 'Medium', evidenceStatus: 'EVIDENCED',
  evidenceRefs: refs, jdRefs: [], whatCouldCount: '', recognitionPrompt: '', resumePriority: '', isTopCritical: critical,
});
const keywords = [
  kw('Microservices', [{ type: 'achievement', id: 'ACH-1' }]),
  kw('MCP', [{ type: 'achievement', id: 'ACH-2' }]),
  kw('Enterprise SaaS', [], true),
  kw('Pipeline', [{ type: 'achievement', id: 'ACH-9' }]),
];
const resume: GeneratedResume = {
  name: 'Pat', contactInfo: '', summary: '', skills: [], education: [],
  experience: [
    { roleId: 'OSO', company: 'Oso Group', title: 'Founder', dates: '', location: '', bullets: [] },
    { roleId: 'CSO', roleIds: ['CSO', 'SA'], company: 'Nymbl', title: 'CSO', dates: '', location: '', bullets: [] },
  ],
};

describe('planKeywordFixes', () => {
  it('sends each keyword to the entry holding its evidence, else summary (critical) or skills', () => {
    const plan = planKeywordFixes(['Microservices', 'MCP', 'Enterprise SaaS', 'Pipeline', 'Unknown term'], keywords, resume, careerJourney);
    expect(plan).toEqual([
      { section: { kind: 'summary' }, keywords: ['Enterprise SaaS'], label: 'Summary' },
      { section: { kind: 'skills' }, keywords: ['Pipeline', 'Unknown term'], label: 'Skills' },
      { section: { kind: 'role', roleId: 'CSO' }, keywords: ['Microservices'], label: 'Nymbl' }, // SA is folded into the combined Nymbl entry
      { section: { kind: 'role', roleId: 'OSO' }, keywords: ['MCP'], label: 'Oso Group' },
    ]);
  });

  it('returns nothing when nothing is missing', () => {
    expect(planKeywordFixes([], keywords, resume, careerJourney)).toEqual([]);
  });

  it('writes a capped, targeted instruction', () => {
    const text = keywordFixInstruction({ section: { kind: 'role', roleId: 'CSO' }, keywords: ['Microservices', 'CI/CD'], label: 'Nymbl' });
    expect(text).toContain('into this role\'s bullets');
    expect(text).toContain('"Microservices", "CI/CD"');
    expect(keywordFixInstruction({ section: { kind: 'skills' }, keywords: Array(80).fill('A long keyword phrase'), label: 'Skills' }).length).toBeLessThanOrEqual(500);
  });
});
