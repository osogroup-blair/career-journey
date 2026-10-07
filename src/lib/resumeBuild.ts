import { EarlierExperienceEntry, EvidenceRef, GeneratedResume, KeywordSignal, ResumeBuildOptions, ResumeFormat, ResumeOutcome, ResumeRoleMode } from '../types';
import { formatContactLine } from './utils';

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
const CONDENSE_AFTER_YEARS = 10;

const BULLET_LADDER: Record<1 | 2, number[]> = {
  1: [5, 4, 3, 2],
  2: [6, 5, 4, 4, 3],
};

/** Summary and skills limits for a page target. With Selected Outcomes on, the outcomes carry the proof points, so the summary is shorter. */
export function sectionLimits(pageTarget: 1 | 2, format?: Partial<ResumeFormat>): { summaryWords: number; skillRows: number } {
  const outcomes = !!format?.selectedOutcomes;
  return pageTarget === 1 ? { summaryWords: outcomes ? 45 : 60, skillRows: 4 } : { summaryWords: outcomes ? 80 : 110, skillRows: 6 };
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-03" / "2026-03-15" -> "March 2026", "2015" -> "2015", "Present" -> "Present". Anything else -> null. */
export function formatResumeDate(value: unknown): string | null {
  if (isPresent(value)) return 'Present';
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^((?:19|20)\d{2})(?:-(\d{1,2})(?:-\d{1,2})?)?$/);
  if (!m) return null;
  const month = m[2] ? Number(m[2]) : null;
  if (month !== null && (month < 1 || month > 12)) return null;
  return month ? `${MONTHS[month - 1]} ${m[1]}` : m[1];
}

/** Full month-year range for an experience entry (ats_tactics.md), from the role's structured dates. Null when they aren't parseable — the caller keeps whatever it had. */
export function formatRoleDates(role: any): string | null {
  const start = formatResumeDate(role?.start_date);
  const end = formatResumeDate(role?.end_date);
  if (!start || start === 'Present') return null;
  return end && end !== start ? `${start} – ${end}` : start;
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
export const DEFAULT_RESUME_FORMAT: ResumeFormat = {
  combineEmployerRoles: true,
  selectedOutcomes: false,
  roleNarratives: false,
  boldLeads: false,
  skillsPosition: 'top',
};

/** Keeps only valid format fields from untrusted input (a request body or the Career Journey). */
export function sanitizeResumeFormat(raw: unknown): Partial<ResumeFormat> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<ResumeFormat> = {};
  for (const key of ['combineEmployerRoles', 'selectedOutcomes', 'roleNarratives', 'boldLeads'] as const) {
    if (typeof r[key] === 'boolean') out[key] = r[key] as boolean;
  }
  if (r.skillsPosition === 'top' || r.skillsPosition === 'bottom') out.skillsPosition = r.skillsPosition;
  return out;
}

/** The effective layout for a build: its own toggles over the defaults. */
export function resumeFormat(options: ResumeBuildOptions | undefined): ResumeFormat {
  return { ...DEFAULT_RESUME_FORMAT, ...sanitizeResumeFormat(options?.format) };
}

export function resumePreferences(careerJourney: any): { pageTarget: 1 | 2; condenseEndedBefore: number | null; format: Partial<ResumeFormat> } {
  const prefs = careerJourney?.person?.resume_preferences || {};
  return {
    pageTarget: Number(prefs.page_target) === 1 ? 1 : 2,
    condenseEndedBefore: firstYear(String(prefs.condense_roles_ended_before ?? '')),
    format: sanitizeResumeFormat(prefs.format),
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
  return { pageTarget: prefs.pageTarget, roles, ...(Object.keys(prefs.format).length > 0 ? { format: prefs.format } : {}) };
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
  const format = raw.format === undefined ? resumePreferences(careerJourney).format : sanitizeResumeFormat(raw.format);
  return {
    pageTarget: Number(raw.pageTarget) === 1 ? 1 : 2,
    roles,
    ...(guidance ? { guidance } : {}),
    ...(Object.keys(format).length > 0 ? { format } : {}),
  };
}

export function roleMode(options: ResumeBuildOptions | undefined, roleId: string): ResumeRoleMode {
  return options?.roles?.[roleId]?.mode ?? 'full';
}

/**
 * How strongly each role evidences this JD: every usable keyword whose
 * evidenceRefs resolve to the role scores 1 (2 if top-critical). Unscored
 * without a keyword breakdown, which leaves the budget purely by recency.
 */
export function roleRelevance(keywords: KeywordSignal[] | undefined, careerJourney: any): Record<string, number> {
  const score: Record<string, number> = {};
  for (const k of keywords || []) {
    if (k.category === 'Hard gate' || k.evidenceStatus === 'HARD GATE' || k.evidenceStatus === 'NOT SUPPORTED') continue;
    const roleIds = new Set((k.evidenceRefs || []).flatMap((ref) => roleIdsForEvidenceRef(careerJourney, ref)));
    for (const id of roleIds) score[id] = (score[id] || 0) + (k.isTopCritical ? 2 : 1);
  }
  return score;
}

/**
 * One experience entry on the resume. Usually one full role; with
 * combineEmployerRoles on, every full role at the same employer (by company
 * name) shares one entry. `primaryId` is the role that entry is filed under —
 * the most JD-relevant of them, recency breaking ties — and `roleIds` lists
 * them all, primary first.
 */
export interface ResumeUnit {
  primaryId: string;
  roleIds: string[];
  company: string;
}

/** Full roles grouped into resume entries, most recent entry first. */
export function resumeUnits(options: ResumeBuildOptions, careerJourney: any, keywords?: KeywordSignal[]): ResumeUnit[] {
  const relevance = roleRelevance(keywords, careerJourney);
  const combine = resumeFormat(options).combineEmployerRoles;
  const full = rolesRecentFirst(careerJourney).filter((role) => role?.id && roleMode(options, role.id) === 'full');
  const groups = new Map<string, any[]>();
  full.forEach((role, i) => {
    const key = combine && employerKey(roleCompany(role)) ? `co:${employerKey(roleCompany(role))}` : `role:${role.id}:${i}`;
    groups.set(key, [...(groups.get(key) || []), role]);
  });
  return [...groups.values()].map((roles) => {
    const ranked = roles.map((role, recency) => ({ role, recency })).sort((a, b) => (relevance[b.role.id] || 0) - (relevance[a.role.id] || 0) || a.recency - b.recency);
    const primary = ranked[0].role;
    return { primaryId: primary.id, roleIds: [primary.id, ...roles.filter((r) => r !== primary).map((r) => r.id)], company: roleCompany(primary) };
  });
}

/**
 * Max bullets per resume entry, keyed by its primary role id. Entries that
 * evidence the most JD keywords get the top rungs of the page-target ladder
 * (recency breaks ties, and decides alone when there's no keyword breakdown);
 * a combined employer entry gets one extra bullet per additional role, up to
 * MAX_BULLETS_PER_ROLE. A maxBullets override on the primary role wins.
 * These are ceilings, not quotas — see buildResumeConstraintsBlock.
 */
export function computeBulletBudget(options: ResumeBuildOptions, careerJourney: any, keywords?: KeywordSignal[]): Record<string, number> {
  const ladder = BULLET_LADDER[options.pageTarget] ?? BULLET_LADDER[2];
  // Selected Outcomes and role narratives take page space the ladder was sized without: one bullet less per entry for each (never below 2).
  const format = resumeFormat(options);
  const formatCost = (format.selectedOutcomes ? 1 : 0) + (format.roleNarratives ? 1 : 0);
  const relevance = roleRelevance(keywords, careerJourney);
  const budget: Record<string, number> = {};
  resumeUnits(options, careerJourney, keywords)
    .map((unit, recency) => ({ unit, recency, score: unit.roleIds.reduce((n, id) => n + (relevance[id] || 0), 0) }))
    .sort((a, b) => b.score - a.score || a.recency - b.recency)
    .forEach(({ unit }, i) => {
      const override = options.roles?.[unit.primaryId]?.maxBullets;
      const rung = ladder[Math.min(i, ladder.length - 1)];
      budget[unit.primaryId] = override ?? Math.max(Math.min(2, rung), Math.min(MAX_BULLETS_PER_ROLE, rung + unit.roleIds.length - 1) - formatCost);
    });
  return budget;
}

/** Comparable month index for a Career Journey date ("2022-02" → 24265); 'Present' sorts last. Null when unparseable. */
function monthIndex(value: unknown, end: boolean): number | null {
  if (isPresent(value)) return Number.POSITIVE_INFINITY;
  const m = typeof value === 'string' ? value.trim().match(/^((?:19|20)\d{2})(?:-(\d{1,2}))?/) : null;
  if (!m) return null;
  return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : end ? 11 : 0);
}

/** Month-year range spanning every role in a combined entry: earliest start to latest end. */
export function unitDates(roleIds: string[], careerJourney: any): string | null {
  const roles = (careerJourney?.roles || []).filter((r: any) => roleIds.includes(r?.id));
  if (roles.length === 0) return null;
  if (roles.length === 1) return formatRoleDates(roles[0]);
  const starts = roles.map((r: any) => ({ key: monthIndex(r.start_date, false), raw: r.start_date })).filter((x: any) => x.key !== null && x.key !== Number.POSITIVE_INFINITY);
  const ends = roles.map((r: any) => ({ key: monthIndex(r.end_date, true), raw: r.end_date })).filter((x: any) => x.key !== null);
  if (starts.length === 0) return null;
  const start = starts.reduce((a: any, b: any) => (b.key < a.key ? b : a));
  const end = ends.length ? ends.reduce((a: any, b: any) => (b.key > a.key ? b : a)) : null;
  const from = formatResumeDate(start.raw);
  const to = end ? formatResumeDate(end.raw) : null;
  if (!from) return null;
  return to && to !== from ? `${from} – ${to}` : from;
}

function achievementRoleIds(careerJourney: any, achievementId: string): string[] {
  const achievement = (careerJourney?.achievements || []).find((a: any) => a?.id === achievementId);
  const ids = new Set<string>(achievement?.role_ids || []);
  for (const m of careerJourney?.links?.timeline_mappings || []) {
    if (m?.entity_type === 'achievement' && m.entity_id === achievementId && m.role_id) ids.add(m.role_id);
  }
  return [...ids];
}

/** Version changelog keys in meta ("version_3_2_changes") — history, not evidence. */
const META_CHANGELOG_KEY = /^version_.*_changes$/;

/**
 * The Career Journey as the resume prompts should see it: only 'full' roles
 * (their nested initiatives/deliverables go with them), minus achievements
 * tied exclusively to removed roles, minus the resume-preference fields that
 * only drive this module. Achievements with no role linkage are kept — there's
 * no way to tell which role they belong to.
 *
 * It also drops what isn't evidence: the links graph (keyword/skill/timeline
 * cross-references) and meta's version changelogs. On a mature Career Journey
 * those are close to half the prompt and crowd out the achievements the
 * resume should be built from. The one link the writer needs — which role an
 * achievement belongs to — is folded into each achievement's role_ids first.
 */
export function projectCareerJourneyForResume(careerJourney: any, options: ResumeBuildOptions): any {
  if (!careerJourney) return careerJourney;
  const removed = new Set<string>(
    (careerJourney.roles || []).filter((r: any) => r?.id && roleMode(options, r.id) !== 'full').map((r: any) => r.id)
  );
  const roles = (careerJourney.roles || [])
    .filter((r: any) => !removed.has(r?.id))
    .map(({ resume_default: _omit, ...role }: any) => role);
  const achievements = (careerJourney.achievements || []).flatMap((a: any) => {
    const linked = achievementRoleIds(careerJourney, a?.id);
    if (linked.length > 0 && linked.every((id) => removed.has(id))) return [];
    return linked.length > 0 ? [{ ...a, role_ids: linked.filter((id) => !removed.has(id)) }] : [a];
  });
  const { links, meta, ...rest } = careerJourney;
  const projected: any = { ...rest, roles, achievements };
  if (meta && typeof meta === 'object') {
    projected.meta = Object.fromEntries(Object.entries(meta).filter(([key]) => !META_CHANGELOG_KEY.test(key)));
  }
  if (Array.isArray(links?.deliverable_achievement) && links.deliverable_achievement.length > 0) {
    projected.links = { deliverable_achievement: links.deliverable_achievement };
  }
  if (careerJourney.person) {
    const { resume_preferences: _omit, ...person } = careerJourney.person;
    projected.person = person;
  }
  return projected;
}

/**
 * The whole Career Journey minus the same non-evidence noise (links graph,
 * meta changelogs) — for prompts that match JD keywords against every role,
 * like the Rating stage's keyword breakdown.
 */
export function stripCareerJourneyNoise(careerJourney: any): any {
  return projectCareerJourneyForResume(careerJourney, { pageTarget: 2, roles: {} });
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
export function buildResumeConstraintsBlock(options: ResumeBuildOptions, careerJourney: any, purpose: 'strategy' | 'resume', keywords?: KeywordSignal[]): string {
  const budget = computeBulletBudget(options, careerJourney, keywords);
  const format = resumeFormat(options);
  const limits = sectionLimits(options.pageTarget, format);
  const units = resumeUnits(options, careerJourney, keywords);
  const rolesById = new Map<string, any>((careerJourney?.roles || []).filter((r: any) => r?.id).map((r: any) => [r.id, r]));
  const condensed = rolesRecentFirst(careerJourney).filter((r) => r?.id && roleMode(options, r.id) === 'condensed');
  const unitLine = (unit: ResumeUnit) => {
    const cap = purpose === 'resume' ? ` — at most ${budget[unit.primaryId]} bullets` : '';
    if (unit.roleIds.length === 1) return `  - roleId ${unit.primaryId}: ${roleLine(rolesById.get(unit.primaryId))}${cap}`;
    const members = unit.roleIds.map((id) => `${id} ${roleLine(rolesById.get(id))}`).join('; ');
    return `  - roleId ${unit.primaryId}, ONE combined entry for ${unit.company} covering roleIds [${unit.roleIds.join(', ')}] (${members})${cap}`;
  };

  const lines = [
    'Resume Constraints (chosen by the candidate for this resume; they override any other length, page-count, bullet-count, or role-selection guidance above):',
    `- Page target: ${options.pageTarget === 1 ? '1 page' : '2 pages'} maximum, US Letter. Stay inside it; cut weaker bullets rather than overflowing.`,
    purpose === 'resume'
      ? '- Experience: write an entry ONLY for each item below, most recent first, and set each entry\'s roleId to the id shown. Never add any other employer or role.'
      : '- roleStrategies: one entry per item below and no others, with roleId set to the id shown.',
    ...units.map(unitLine),
  ];
  if (units.length === 0) lines.push('  - (none — the candidate chose no full roles; leave experience empty)');
  if (units.some((u) => u.roleIds.length > 1)) {
    lines.push(
      purpose === 'resume'
        ? '- A combined entry is ONE experience entry for that employer: roleId is the id shown, roleIds lists every id it covers, and its title is one hybrid title spanning the real titles and scope (e.g. "Head of Solution Consulting | Chief Strategy Officer"). Draw its bullets from all of its roles, strongest first. The app fills in its dates.'
        : '- A combined entry gets one roleStrategies item (roleId as shown) whose titleReframe is one hybrid title spanning all of its roles.'
    );
  }
  if (purpose === 'resume') {
    lines.push(
      '- Bullet limits are ceilings, not targets. Fewer proven bullets beat filler: every bullet should rest on a specific deliverable or achievement in the Career Journey and cite it in evidenceRefs. Never pad a role with generic duties ("managed agile delivery", "coordinated with stakeholders") to reach a limit.',
      '- Order each role\'s bullets strongest-first for this JD, so trimming from the end loses the least.',
      '- Every number on the resume (percentages, dollar amounts, counts, team sizes, multiples) must appear in the Career Journey or the candidate-confirmed experience. Never compute a new figure from others ("2 weeks to 3 days" stays as written, never "80% faster"), round up, or estimate one.',
      format.roleNarratives
        ? '- Give every experience entry a narrative: 1–2 sentences, at most 35 words, on the scope of the role (what the candidate owned, team or reporting line, the mandate) in the JD\'s vocabulary. It frames the bullets; it must not repeat one.'
        : '- Leave every experience entry\'s narrative empty.',
      format.boldLeads
        ? '- Give the 3–5 bullets per entry that best demonstrate the JD\'s top signals a lead: a 2–5 word label in the JD\'s vocabulary ("POC & technical validation", "Post-sale adoption & expansion"), no trailing colon, not repeated in the bullet text. Leave lead empty on the remaining bullets.'
        : '- Leave every bullet\'s lead empty.'
    );
    lines.push(
      format.selectedOutcomes
        ? '- Fill selectedOutcomes from the Resume Strategy\'s selectedOutcomes (as the candidate reviewed them): same order, same facts and numbers, none added. Each has a lead (a 2–5 word label naming the capability, e.g. "Revenue scaling", no colon) and text (one sentence of at most 20 words stating the result with its real numbers). Don\'t repeat an outcome word for word in a bullet; a bullet may cover the same work with different detail.'
        : '- Leave selectedOutcomes empty.'
    );
  } else if (format.selectedOutcomes) {
    lines.push('- selectedOutcomes: 4–5 entries, each "Lead label: one sentence", taken from the candidate\'s strongest quantified results for this JD with the real numbers from the Career Journey. They appear on the resume as a Selected Outcomes section before Experience.');
  }
  lines.push(
    `- Summary: at most ${limits.summaryWords} words, written as 3–5 complete sentences in implied first person (no "I", "my" or "me"; no telegraphic fragments or keyword lists). Include the candidate's strongest quantified outcome for this JD with its real numbers exactly as the Career Journey states them.`,
    `- Skills: at most ${limits.skillRows} category rows. Rows list skills, tools and methods only — never a JD sentence, an audience ("CTOs"), or a slogan — and each term appears once, with no variants or synonyms of a term already listed. At most 8 terms per row.`
  );
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

/** companyKey without a trailing legal suffix, so "Nymbl" and "Nymbl, Inc." count as one employer. */
function employerKey(value: string | undefined): string {
  return companyKey((value || '').replace(/[\s,]+(inc|llc|l\.l\.c|ltd|limited|corp|corporation|co|gmbh|plc|pty|pbc)\.?$/i, ''));
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

function hasEvidence(bullet: { evidenceRefs?: EvidenceRef[] } | string): boolean {
  return typeof bullet !== 'string' && (bullet?.evidenceRefs?.length ?? 0) > 0;
}

/** Cuts a role's bullets down to `max`, dropping uncited bullets (from the end) before any cited one. Order is otherwise kept. */
export function trimBullets<T extends { evidenceRefs?: EvidenceRef[] } | string>(bullets: T[], max: number): T[] {
  const out = [...bullets];
  while (out.length > max) {
    let drop = -1;
    for (let i = out.length - 1; i >= 0; i--) {
      if (!hasEvidence(out[i])) { drop = i; break; }
    }
    out.splice(drop === -1 ? out.length - 1 : drop, 1);
  }
  return out;
}

/** "**POC Delivery:** Ran …" / "POC Delivery: Ran …" → { lead, text }. Only a short phrase (≤ 6 words, no comma or period) before the colon counts as a label. */
export function parseOutcome(raw: string): ResumeOutcome {
  const clean = (raw || '').replace(/\*\*/g, '').trim();
  const m = clean.match(/^([^:,.]{2,60}):\s+(.+)$/s);
  return m && m[1].trim().split(/\s+/).length <= 6 ? { lead: m[1].trim(), text: m[2].trim() } : { lead: '', text: clean };
}

/** Resume education lines straight from the Career Journey — the fallback when the model returns none. */
export function educationFromCareerJourney(careerJourney: any): GeneratedResume['education'] {
  return (careerJourney?.education || []).filter((e: any) => e?.institution).map((e: any) => {
    const program = String(e.program || '').trim();
    const type = String(e.degree_type || '').trim();
    const degree = /coursework/i.test(type)
      ? `${program} coursework`.trim()
      : /\b(B\.?[AS]\.?|M\.?[AS]\.?|MBA|Ph\.?D|Bachelor|Master|Associate|Doctor)/i.test(program) || !type
        ? program
        : `${type}, ${program}`;
    const start = firstYear(String(e.start || ''));
    const end = formatResumeDate(e.end) ?? (e.end ? String(e.end) : '');
    const completed = !/coursework|not completed/i.test(`${type} ${e.completion_status || ''}`);
    return { institution: e.institution, degree: degree || type, graduationDate: completed || !start ? end : `${start} – ${firstYear(String(e.end || '')) ?? end}` };
  });
}

/** A model-written bullet lead, tidied: no markdown bold, no trailing colon or dash. */
function cleanLead(lead: unknown): string {
  return typeof lead === 'string' ? lead.replace(/\*\*/g, '').replace(/[\s:–—-]+$/, '').trim() : '';
}

/**
 * Hard guarantee applied to the model's output: drops experience entries for
 * any role that isn't 'full' (or duplicates), files every entry under its
 * resume unit (separate entries the model wrote for roles of one combined
 * employer are merged into one), caps bullets to the budget (uncited bullets
 * go first), orders entries most recent first, and rebuilds earlierExperience
 * from the Career Journey. Dates, name and contact line are rewritten from the
 * Career Journey too, so the model can't leak ISO dates or an unformatted
 * phone number. Layout fields whose format toggle is off are stripped; with
 * selectedOutcomes on, the outcomes come from the strategy (as the candidate
 * edited them on Strategy Review). Entries that can't be matched to any role
 * are kept (better than silently losing real work) but reported.
 */
export function enforceResumeConstraints(
  resume: GeneratedResume,
  options: ResumeBuildOptions,
  careerJourney: any,
  keywords?: KeywordSignal[],
  strategy?: { selectedOutcomes?: string[] }
): { resume: GeneratedResume; warnings: string[] } {
  const warnings: string[] = [];
  const format = resumeFormat(options);
  const budget = computeBulletBudget(options, careerJourney, keywords);
  const units = resumeUnits(options, careerJourney, keywords);
  const unitOf = new Map<string, ResumeUnit>(units.flatMap((u) => u.roleIds.map((id) => [id, u] as [string, ResumeUnit])));
  const unitRank = new Map<string, number>(units.map((u, i) => [u.primaryId, i]));
  const seenRoles = new Set<string>();
  const byUnit = new Map<string, GeneratedResume['experience'][number]>();
  const unmatched: GeneratedResume['experience'] = [];

  for (const raw of resume?.experience || []) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = { ...raw, bullets: Array.isArray(raw.bullets) ? raw.bullets : [] };
    const roleId = resolveExperienceRoleId(entry, careerJourney);
    if (!roleId) {
      // Keep real-looking work the model couldn't match; drop anything that isn't an experience entry at all (e.g. an education item filed here).
      if (!entry.company || entry.bullets.length === 0) {
        warnings.push(`Dropped a malformed experience entry${entry.company ? ` for "${entry.company}"` : ''}.`);
        continue;
      }
      warnings.push(`"${entry.company}" doesn't match any role in your Career Journey — kept, but check it.`);
      unmatched.push(entry);
      continue;
    }
    const unit = unitOf.get(roleId);
    if (!unit) {
      warnings.push(`Removed "${entry.company}" — that role is set to ${roleMode(options, roleId)}.`);
      continue;
    }
    if (seenRoles.has(roleId)) {
      warnings.push(`Removed a duplicate entry for "${entry.company}".`);
      continue;
    }
    seenRoles.add(roleId);
    const existing = byUnit.get(unit.primaryId);
    if (existing) {
      warnings.push(`Combined a separate "${entry.title}" entry into the ${unit.company} entry.`);
      byUnit.set(unit.primaryId, { ...existing, bullets: [...(existing.bullets || []), ...(entry.bullets || [])] });
      continue;
    }
    byUnit.set(unit.primaryId, entry);
  }

  // ats_tactics.md: bold leads only on the bullets that carry the JD's top signals, never all of them.
  const MAX_LEADS = 5;
  const experience = [...byUnit.entries()]
    .sort(([a], [b]) => (unitRank.get(a) ?? 0) - (unitRank.get(b) ?? 0))
    .map(([primaryId, entry]) => {
      const unit = unitOf.get(primaryId)!;
      const max = budget[primaryId] ?? MAX_BULLETS_PER_ROLE;
      const bullets = (entry.bullets || []).map((raw) => {
        const b = typeof raw === 'string' ? { text: raw } : raw;
        const { lead, ...rest } = b;
        const cleaned = format.boldLeads ? cleanLead(lead) : '';
        return cleaned ? { ...rest, lead: cleaned } : rest;
      });
      if (bullets.length > max) warnings.push(`Trimmed "${entry.company}" from ${bullets.length} to ${max} bullets.`);
      const kept = trimBullets(bullets, max);
      let leads = 0;
      const labelled = kept.map((b, i) => {
        if (!('lead' in b)) return b;
        const everyOneLabelled = kept.length > 3 && i === kept.length - 1 && leads === i;
        if (leads >= MAX_LEADS || everyOneLabelled) {
          const { lead: _drop, ...plain } = b;
          return plain;
        }
        leads++;
        return b;
      });
      const { narrative, roleIds: _ids, ...rest } = entry;
      const narrativeText = format.roleNarratives && typeof narrative === 'string' ? narrative.trim() : '';
      return {
        ...rest,
        roleId: primaryId,
        ...(unit.roleIds.length > 1 ? { roleIds: unit.roleIds } : {}),
        dates: unitDates(unit.roleIds, careerJourney) ?? entry.dates,
        ...(narrativeText ? { narrative: narrativeText } : {}),
        bullets: labelled,
      };
    });

  const person = careerJourney?.person;
  const contactInfo = person && (person.email || person.phone) ? formatContactLine(person) : resume?.contactInfo;
  const modelEducation = (resume?.education || []).filter((ed) => ed && typeof ed === 'object' && ed.institution);
  const education = modelEducation.length > 0
    ? modelEducation.map((ed) => ({ ...ed, graduationDate: formatResumeDate(ed.graduationDate) ?? ed.graduationDate }))
    : educationFromCareerJourney(careerJourney);
  const { selectedOutcomes: modelOutcomes, skillsPosition: _pos, ...base } = resume || ({} as GeneratedResume);
  // With the format on: the writer's structured outcomes (built from the reviewed strategy), else the strategy's own lines parsed.
  const written = (Array.isArray(modelOutcomes) ? modelOutcomes : [])
    .filter((o) => o && typeof o.text === 'string' && o.text.trim())
    .map((o) => ({ lead: cleanLead(o.lead), text: o.text.trim() }));
  const outcomes = !format.selectedOutcomes
    ? []
    : (written.length > 0
      ? written
      : (strategy?.selectedOutcomes || []).filter((o) => typeof o === 'string' && o.trim()).map(parseOutcome)
    ).slice(0, 6);
  return {
    resume: {
      ...base,
      ...(person?.name ? { name: person.name } : {}),
      contactInfo,
      education,
      ...(outcomes.length > 0 ? { selectedOutcomes: outcomes } : {}),
      ...(format.skillsPosition === 'bottom' ? { skillsPosition: 'bottom' as const } : {}),
      experience: [...experience, ...unmatched],
      earlierExperience: buildEarlierExperience(options, careerJourney),
    },
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
