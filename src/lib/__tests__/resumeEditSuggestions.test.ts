import { describe, it, expect } from 'vitest';
import { applyEditSuggestion, editState, normalizeEditSuggestions, resumeLinesForPrompt, splitLeadingLabels } from '../resumeEditSuggestions';
import type { GeneratedResume } from '../../types';

const careerJourney = {
  roles: [
    { id: 'CSO', organization: 'Nymbl', title: 'Chief Strategy Officer' },
    { id: 'OSO', organization: 'Oso Group', title: 'Founder' },
  ],
  achievements: [{ id: 'ACH-1', description: 'Grew pipeline 6x', role_ids: ['CSO'] }],
  skills_index: [{ id: 'SK-1', name: 'Solution design' }],
};
const resume = (): GeneratedResume => ({
  name: 'Pat', contactInfo: '', summary: 'Solutions leader.', education: [],
  skills: [{ category: 'Technical', terms: 'APIs, SQL' }],
  selectedOutcomes: [{ lead: 'Growth', text: 'Grew pipeline 6x.' }],
  experience: [
    { roleId: 'CSO', company: 'Nymbl', title: 'CSO', dates: '2024 – Present', location: '', bullets: [{ text: 'Led demos.', evidenceRefs: [{ type: 'achievement', id: 'ACH-1' }] }, { text: 'Ran POCs.' }] },
    { roleId: 'OSO', company: 'Oso Group', title: 'Founder', dates: '2020 – 2024', location: '', narrative: 'Founded a consultancy.', bullets: [{ text: 'Built tools.' }] },
  ],
});
const tagline = 'Solutions Leader';

describe('resumeLinesForPrompt', () => {
  it('addresses every line the scorer can edit', () => {
    const lines = resumeLinesForPrompt(resume(), tagline);
    for (const id of ['[tagline]', '[summary]', '[skills]', '[skills.0] {category: Technical} APIs, SQL', '[outcomes]', '[outcome.0] {label: Growth} Grew pipeline 6x.', '[role.0] Nymbl — CSO', '[role.0.bullet.1] Ran POCs.', '[role.1.narrative] Founded a consultancy.']) {
      expect(lines).toContain(id);
    }
    expect(resumeLinesForPrompt(resume(), tagline, false)).not.toContain('[tagline]');
  });
});

describe('normalizeEditSuggestions', () => {
  it('resolves line ids to text anchors, sorts in resume order and drops unusable edits', () => {
    const edits = normalizeEditSuggestions([
      { op: 'add', line: 'role.0.bullet.0', text: 'Ran technical discovery (ACH-1).', why: 'Covers discovery, per ACH-1', keywords: ['technical discovery'], evidenceRefs: [{ type: 'deliverable', id: 'ACH-1' }], support: 'backed' },
      { op: 'replace', line: 'summary', text: 'Solutions leader for enterprise SaaS.', keywords: ['enterprise SaaS'], evidenceRefs: [{ type: 'achievement', id: 'NOPE-9' }], support: 'backed' },
      { op: 'replace', line: 'summary', text: 'Solutions leader.' }, // no change
      { op: 'replace', line: 'role.7.bullet.0', text: 'Ghost role.' },
      { op: 'replace', line: 'role.0.narrative', text: 'No narrative to replace.' },
      { op: 'add', line: 'skills', text: 'Kubernetes' }, // new row with no category
    ], resume(), tagline, careerJourney);

    expect(edits.map((e) => e.label)).toEqual(['Summary', 'Nymbl · new bullet after 1']);
    const [summary, bullet] = edits;
    expect(summary.support).toBe('inferred'); // its only citation doesn't exist
    expect(summary.before).toBe('Solutions leader.');
    expect(bullet.target).toEqual({ kind: 'newBullet', roleKey: 'CSO', afterText: 'Led demos.' });
    expect(bullet.text).toBe('Ran technical discovery.');
    expect(bullet.why).toBe('Covers discovery, per');
    expect(bullet.evidenceRefs).toEqual([{ type: 'achievement', id: 'ACH-1' }]); // type corrected
    expect(bullet.support).toBe('backed');
  });
});

describe('label cleanup', () => {
  it('strips repeated labels where the line type keeps them in lead, and leaves other text alone', () => {
    expect(splitLeadingLabels('POC Delivery: POC & Validation: Ran 12 POCs.')).toEqual({ labels: ['POC Delivery', 'POC & Validation'], text: 'Ran 12 POCs.' });
    expect(splitLeadingLabels('{label: Growth} Grew 6x.')).toEqual({ labels: ['Growth'], text: 'Grew 6x.' });
    expect(splitLeadingLabels('Grew revenue 6x, from $1.5M to $9.2M: the largest jump.').labels).toEqual([]);

    const r = resume();
    r.experience[0].bullets[0] = { text: 'Led demos.', lead: 'Demos' };
    const edits = normalizeEditSuggestions([
      { op: 'replace', line: 'skills.0', text: 'Technical Skills: APIs, SQL, AWS' },
      { op: 'add', line: 'role.0', text: 'Discovery: Ran technical discovery.' },
      { op: 'add', line: 'role.1', text: 'Tooling: Built internal tools.', lead: 'Tools' }, // Oso bullets have no labels
      { op: 'add', line: 'outcomes', text: 'Speed: Cut onboarding to three days.' },
    ], r, tagline, careerJourney);
    expect(edits.map((e) => [e.text, e.lead])).toEqual([
      ['APIs, SQL, AWS', undefined],
      ['Cut onboarding to three days.', 'Speed'],
      ['Ran technical discovery.', 'Discovery'],
      ['Tooling: Built internal tools.', undefined],
    ]);
  });
});

describe('applyEditSuggestion', () => {
  const edits = normalizeEditSuggestions([
    { op: 'replace', line: 'role.0.bullet.1', text: 'Ran 12 POCs for Fortune 500 buyers.', evidenceRefs: [{ type: 'achievement', id: 'ACH-1' }], support: 'backed' },
    { op: 'add', line: 'role.0.bullet.0', text: 'Ran discovery.' },
    { op: 'replace', line: 'tagline', text: 'Head of Solution Consulting' },
    { op: 'replace', line: 'skills.0', text: 'APIs, SQL, Kubernetes' },
    { op: 'add', line: 'outcomes', text: 'Cut onboarding from two weeks to three days.', lead: 'Speed' },
  ], resume(), tagline, careerJourney);
  const byLabel = (prefix: string) => edits.find((e) => e.label.startsWith(prefix))!;

  it('writes each edit exactly where it was anchored, even after earlier edits shift indexes', () => {
    let r = resume();
    r = applyEditSuggestion(byLabel('Nymbl · new bullet'), r, tagline, careerJourney)!.resume;
    expect(r.experience[0].bullets.map((b) => b.text)).toEqual(['Led demos.', 'Ran discovery.', 'Ran POCs.']);
    r = applyEditSuggestion(byLabel('Nymbl · bullet 2'), r, tagline, careerJourney)!.resume;
    expect(r.experience[0].bullets[2]).toEqual({ text: 'Ran 12 POCs for Fortune 500 buyers.', evidenceRefs: [{ type: 'achievement', id: 'ACH-1' }] });
    r = applyEditSuggestion(byLabel('Skills'), r, tagline, careerJourney)!.resume;
    expect(r.skills[0].terms).toBe('APIs, SQL, Kubernetes');
    r = applyEditSuggestion(byLabel('Selected Outcomes'), r, tagline, careerJourney, 'Cut onboarding to three days.')!.resume;
    expect(r.selectedOutcomes?.[1]).toEqual({ lead: 'Speed', text: 'Cut onboarding to three days.' });
    expect(applyEditSuggestion(byLabel('Tagline'), r, tagline, careerJourney)).toEqual({ resume: r, tagline: 'Head of Solution Consulting' });
  });

  it('marks an edit outdated once its line changed, and refuses to apply it', () => {
    const edit = byLabel('Nymbl · bullet 2');
    const r = resume();
    expect(editState(edit, r, tagline, careerJourney)).toBe('ready');
    r.experience[0].bullets[1] = { text: 'Ran POCs, edited by hand.' };
    expect(editState(edit, r, tagline, careerJourney)).toBe('outdated');
    expect(applyEditSuggestion(edit, r, tagline, careerJourney)).toBeNull();
    expect(editState({ ...edit, status: 'dismissed' }, r, tagline, careerJourney)).toBe('dismissed');
  });
});
