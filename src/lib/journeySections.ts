import { computeJourneyGaps } from './careerJourneyGaps';
import { achievementRoleIds } from './journeyMutations';

/**
 * The Career Journey editor's section registry: what each section lists, how an entity
 * is titled/subtitled, which facets it can be filtered by, and the lowercased text the
 * search matches against (including names resolved through ids — searching a role's
 * company finds its projects and achievements too).
 *
 * Pure and React-free so search and the AI assistant's duplicate check can share it.
 */

export type SectionId =
  | 'profile'
  | 'roles'
  | 'projects'
  | 'achievements'
  | 'skills'
  | 'capabilities'
  | 'education'
  | 'certifications'
  | 'methodologies'
  | 'engagements';

export interface FacetDef {
  key: string;
  label: string;
}

export interface SectionDef {
  id: SectionId;
  label: string;
  singular: string;
  description: string;
  /** False for single-form sections (Profile). */
  list: boolean;
  facets: FacetDef[];
}

export interface SectionItem {
  id: string;
  section: SectionId;
  title: string;
  subtitle: string;
  badges: string[];
  /** Lowercased haystack for search: ids, fields and resolved names. */
  text: string;
  facets: Record<string, string[]>;
  /** Short reason this item is flagged, from careerJourneyGaps plus a few structural checks. */
  attention?: string;
}

export const SECTIONS: SectionDef[] = [
  { id: 'profile', label: 'Profile', singular: 'Profile', description: 'Contact details, summary and positioning.', list: false, facets: [] },
  {
    id: 'roles',
    label: 'Roles',
    singular: 'Role',
    description: 'Every position you have held. Projects and achievements hang off these.',
    list: true,
    facets: [{ key: 'organization', label: 'Company' }],
  },
  {
    id: 'projects',
    label: 'Projects',
    singular: 'Project',
    description: 'Initiatives within a role, each with the deliverables you shipped.',
    list: true,
    facets: [{ key: 'role', label: 'Role' }],
  },
  {
    id: 'achievements',
    label: 'Achievements',
    singular: 'Achievement',
    description: 'Outcomes you can point to, linked to the roles where they happened.',
    list: true,
    facets: [
      { key: 'role', label: 'Role' },
      { key: 'category', label: 'Category' },
    ],
  },
  {
    id: 'skills',
    label: 'Skills',
    singular: 'Skill',
    description: 'The master skills index. Capabilities, projects and achievements reference these by id.',
    list: true,
    facets: [
      { key: 'category', label: 'Category' },
      { key: 'proficiency', label: 'Proficiency' },
    ],
  },
  {
    id: 'capabilities',
    label: 'Capabilities',
    singular: 'Capability',
    description: 'What you can do, broken into functions and the skills behind them.',
    list: true,
    facets: [{ key: 'maturity', label: 'Maturity' }],
  },
  { id: 'education', label: 'Education', singular: 'Education entry', description: 'Schools, programs and coursework.', list: true, facets: [] },
  { id: 'certifications', label: 'Certifications', singular: 'Certification', description: 'Credentials and certificates.', list: true, facets: [] },
  { id: 'methodologies', label: 'Methodologies', singular: 'Methodology', description: 'Frameworks and methods you practise.', list: true, facets: [] },
  {
    id: 'engagements',
    label: 'Client Engagements',
    singular: 'Client engagement',
    description: 'Client-facing projects, shown on resumes when marked for display.',
    list: true,
    facets: [],
  },
];

export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s])) as Record<SectionId, SectionDef>;

export function isSectionId(value: string | null | undefined): value is SectionId {
  return !!value && value in SECTION_BY_ID;
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
const str = (v: any) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const haystack = (...parts: any[]) =>
  parts
    .flat(Infinity)
    .map(str)
    .filter(Boolean)
    .join(' \u0001 ')
    .toLowerCase();

export function roleLabel(role: any) {
  if (!role) return '';
  const org = role.organization || role.company;
  return [role.title, org].filter(Boolean).join(' @ ') || role.id;
}

/** Id -> display name lookups shared by the item builders, editors and pickers. */
export interface JourneyLookups {
  roleById: Map<string, any>;
  skillById: Map<string, any>;
  capabilityById: Map<string, any>;
  initiativeRole: Map<string, any>;
  name: (id: string) => string;
}

export function buildLookups(cj: any): JourneyLookups {
  const roleById = new Map<string, any>((cj?.roles || []).map((r: any) => [r.id, r]));
  const skillById = new Map<string, any>((cj?.skills_index || []).map((s: any) => [s.id, s]));
  const capabilityById = new Map<string, any>((cj?.capabilities || []).map((c: any) => [c.id, c]));
  const initiativeRole = new Map<string, any>();
  for (const role of cj?.roles || []) for (const i of role.initiatives || []) initiativeRole.set(i.id, role);
  const name = (id: string) =>
    skillById.get(id)?.name || capabilityById.get(id)?.name || (roleById.has(id) ? roleLabel(roleById.get(id)) : '') || id;
  return { roleById, skillById, capabilityById, initiativeRole, name };
}

const GAP_LABEL: Record<string, string> = {
  'achievement-metric': 'No metric',
  'skill-stale': 'Last used missing or old',
  'role-thin': 'Thin description',
};

export function buildSectionItems(cj: any): Record<SectionId, SectionItem[]> {
  const out = Object.fromEntries(SECTIONS.map((s) => [s.id, [] as SectionItem[]])) as Record<SectionId, SectionItem[]>;
  if (!cj) return out;
  const lk = buildLookups(cj);
  const attention = new Map<string, string>();
  try {
    for (const gap of computeJourneyGaps(cj)) attention.set(gap.entityId, GAP_LABEL[gap.type] || 'Needs attention');
  } catch {
    // Gap detection is advisory — never let a malformed entity break the editor.
  }
  const names = (ids: any) => (Array.isArray(ids) ? ids.map((id) => lk.name(str(id))) : []);

  // Reverse indexes: where is each skill used?
  const skillUse = new Map<string, Set<string>>();
  const use = (skillId: string, where: string) => {
    if (!skillUse.has(skillId)) skillUse.set(skillId, new Set());
    skillUse.get(skillId)!.add(where);
  };

  for (const role of cj.roles || []) {
    const org = role.organization || role.company || '';
    for (const id of role.skills || []) use(str(id), roleLabel(role));
    out.roles.push({
      id: role.id,
      section: 'roles',
      title: role.title || 'Untitled role',
      subtitle: [org, role.dates || [role.start_date, role.end_date].filter(Boolean).join(' - ')].filter(Boolean).join(' · '),
      badges: [plural((role.initiatives || []).length, 'project')],
      text: haystack(role.id, role.title, org, role.location, role.dates, role.description, role.positioning_note, role.company_descriptor, names(role.skills)),
      facets: { organization: org ? [org] : [] },
      attention: attention.get(role.id),
    });

    for (const initiative of role.initiatives || []) {
      const deliverables = initiative.deliverables || [];
      for (const d of deliverables) for (const id of d.skill_ids || []) use(str(id), initiative.name || initiative.id);
      out.projects.push({
        id: initiative.id,
        section: 'projects',
        title: initiative.name || 'Untitled project',
        subtitle: roleLabel(role),
        badges: [plural(deliverables.length, 'deliverable')],
        text: haystack(
          initiative.id,
          initiative.name,
          initiative.description,
          roleLabel(role),
          deliverables.map((d: any) => [d.id, d.description, d.impact, names(d.skill_ids), names(d.capability_alignment)])
        ),
        facets: { role: [role.id] },
        attention: deliverables.length === 0 ? 'No deliverables' : undefined,
      });
    }
  }

  for (const ach of cj.achievements || []) {
    const roleIds = achievementRoleIds(cj, ach.id);
    for (const id of ach.skill_ids || []) use(str(id), ach.title || ach.id);
    out.achievements.push({
      id: ach.id,
      section: 'achievements',
      title: ach.title || 'Untitled achievement',
      subtitle: roleIds.map((id) => roleLabel(lk.roleById.get(id)) || id).join(', ') || 'Not linked to a role',
      badges: ach.category ? [ach.category] : [],
      text: haystack(ach.id, ach.title, ach.description, ach.category, roleIds.map((id) => roleLabel(lk.roleById.get(id))), names(ach.skill_ids)),
      facets: { role: roleIds, category: ach.category ? [ach.category] : [] },
      attention: attention.get(ach.id) || (roleIds.length === 0 ? 'Not linked to a role' : undefined),
    });
  }

  for (const cap of cj.capabilities || []) {
    const fns = (cap.functions || []).filter((f: any) => f && typeof f === 'object');
    for (const fn of fns) for (const s of fn.skills || []) use(str(s.id), `${cap.name} › ${fn.name}`);
    out.capabilities.push({
      id: cap.id,
      section: 'capabilities',
      title: cap.name || 'Untitled capability',
      subtitle: `${(cap.functions || []).length} functions · ${fns.reduce((n: number, f: any) => n + (f.skills || []).length, 0)} skills`,
      badges: cap.maturity_level ? [cap.maturity_level] : [],
      text: haystack(cap.id, cap.name, cap.description, cap.maturity_level, fns.map((f: any) => [f.id, f.name, f.description, (f.skills || []).map((s: any) => s.name)])),
      facets: { maturity: cap.maturity_level ? [cap.maturity_level] : [] },
      attention: (cap.functions || []).length === 0 ? 'No functions' : undefined,
    });
  }

  for (const skill of cj.skills_index || []) {
    const usedIn = [...(skillUse.get(skill.id) || [])];
    out.skills.push({
      id: skill.id,
      section: 'skills',
      title: skill.name || 'Untitled skill',
      subtitle: [skill.category, skill.years_experience != null ? `${skill.years_experience} yrs` : '', skill.last_used ? `last used ${skill.last_used}` : '']
        .filter(Boolean)
        .join(' · '),
      badges: skill.proficiency ? [skill.proficiency] : [],
      text: haystack(skill.id, skill.name, skill.category, skill.proficiency, skill.description, skill.last_used, usedIn),
      facets: { category: skill.category ? [skill.category] : [], proficiency: skill.proficiency ? [skill.proficiency] : [] },
      attention: attention.get(skill.id) || (usedIn.length === 0 ? 'Not used anywhere' : undefined),
    });
  }

  for (const edu of cj.education || []) {
    out.education.push({
      id: edu.id,
      section: 'education',
      title: [edu.program, edu.degree_type].filter(Boolean).join(' — ') || edu.institution || 'Untitled entry',
      subtitle: [edu.institution, [edu.start, edu.end].filter(Boolean).join(' - ') || edu.dates].filter(Boolean).join(' · '),
      badges: edu.completion_status ? [edu.completion_status.length > 24 ? 'Status noted' : edu.completion_status] : [],
      text: haystack(edu.id, edu.institution, edu.program, edu.degree_type, edu.location, edu.description, edu.achievements, names(edu.capability_alignment), names(edu.skills_reinforced)),
      facets: {},
    });
  }

  for (const cert of cj.certifications || []) {
    out.certifications.push({
      id: cert.id,
      section: 'certifications',
      title: cert.name || cert.title || 'Untitled certification',
      subtitle: [cert.issuer, cert.date].filter(Boolean).join(' · '),
      badges: [],
      text: haystack(cert.id, cert.name, cert.title, cert.issuer, cert.date, cert.url),
      facets: {},
    });
  }

  for (const meth of cj.methodologies || []) {
    out.methodologies.push({
      id: meth.id,
      section: 'methodologies',
      title: meth.name || 'Untitled methodology',
      subtitle: meth.context || '',
      badges: [],
      text: haystack(meth.id, meth.name, meth.description, meth.context),
      facets: {},
    });
  }

  for (const eng of cj.customer_engagements || []) {
    out.engagements.push({
      id: eng.id,
      section: 'engagements',
      title: [eng.client, eng.project].filter(Boolean).join(' — ') || 'Untitled engagement',
      subtitle: eng.dates || '',
      badges: eng.display === false ? ['Hidden on resumes'] : [],
      text: haystack(eng.id, eng.client, eng.project, eng.description, eng.dates),
      facets: {},
    });
  }

  return out;
}

/** Distinct facet values for a section, most common first. */
export function facetValues(items: SectionItem[], key: string): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) for (const v of item.facets[key] || []) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Which section an entity id belongs to — for deep links that only know an id. */
export function sectionForId(items: Record<SectionId, SectionItem[]>, id: string): SectionId | null {
  for (const section of SECTIONS) if (items[section.id].some((i) => i.id === id)) return section.id;
  return null;
}

const ENTITY_SECTION: Record<string, SectionId> = {
  role: 'roles',
  initiative: 'projects',
  project: 'projects',
  achievement: 'achievements',
  skill: 'skills',
  capability: 'capabilities',
  education: 'education',
  certification: 'certifications',
  methodology: 'methodologies',
  engagement: 'engagements',
};

/**
 * Route to the Simple editor with one entity open, e.g. `/edit?section=skills&item=SK-001`.
 * Deliverables have no section of their own, so they open their project.
 */
export function editPathFor(cj: any, entityType: string, id: string): string {
  let section = ENTITY_SECTION[entityType];
  let item = id;
  if (entityType === 'deliverable') {
    section = 'projects';
    for (const role of cj?.roles || []) {
      for (const initiative of role.initiatives || []) {
        if ((initiative.deliverables || []).some((d: any) => d.id === id)) item = initiative.id;
      }
    }
  }
  if (!section) return '/edit';
  return `/edit?${new URLSearchParams({ section, item }).toString()}`;
}
