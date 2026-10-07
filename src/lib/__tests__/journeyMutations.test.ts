import { describe, it, expect } from 'vitest';
import demo from '../demo/demoCareerJourney.json';
import { CareerJourneySchema } from '../../types/careerJourney';
import { computeNextIds, createIdAllocator } from '../careerJourneyIds';
import * as m from '../journeyMutations';

const fresh = () => JSON.parse(JSON.stringify(demo));
const run = <T,>(recipe: (d: any, ids: m.IdAlloc) => T, cj: any = fresh()) => m.produceJourney(cj, recipe);
const valid = (cj: any) => expect(CareerJourneySchema.safeParse(cj).success).toBe(true);

describe('careerJourneyIds', () => {
  it('allocates the next sequential id per prefix', () => {
    const next = computeNextIds(fresh());
    expect(next.SK).toBe('SK-011');
    expect(next.ROLE).toBe('ROLE-004');
    expect(next.MAP).toBe('MAP-002');
  });

  it('ignores legacy random ids, including all-digit ones', () => {
    const cj = fresh();
    cj.achievements.push({ id: 'ACH-K3F9QZ', title: 'x' }, { id: 'ACH-482913', title: 'y' });
    expect(computeNextIds(cj).ACH).toBe('ACH-004');
  });

  it('hands out distinct ids within one batch', () => {
    const next = createIdAllocator(fresh());
    expect([next('SK'), next('SK'), next('ACH')]).toEqual(['SK-011', 'SK-012', 'ACH-004']);
  });
});

describe('produceJourney', () => {
  it('never mutates the input and stamps last_updated', () => {
    const before = fresh();
    const snapshot = JSON.stringify(before);
    const { journey } = run((d) => m.updateRole(d, 'ROLE-001', { title: 'Changed' }), before);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(journey.roles[0].title).toBe('Changed');
    expect(journey.meta.last_updated).toBe(m.todayIso());
  });
});

describe('roles', () => {
  it('adds with a sequential id and synced aliases', () => {
    const { journey, result } = run((d, ids) => m.addRole(d, ids, { organization: 'Acme', start_date: '2025-01' }));
    expect(result).toBe('ROLE-004');
    expect(journey.roles[0]).toMatchObject({ id: 'ROLE-004', company: 'Acme', dates: '2025-01 - Present' });
    valid(journey);
  });

  it('keeps company/organization and dates in step on update', () => {
    const { journey } = run((d) => m.updateRole(d, 'ROLE-001', { organization: 'NewCo', end_date: '2025-06' }));
    const role = journey.roles.find((r: any) => r.id === 'ROLE-001');
    expect(role.company).toBe('NewCo');
    expect(role.dates).toBe(`${role.start_date} - 2025-06`);
  });

  it('delete purges role, initiative and deliverable references', () => {
    const { journey } = run((d) => m.deleteRole(d, 'ROLE-001'));
    expect(journey.roles.map((r: any) => r.id)).toEqual(['ROLE-002', 'ROLE-003']);
    expect(journey.achievements.find((a: any) => a.id === 'ACH-001').role_ids).toEqual([]);
    expect(journey.links.timeline_mappings).toEqual([]);
    expect(journey.links.keywords.map((k: any) => k.entity_id)).toEqual(['DEL-003']);
    expect(journey.links.industries.some((k: any) => k.entity_id === 'ROLE-001')).toBe(false);
    expect(journey.links.deliverable_function.map((k: any) => k.deliverable_id)).toEqual(['DEL-003']);
    expect(journey.links.deliverable_achievement.map((k: any) => k.deliverable_id)).toEqual(['DEL-003']);
    valid(journey);
  });
});

describe('initiatives and deliverables', () => {
  it('adds a deliverable to the chosen initiative', () => {
    const { journey, result } = run((d, ids) => {
      const init = m.addInitiative(d, ids, 'ROLE-002', { name: 'Second project' })!;
      return { init, del: m.addDeliverable(d, ids, init, { description: 'Shipped it' }) };
    });
    expect(result).toEqual({ init: 'INIT-004', del: 'DEL-005' });
    const role = journey.roles.find((r: any) => r.id === 'ROLE-002');
    expect(role.initiatives[1].deliverables[0]).toMatchObject({ id: 'DEL-005', description: 'Shipped it', skill_ids: [] });
    valid(journey);
  });

  it('moves an initiative and re-points its timeline mappings', () => {
    const { journey } = run((d) => m.moveInitiative(d, 'INIT-001', 'ROLE-003'));
    expect(journey.roles.find((r: any) => r.id === 'ROLE-001').initiatives).toEqual([]);
    expect(journey.roles.find((r: any) => r.id === 'ROLE-003').initiatives.map((i: any) => i.id)).toEqual(['INIT-003', 'INIT-001']);
    expect(journey.links.timeline_mappings[0].role_id).toBe('ROLE-003');
  });

  it('deleting an initiative keeps achievement-role mappings but clears initiative_id', () => {
    const { journey } = run((d) => m.deleteInitiative(d, 'INIT-001'));
    expect(journey.links.timeline_mappings[0]).toMatchObject({ entity_id: 'ACH-001', role_id: 'ROLE-001', initiative_id: null });
    expect(journey.links.deliverable_achievement.some((k: any) => k.deliverable_id === 'DEL-001')).toBe(false);
    valid(journey);
  });
});

describe('achievements', () => {
  it('adds with roles linked through role_ids and timeline_mappings', () => {
    const { journey, result } = run((d, ids) => m.addAchievement(d, ids, { title: 'Cut costs 20%' }, ['ROLE-002']));
    expect(result).toBe('ACH-004');
    expect(journey.achievements[0]).toMatchObject({ id: 'ACH-004', role_ids: ['ROLE-002'] });
    expect(journey.links.timeline_mappings.at(-1)).toMatchObject({ id: 'MAP-002', entity_id: 'ACH-004', role_id: 'ROLE-002' });
    valid(journey);
  });

  it('setAchievementRoles adds and removes mappings to match', () => {
    const { journey } = run((d, ids) => m.setAchievementRoles(d, ids, 'ACH-001', ['ROLE-003']));
    const mappings = journey.links.timeline_mappings.filter((x: any) => x.entity_id === 'ACH-001');
    expect(mappings.map((x: any) => x.role_id)).toEqual(['ROLE-003']);
    expect(m.achievementRoleIds(journey, 'ACH-001')).toEqual(['ROLE-003']);
  });

  it('setRoleAchievements links and unlinks from the role side', () => {
    const { journey } = run((d, ids) => m.setRoleAchievements(d, ids, 'ROLE-001', ['ACH-002', 'ACH-003']));
    expect(m.achievementRoleIds(journey, 'ACH-001')).toEqual([]);
    expect(m.achievementRoleIds(journey, 'ACH-003').sort()).toEqual(['ROLE-001', 'ROLE-002']);
    expect(journey.links.timeline_mappings.map((x: any) => [x.entity_id, x.role_id])).toEqual([
      ['ACH-002', 'ROLE-001'],
      ['ACH-003', 'ROLE-001'],
    ]);
    valid(journey);
  });

  it('delete removes the achievement and its link rows', () => {
    const { journey } = run((d) => m.deleteAchievement(d, 'ACH-001'));
    expect(journey.achievements.map((a: any) => a.id)).toEqual(['ACH-002', 'ACH-003']);
    expect(journey.links.timeline_mappings).toEqual([]);
    expect(journey.links.deliverable_achievement.map((k: any) => k.achievement_id)).toEqual(['ACH-003']);
  });
});

describe('skills', () => {
  it('addSkill always assigns an id, so the journey still validates', () => {
    const { journey, result } = run((d, ids) => m.addSkill(d, ids, { name: 'Rust' }));
    expect(result).toBe('SK-011');
    expect(journey.skills_index.at(-1)).toMatchObject({ id: 'SK-011', name: 'Rust' });
    valid(journey);
  });

  it('updateSkill propagates shared fields to capability function copies', () => {
    const { journey } = run((d) => m.updateSkill(d, 'SK-001', { name: 'Renamed', proficiency: 'Expert', category: 'Other' }));
    const copy = journey.capabilities[0].functions[0].skills.find((s: any) => s.id === 'SK-001');
    expect(copy).toMatchObject({ name: 'Renamed', proficiency: 'Expert' });
    expect(copy.category).toBeUndefined();
  });

  it('setSkillRoles writes role.skills and drops stale skill mappings', () => {
    const cj = fresh();
    cj.links.timeline_mappings.push({ id: 'MAP-009', entity_type: 'skill', entity_id: 'SK-003', role_id: 'ROLE-003' });
    expect(m.skillRoleIds(cj, 'SK-003').sort()).toEqual(['ROLE-001', 'ROLE-002', 'ROLE-003']);
    const { journey } = run((d, ids) => m.setSkillRoles(d, ids, 'SK-003', ['ROLE-002', 'ROLE-003']), cj);
    expect(m.referrerIds(journey.roles, 'skills', 'SK-003')).toEqual(['ROLE-002', 'ROLE-003']);
    expect(journey.links.timeline_mappings.filter((x: any) => x.entity_type === 'skill')).toHaveLength(1);
    const { journey: removed } = run((d, ids) => m.setSkillRoles(d, ids, 'SK-003', []), journey);
    expect(m.skillRoleIds(removed, 'SK-003')).toEqual([]);
    valid(removed);
  });

  it('setSkillFunctions adds index copies and removes from other functions', () => {
    const { journey } = run((d) => m.setSkillFunctions(d, 'SK-001', ['FUNC-003']));
    expect(m.skillFunctionIds(journey, 'SK-001')).toEqual(['FUNC-003']);
    expect(journey.capabilities[2].functions[0].skills.at(-1)).toMatchObject({ id: 'SK-001', name: journey.skills_index[0].name });
    expect(journey.capabilities[2].functions[0].skills.at(-1).category).toBeUndefined();
  });

  it('setReferrers edits the other side of an id array', () => {
    const { journey } = run((d) => m.setReferrers(d.achievements, 'skill_ids', 'SK-001', ['ACH-003']));
    expect(m.referrerIds(journey.achievements, 'skill_ids', 'SK-001')).toEqual(['ACH-003']);
    expect(journey.achievements[0].skill_ids).toEqual(['SK-002']);
  });

  it('deleteSkill strips every reference to the id', () => {
    const { journey } = run((d) => m.deleteSkill(d, 'SK-001'));
    const json = JSON.stringify(journey);
    expect(json.includes('"SK-001"')).toBe(false);
    valid(journey);
  });
});

describe('capabilities', () => {
  it('adds a function and sets its skills from the index', () => {
    const { journey, result } = run((d, ids) => {
      const fn = m.addFunction(d, ids, 'CAP-002', { name: 'New fn' })!;
      m.setFunctionSkills(d, fn, ['SK-010', 'SK-999']);
      return fn;
    });
    expect(result).toBe('FUNC-004');
    const fn = journey.capabilities[1].functions.find((f: any) => f.id === 'FUNC-004');
    expect(fn.skills.map((s: any) => s.id)).toEqual(['SK-010']);
    valid(journey);
  });

  it('delete purges capability and function references', () => {
    const { journey } = run((d) => m.deleteCapability(d, 'CAP-001'));
    expect(journey.links.education_alignment).toEqual([]);
    expect(journey.links.deliverable_function.map((k: any) => k.function_id)).toEqual(['FUNC-002']);
    expect(journey.education[0].capability_alignment).toEqual([]);
    expect(JSON.stringify(journey.roles).includes('"CAP-001"')).toBe(false);
  });

  it('links capabilities and roles through timeline mappings, from either side', () => {
    const { journey } = run((d, ids) => m.setCapabilityRoles(d, ids, 'CAP-001', ['ROLE-001', 'ROLE-002']));
    expect(m.capabilityRoleIds(journey, 'CAP-001')).toEqual(['ROLE-001', 'ROLE-002']);
    expect(journey.links.timeline_mappings.at(-1)).toMatchObject({ id: 'MAP-003', entity_type: 'capability', entity_id: 'CAP-001', role_id: 'ROLE-002' });
    valid(journey);
    const { journey: next } = run((d, ids) => m.setRoleCapabilities(d, ids, 'ROLE-001', ['CAP-003']), journey);
    expect(m.roleCapabilityIds(next, 'ROLE-001')).toEqual(['CAP-003']);
    expect(m.capabilityRoleIds(next, 'CAP-001')).toEqual(['ROLE-002']);
    // Achievement mappings on the same role are untouched.
    expect(m.achievementRoleIds(next, 'ACH-001')).toEqual(['ROLE-001']);
  });

  it('lists deliverables aligned to a capability', () => {
    expect(m.capabilityDeliverables(fresh(), 'CAP-002').map((x) => x.deliverable.id)).toEqual(['DEL-001', 'DEL-003']);
  });

  it('upgrades a legacy string function in place', () => {
    const cj = fresh();
    cj.capabilities[0].functions.push('FN-001');
    cj.functions = [{ id: 'FN-001', name: 'Legacy', description: 'old' }];
    const { journey } = run((d) => m.upgradeLegacyFunction(d, 'CAP-001', 'FN-001'), cj);
    expect(journey.capabilities[0].functions[1]).toMatchObject({ id: 'FN-001', name: 'Legacy', skills: [] });
  });
});

describe('flat lists', () => {
  it.each([
    ['education', 'EDU-002'],
    ['certifications', 'CERT-002'],
    ['methodologies', 'METH-002'],
    ['customer_engagements', 'ENG-001'],
  ] as const)('adds, updates and deletes %s', (key, expectedId) => {
    let cj = fresh();
    const added = run((d, ids) => m.addListItem(d, ids, key, {}), cj);
    expect(added.result).toBe(expectedId);
    cj = run((d) => m.updateListItem(d, key, expectedId, { notes: 'kept' }), added.journey).journey;
    expect(cj[key].find((x: any) => x.id === expectedId).notes).toBe('kept');
    valid(cj);
    cj = run((d) => m.deleteListItem(d, key, expectedId), cj).journey;
    expect(cj[key].some((x: any) => x.id === expectedId)).toBe(false);
  });
});
