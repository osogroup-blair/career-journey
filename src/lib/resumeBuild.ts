import { EarlierExperienceEntry, EvidenceRef, GeneratedResume, KeywordSignal, ResumeBuildOptions, ResumeRoleMode } from '../types';

/**
 * Deterministic side of tailored-resume generation: which Career Journey roles
 * go on the page (full / condensed one-liner / excluded), how many bullets
 * each full role may carry for the chosen page target, and the post-AI
 * enforcement that guarantees an excluded role never appears no matter what
 * the model returns. Shared by the server (prompt projection + enforcement in
 * the generateResume/resumeStrategy routes) and the client (Build Settings
 * screen), so both sides compute the same budget.
 */

export const RESUME_ROLE_MODES: readonly ResumeRoleMode[] = ['full', 'condensed', 'excluded'];
export const MAX_BULLETS_PER_ROLE = 8;
/** With no saved preference, roles that ended this many years ago start out condensed. */
const CONDENSE_AFTER_YEARS = 15;

const BULLET_LADDER: Record<1 | 2, number[]> = {
  1: [5, 4, 3, 2],
  2: [6, 5, 4, 4, 3],
};

export function sectionLimits(pageTarget: 1 | 2): { summaryWords: number; skillRows: number } {
  return pageTarget === 1 ? { summaryWords: 50, skillRows: 4 } : { summaryWords: 70, skillRows: 6 };
}

export function roleCompany(role: any): string {
  return role?.organization || role?.company || '';
}

function isPresent(value: unknown): boolean {
  return typeof value === 'string' && /present|current|now/i.test(value);
}

function firstYear(value: unknown): number | null {
  const m = typeof value === 'string' ? value.match(/\b(19|20)\d{2}\b/) : null;
  return m ? Number(m[0]) : null;
}

function lastYear(value: unknown): number | null {
  const all = typeof value === 'string' ? value.match(/\b(19|20)\d{2}\b/g) : null;
  return all ? Number(all[all.length - 1]) : null;
}

export function roleStartYear(role: any): number | null {
  return firstYear(role?.start_date) ?? firstYear(role?.dates);
}

/** End year of a role; a current role ends this year. Null when the Career Journey gives no usable date. */
export function roleEndYear(role: any, now: Date = new Date()): number | null {
  if (isPresent(role?.end_date) || (!role?.end_date && isPresent(role?.dates))) return now.getFullYear();
  return firstYear(role?.end_date) ?? lastYear(role?.dates);
}

/** Year-only date range for a condensed one-liner — ats_tactics.md allows year-only for older roles. */
export function condensedRoleDates(role: any): string {
  const start = roleStartYear(role);
  const current = isPresent(role?.end_date) || (!role?.end_date && isPresent(role?.dates));
  const end = current ? 'Present' : roleEndYear(role);
  if (start && end && String(start) !== String(end)) return `${start} – ${end}`;
  return String(end ?? start ?? '');
}

/** Career Journey roles, most recent first (current roles, then by end year, then start year). Stable for ties. */
export function rolesRecentFirst(careerJourney: any): any[] {
  const roles: any[] = Array.isArray(careerJourney?.roles) ? careerJourney.roles : [];
  return roles
    .map((role, index) => ({ role, index, end: roleEndYear(role) ?? -Infinity, start: roleStartYear(role) ?? -Infinity }))
    .sort((a, b) => b.end - a.end || b.start - a.start || a.index - b.index)
    .map((r) => r.role);
}

function isRoleMode(value: unknown): value is ResumeRoleMode {
  return typeof value === 'string' && (RESUME_ROLE_MODES as readonly string[]).includes(value);
}

/** The candidate's saved resume defaults, from person.resume_preferences in the Career Journey. */
export function resumePreferences(careerJourney: any): { pageTarget: 1 | 2; condenseEndedBefore: number | null } {
  const prefs = careerJourney?.person?.resume_preferences || {};
  return {
    pageTarget: Number(prefs.page_target) === 1 ? 1 : 2,
    condenseEndedBefore: firstYear(String(prefs.condense_roles_ended_before ?? '')),
  };
}

/** Starting point for the Build Settings screen: a role's saved resume_default wins, then the condense-before-year preference, then the age fallback. */
export function defaultBuildOptions(careerJourney: any, now: Date = new Date()): ResumeBuildOptions {
  const prefs = resumePreferences(careerJourney);
  const roles: ResumeBuildOptions['roles'] = {};
  for (const role of careerJourney?.roles || []) {
    if (!role?.id) continue;
    const end = roleEndYear(role, now);
    let mode: ResumeRoleMode = 'full';
    if (isRoleMode(role.resume_default)) mode = role.resume_default;
    else if (prefs.condenseEndedBefore !== null && end !== null && end < prefs.condenseEndedBefore) mode = 'condensed';
    else if (prefs.condenseEndedBefore === null && end !== null && now.getFullYear() - end > CONDENSE_AFTER_YEARS) mode = 'condensed';
    roles[role.id] = { mode };
  }
  return { pageTarget: prefs.pageTarget, roles };
}

/**
 * Validates options from a request body against the real Career Journey —
 * unknown role ids are dropped, unknown modes become 'full', bullet overrides
 * are clamped. A missing/garbage body falls back to the candidate's defaults.
 */
export function normalizeResumeBuildOptions(raw: any, careerJourney: any): ResumeBuildOptions {
  if (!raw || typeof raw !== 'object') return defaultBuildOptions(careerJourney);
  const roles: ResumeBuildOptions['roles'] = {};
  for (const role of careerJourney?.roles || []) {
    if (!role?.id) continue;
    const entry = raw.roles?.[role.id];
    const mode = isRoleMode(entry?.mode) ? entry.mode : 'full';
    const n = Number(entry?.maxBullets);
    roles[role.id] = entry?.maxBullets != null && Number.isFinite(n)
      ? { mode, maxBullets: Math.max(0, Math.min(MAX_BULLETS_PER_ROLE, Math.round(n))) }
      : { mode };
  }
  const guidance = typeof raw.guidance === 'string' ? raw.guidance.trim().slice(0, 1000) : '';
  return { pageTarget: Number(raw.pageTarget) === 1 ? 1 : 2, roles, ...(guidance ? { guidance } : {}) };
}

export function roleMode(options: ResumeBuildOptions | undefined, roleId: string): ResumeRoleMode {
  return options?.roles?.[roleId]?.mode ?? 'full';
}

/** Max bullets per full role id: most recent role gets the most, tapering down the page-target ladder. A per-role maxBullets overrides the ladder. */
export function computeBulletBudget(options: ResumeBuildOptions, careerJourney: any): Record<string, number> {
  const ladder = BULLET_LADDER[options.pageTarget] ?? BULLET_LADDER[2];
  const budget: Record<string, number> = {};
  rolesRecentFirst(careerJourney)
    .filter((role) => role?.id && roleMode(options, role.id) === 'full')
    .forEach((role, i) => {
      const override = options.roles?.[role.id]?.maxBullets;
      budget[role.id] = override ?? ladder[Math.min(i, ladder.length - 1)];
    });
  return budget;
}

function achievementRoleIds(careerJourney: any, achievementId: string): string[] {
  const achievement = (careerJourney?.achievements || []).find((a: any) => a?.id === achievementId);
  const ids = new Set<string>(achievement?.role_ids || []);
  for (const m of careerJourney?.links?.timeline_mappings || []) {
    if (m?.entity_type === 'achievement' && m.entity_id === achievementId && m.role_id) ids.add(m.role_id);
  }
  return [...ids];
}

/**
 * The Career Journey as the resume prompts should see it: only 'full' roles
 * (their nested initiatives/deliverables go with them), minus achievements
 * tied exclusively to removed roles, minus the resume-preference fields that
 * only drive this module. Achievements with no role linkage are kept — there's
 * no way to tell which role they belong to.
 */
export function projectCareerJourneyForResume(careerJourney: any, options: ResumeBuildOptions): any {
  if (!careerJourney) return careerJourney;
  const removed = new Set<string>(
    (careerJourney.roles || []).filter((r: any) => r?.id && roleMode(options, r.id) !== 'full').map((r: any) => r.id)
  );
  const roles = (careerJourney.roles || [])
    .filter((r: any) => !removed.has(r?.id))
    .map(({ resume_default: _omit, ...role }: any) => role);
  const achievements = (careerJourney.achievements || []).filter((a: any) => {
    const linked = achievementRoleIds(careerJourney, a?.id);
    return linked.length === 0 || linked.some((id) => !removed.has(id));
  });
  const projected: any = { ...careerJourney, roles, achievements };
  if (careerJourney.person) {
    const { resume_preferences: _omit, ...person } = careerJourney.person;
    projected.person = person;
  }
  if (Array.isArray(careerJourney.links?.timeline_mappings)) {
    projected.links = { ...careerJourney.links, timeline_mappings: careerJourney.links.timeline_mappings.filter((m: any) => !removed.has(m?.role_id)) };
  }
  return projected;
}

function roleLine(role: any): string {
  const dates = role.dates || [role.start_date, role.end_date].filter(Boolean).join(' – ');
  return `${role.title || 'Untitled role'}, ${roleCompany(role) || 'Unknown organization'}${dates ? ` (${dates})` : ''}`;
}

/**
 * The "Resume Constraints" data block appended after the admin-editable
 * prompt text. Lives in code, not the prompt template, so an admin override
 * of the instructional text can't drop the candidate's role selection.
 */
export function buildResumeConstraintsBlock(options: ResumeBuildOptions, careerJourney: any, purpose: 'strategy' | 'resume'): string {
  const budget = computeBulletBudget(options, careerJourney);
  const limits = sectionLimits(options.pageTarget);
  const recent = rolesRecentFirst(careerJourney);
  const full = recent.filter((r) => r?.id && roleMode(options, r.id) === 'full');
  const condensed = recent.filter((r) => r?.id && roleMode(options, r.id) === 'condensed');

  const lines = [
    'Resume Constraints (chosen by the candidate for this resume; they override any other length, page-count, bullet-count, or role-selection guidance above):',
    `- Page target: ${options.pageTarget === 1 ? '1 page' : '2 pages'} maximum, US Letter. Stay inside it; cut weaker bullets rather than overflowing.`,
    purpose === 'resume'
      ? '- Experience: write an entry ONLY for each role below, most recent first, and set each entry\'s roleId to the id shown. Never add any other employer or role.'
      : '- roleStrategies: one entry per role below and no others, with roleId set to the id shown.',
    ...full.map((r) => `  - roleId ${r.id}: ${roleLine(r)}${purpose === 'resume' ? ` — at most ${budget[r.id]} bullets` : ''}`),
  ];
  if (full.length === 0) lines.push('  - (none — the candidate chose no full roles; leave experience empty)');
  if (purpose === 'resume') {
    lines.push('- Order each role\'s bullets strongest-first for this JD, so trimming from the end loses the least.');
  }
  lines.push(`- Summary: at most ${limits.summaryWords} words. Skills: at most ${limits.skillRows} category rows.`);
  if (condensed.length > 0) {
    lines.push(
      '- These earlier roles appear on the resume only as one-line entries the app adds itself. Do not write experience entries, bullets, or roleStrategies for them; you may count their tenure toward total years of experience:',
      ...condensed.map((r) => `  - ${roleLine(r)}`)
    );
  }
  if (options.guidance) lines.push(`- Candidate guidance for this resume: ${options.guidance}`);
  return lines.join('\n');
}

function companyKey(value: string | undefined): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Which Career Journey role a generated experience entry came from — its roleId if it's real, otherwise a company (then title) match for resumes generated before roleId existed. */
export function resolveExperienceRoleId(entry: { roleId?: string; company?: string; title?: string }, careerJourney: any): string | null {
  const roles: any[] = careerJourney?.roles || [];
  if (entry.roleId && roles.some((r) => r?.id === entry.roleId)) return entry.roleId;
  const key = companyKey(entry.company);
  if (!key) return null;
  const sameCompany = roles.filter((r) => {
    const k = companyKey(roleCompany(r));
    return k && (k === key || k.startsWith(key) || key.startsWith(k));
  });
  if (sameCompany.length === 1) return sameCompany[0].id;
  const titleKey = companyKey(entry.title);
  const byTitle = sameCompany.find((r) => titleKey && companyKey(r.title) && (titleKey.includes(companyKey(r.title)) || companyKey(r.title).includes(titleKey)));
  return byTitle?.id ?? sameCompany[0]?.id ?? null;
}

export function buildEarlierExperience(options: ResumeBuildOptions, careerJourney: any): EarlierExperienceEntry[] {
  return rolesRecentFirst(careerJourney)
    .filter((r) => r?.id && roleMode(options, r.id) === 'condensed')
    .map((r) => ({ roleId: r.id, company: roleCompany(r), title: r.title || '', dates: condensedRoleDates(r) }));
}

/**
 * Hard guarantee applied to the model's output: drops experience entries for
 * any role that isn't 'full' (or duplicates), caps bullets to the budget by
 * trimming from the end, orders roles most recent first, and rebuilds
 * earlierExperience from the Career Journey. Entries that can't be matched to
 * any role are kept (better than silently losing real work) but reported.
 */
export function enforceResumeConstraints(
  resume: GeneratedResume,
  options: ResumeBuildOptions,
  careerJourney: any
): { resume: GeneratedResume; warnings: string[] } {
  const warnings: string[] = [];
  const budget = computeBulletBudget(options, careerJourney);
  const order = new Map<string, number>(rolesRecentFirst(careerJourney).map((r, i) => [r.id, i]));
  const seen = new Set<string>();
  const kept: { entry: GeneratedResume['experience'][number]; rank: number }[] = [];

  for (const entry of resume?.experience || []) {
    const roleId = resolveExperienceRoleId(entry, careerJourney);
    if (!roleId) {
      warnings.push(`"${entry.company}" doesn't match any role in your Career Journey — kept, but check it.`);
      kept.push({ entry, rank: Number.MAX_SAFE_INTEGER });
      continue;
    }
    if (roleMode(options, roleId) !== 'full') {
      warnings.push(`Removed "${entry.company}" — that role is set to ${roleMode(options, roleId)}.`);
      continue;
    }
    if (seen.has(roleId)) {
      warnings.push(`Removed a duplicate entry for "${entry.company}".`);
      continue;
    }
    seen.add(roleId);
    const max = budget[roleId] ?? MAX_BULLETS_PER_ROLE;
    const bullets = entry.bullets || [];
    if (bullets.length > max) warnings.push(`Trimmed "${entry.company}" from ${bullets.length} to ${max} bullets.`);
    kept.push({ entry: { ...entry, roleId, bullets: bullets.slice(0, max) }, rank: order.get(roleId) ?? Number.MAX_SAFE_INTEGER });
  }

  kept.sort((a, b) => a.rank - b.rank);
  return {
    resume: { ...resume, experience: kept.map((k) => k.entry), earlierExperience: buildEarlierExperience(options, careerJourney) },
    warnings,
  };
}

/** Role ids an evidence ref is tied to. Empty for evidence that isn't role-bound (skills, education) or can't be found. */
export function roleIdsForEvidenceRef(careerJourney: any, ref: EvidenceRef): string[] {
  if (!careerJourney || !ref?.id) return [];
  if (ref.type === 'role') return (careerJourney.roles || []).some((r: any) => r?.id === ref.id) ? [ref.id] : [];
  if (ref.type === 'deliverable') {
    for (const role of careerJourney.roles || []) {
      for (const initiative of role.initiatives || []) {
        if ((initiative.deliverables || []).some((d: any) => d?.id === ref.id)) return [role.id];
      }
    }
    return [];
  }
  if (ref.type === 'achievement') return achievementRoleIds(careerJourney, ref.id);
  return [];
}

/**
 * JD keywords whose only Career Journey evidence lives in roles that won't be
 * written in full if `roleId` is also dropped — what the Build Settings screen
 * warns about before you condense/exclude a role. Keywords with any
 * non-role-bound evidence (a skill entry, education) are never at risk.
 */
export function keywordsAtRisk(
  keywords: KeywordSignal[] | undefined,
  careerJourney: any,
  options: ResumeBuildOptions,
  roleId: string
): { phrase: string; critical: boolean }[] {
  const out: { phrase: string; critical: boolean }[] = [];
  for (const k of keywords || []) {
    if (k.category === 'Hard gate' || k.evidenceStatus === 'NOT SUPPORTED' || !k.evidenceRefs?.length) continue;
    const roleSets = k.evidenceRefs.map((ref) => roleIdsForEvidenceRef(careerJourney, ref));
    if (roleSets.some((ids) => ids.length === 0)) continue;
    const supporting = new Set(roleSets.flat());
    if (!supporting.has(roleId)) continue;
    const survives = [...supporting].some((id) => id !== roleId && roleMode(options, id) === 'full');
    if (!survives) out.push({ phrase: k.phrase, critical: !!k.isTopCritical });
  }
  return out;
}
