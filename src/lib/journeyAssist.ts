import * as m from './journeyMutations';
import type { IdAlloc } from './journeyMutations';
import { computeNextVersion, versionChangesKey } from './careerJourneyIds';
import { roleLabel, SECTION_BY_ID, type SectionId } from './journeySections';

/**
 * The per-section AI assistant on /edit, minus the network call. Shared by
 * server.ts (/api/ai/journeySectionAssist builds context and cleans the model's
 * proposals) and the client (duplicate checks, applying an accepted proposal).
 *
 * The model never assigns ids and can only link to ids that already exist —
 * sanitizeProposals drops anything else. New ids come from the sequential
 * allocator when the user accepts a proposal.
 */

export interface AssistMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A nested child: a deliverable (projects) or a function (capabilities). */
export interface ProposalChild {
  fields: Record<string, any>;
  skillIds: string[];
  capabilityIds: string[];
  newSkillNames: string[];
}

export interface SectionProposal {
  op: 'add' | 'update';
  /** Existing item id, for 'update'. */
  targetId: string | null;
  /** Role id a new project belongs to. */
  parentId: string | null;
  fields: Record<string, any>;
  roleIds: string[];
  skillIds: string[];
  capabilityIds: string[];
  /** Skills to create (deduplicated against the index by name) and link. */
  newSkillNames: string[];
  children: ProposalChild[];
  /** Profile list fields to append to (signature_outcomes, narrative_anchors, target_role_families). */
  appendLists: Record<string, string[]>;
  rationale: string;
}

export interface SectionAssistResponse {
  reply: string;
  proposals: SectionProposal[];
  followUpQuestion: string | null;
}

// ---------------------------------------------------------------------------
// What each section's proposals may contain
// ---------------------------------------------------------------------------

export interface SectionSpec {
  fields: Record<string, string>;
  numberFields?: string[];
  links: ('roleIds' | 'skillIds' | 'capabilityIds')[];
  children?: { label: string; fields: Record<string, string>; links: ('skillIds' | 'capabilityIds')[] };
  appendLists?: Record<string, string>;
  /** Can the assistant add new items here (false for Profile, which is a single record). */
  canAdd: boolean;
  needsParentRole?: boolean;
}

export const SECTION_SPECS: Record<SectionId, SectionSpec> = {
  profile: {
    fields: {
      summary: 'Professional summary paragraph',
      brand: 'One-line personal brand',
      work_preference: 'Work arrangement preference',
      primary_tagline: 'Positioning tagline',
      role_orientation: 'What kind of roles they orient toward',
    },
    links: [],
    appendLists: {
      signature_outcomes: 'Signature outcomes to add',
      narrative_anchors: 'Narrative anchors to add',
      target_role_families: 'Target role families to add',
    },
    canAdd: false,
  },
  roles: {
    fields: {
      title: 'Job title',
      organization: 'Company / organization',
      start_date: 'YYYY-MM',
      end_date: 'YYYY-MM or Present',
      location: 'City, region or Remote',
      description: 'Scope and accountabilities, 2-5 sentences',
      positioning_note: 'Optional note on how to position this role',
    },
    links: ['skillIds'],
    canAdd: true,
  },
  projects: {
    fields: { name: 'Project / initiative name', description: 'What the project was and why it mattered, 1-3 sentences' },
    links: [],
    children: {
      label: 'deliverables',
      fields: { description: 'What was delivered, past tense, specific', impact: 'Only an outcome the user actually stated, with their numbers; omit entirely if they gave none' },
      links: ['skillIds', 'capabilityIds'],
    },
    canAdd: true,
    needsParentRole: true,
  },
  achievements: {
    fields: { title: 'Short outcome headline', description: 'What happened and the result, 1-2 sentences', category: 'Category, reusing an existing one when it fits' },
    links: ['roleIds', 'skillIds'],
    canAdd: true,
  },
  skills: {
    fields: {
      name: 'Skill name',
      category: 'Category, reusing an existing one when it fits',
      proficiency: 'One of the proficiency levels',
      years_experience: 'Whole number of years, only if known',
      last_used: 'Present or a year',
      description: 'Optional one-line description',
    },
    numberFields: ['years_experience'],
    links: [],
    canAdd: true,
  },
  capabilities: {
    fields: { name: 'Capability name', description: 'What the capability covers', maturity_level: 'One of the maturity levels' },
    links: [],
    children: {
      label: 'functions',
      fields: { name: 'Function name', description: 'What this function involves', competency_level: 'One of the competency levels', value_stream_stage: 'One of the value stream stages' },
      links: ['skillIds'],
    },
    canAdd: true,
  },
  education: {
    fields: {
      institution: 'School',
      program: 'Program or field of study',
      degree_type: 'Degree type, e.g. BS, MBA, Coursework',
      start: 'Start year',
      end: 'End year',
      location: 'Location',
      description: 'What was studied or achieved',
      completion_status: 'Completed / in progress / not completed, with context',
    },
    links: [],
    canAdd: true,
  },
  certifications: {
    fields: { name: 'Certification name', issuer: 'Issuing body', date: 'YYYY-MM', status: 'Active / expired', url: 'Credential URL' },
    links: [],
    canAdd: true,
  },
  methodologies: {
    fields: { name: 'Methodology or framework', description: 'What it is', context: 'Where the user applied it' },
    links: [],
    canAdd: true,
  },
  engagements: {
    fields: { client: 'Client organization', project: 'Engagement / project name', dates: 'e.g. 2021-11 to 2022-02', description: 'What was done for the client' },
    links: [],
    canAdd: true,
  },
};

const LIST_KEY: Partial<Record<SectionId, m.FlatListKey>> = {
  education: 'education',
  certifications: 'certifications',
  methodologies: 'methodologies',
  engagements: 'customer_engagements',
};

// ---------------------------------------------------------------------------
// Context for the model
// ---------------------------------------------------------------------------

const clip = (v: any, n: number) => {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

/** Ids that already exist in a section — what an 'update' may target. */
export function sectionItemIds(cj: any, section: SectionId): Set<string> {
  switch (section) {
    case 'roles':
      return new Set<string>((cj?.roles || []).map((r: any) => r.id));
    case 'projects':
      return new Set<string>((cj?.roles || []).flatMap((r: any) => (r.initiatives || []).map((i: any) => i.id)));
    case 'achievements':
      return new Set<string>((cj?.achievements || []).map((a: any) => a.id));
    case 'skills':
      return new Set<string>((cj?.skills_index || []).map((s: any) => s.id));
    case 'capabilities':
      return new Set<string>((cj?.capabilities || []).map((c: any) => c.id));
    case 'profile':
      return new Set<string>(['profile']);
    default:
      return new Set<string>((cj?.[LIST_KEY[section]!] || []).map((x: any) => x.id));
  }
}

/** The existing items of a section, trimmed for the prompt (the model needs them to avoid duplicates). */
function existingItems(cj: any, section: SectionId): any {
  switch (section) {
    case 'profile': {
      const p = cj?.person || {};
      return {
        name: p.name,
        brand: p.brand,
        summary: p.summary,
        work_preference: p.work_preference,
        positioning: p.positioning,
        signature_outcomes: p.signature_outcomes,
      };
    }
    case 'roles':
      return (cj?.roles || []).map((r: any) => ({ id: r.id, title: r.title, organization: r.organization || r.company, dates: r.dates, description: clip(r.description, 400) }));
    case 'projects':
      return (cj?.roles || []).flatMap((r: any) =>
        (r.initiatives || []).map((i: any) => ({
          id: i.id,
          roleId: r.id,
          name: i.name,
          description: clip(i.description, 200),
          deliverables: (i.deliverables || []).map((d: any) => clip(d.description, 120)),
        }))
      );
    case 'achievements':
      return (cj?.achievements || []).map((a: any) => ({ id: a.id, title: a.title, category: a.category, roleIds: m.achievementRoleIds(cj, a.id) }));
    case 'skills':
      return (cj?.skills_index || []).map((s: any) => ({ id: s.id, name: s.name, category: s.category, proficiency: s.proficiency }));
    case 'capabilities':
      return (cj?.capabilities || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        maturity_level: c.maturity_level,
        functions: (c.functions || []).filter((f: any) => f && typeof f === 'object').map((f: any) => f.name),
      }));
    case 'education':
      return (cj?.education || []).map((e: any) => ({ id: e.id, institution: e.institution, program: e.program, degree_type: e.degree_type, start: e.start, end: e.end }));
    case 'certifications':
      return (cj?.certifications || []).map((c: any) => ({ id: c.id, name: c.name, issuer: c.issuer, date: c.date }));
    case 'methodologies':
      return (cj?.methodologies || []).map((x: any) => ({ id: x.id, name: x.name, context: clip(x.context, 160) }));
    case 'engagements':
      return (cj?.customer_engagements || []).map((x: any) => ({ id: x.id, client: x.client, project: x.project, dates: x.dates }));
  }
}

/** Full record of one item the user asked about, for "help me improve this". */
function focusItem(cj: any, section: SectionId, id: string | null | undefined): any {
  if (!id) return null;
  switch (section) {
    case 'roles':
      return (cj?.roles || []).find((r: any) => r.id === id) ? { ...(cj.roles.find((r: any) => r.id === id)), initiatives: undefined } : null;
    case 'projects':
      return m.findInitiative(cj || {}, id)?.initiative || null;
    case 'achievements':
      return (cj?.achievements || []).find((a: any) => a.id === id) || null;
    case 'skills':
      return (cj?.skills_index || []).find((s: any) => s.id === id) || null;
    case 'capabilities':
      return (cj?.capabilities || []).find((c: any) => c.id === id) || null;
    case 'profile':
      return null;
    default:
      return (cj?.[LIST_KEY[section]!] || []).find((x: any) => x.id === id) || null;
  }
}

/**
 * A compact view of the journey for one section: that section's existing items in
 * full-enough detail to avoid duplicates, plus id->name lists for linking. The whole
 * document (hundreds of KB for a real journey) is never sent.
 */
export function buildSectionContext(cj: any, section: SectionId, focusItemId?: string | null) {
  const spec = SECTION_SPECS[section];
  const wantsRoles = section !== 'roles';
  const wantsSkills = spec.links.includes('skillIds') || !!spec.children?.links.includes('skillIds') || section === 'skills';
  const wantsCaps = !!spec.children?.links.includes('capabilityIds');
  return {
    section: SECTION_BY_ID[section].label,
    person: { name: cj?.person?.name, positioning: cj?.person?.positioning },
    existingItems: existingItems(cj, section),
    focusItem: focusItem(cj, section, focusItemId),
    // Descriptions (clipped) let the model spot skills/achievements implied by a role but not yet captured.
    roles: wantsRoles ? (cj?.roles || []).map((r: any) => ({ id: r.id, label: roleLabel(r), dates: r.dates, description: clip(r.description, 300) })) : undefined,
    skills: wantsSkills && section !== 'skills' ? (cj?.skills_index || []).map((s: any) => ({ id: s.id, name: s.name })) : undefined,
    capabilities: wantsCaps ? (cj?.capabilities || []).map((c: any) => ({ id: c.id, name: c.name })) : undefined,
    vocabularies: cj?.vocabularies,
  };
}

/** Section-specific output rules, appended after the (admin-editable) prompt so an override can't drop them. */
export function sectionGuidance(section: SectionId): string {
  const spec = SECTION_SPECS[section];
  const lines = [
    `## Output rules for the ${SECTION_BY_ID[section].label} section`,
    `Fields you may fill in "fields": ${Object.entries(spec.fields)
      .map(([k, v]) => `${k} (${v})`)
      .join('; ')}. Leave a field out rather than guessing.`,
  ];
  if (!spec.canAdd) lines.push(`This section is a single record: only use op "update" with targetId "profile".`);
  else lines.push(`Use op "add" for something new (targetId null). Use op "update" with the existing item's id from existingItems when the user is describing something already there — never add a duplicate.`);
  if (spec.needsParentRole) lines.push(`Every new project needs parentId set to the id of the role it belongs to, from the roles list.`);
  if (spec.links.includes('roleIds')) lines.push(`roleIds: ids from the roles list where this happened.`);
  if (spec.links.includes('skillIds') || spec.children?.links.includes('skillIds'))
    lines.push(`skillIds: ids from the skills list only. For a skill that isn't listed, put its name in newSkillNames instead.`);
  if (spec.children) {
    lines.push(
      `children are the item's ${spec.children.label}; each child's "fields" may contain: ${Object.entries(spec.children.fields)
        .map(([k, v]) => `${k} (${v})`)
        .join('; ')}.${spec.children.links.includes('capabilityIds') ? ' Child capabilityIds come from the capabilities list.' : ''}`
    );
  } else lines.push(`Leave children empty.`);
  if (spec.appendLists) lines.push(`appendLists keys: ${Object.entries(spec.appendLists).map(([k, v]) => `${k} (${v})`).join('; ')}.`);
  else lines.push(`Leave appendLists empty.`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Cleaning the model's output
// ---------------------------------------------------------------------------

const asString = (v: any) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const asStrings = (v: any): string[] => (Array.isArray(v) ? v.map(asString).filter(Boolean) : []);

function cleanFields(raw: any, allowed: Record<string, string>, numberFields: string[] = []): Record<string, any> {
  const out: Record<string, any> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(allowed)) {
    const v = raw[key];
    if (v == null) continue;
    if (numberFields.includes(key)) {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (Number.isFinite(n)) out[key] = n;
      continue;
    }
    const s = asString(v);
    if (s) out[key] = s;
  }
  return out;
}

const dedupe = (xs: string[]) => [...new Set(xs)];

/** Normalises the model's proposals: allowed fields only, existing link ids only, valid targets only. */
export function sanitizeProposals(section: SectionId, raw: any, cj: any): SectionProposal[] {
  const spec = SECTION_SPECS[section];
  const itemIds = sectionItemIds(cj, section);
  const roleIds = new Set<string>((cj?.roles || []).map((r: any) => r.id));
  const skillIds = new Set<string>((cj?.skills_index || []).map((s: any) => s.id));
  const capIds = new Set<string>((cj?.capabilities || []).map((c: any) => c.id));
  const keep = (ids: any, valid: Set<string>) => dedupe(asStrings(ids).filter((id) => valid.has(id)));

  const out: SectionProposal[] = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    if (!p || typeof p !== 'object') continue;
    let op: 'add' | 'update' = asString(p.op).toLowerCase() === 'update' ? 'update' : 'add';
    let targetId = asString(p.targetId) || null;
    if (!spec.canAdd) {
      op = 'update';
      targetId = 'profile';
    } else if (op === 'update' && (!targetId || !itemIds.has(targetId))) {
      continue; // an update to something that doesn't exist can't be applied safely
    }
    if (op === 'add') targetId = null;

    let parentId = asString(p.parentId) || null;
    if (spec.needsParentRole && parentId && !roleIds.has(parentId)) parentId = null;
    if (!spec.needsParentRole) parentId = null;

    const children: ProposalChild[] = spec.children
      ? (Array.isArray(p.children) ? p.children : [])
          .map((c: any) => ({
            fields: cleanFields(c?.fields, spec.children!.fields),
            skillIds: spec.children!.links.includes('skillIds') ? keep(c?.skillIds, skillIds) : [],
            capabilityIds: spec.children!.links.includes('capabilityIds') ? keep(c?.capabilityIds, capIds) : [],
            newSkillNames: spec.children!.links.includes('skillIds') ? dedupe(asStrings(c?.newSkillNames)) : [],
          }))
          .filter((c: ProposalChild) => Object.keys(c.fields).length > 0)
      : [];

    const appendLists: Record<string, string[]> = {};
    if (spec.appendLists && p.appendLists && typeof p.appendLists === 'object') {
      for (const key of Object.keys(spec.appendLists)) {
        const values = asStrings(p.appendLists[key]);
        if (values.length) appendLists[key] = values;
      }
    }

    const proposal: SectionProposal = {
      op,
      targetId,
      parentId,
      fields: cleanFields(p.fields, spec.fields, spec.numberFields),
      roleIds: spec.links.includes('roleIds') ? keep(p.roleIds, roleIds) : [],
      skillIds: spec.links.includes('skillIds') ? keep(p.skillIds, skillIds) : [],
      capabilityIds: spec.links.includes('capabilityIds') ? keep(p.capabilityIds, capIds) : [],
      newSkillNames: spec.links.includes('skillIds') ? dedupe(asStrings(p.newSkillNames)) : [],
      children,
      appendLists,
      rationale: asString(p.rationale),
    };
    const hasContent = Object.keys(proposal.fields).length > 0 || children.length > 0 || Object.keys(appendLists).length > 0;
    if (hasContent) out.push(proposal);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim();
const tokens = (s: string) => new Set(normalize(s).split(' ').filter((t) => t.length > 2));

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

const TITLE_FIELD: Partial<Record<SectionId, string>> = {
  roles: 'title',
  projects: 'name',
  achievements: 'title',
  skills: 'name',
  capabilities: 'name',
  education: 'program',
  certifications: 'name',
  methodologies: 'name',
  engagements: 'project',
};

function sectionTitles(cj: any, section: SectionId): { id: string; title: string }[] {
  switch (section) {
    case 'roles':
      return (cj?.roles || []).map((r: any) => ({ id: r.id, title: `${r.title || ''} ${r.organization || r.company || ''}` }));
    case 'projects':
      return (cj?.roles || []).flatMap((r: any) => (r.initiatives || []).map((i: any) => ({ id: i.id, title: i.name || '' })));
    case 'achievements':
      return (cj?.achievements || []).map((a: any) => ({ id: a.id, title: a.title || '' }));
    case 'skills':
      return (cj?.skills_index || []).map((s: any) => ({ id: s.id, title: s.name || '' }));
    case 'capabilities':
      return (cj?.capabilities || []).map((c: any) => ({ id: c.id, title: c.name || '' }));
    case 'education':
      return (cj?.education || []).map((e: any) => ({ id: e.id, title: `${e.program || ''} ${e.institution || ''}` }));
    case 'certifications':
      return (cj?.certifications || []).map((c: any) => ({ id: c.id, title: c.name || '' }));
    case 'methodologies':
      return (cj?.methodologies || []).map((x: any) => ({ id: x.id, title: x.name || '' }));
    case 'engagements':
      return (cj?.customer_engagements || []).map((x: any) => ({ id: x.id, title: `${x.client || ''} ${x.project || ''}` }));
    default:
      return [];
  }
}

/** An existing item an 'add' proposal probably duplicates, if any. */
export function findPossibleDuplicate(cj: any, section: SectionId, proposal: SectionProposal): { id: string; title: string } | null {
  if (proposal.op !== 'add') return null;
  const key = TITLE_FIELD[section];
  if (!key) return null;
  const f = proposal.fields;
  const title =
    section === 'roles'
      ? `${f.title || ''} ${f.organization || ''}`
      : section === 'education'
        ? `${f.program || ''} ${f.institution || ''}`
        : section === 'engagements'
          ? `${f.client || ''} ${f.project || ''}`
          : asString(f[key]);
  if (!title.trim()) return null;
  // Short names (skills) need an exact match; longer titles can match on token overlap.
  const threshold = section === 'skills' ? 1 : 0.75;
  let best: { id: string; title: string; score: number } | null = null;
  for (const item of sectionTitles(cj, section)) {
    const score = similarity(title, item.title);
    if (score >= threshold && (!best || score > best.score)) best = { ...item, score };
  }
  return best ? { id: best.id, title: best.title.trim() } : null;
}

// ---------------------------------------------------------------------------
// Applying an accepted proposal
// ---------------------------------------------------------------------------

/** Resolves skill ids plus names to create: names matching an existing skill reuse its id. */
function resolveSkillIds(d: any, ids: IdAlloc, skillIds: string[], newNames: string[]): string[] {
  const out = [...skillIds];
  for (const name of newNames) {
    const existing = (d.skills_index || []).find((s: any) => normalize(s.name || '') === normalize(name));
    out.push(existing ? existing.id : m.addSkill(d, ids, { name }));
  }
  return dedupe(out);
}

const mergeIds = (current: any, extra: string[]) => dedupe([...(Array.isArray(current) ? current : []), ...extra]);

export interface ApplyOptions {
  /** Overrides the proposal's parent role (the review card lets the user pick one). */
  parentId?: string | null;
  /** 'update' this existing item instead of adding (the duplicate "merge" action). */
  mergeIntoId?: string | null;
}

/**
 * Writes an accepted proposal into a draft journey (use inside mutateCareerJourney).
 * Returns the id of the item added or updated, or null if it couldn't be applied.
 */
export function applyProposal(d: any, ids: IdAlloc, section: SectionId, proposal: SectionProposal, options: ApplyOptions = {}): string | null {
  const op = options.mergeIntoId ? 'update' : proposal.op;
  const targetId = options.mergeIntoId || proposal.targetId;
  // The review card edits fields as text: drop blanked fields, turn number fields back into numbers.
  const spec = SECTION_SPECS[section];
  const f = cleanFields(proposal.fields, spec.fields, spec.numberFields);

  switch (section) {
    case 'profile': {
      const { primary_tagline, role_orientation, ...personFields } = f;
      if (Object.keys(personFields).length) m.updatePerson(d, personFields);
      const pos: any = {};
      if (primary_tagline) pos.primary_tagline = primary_tagline;
      if (role_orientation) pos.role_orientation = role_orientation;
      const lists = proposal.appendLists || {};
      if (lists.narrative_anchors) pos.narrative_anchors = mergeIds(d.person?.positioning?.narrative_anchors, lists.narrative_anchors);
      if (lists.target_role_families) pos.target_role_families = mergeIds(d.person?.positioning?.target_role_families, lists.target_role_families);
      if (Object.keys(pos).length) m.updatePositioning(d, pos);
      if (lists.signature_outcomes) m.updatePerson(d, { signature_outcomes: mergeIds(d.person?.signature_outcomes, lists.signature_outcomes) });
      return 'profile';
    }
    case 'roles': {
      const skills = resolveSkillIds(d, ids, proposal.skillIds, proposal.newSkillNames);
      if (op === 'update' && targetId) {
        const role = m.findRole(d, targetId);
        if (!role) return null;
        m.updateRole(d, targetId, { ...f, ...(skills.length ? { skills: mergeIds(role.skills, skills) } : {}) });
        return targetId;
      }
      return m.addRole(d, ids, { ...f, company: f.organization, skills });
    }
    case 'projects': {
      let initiativeId = targetId;
      if (op === 'update' && targetId) {
        if (!m.findInitiative(d, targetId)) return null;
        if (Object.keys(f).length) m.updateInitiative(d, targetId, f);
      } else {
        const roleId = options.parentId || proposal.parentId;
        if (!roleId || !m.findRole(d, roleId)) return null;
        initiativeId = m.addInitiative(d, ids, roleId, { name: f.name || 'New project', description: f.description || '' });
      }
      if (!initiativeId) return null;
      for (const child of proposal.children) {
        m.addDeliverable(d, ids, initiativeId, {
          ...child.fields,
          skill_ids: resolveSkillIds(d, ids, child.skillIds, child.newSkillNames),
          capability_alignment: child.capabilityIds,
        });
      }
      return initiativeId;
    }
    case 'achievements': {
      const skills = resolveSkillIds(d, ids, proposal.skillIds, proposal.newSkillNames);
      if (op === 'update' && targetId) {
        const ach = (d.achievements || []).find((a: any) => a.id === targetId);
        if (!ach) return null;
        m.updateAchievement(d, targetId, { ...f, ...(skills.length ? { skill_ids: mergeIds(ach.skill_ids, skills) } : {}) });
        if (proposal.roleIds.length) m.setAchievementRoles(d, ids, targetId, mergeIds(m.achievementRoleIds(d, targetId), proposal.roleIds));
        return targetId;
      }
      return m.addAchievement(d, ids, { ...f, ...(skills.length ? { skill_ids: skills } : {}) }, proposal.roleIds);
    }
    case 'skills': {
      if (op === 'update' && targetId) {
        if (!(d.skills_index || []).some((s: any) => s.id === targetId)) return null;
        m.updateSkill(d, targetId, f);
        return targetId;
      }
      return m.addSkill(d, ids, f);
    }
    case 'capabilities': {
      let capId = targetId;
      if (op === 'update' && targetId) {
        if (!(d.capabilities || []).some((c: any) => c.id === targetId)) return null;
        if (Object.keys(f).length) m.updateCapability(d, targetId, f);
      } else {
        capId = m.addCapability(d, ids, f);
      }
      if (!capId) return null;
      for (const child of proposal.children) {
        const fnId = m.addFunction(d, ids, capId, child.fields);
        if (fnId) m.setFunctionSkills(d, fnId, resolveSkillIds(d, ids, child.skillIds, child.newSkillNames));
      }
      return capId;
    }
    default: {
      const key = LIST_KEY[section];
      if (!key) return null;
      if (op === 'update' && targetId) {
        if (!(d[key] || []).some((x: any) => x.id === targetId)) return null;
        m.updateListItem(d, key, targetId, f);
        return targetId;
      }
      return m.addListItem(d, ids, key, f);
    }
  }
}

/** One human-readable changelog line for an accepted proposal. */
export function changelogLine(section: SectionId, proposal: SectionProposal, id: string, mergedInto?: string | null): string {
  const f = proposal.fields;
  const name = f.title || f.name || f.client || f.program || f.institution || '';
  const label = SECTION_BY_ID[section].singular.toLowerCase();
  const verb = mergedInto || proposal.op === 'update' ? 'Updated' : 'Added';
  const extra = proposal.children.length ? ` with ${proposal.children.length} ${SECTION_SPECS[section].children?.label}` : '';
  return `${verb} ${label} ${id}${name ? ` "${name}"` : ''}${extra} via the ${SECTION_BY_ID[section].label} AI assistant.`;
}

/**
 * Appends a line to the changelog the user keeps in meta (version_X_Y_changes).
 * The version is bumped once per editor session: `sessionVersion` is the version this
 * session already bumped to, if any.
 */
export function recordChange(d: any, line: string, sessionVersion: string | null): string {
  if (!d.meta) d.meta = { owner: '', version: '0.1' };
  const version = sessionVersion && d.meta.version === sessionVersion ? sessionVersion : computeNextVersion(d.meta.version);
  d.meta.version = version;
  const key = versionChangesKey(version);
  const current = Array.isArray(d.meta[key]) ? d.meta[key] : [];
  d.meta[key] = [...current, line];
  return version;
}
