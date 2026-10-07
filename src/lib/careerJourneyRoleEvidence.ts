import { CareerJourney } from '../types/careerJourney';

/**
 * Achievements linked to a role live at the top level (`achievements[]`, matched via
 * `role_ids` or a `links.timeline_mappings` entry) — not embedded on the role. This
 * resolves "what should the role editor show" without the UI needing to know that.
 */
export function getRoleAchievements(careerJourney: CareerJourney, roleId: string) {
  const viaRoleIds = new Set(
    (careerJourney.achievements || [])
      .filter((a: any) => Array.isArray(a.role_ids) && a.role_ids.includes(roleId))
      .map((a: any) => a.id)
  );
  const viaLinks = new Set(
    (careerJourney.links?.timeline_mappings || [])
      .filter((m: any) => m.entity_type === 'achievement' && m.role_id === roleId)
      .map((m: any) => m.entity_id)
  );
  const ids = new Set([...viaRoleIds, ...viaLinks]);
  return (careerJourney.achievements || []).filter((a: any) => ids.has(a.id));
}

/** Deliverables live nested under roles[].initiatives[].deliverables[] — flattened here for display. */
export function getRoleDeliverables(careerJourney: CareerJourney, roleId: string) {
  const role = (careerJourney.roles || []).find((r: any) => r.id === roleId);
  if (!role) return [];
  const out: any[] = [];
  for (const initiative of role.initiatives || []) {
    for (const deliverable of initiative.deliverables || []) {
      out.push({ ...deliverable, initiativeId: initiative.id, initiativeName: initiative.name });
    }
  }
  return out;
}

/**
 * A role with its evidence resolved for display: achievements and deliverables as
 * objects (from the top-level/nested model, plus any legacy embedded objects), skill
 * ids turned into names, and the legacy display fields (summary, industry) falling
 * back to their real-schema equivalents. Real data stores role.achievements and
 * role.skills as id strings, so reading them raw shows "ACH-151" / "SK-162".
 */
export function toRoleView(careerJourney: CareerJourney, role: any) {
  const legacyObjects = (list: any) => (Array.isArray(list) ? list.filter((x: any) => x && typeof x === 'object') : []);
  const achievementIds = new Set<string>((Array.isArray(role.achievements) ? role.achievements : []).filter((x: any) => typeof x === 'string'));
  const byId = new Map<string, any>((careerJourney.achievements || []).map((a: any) => [a.id, a]));
  const linked = getRoleAchievements(careerJourney, role.id);
  const linkedIds = new Set(linked.map((a: any) => a.id));
  const fromRoleIds = [...achievementIds].filter((id) => !linkedIds.has(id) && byId.has(id)).map((id) => byId.get(id));
  const skillById = new Map<string, any>((careerJourney.skills_index || []).map((s: any) => [s.id, s]));
  const industry =
    role.industry ||
    (careerJourney.links?.industries || []).find((l: any) => (l.entity_id || l.role_id) === role.id)?.industry;

  return {
    ...role,
    summary: role.summary || role.description,
    industry,
    skills: (Array.isArray(role.skills) ? role.skills : []).map((s: any) => (typeof s === 'string' ? skillById.get(s)?.name || s : s)),
    achievements: [...linked, ...fromRoleIds, ...legacyObjects(role.achievements)],
    deliverables: [...getRoleDeliverables(careerJourney, role.id), ...legacyObjects(role.deliverables)],
  };
}
