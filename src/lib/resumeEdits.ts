import { EarlierExperienceEntry, GeneratedResume, ResumeExperienceEntry } from '../types';
import { condensedRoleDates, resolveExperienceRoleId, rolesRecentFirst } from './resumeBuild';

/**
 * Immutable edits for the tailored-resume preview. Every helper returns a new
 * resume and never touches the one passed in (it's the persisted store
 * object), so templates can call these straight from their onUpdate handlers.
 */

type Bullet = ResumeExperienceEntry['bullets'][number];

/** Bullets generated before evidenceRefs existed are bare strings in older persisted resumes. */
export function normalizeBullet(b: Bullet | string): Bullet {
  return typeof b === 'string' ? { text: b } : b;
}

function withRole(resume: GeneratedResume, roleIndex: number, edit: (entry: ResumeExperienceEntry) => ResumeExperienceEntry): GeneratedResume {
  const entry = resume.experience?.[roleIndex];
  if (!entry) return resume;
  const experience = [...resume.experience];
  experience[roleIndex] = edit(entry);
  return { ...resume, experience };
}

function move<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function updateBullet(resume: GeneratedResume, roleIndex: number, bulletIndex: number, text: string): GeneratedResume {
  return withRole(resume, roleIndex, (entry) => {
    const bullets = [...(entry.bullets || [])];
    if (bulletIndex < 0 || bulletIndex >= bullets.length) return entry;
    bullets[bulletIndex] = { ...normalizeBullet(bullets[bulletIndex]), text };
    return { ...entry, bullets };
  });
}

export function removeBullet(resume: GeneratedResume, roleIndex: number, bulletIndex: number): GeneratedResume {
  return withRole(resume, roleIndex, (entry) => ({ ...entry, bullets: (entry.bullets || []).filter((_, i) => i !== bulletIndex) }));
}

export function moveBullet(resume: GeneratedResume, roleIndex: number, bulletIndex: number, delta: number): GeneratedResume {
  return withRole(resume, roleIndex, (entry) => ({ ...entry, bullets: move(entry.bullets || [], bulletIndex, delta) }));
}

export function addBullet(resume: GeneratedResume, roleIndex: number, text = 'New bullet — click to edit'): GeneratedResume {
  return withRole(resume, roleIndex, (entry) => ({ ...entry, bullets: [...(entry.bullets || []), { text }] }));
}

export function moveRole(resume: GeneratedResume, roleIndex: number, delta: number): GeneratedResume {
  return { ...resume, experience: move(resume.experience || [], roleIndex, delta) };
}

export function removeRole(resume: GeneratedResume, roleIndex: number): GeneratedResume {
  return { ...resume, experience: (resume.experience || []).filter((_, i) => i !== roleIndex) };
}

/** Keeps earlierExperience in Career Journey recency order (unknown roles last). */
function sortEarlier(entries: EarlierExperienceEntry[], careerJourney: any): EarlierExperienceEntry[] {
  const order = new Map<string, number>(rolesRecentFirst(careerJourney).map((r, i) => [r.id, i]));
  return [...entries].sort((a, b) => (order.get(a.roleId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.roleId) ?? Number.MAX_SAFE_INTEGER));
}

/** Moves a full role down to a one-line Earlier Experience entry, keeping the full entry so it can be restored. */
export function condenseRole(resume: GeneratedResume, roleIndex: number, careerJourney: any): GeneratedResume {
  const entry = resume.experience?.[roleIndex];
  if (!entry) return resume;
  const roleId = resolveExperienceRoleId(entry, careerJourney);
  const role = roleId ? (careerJourney?.roles || []).find((r: any) => r.id === roleId) : null;
  const earlier: EarlierExperienceEntry = {
    roleId: roleId || entry.roleId || '',
    company: entry.company,
    title: role?.title || entry.title,
    dates: role ? condensedRoleDates(role) : entry.dates,
    restorable: { ...entry, ...(roleId ? { roleId } : {}) },
  };
  const others = (resume.earlierExperience || []).filter((e) => !earlier.roleId || e.roleId !== earlier.roleId);
  return { ...removeRole(resume, roleIndex), earlierExperience: sortEarlier([...others, earlier], careerJourney) };
}

export function removeEarlier(resume: GeneratedResume, index: number): GeneratedResume {
  return { ...resume, earlierExperience: (resume.earlierExperience || []).filter((_, i) => i !== index) };
}

/** Inserts an entry by Career Journey recency, leaving the user's manual order of everything else alone. */
function insertByRecency(experience: ResumeExperienceEntry[], entry: ResumeExperienceEntry, careerJourney: any): ResumeExperienceEntry[] {
  const order = new Map<string, number>(rolesRecentFirst(careerJourney).map((r, i) => [r.id, i]));
  const rank = (e: ResumeExperienceEntry) => order.get(resolveExperienceRoleId(e, careerJourney) || '') ?? Number.MAX_SAFE_INTEGER;
  const next = [...experience];
  const at = next.findIndex((e) => rank(e) > rank(entry));
  next.splice(at === -1 ? next.length : at, 0, entry);
  return next;
}

/** Puts a condensed role's kept full entry back into Experience. No-op when there's nothing kept. */
export function restoreEarlier(resume: GeneratedResume, index: number, careerJourney: any): GeneratedResume {
  const entry = resume.earlierExperience?.[index];
  if (!entry?.restorable) return resume;
  return { ...removeEarlier(resume, index), experience: insertByRecency(resume.experience || [], entry.restorable, careerJourney) };
}

/** Replaces one role's experience entry — or inserts it, for a role that was condensed — and drops its Earlier Experience line. Used by section regenerate. */
export function replaceRoleEntry(resume: GeneratedResume, roleId: string, entry: ResumeExperienceEntry, careerJourney: any): GeneratedResume {
  const earlierExperience = (resume.earlierExperience || []).filter((e) => e.roleId !== roleId);
  const existing = (resume.experience || []).findIndex((e) => resolveExperienceRoleId(e, careerJourney) === roleId);
  if (existing === -1) {
    return { ...resume, earlierExperience, experience: insertByRecency(resume.experience || [], { ...entry, roleId }, careerJourney) };
  }
  const experience = [...resume.experience];
  experience[existing] = { ...entry, roleId };
  return { ...resume, experience, earlierExperience };
}
