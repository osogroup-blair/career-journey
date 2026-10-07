import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import demo from '../../src/lib/demo/demoCareerJourney.json';
import { sectionAssistSchema, DiscoverySearchProfileAiSchema } from '../ai/schemas';
import { zodToGeminiSchema } from '../ai/zodToGeminiSchema';
import { DEFAULT_PROMPTS } from '../promptStore';
import { SAMPLE_INPUTS } from '../ai/promptSampleInputs';
import { PROMPT_OSO_ALIASES } from '../ai/osoAliasMap';
import { FEATURE_NAMES } from '../billing';
import { SECTIONS } from '../../src/lib/journeySections';
import { CareerJourneySchema } from '../../src/types/careerJourney';
import { produceJourney } from '../../src/lib/journeyMutations';
import {
  applyProposal,
  buildSectionContext,
  changelogLine,
  findPossibleDuplicate,
  recordChange,
  sanitizeProposals,
  sectionGuidance,
  type SectionProposal,
} from '../../src/lib/journeyAssist';

const cj = () => JSON.parse(JSON.stringify(demo));

const proposal = (over: Partial<SectionProposal>): SectionProposal => ({
  op: 'add',
  targetId: null,
  parentId: null,
  fields: {},
  roleIds: [],
  skillIds: [],
  capabilityIds: [],
  newSkillNames: [],
  children: [],
  appendLists: {},
  rationale: '',
  ...over,
});

describe('journeySectionAssist registration', () => {
  it('is registered in every prompt registry', () => {
    expect(DEFAULT_PROMPTS.journeySectionAssist.template).toContain('{{section}}');
    expect(SAMPLE_INPUTS.journeySectionAssist).toBeDefined();
    expect(PROMPT_OSO_ALIASES.journeySectionAssist).toBeDefined();
    expect(FEATURE_NAMES.journeySectionAssist).toBeDefined();
  });

  it('converts nullable fields for Gemini (also fixes discoverySearchProfile on Gemini BYOM)', () => {
    const gemini = zodToGeminiSchema(DiscoverySearchProfileAiSchema);
    expect(gemini.properties.payMin).toMatchObject({ nullable: true });
    expect(gemini.properties.payMin.type).toBeDefined();
  });

  it.each(SECTIONS.map((s) => s.id))('builds a provider-safe schema for %s', (section) => {
    const schema = sectionAssistSchema(section);
    const json = JSON.stringify(z.toJSONSchema(schema));
    expect(json).not.toContain('$ref');
    expect(() => zodToGeminiSchema(schema)).not.toThrow();
    expect(sectionGuidance(section)).toContain('Output rules');
  });
});

describe('buildSectionContext', () => {
  it('sends the section items and only the lookups it needs', () => {
    const ctx = buildSectionContext(cj(), 'achievements', 'ACH-001');
    expect(ctx.existingItems.map((a: any) => a.id)).toEqual(['ACH-001', 'ACH-002', 'ACH-003']);
    expect(ctx.focusItem.id).toBe('ACH-001');
    expect(ctx.roles?.length).toBe(3);
    expect(ctx.skills?.length).toBe(7);
    expect(ctx.capabilities).toBeUndefined();
  });

  it('includes capabilities for projects (deliverable alignment)', () => {
    const ctx = buildSectionContext(cj(), 'projects');
    expect(ctx.capabilities?.map((c: any) => c.id)).toEqual(['CAP-001', 'CAP-002', 'CAP-003']);
    expect(ctx.existingItems[0]).toMatchObject({ id: 'INIT-001', roleId: 'ROLE-001' });
  });
});

describe('sanitizeProposals', () => {
  it('keeps allowed fields and existing ids only', () => {
    const [p] = sanitizeProposals(
      'achievements',
      [{ op: 'add', targetId: 'ACH-001', fields: { title: ' Cut churn 12% ', bogus: 'x' }, roleIds: ['ROLE-001', 'ROLE-999'], skillIds: ['SK-001', 'SK-777'], newSkillNames: ['Churn modelling'], rationale: 'r' }],
      cj()
    );
    expect(p).toMatchObject({ op: 'add', targetId: null, fields: { title: 'Cut churn 12%' }, roleIds: ['ROLE-001'], skillIds: ['SK-001'], newSkillNames: ['Churn modelling'] });
  });

  it('drops updates to items that do not exist and empty proposals', () => {
    const out = sanitizeProposals('skills', [{ op: 'update', targetId: 'SK-999', fields: { name: 'x' } }, { op: 'add', fields: {} }], cj());
    expect(out).toEqual([]);
  });

  it('coerces number fields and validates the parent role', () => {
    const [skill] = sanitizeProposals('skills', [{ op: 'add', fields: { name: 'Go', years_experience: '4' } }], cj());
    expect(skill.fields.years_experience).toBe(4);
    const [project] = sanitizeProposals('projects', [{ op: 'add', parentId: 'ROLE-404', fields: { name: 'P' }, children: [{ fields: { description: 'D' }, capabilityIds: ['CAP-001', 'CAP-404'] }] }], cj());
    expect(project.parentId).toBeNull();
    expect(project.children[0].capabilityIds).toEqual(['CAP-001']);
  });

  it('forces profile proposals to update the single record', () => {
    const [p] = sanitizeProposals('profile', [{ op: 'add', fields: { summary: 'S' }, appendLists: { signature_outcomes: ['O'], junk: ['x'] } }], cj());
    expect(p).toMatchObject({ op: 'update', targetId: 'profile', appendLists: { signature_outcomes: ['O'] } });
  });
});

describe('findPossibleDuplicate', () => {
  it('flags an exact skill name and a near-identical achievement', () => {
    const journey = cj();
    const skillName = journey.skills_index[0].name;
    expect(findPossibleDuplicate(journey, 'skills', proposal({ fields: { name: skillName.toUpperCase() } }))?.id).toBe('SK-001');
    const achTitle = journey.achievements[0].title;
    expect(findPossibleDuplicate(journey, 'achievements', proposal({ fields: { title: `${achTitle} quickly` } }))?.id).toBe('ACH-001');
    expect(findPossibleDuplicate(journey, 'skills', proposal({ fields: { name: 'Underwater basket weaving' } }))).toBeNull();
  });
});

describe('applyProposal', () => {
  it('adds a project with deliverables and creates only genuinely new skills', () => {
    const journey = cj();
    const existingSkill = journey.skills_index[0].name;
    const { journey: next, result } = produceJourney(journey, (d, ids) =>
      applyProposal(d, ids, 'projects', proposal({
        parentId: 'ROLE-002',
        fields: { name: 'Routing v2', description: 'Rebuilt routing' },
        children: [{ fields: { description: 'Shipped it', impact: 'Faster' }, skillIds: ['SK-003'], capabilityIds: ['CAP-002'], newSkillNames: ['Graph search', existingSkill] }],
      }))
    );
    expect(result).toBe('INIT-004');
    const init = next.roles.find((r: any) => r.id === 'ROLE-002').initiatives.find((i: any) => i.id === 'INIT-004');
    expect(init.deliverables[0]).toMatchObject({ id: 'DEL-005', capability_alignment: ['CAP-002'], skill_ids: ['SK-003', 'SK-011', 'SK-001'] });
    expect(next.skills_index.at(-1)).toMatchObject({ id: 'SK-011', name: 'Graph search' });
    expect(CareerJourneySchema.safeParse(next).success).toBe(true);
  });

  it('a project with no valid role is not applied', () => {
    const { result } = produceJourney(cj(), (d, ids) => applyProposal(d, ids, 'projects', proposal({ fields: { name: 'Orphan' } })));
    expect(result).toBeNull();
  });

  it('merges into an existing item instead of adding', () => {
    const { journey: next, result } = produceJourney(cj(), (d, ids) =>
      applyProposal(d, ids, 'achievements', proposal({ fields: { description: 'Better' }, roleIds: ['ROLE-003'] }), { mergeIntoId: 'ACH-002' })
    );
    expect(result).toBe('ACH-002');
    expect(next.achievements).toHaveLength(3);
    const ach = next.achievements.find((a: any) => a.id === 'ACH-002');
    expect(ach.description).toBe('Better');
    expect(ach.role_ids).toEqual(['ROLE-001', 'ROLE-003']);
  });

  it('appends to profile lists without duplicating', () => {
    const journey = cj();
    const existing = journey.person.signature_outcomes[0];
    const { journey: next } = produceJourney(journey, (d, ids) =>
      applyProposal(d, ids, 'profile', proposal({ op: 'update', targetId: 'profile', fields: { primary_tagline: 'New tagline' }, appendLists: { signature_outcomes: [existing, 'Fresh outcome'] } }))
    );
    expect(next.person.positioning.primary_tagline).toBe('New tagline');
    expect(next.person.signature_outcomes.filter((o: string) => o === existing)).toHaveLength(1);
    expect(next.person.signature_outcomes).toContain('Fresh outcome');
  });

  it('adds a capability with functions and their skills', () => {
    const { journey: next, result } = produceJourney(cj(), (d, ids) =>
      applyProposal(d, ids, 'capabilities', proposal({ fields: { name: 'Platform Strategy' }, children: [{ fields: { name: 'Roadmapping' }, skillIds: ['SK-002'], capabilityIds: [], newSkillNames: [] }] }))
    );
    expect(result).toBe('CAP-004');
    expect(next.capabilities.at(-1).functions[0]).toMatchObject({ id: 'FUNC-004', name: 'Roadmapping', skills: [{ id: 'SK-002' }] });
  });
});

describe('applyProposal field cleanup', () => {
  it('re-coerces edited number fields and drops blanked ones', () => {
    const { journey: next, result } = produceJourney(cj(), (d, ids) =>
      applyProposal(d, ids, 'skills', proposal({ fields: { name: 'Terraform', years_experience: '3' as any, description: '  ' } }))
    );
    expect(next.skills_index.find((s: any) => s.id === result)).toMatchObject({ name: 'Terraform', years_experience: 3 });
    expect(next.skills_index.find((s: any) => s.id === result).description).toBeUndefined();
    expect(CareerJourneySchema.safeParse(next).success).toBe(true);
  });
});

describe('changelog', () => {
  it('bumps the version once per session and appends lines', () => {
    const journey = cj();
    journey.meta.version = '3.53';
    const p = proposal({ fields: { name: 'Rust' } });
    const { journey: a, result: v1 } = produceJourney(journey, (d) => recordChange(d, changelogLine('skills', p, 'SK-011'), null));
    expect(v1).toBe('3.54');
    const { journey: b, result: v2 } = produceJourney(a, (d) => recordChange(d, 'second', v1));
    expect(v2).toBe('3.54');
    expect(b.meta.version_3_54_changes).toEqual(['Added skill SK-011 "Rust" via the Skills AI assistant.', 'second']);
    expect(CareerJourneySchema.safeParse(b).success).toBe(true);
  });
});
