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
