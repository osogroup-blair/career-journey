import { createIdAllocator, type IdPrefix } from './careerJourneyIds';

/**
 * Id-keyed edits over a Career Journey, written as "recipes" that mutate a draft.
 * `produceJourney` clones first, so callers (the store's `mutateCareerJourney`, tests)
 * only ever see an immutable before/after pair.
 *
 * Where things actually live (see src/types/careerJourney.ts):
 * - deliverables:  roles[].initiatives[].deliverables[]
 * - function skills: capabilities[].functions[].skills[] — copies of skills_index entries (same id)
 * - achievement <-> role: achievement.role_ids AND links.timeline_mappings (both kept in sync here)
 * - skill <-> role: role.skills;  capability <-> role: links.timeline_mappings only
 *
 * Every many-to-many link has a setter from each side (setSkillRoles / role.skills,
 * setRoleCapabilities / setCapabilityRoles, …) so either editor can manage it.
 *
 * Every delete runs `purgeReferences`, so removing an entity never leaves dangling ids
 * in links.* or in another entity's id arrays.
 */

export type Draft = any;
export type IdAlloc = (prefix: IdPrefix) => string;

export const todayIso = () => new Date().toISOString().split('T')[0];

export function produceJourney<T>(careerJourney: any, recipe: (draft: Draft, ids: IdAlloc) => T): { journey: any; result: T } {
  const draft = JSON.parse(JSON.stringify(careerJourney));
  const ids = createIdAllocator(draft);
  const result = recipe(draft, ids);
  if (!draft.meta) draft.meta = { owner: '', version: '0.1' };
  draft.meta.last_updated = todayIso();
  return { journey: draft, result };
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const LINK_KEYS = [
  'keywords',
  'industries',
  'education_alignment',
  'deliverable_function',
  'certification_alignment',
  'deliverable_achievement',
  'timeline_mappings',
] as const;

export function ensureLinks(d: Draft) {
  if (!d.links || typeof d.links !== 'object') d.links = {};
  for (const key of LINK_KEYS) if (!Array.isArray(d.links[key])) d.links[key] = [];
  return d.links;
}

function list(d: Draft, key: string): any[] {
  if (!Array.isArray(d[key])) d[key] = [];
  return d[key];
}

export function findRole(d: Draft, roleId: string) {
  return (d.roles || []).find((r: any) => r.id === roleId);
}

export function findInitiative(d: Draft, initiativeId: string) {
  for (const role of d.roles || []) {
    const initiative = (role.initiatives || []).find((i: any) => i.id === initiativeId);
    if (initiative) return { role, initiative };
  }
  return null;
}

export function findDeliverable(d: Draft, deliverableId: string) {
  for (const role of d.roles || []) {
    for (const initiative of role.initiatives || []) {
      const deliverable = (initiative.deliverables || []).find((x: any) => x.id === deliverableId);
      if (deliverable) return { role, initiative, deliverable };
    }
  }
  return null;
}

export function findFunction(d: Draft, functionId: string) {
  for (const capability of d.capabilities || []) {
    const fn = (capability.functions || []).find((f: any) => typeof f === 'object' && f?.id === functionId);
    if (fn) return { capability, fn };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reference cleanup
// ---------------------------------------------------------------------------

const without = (arr: any, ids: Set<string>) => (Array.isArray(arr) ? arr.filter((x: any) => !(typeof x === 'string' && ids.has(x))) : arr);

/** Strips every reference to `ids` from id arrays and links.* rows. */
export function purgeReferences(d: Draft, ids: Set<string>) {
  if (ids.size === 0) return;
  for (const role of d.roles || []) {
    role.skills = without(role.skills, ids);
    role.achievements = without(role.achievements, ids);
    for (const initiative of role.initiatives || []) {
      for (const deliverable of initiative.deliverables || []) {
        deliverable.skill_ids = without(deliverable.skill_ids, ids);
        deliverable.capability_alignment = without(deliverable.capability_alignment, ids);
      }
    }
  }
  for (const ach of d.achievements || []) {
    if (ach.role_ids) ach.role_ids = without(ach.role_ids, ids);
    if (ach.skill_ids) ach.skill_ids = without(ach.skill_ids, ids);
  }
  for (const edu of d.education || []) {
    edu.capability_alignment = without(edu.capability_alignment, ids);
    edu.skills_reinforced = without(edu.skills_reinforced, ids);
  }
  for (const capability of d.capabilities || []) {
    for (const fn of capability.functions || []) {
      if (fn && typeof fn === 'object' && Array.isArray(fn.skills)) fn.skills = fn.skills.filter((s: any) => !ids.has(s?.id));
    }
  }

  if (!d.links) return;
  const links = d.links;
  const hit = (v: any) => typeof v === 'string' && ids.has(v);
  if (Array.isArray(links.keywords)) links.keywords = links.keywords.filter((k: any) => !hit(k.entity_id));
  if (Array.isArray(links.industries)) links.industries = links.industries.filter((k: any) => !hit(k.entity_id) && !hit(k.role_id));
  if (Array.isArray(links.education_alignment))
    links.education_alignment = links.education_alignment.filter((k: any) => !hit(k.education_id) && !hit(k.capability_id));
  if (Array.isArray(links.deliverable_function))
    links.deliverable_function = links.deliverable_function.filter((k: any) => !hit(k.function_id) && !hit(k.deliverable_id));
  if (Array.isArray(links.deliverable_achievement))
    links.deliverable_achievement = links.deliverable_achievement.filter((k: any) => !hit(k.achievement_id) && !hit(k.deliverable_id));
  if (Array.isArray(links.certification_alignment))
    links.certification_alignment = links.certification_alignment.filter((k: any) => !Object.values(k || {}).some(hit));
  if (Array.isArray(links.timeline_mappings)) {
    links.timeline_mappings = links.timeline_mappings.filter((m: any) => !hit(m.entity_id) && !hit(m.role_id));
    for (const m of links.timeline_mappings) if (hit(m.initiative_id)) m.initiative_id = null;
  }
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export function formatRoleDates(start?: string, end?: string) {
  return `${start || 'Unknown'} - ${end || 'Present'}`;
}

/** Keeps the back-compat `company`/`dates` aliases in step with the canonical fields. */
function syncRoleAliases(role: any, patch: any) {
  if ('organization' in patch && !('company' in patch)) role.company = patch.organization;
  if ('company' in patch && !('organization' in patch)) role.organization = patch.company;
  if (('start_date' in patch || 'end_date' in patch) && !('dates' in patch)) role.dates = formatRoleDates(role.start_date, role.end_date);
}

export function addRole(d: Draft, ids: IdAlloc, fields: any = {}) {
  const role = {
    organization: '',
    company: '',
    title: '',
    start_date: '',
    end_date: 'Present',
    location: '',
    description: '',
    initiatives: [],
    deliverables: [],
    achievements: [],
    skills: [],
    ...fields,
    id: ids('ROLE'),
  };
  syncRoleAliases(role, fields);
  if (!role.dates) role.dates = formatRoleDates(role.start_date, role.end_date);
  list(d, 'roles').unshift(role);
  return role.id as string;
}

export function updateRole(d: Draft, roleId: string, patch: any) {
  const role = findRole(d, roleId);
  if (!role) return;
  Object.assign(role, patch);
  syncRoleAliases(role, patch);
}

export function deleteRole(d: Draft, roleId: string) {
  const role = findRole(d, roleId);
  if (!role) return;
  const removed = new Set<string>([roleId]);
  for (const initiative of role.initiatives || []) {
    removed.add(initiative.id);
    for (const deliverable of initiative.deliverables || []) removed.add(deliverable.id);
  }
  d.roles = d.roles.filter((r: any) => r.id !== roleId);
  purgeReferences(d, removed);
}

// ---------------------------------------------------------------------------
// Initiatives ("Projects") and their deliverables
// ---------------------------------------------------------------------------

export function addInitiative(d: Draft, ids: IdAlloc, roleId: string, fields: any = {}) {
  const role = findRole(d, roleId);
  if (!role) return null;
  if (!Array.isArray(role.initiatives)) role.initiatives = [];
  const initiative = { name: '', description: '', deliverables: [], ...fields, id: ids('INIT') };
  role.initiatives.push(initiative);
  return initiative.id as string;
}

export function updateInitiative(d: Draft, initiativeId: string, patch: any) {
  const found = findInitiative(d, initiativeId);
  if (found) Object.assign(found.initiative, patch);
}

export function moveInitiative(d: Draft, initiativeId: string, toRoleId: string) {
  const found = findInitiative(d, initiativeId);
  const target = findRole(d, toRoleId);
  if (!found || !target || found.role.id === toRoleId) return;
  found.role.initiatives = found.role.initiatives.filter((i: any) => i.id !== initiativeId);
  if (!Array.isArray(target.initiatives)) target.initiatives = [];
  target.initiatives.push(found.initiative);
  for (const m of d.links?.timeline_mappings || []) if (m.initiative_id === initiativeId) m.role_id = toRoleId;
}

export function deleteInitiative(d: Draft, initiativeId: string) {
  const found = findInitiative(d, initiativeId);
  if (!found) return;
  const removed = new Set<string>([initiativeId, ...(found.initiative.deliverables || []).map((x: any) => x.id)]);
  found.role.initiatives = found.role.initiatives.filter((i: any) => i.id !== initiativeId);
  purgeReferences(d, removed);
}

export function addDeliverable(d: Draft, ids: IdAlloc, initiativeId: string, fields: any = {}) {
  const found = findInitiative(d, initiativeId);
  if (!found) return null;
  if (!Array.isArray(found.initiative.deliverables)) found.initiative.deliverables = [];
  const deliverable = { description: '', impact: '', capability_alignment: [], skill_ids: [], ...fields, id: ids('DEL') };
  found.initiative.deliverables.push(deliverable);
  return deliverable.id as string;
}

export function updateDeliverable(d: Draft, deliverableId: string, patch: any) {
  const found = findDeliverable(d, deliverableId);
  if (found) Object.assign(found.deliverable, patch);
}

export function deleteDeliverable(d: Draft, deliverableId: string) {
  const found = findDeliverable(d, deliverableId);
  if (!found) return;
  found.initiative.deliverables = found.initiative.deliverables.filter((x: any) => x.id !== deliverableId);
  purgeReferences(d, new Set([deliverableId]));
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

/** `role_id`s of the timeline mappings for one entity. */
function mappedRoles(d: Draft, entityType: string, entityId: string): string[] {
  return (d.links?.timeline_mappings || [])
    .filter((m: any) => m.entity_type === entityType && m.entity_id === entityId && m.role_id)
    .map((m: any) => m.role_id);
}

/**
 * Makes the role-linked timeline mappings of `entityType` that fall in `scope` match the
 * wanted (entityId, roleId) pairs: unwanted rows go, existing wanted rows are kept as-is
 * (initiative_id/context intact), and missing ones are added unless `add` is false.
 */
function syncRoleMappings(
  d: Draft,
  ids: IdAlloc,
  entityType: string,
  scope: (m: any) => boolean,
  wanted: [entityId: string, roleId: string][],
  add = true
) {
  const links = ensureLinks(d);
  const key = (entityId: string, roleId: string) => `${entityId}\u0000${roleId}`;
  const want = new Set(wanted.map(([e, r]) => key(e, r)));
  const inScope = (m: any) => m.entity_type === entityType && m.role_id && scope(m);
  links.timeline_mappings = links.timeline_mappings.filter((m: any) => !inScope(m) || want.has(key(m.entity_id, m.role_id)));
  if (!add) return;
  const have = new Set(links.timeline_mappings.filter(inScope).map((m: any) => key(m.entity_id, m.role_id)));
  for (const [entityId, roleId] of wanted) {
    if (have.has(key(entityId, roleId))) continue;
    have.add(key(entityId, roleId));
    const role = findRole(d, roleId);
    links.timeline_mappings.push({
      id: ids('MAP'),
      entity_type: entityType,
      entity_id: entityId,
      role_id: roleId,
      initiative_id: null,
      context: `Linked in the Career Journey editor to ${role?.title || roleId}${role?.organization ? ` at ${role.organization}` : ''}.`,
    });
  }
}

/** Adds or removes `id` from `item[field]` so membership matches `member`. */
function setMember(item: any, field: string, id: string, member: boolean) {
  const current: string[] = Array.isArray(item[field]) ? item[field] : [];
  const has = current.includes(id);
  if (member && !has) item[field] = [...current, id];
  else if (!member && has) item[field] = current.filter((x) => x !== id);
}

/**
 * The inverse of an id-array field: makes `id` appear in `items[].field` for exactly the
 * items in `itemIds` — e.g. which roles' `skills` contain a skill.
 */
export function setReferrers(items: any[] | undefined, field: string, id: string, itemIds: string[]) {
  const wanted = new Set(itemIds);
  for (const item of items || []) setMember(item, field, id, wanted.has(item.id));
}

/** Ids of the items whose `field` array contains `id`. */
export function referrerIds(items: any[] | undefined, field: string, id: string): string[] {
  return (items || []).filter((x: any) => Array.isArray(x[field]) && x[field].includes(id)).map((x: any) => x.id);
}

/** Role ids an achievement is linked to, via role_ids or timeline_mappings. */
export function achievementRoleIds(d: Draft, achievementId: string): string[] {
  const ach = (d.achievements || []).find((a: any) => a.id === achievementId);
  return [...new Set<string>([...(ach?.role_ids || []), ...mappedRoles(d, 'achievement', achievementId)])];
}

/** Sets the achievement's roles, keeping role_ids and timeline_mappings in step. */
export function setAchievementRoles(d: Draft, ids: IdAlloc, achievementId: string, roleIds: string[]) {
  const ach = (d.achievements || []).find((a: any) => a.id === achievementId);
  if (!ach) return;
  const wanted = [...new Set(roleIds)];
  ach.role_ids = wanted;
  syncRoleMappings(d, ids, 'achievement', (m) => m.entity_id === achievementId, wanted.map((r) => [achievementId, r]));
}

/** The role-side view of the same link: which achievements a role has. */
export function setRoleAchievements(d: Draft, ids: IdAlloc, roleId: string, achievementIds: string[]) {
  const wanted = [...new Set(achievementIds)];
  for (const ach of d.achievements || []) {
    if (wanted.includes(ach.id)) setMember(ach, 'role_ids', roleId, true);
    else if (Array.isArray(ach.role_ids)) setMember(ach, 'role_ids', roleId, false);
  }
  syncRoleMappings(d, ids, 'achievement', (m) => m.role_id === roleId, wanted.map((a) => [a, roleId]));
}

export function addAchievement(d: Draft, ids: IdAlloc, fields: any = {}, roleIds: string[] = []) {
  const ach = { title: '', description: '', category: '', ...fields, id: ids('ACH') };
  list(d, 'achievements').unshift(ach);
  if (roleIds.length) setAchievementRoles(d, ids, ach.id, roleIds);
  return ach.id as string;
}

export function updateAchievement(d: Draft, achievementId: string, patch: any) {
  const ach = (d.achievements || []).find((a: any) => a.id === achievementId);
  if (ach) Object.assign(ach, patch);
}

export function deleteAchievement(d: Draft, achievementId: string) {
  d.achievements = (d.achievements || []).filter((a: any) => a.id !== achievementId);
  purgeReferences(d, new Set([achievementId]));
}

// ---------------------------------------------------------------------------
// Skills index (+ the copies nested under capability functions)
// ---------------------------------------------------------------------------

const FUNCTION_SKILL_FIELDS = ['name', 'description', 'proficiency', 'last_used'] as const;

function toFunctionSkill(skill: any) {
  const copy: any = { id: skill.id };
  for (const key of FUNCTION_SKILL_FIELDS) if (skill[key] !== undefined) copy[key] = skill[key];
  return copy;
}

export function addSkill(d: Draft, ids: IdAlloc, fields: any = {}) {
  const skill = { name: '', category: '', proficiency: 'Intermediate', last_used: 'Present', ...fields, id: ids('SK') };
  list(d, 'skills_index').push(skill);
  return skill.id as string;
}

export function updateSkill(d: Draft, skillId: string, patch: any) {
  const skill = (d.skills_index || []).find((s: any) => s.id === skillId);
  if (!skill) return;
  Object.assign(skill, patch);
  // Function skills are copies of the index entry — keep the shared fields identical.
  for (const capability of d.capabilities || []) {
    for (const fn of capability.functions || []) {
      if (!fn || typeof fn !== 'object') continue;
      for (const copy of fn.skills || []) {
        if (copy.id !== skillId) continue;
        for (const key of FUNCTION_SKILL_FIELDS) if (key in patch) copy[key] = patch[key];
      }
    }
  }
}

/** Roles that use a skill: `role.skills` (canonical), plus any older skill timeline mappings. */
export function skillRoleIds(d: Draft, skillId: string): string[] {
  return [...new Set([...referrerIds(d.roles, 'skills', skillId), ...mappedRoles(d, 'skill', skillId)])];
}

/** Sets which roles use a skill — writes `role.skills` and drops skill mappings to roles no longer wanted. */
export function setSkillRoles(d: Draft, ids: IdAlloc, skillId: string, roleIds: string[]) {
  setReferrers(d.roles, 'skills', skillId, roleIds);
  syncRoleMappings(d, ids, 'skill', (m) => m.entity_id === skillId, roleIds.map((r) => [skillId, r]), false);
}

/** Function ids (across all capabilities) whose nested skills include this skill. */
export function skillFunctionIds(d: Draft, skillId: string): string[] {
  const out: string[] = [];
  for (const capability of d.capabilities || []) {
    for (const fn of capability.functions || []) {
      if (fn && typeof fn === 'object' && (fn.skills || []).some((s: any) => s?.id === skillId)) out.push(fn.id);
    }
  }
  return out;
}

/** Sets which capability functions carry this skill (as a copy of the index entry). */
export function setSkillFunctions(d: Draft, skillId: string, functionIds: string[]) {
  const wanted = new Set(functionIds);
  const skill = (d.skills_index || []).find((s: any) => s.id === skillId);
  for (const capability of d.capabilities || []) {
    for (const fn of capability.functions || []) {
      if (!fn || typeof fn !== 'object') continue;
      const skills: any[] = Array.isArray(fn.skills) ? fn.skills : [];
      const has = skills.some((s: any) => s?.id === skillId);
      if (wanted.has(fn.id) && !has && skill) fn.skills = [...skills, toFunctionSkill(skill)];
      else if (!wanted.has(fn.id) && has) fn.skills = skills.filter((s: any) => s?.id !== skillId);
    }
  }
}

export function deleteSkill(d: Draft, skillId: string) {
  d.skills_index = (d.skills_index || []).filter((s: any) => s.id !== skillId);
  purgeReferences(d, new Set([skillId]));
}

// ---------------------------------------------------------------------------
// Capabilities -> functions -> skills
// ---------------------------------------------------------------------------

export function addCapability(d: Draft, ids: IdAlloc, fields: any = {}) {
  const capability = { name: '', description: '', maturity_level: '', functions: [], ...fields, id: ids('CAP') };
  list(d, 'capabilities').push(capability);
  return capability.id as string;
}

export function updateCapability(d: Draft, capabilityId: string, patch: any) {
  const capability = (d.capabilities || []).find((c: any) => c.id === capabilityId);
  if (capability) Object.assign(capability, patch);
}

/**
 * Capabilities have no role field of their own: a capability <-> role link is a
 * `capability` timeline mapping. (Deliverables' `capability_alignment` is separate,
 * finer-grained evidence — see capabilityDeliverables.)
 */
export function capabilityRoleIds(d: Draft, capabilityId: string): string[] {
  return [...new Set(mappedRoles(d, 'capability', capabilityId))];
}

export function setCapabilityRoles(d: Draft, ids: IdAlloc, capabilityId: string, roleIds: string[]) {
  syncRoleMappings(d, ids, 'capability', (m) => m.entity_id === capabilityId, [...new Set(roleIds)].map((r) => [capabilityId, r]));
}

/** The role-side view of the same link. */
export function roleCapabilityIds(d: Draft, roleId: string): string[] {
  return [
    ...new Set<string>(
      (d.links?.timeline_mappings || []).filter((m: any) => m.entity_type === 'capability' && m.role_id === roleId).map((m: any) => m.entity_id)
    ),
  ];
}

export function setRoleCapabilities(d: Draft, ids: IdAlloc, roleId: string, capabilityIds: string[]) {
  syncRoleMappings(d, ids, 'capability', (m) => m.role_id === roleId, [...new Set(capabilityIds)].map((c) => [c, roleId]));
}

/** Deliverables aligned to a capability, with the project and role they sit under. */
export function capabilityDeliverables(d: Draft, capabilityId: string) {
  const out: { role: any; initiative: any; deliverable: any }[] = [];
  for (const role of d.roles || []) {
    for (const initiative of role.initiatives || []) {
      for (const deliverable of initiative.deliverables || []) {
        if ((deliverable.capability_alignment || []).includes(capabilityId)) out.push({ role, initiative, deliverable });
      }
    }
  }
  return out;
}

export function deleteCapability(d: Draft, capabilityId: string) {
  const capability = (d.capabilities || []).find((c: any) => c.id === capabilityId);
  if (!capability) return;
  const removed = new Set<string>([capabilityId]);
  for (const fn of capability.functions || []) if (fn && typeof fn === 'object') removed.add(fn.id);
  d.capabilities = d.capabilities.filter((c: any) => c.id !== capabilityId);
  purgeReferences(d, removed);
}

export function addFunction(d: Draft, ids: IdAlloc, capabilityId: string, fields: any = {}) {
  const capability = (d.capabilities || []).find((c: any) => c.id === capabilityId);
  if (!capability) return null;
  if (!Array.isArray(capability.functions)) capability.functions = [];
  const fn = { name: '', description: '', competency_level: '', value_stream_stage: '', skills: [], ...fields, id: ids('FUNC') };
  capability.functions.push(fn);
  return fn.id as string;
}

/** Turns a legacy bare function-id string into a full function object in place. */
export function upgradeLegacyFunction(d: Draft, capabilityId: string, functionId: string) {
  const capability = (d.capabilities || []).find((c: any) => c.id === capabilityId);
  if (!capability) return;
  capability.functions = (capability.functions || []).map((fn: any) => {
    if (fn !== functionId) return fn;
    const legacy = (d.functions || []).find((f: any) => f.id === functionId);
    return { id: functionId, name: legacy?.name || '', description: legacy?.description || '', competency_level: '', value_stream_stage: '', skills: [] };
  });
}

export function updateFunction(d: Draft, functionId: string, patch: any) {
  const found = findFunction(d, functionId);
  if (found) Object.assign(found.fn, patch);
}

export function deleteFunction(d: Draft, functionId: string) {
  for (const capability of d.capabilities || []) {
    capability.functions = (capability.functions || []).filter((f: any) => (typeof f === 'object' ? f?.id : f) !== functionId);
  }
  purgeReferences(d, new Set([functionId]));
}

/** Sets a function's skills from skills_index ids, copying the shared fields. */
export function setFunctionSkills(d: Draft, functionId: string, skillIds: string[]) {
  const found = findFunction(d, functionId);
  if (!found) return;
  const index = new Map<string, any>((d.skills_index || []).map((s: any) => [s.id, s]));
  const existing = new Map<string, any>((found.fn.skills || []).map((s: any) => [s.id, s]));
  found.fn.skills = skillIds
    .map((id) => (index.has(id) ? toFunctionSkill(index.get(id)) : existing.get(id)))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Flat top-level lists: education, certifications, methodologies, customer_engagements
// ---------------------------------------------------------------------------

export type FlatListKey = 'education' | 'certifications' | 'methodologies' | 'customer_engagements';

export const FLAT_LIST_PREFIX: Record<FlatListKey, IdPrefix> = {
  education: 'EDU',
  certifications: 'CERT',
  methodologies: 'METH',
  customer_engagements: 'ENG',
};

const FLAT_LIST_DEFAULTS: Record<FlatListKey, any> = {
  education: { institution: '', program: '', capability_alignment: [], skills_reinforced: [], achievements: [] },
  certifications: { name: '' },
  methodologies: { name: '', description: '', context: '' },
  customer_engagements: { client: '', project: '', description: '', dates: '', display: true },
};

export function addListItem(d: Draft, ids: IdAlloc, key: FlatListKey, fields: any = {}) {
  const item = { ...FLAT_LIST_DEFAULTS[key], ...fields, id: ids(FLAT_LIST_PREFIX[key]) };
  list(d, key).push(item);
  return item.id as string;
}

export function updateListItem(d: Draft, key: FlatListKey, id: string, patch: any) {
  const item = (d[key] || []).find((x: any) => x.id === id);
  if (item) Object.assign(item, patch);
}

export function deleteListItem(d: Draft, key: FlatListKey, id: string) {
  d[key] = (d[key] || []).filter((x: any) => x.id !== id);
  purgeReferences(d, new Set([id]));
}

// ---------------------------------------------------------------------------
// Person
// ---------------------------------------------------------------------------

export function updatePerson(d: Draft, patch: any) {
  d.person = { ...(d.person || {}), ...patch };
}

export function updatePositioning(d: Draft, patch: any) {
  d.person = { ...(d.person || {}), positioning: { ...(d.person?.positioning || {}), ...patch } };
}
