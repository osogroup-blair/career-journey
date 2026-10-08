import { EvidenceRef } from '../types';

/** A Career Journey item an EvidenceRef points at, as a short label + snippet, or null when the id doesn't exist. */
export function resolveEvidenceRef(careerJourney: any, ref: EvidenceRef): { label: string; snippet: string } | null {
  if (!careerJourney) return null;
  if (ref.type === 'role') {
    const role = (careerJourney.roles || []).find((r: any) => r.id === ref.id);
    if (!role) return null;
    return { label: `Role — ${role.title || role.id}`, snippet: `${role.organization || role.company || ''} ${role.dates || ''}`.trim() };
  }
  if (ref.type === 'deliverable') {
    for (const role of careerJourney.roles || []) {
      for (const initiative of role.initiatives || []) {
        const d = (initiative.deliverables || []).find((d: any) => d.id === ref.id);
        if (d) return { label: `Deliverable — ${role.title || role.id}`, snippet: d.description || d.impact || ref.id };
      }
    }
    return null;
  }
  if (ref.type === 'achievement') {
    const a = (careerJourney.achievements || []).find((a: any) => a.id === ref.id);
    if (!a) return null;
    return { label: 'Achievement', snippet: a.description || a.title || ref.id };
  }
  if (ref.type === 'skill') {
    const s = (careerJourney.skills_index || []).find((s: any) => s.id === ref.id);
    if (!s) return null;
    return { label: 'Skill', snippet: `${s.name}${s.proficiency ? ` — ${s.proficiency}` : ''}${s.years_experience ? `, ${s.years_experience}y` : ''}` };
  }
  if (ref.type === 'education') {
    const e = (careerJourney.education || []).find((e: any) => e.id === ref.id);
    if (!e) return null;
    return { label: 'Education', snippet: `${e.institution || ''} ${e.degree || ''}`.trim() || ref.id };
  }
  return null;
}

const EVIDENCE_TYPES: EvidenceRef['type'][] = ['achievement', 'deliverable', 'skill', 'role', 'education'];

/**
 * The ref with its type corrected when the model got the id right but the
 * type wrong (it often labels a deliverable an achievement), or null when no
 * Career Journey item has that id — so callers never show or trust a phantom citation.
 */
export function verifiedEvidenceRef(careerJourney: any, ref: { type?: string; id?: string } | null | undefined): EvidenceRef | null {
  const id = typeof ref?.id === 'string' ? ref.id.trim() : '';
  if (!id) return null;
  const given = EVIDENCE_TYPES.find((t) => t === ref?.type);
  for (const type of given ? [given, ...EVIDENCE_TYPES.filter((t) => t !== given)] : EVIDENCE_TYPES) {
    if (resolveEvidenceRef(careerJourney, { type, id })) return { type, id };
  }
  return null;
}
