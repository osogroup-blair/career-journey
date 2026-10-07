import {
  LeadMetric,
  SPOTLIGHT_MAX_CAPTION,
  SPOTLIGHT_MAX_HEADLINE,
  SPOTLIGHT_MAX_OUTCOMES,
  SPOTLIGHT_MAX_PINNED_ACHIEVEMENTS,
  SPOTLIGHT_ROLE_MODES,
  SpotlightAchievement,
  SpotlightChange,
  SpotlightDeliverable,
  SpotlightEvidenceRef,
  SpotlightRole,
  SpotlightRoleMode,
  SpotlightSettings,
  SpotlightSettingsSchema,
  SpotlightSnapshot,
  SpotlightWarning,
} from '../types/spotlight';
import { defaultBuildOptions, rolesRecentFirst } from './resumeBuild';

/**
 * Builds the public Career Spotlight from a Career Journey plus the owner's settings.
 * Pure and shared: the in-app preview and the server's publish route both call it,
 * so what the owner previews is exactly what gets published.
 *
 * Privacy rule for this file: every output object is constructed field by field from
 * an allowlist. Never spread a Career Journey object (`{ ...role }`) into the output —
 * every schema is `.passthrough()`, so a spread would publish whatever unknown fields
 * the owner's data carries (private notes, future additions). The sentinel test in
 * src/lib/__tests__/spotlightSnapshot.test.ts fails if anything slips through.
 *
 * Hidden roles are hidden everywhere: their deliverables leave every evidence list,
 * their achievements leave the featured list and the index, and their dates don't
 * count towards the career start year.
 */

// ---------- small, defensive readers (input is raw Firestore/localStorage data) ----------

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
const objList = (v: unknown): any[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const unique = <T>(list: T[]): T[] => [...new Set(list)];

// ---------- dates ----------

interface YearMonth {
  y: number;
  m: number | null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const isPresent = (v: unknown) => typeof v === 'string' && /\b(present|current|now|today)\b/i.test(v);

/** Reads '2022-03', '2022-03-15', '2022', 'Mar 2022', 'March 2022' or '03/2022'. */
export function parseYearMonth(value: unknown): YearMonth | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = s.match(/^((?:19|20)\d{2})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return { y: Number(m[1]), m: clampMonth(Number(m[2])) };
  m = s.match(/^(\d{1,2})\/((?:19|20)\d{2})$/);
  if (m) return { y: Number(m[2]), m: clampMonth(Number(m[1])) };
  m = s.match(/^([A-Za-z]{3,9})\.?\s+((?:19|20)\d{2})$/);
  if (m) {
    const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return { y: Number(m[2]), m: idx >= 0 ? idx + 1 : null };
  }
  m = s.match(/^((?:19|20)\d{2})$/);
  if (m) return { y: Number(m[1]), m: null };
  return null;
}

function clampMonth(n: number): number | null {
  return n >= 1 && n <= 12 ? n : null;
}

const formatYearMonth = (ym: YearMonth) => (ym.m ? `${ym.y}-${String(ym.m).padStart(2, '0')}` : String(ym.y));

/** A role's start/end, from start_date/end_date, falling back to the legacy `dates` string ("Mar 2022 – Present"). */
export function roleRange(role: any, now: Date = new Date()): { start: YearMonth | null; end: YearMonth | null; current: boolean } {
  const [fromDates, toDates] = typeof role?.dates === 'string' ? role.dates.split(/\s*[–—]\s*|\s+-\s+|\s+to\s+/i) : [];
  const start = parseYearMonth(role?.start_date) ?? parseYearMonth(fromDates);
  const endRaw = str(role?.end_date) ?? (role?.end_date === undefined ? str(toDates) : undefined);
  const current = isPresent(endRaw) || (!endRaw && isPresent(role?.dates));
  const end = current ? { y: now.getFullYear(), m: now.getMonth() + 1 } : parseYearMonth(endRaw);
  return { start, end, current };
}

function durationMonths(start: YearMonth | null, end: YearMonth | null): number | null {
  if (!start?.m || !end?.m) return null;
  const n = (end.y - start.y) * 12 + (end.m - start.m) + 1;
  return n > 0 ? n : null;
}

// ---------- figures ----------

const CURRENCY = '[$£€]';
const NUMBER = '\\d[\\d,]*(?:\\.\\d+)?';
const LEAD_METRIC = new RegExp(
  [
    `${CURRENCY}\\s?${NUMBER}\\s?(?:[KMB]|bn|million|billion)?\\b`, // $4M, £1.2 million
    `${NUMBER}\\s?%`, // 60%, 9.5 %
    `\\b${NUMBER}\\s?(?:→|->|to)\\s?${NUMBER}\\b`, // 3 to 11, 2.9 → 4.5
    `\\b${NUMBER}x\\b`, // 3x
  ].join('|'),
  'gi',
);
const YEAR = /^(?:19|20)\d{2}$/;

/**
 * The first figure in a sentence, for setting large on the page. Deterministic and
 * conservative: it never rewrites the number, and returns null rather than guess
 * (plain counts like "20+ tests" or years like "2023" are not figures).
 */
export function extractLeadMetric(text: unknown): LeadMetric | null {
  if (typeof text !== 'string') return null;
  for (const match of text.matchAll(LEAD_METRIC)) {
    const value = match[0].trim();
    const change = value.split(/\s?(?:→|->|\bto\b)\s?/i).map((p) => p.trim());
    // "from 2019 to 2021" is a date range, not a result.
    if (change.length === 2 && change.every((p) => YEAR.test(p))) continue;
    return { value, parts: change.length === 2 ? change : [value] };
  }
  return null;
}

// ---------- outcome evidence suggestions ----------

const STOPWORDS = new Set([
  'about', 'across', 'after', 'also', 'from', 'into', 'more', 'over', 'than', 'that', 'their', 'them', 'they',
  'this', 'through', 'using', 'were', 'what', 'when', 'which', 'while', 'with', 'within', 'without', 'year', 'years',
]);

function stem(word: string): string {
  return word.replace(/(ing|ed|es|s)$/, '');
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
      .map(stem),
  );
}

const normalizeFigure = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/→|->/g, 'to');

export interface EvidenceCandidate {
  ref: SpotlightEvidenceRef;
  text: string;
}

/**
 * Suggests up to three deliverables/achievements that back an outcome sentence:
 * ones whose text contains the same figure, or which share at least half of the
 * outcome's meaningful words. The owner can override the suggestion in settings.
 */
export function suggestOutcomeEvidence(outcome: string, candidates: EvidenceCandidate[], limit = 3): SpotlightEvidenceRef[] {
  const lead = extractLeadMetric(outcome);
  const figure = lead ? normalizeFigure(lead.value) : null;
  const words = tokens(outcome);
  return candidates
    .map((c, index) => {
      const figureMatch = !!figure && normalizeFigure(c.text).includes(figure);
      const theirs = tokens(c.text);
      const overlap = words.size ? [...words].filter((w) => theirs.has(w)).length / words.size : 0;
      return { c, index, figureMatch, overlap, score: (figureMatch ? 1 : 0) + overlap };
    })
    .filter((s) => s.figureMatch || s.overlap >= 0.5)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.c.ref);
}

// ---------- settings ----------

/**
 * Free text the owner is typing: capped but not trimmed, so the editor's controlled inputs
 * keep a trailing space mid-word. The snapshot trims it.
 */
const keepText = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);

const isRoleMode = (v: unknown): v is SpotlightRoleMode =>
  typeof v === 'string' && (SPOTLIGHT_ROLE_MODES as readonly string[]).includes(v);

/** A role's starting mode on the Spotlight: its résumé default (src/lib/resumeBuild.ts). */
export function defaultSpotlightRoleModes(careerJourney: any, now: Date = new Date()): Record<string, SpotlightRoleMode> {
  const out: Record<string, SpotlightRoleMode> = {};
  for (const [id, { mode }] of Object.entries(defaultBuildOptions(careerJourney, now).roles)) out[id] = mode;
  return out;
}

export function defaultSpotlightSettings(): SpotlightSettings {
  return SpotlightSettingsSchema.parse({});
}

/**
 * Validates settings (e.g. from a request body) against the real Career Journey:
 * unknown role ids and modes are dropped, lists are de-duplicated and capped, and
 * free text is trimmed to its limit. Garbage input falls back to the defaults.
 */
export function normalizeSpotlightSettings(raw: unknown, careerJourney: any): SpotlightSettings {
  const parsed = SpotlightSettingsSchema.safeParse(raw && typeof raw === 'object' ? raw : {});
  const s = parsed.success ? parsed.data : defaultSpotlightSettings();
  const roleIds = new Set(objList(careerJourney?.roles).map((r) => r.id));
  const roles: Record<string, string> = {};
  for (const [id, mode] of Object.entries(s.roles)) if (roleIds.has(id) && isRoleMode(mode)) roles[id] = mode;

  const seenOutcomes = new Set<string>();
  const outcomes = s.outcomes
    ?.map((o) => ({
      text: o.text.trim(),
      caption: keepText(o.caption, SPOTLIGHT_MAX_CAPTION),
      evidence: o.evidence ? unique(strList(o.evidence)).slice(0, 6) : undefined,
    }))
    .filter((o) => o.text && !seenOutcomes.has(o.text) && seenOutcomes.add(o.text))
    .slice(0, SPOTLIGHT_MAX_OUTCOMES);

  return {
    ...s,
    slug: str(s.slug)?.toLowerCase(),
    headline: keepText(s.headline, SPOTLIGHT_MAX_HEADLINE),
    outcomes,
    roles,
    pinnedAchievements: s.pinnedAchievements ? unique(strList(s.pinnedAchievements)).slice(0, SPOTLIGHT_MAX_PINNED_ACHIEVEMENTS) : undefined,
  };
}

// ---------- slugs ----------

export const SPOTLIGHT_RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'assets', 'billing', 'demo', 'edit', 'help', 'login', 'logout', 'new', 'privacy',
  'refunds', 's', 'settings', 'signup', 'spotlight', 'static', 'support', 'terms', 'www',
]);

export type SlugCheck = { ok: true; slug: string } | { ok: false; reason: 'too_short' | 'too_long' | 'invalid_characters' | 'reserved' };

/** Lowercase letters, digits and single hyphens, 3–40 characters, not a reserved word. */
export function validateSpotlightSlug(raw: unknown): SlugCheck {
  const slug = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (slug.length < 3) return { ok: false, reason: 'too_short' };
  if (slug.length > 40) return { ok: false, reason: 'too_long' };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: false, reason: 'invalid_characters' };
  if (SPOTLIGHT_RESERVED_SLUGS.has(slug)) return { ok: false, reason: 'reserved' };
  return { ok: true, slug };
}

/** "Jordan Rivera" → "jordan-rivera". May still need validateSpotlightSlug (e.g. a very short name). */
export function suggestSpotlightSlug(name: unknown): string {
  return (typeof name === 'string' ? name : '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

// ---------- the build ----------

export interface SpotlightBuild {
  snapshot: SpotlightSnapshot;
  warnings: SpotlightWarning[];
}

/** Scope chips from structured team data only — free-text notes on a role are never published. */
function roleScope(role: any): { chips: string[]; peak: number | null } {
  const team = role?.team_leadership && typeof role.team_leadership === 'object' ? role.team_leadership : null;
  const startSize = num(team?.starting_size);
  const peak = num(team?.peak_size);
  const chips: string[] = [];
  if (startSize !== null && peak !== null && peak > startSize) chips.push(`Grew team from ${startSize} to ${peak}`);
  else if (peak !== null) chips.push(`Team of up to ${peak}`);
  return { chips, peak };
}

export function buildSpotlightSnapshot(careerJourney: any, rawSettings: unknown, now: Date = new Date()): SpotlightBuild {
  const cj = careerJourney && typeof careerJourney === 'object' ? careerJourney : {};
  const settings = normalizeSpotlightSettings(rawSettings, cj);
  const warnings: SpotlightWarning[] = [];
  const person = cj.person && typeof cj.person === 'object' ? cj.person : {};
  const positioning = person.positioning && typeof person.positioning === 'object' ? person.positioning : {};
  const links = cj.links && typeof cj.links === 'object' ? cj.links : {};

  // Roles: résumé default, then the owner's override. Excluded roles drop out here.
  const modes = { ...defaultSpotlightRoleModes(cj, now), ...(settings.roles as Record<string, SpotlightRoleMode>) };
  const visibleRoles = rolesRecentFirst({ roles: objList(cj.roles) }).filter(
    (r: any) => str(r.id) && (modes[r.id] ?? 'full') !== 'excluded',
  );
  const visibleRoleIds = new Set<string>(visibleRoles.map((r: any) => r.id));
  if (!visibleRoles.length) warnings.push({ code: 'no_visible_roles', message: 'No roles are shown. Set at least one role to Full or One line.' });

  // Achievements and their links, restricted to visible roles.
  const achievementRoles = new Map<string, Set<string>>();
  for (const a of objList(cj.achievements)) {
    if (!str(a.id)) continue;
    achievementRoles.set(a.id, new Set(strList(a.role_ids)));
  }
  for (const m of objList(links.timeline_mappings)) {
    if (m.entity_type === 'achievement' && str(m.role_id) && achievementRoles.has(m.entity_id)) achievementRoles.get(m.entity_id)!.add(m.role_id);
  }
  const isEligibleAchievement = (id: string) => {
    const roles = achievementRoles.get(id);
    if (!roles) return false;
    return roles.size === 0 || [...roles].some((r) => visibleRoleIds.has(r));
  };

  const deliverableToAchievement = new Map<string, string>();
  for (const l of objList(links.deliverable_achievement)) {
    const d = str(l.deliverable_id), a = str(l.achievement_id);
    if (d && a && isEligibleAchievement(a) && !deliverableToAchievement.has(d)) deliverableToAchievement.set(d, a);
  }

  // Roles, initiatives, deliverables.
  const roles: SpotlightRole[] = [];
  const deliverables: { d: SpotlightDeliverable; roleId: string }[] = [];
  let careerStartYear: number | null = null;
  let largestTeam: number | null = null;
  for (const r of visibleRoles) {
    const range = roleRange(r, now);
    if (range.start && (careerStartYear === null || range.start.y < careerStartYear)) careerStartYear = range.start.y;
    const scope = roleScope(r);
    if (scope.peak !== null && (largestTeam === null || scope.peak > largestTeam)) largestTeam = scope.peak;

    const initiatives = objList(r.initiatives).filter((i) => str(i.id)).map((i) => ({
      id: i.id as string,
      name: str(i.name) ?? '',
      description: str(i.description),
      deliverables: objList(i.deliverables).filter((d) => str(d.id) && str(d.description)).map((d): SpotlightDeliverable => {
        const impact = str(d.impact);
        const out: SpotlightDeliverable = {
          id: d.id,
          description: str(d.description)!,
          impact,
          lead: extractLeadMetric(impact),
          skillIds: unique(strList(d.skill_ids)),
          capabilityIds: unique(strList(d.capability_alignment)),
        };
        const achievementId = deliverableToAchievement.get(d.id);
        if (achievementId) out.achievementId = achievementId;
        deliverables.push({ d: out, roleId: r.id });
        return out;
      }),
    }));

    const roleDeliverables = initiatives.flatMap((i) => i.deliverables);
    const highlightIds = roleDeliverables
      .map((d, index) => ({ d, index }))
      .filter(({ d }) => d.impact && /\d/.test(d.impact))
      .sort((a, b) => Number(!a.d.lead) - Number(!b.d.lead) || a.index - b.index)
      .slice(0, 2)
      .map(({ d }) => d.id);

    roles.push({
      id: r.id,
      title: str(r.title) ?? '',
      organization: str(r.organization) ?? str(r.company) ?? '',
      descriptor: str(r.company_descriptor),
      location: str(r.location),
      start: range.start ? formatYearMonth(range.start) : undefined,
      end: !range.current && range.end ? formatYearMonth(range.end) : undefined,
      current: range.current,
      durationMonths: durationMonths(range.start, range.end),
      mode: modes[r.id] === 'condensed' ? 'condensed' : 'full',
      description: str(r.description),
      scope: scope.chips,
      highlightIds,
      initiatives,
      achievementIds: [], // filled once the achievement index exists, below
    });
  }
  const deliverableById = new Map(deliverables.map((x) => [x.d.id, x]));

  // Achievements: every eligible one goes in the index; featured are pinned or suggested.
  const achievementItems: SpotlightAchievement[] = objList(cj.achievements)
    .filter((a) => str(a.id) && str(a.title) && isEligibleAchievement(a.id))
    .map((a) => {
      const item: SpotlightAchievement = {
        id: a.id,
        title: str(a.title)!,
        description: str(a.description),
        category: str(a.category),
        roleIds: [...achievementRoles.get(a.id)!].filter((r) => visibleRoleIds.has(r)),
      };
      const deliverableId = [...deliverableToAchievement.entries()].find(([d, ach]) => ach === a.id && deliverableById.has(d))?.[0];
      if (deliverableId) item.deliverableId = deliverableId;
      return item;
    });
  const achievementById = new Map(achievementItems.map((a) => [a.id, a]));
  for (const role of roles) {
    // An achievement linked to one of the role's deliverables is shown on that deliverable, not again here.
    const onDeliverables = new Set(role.initiatives.flatMap((i) => i.deliverables.map((d) => d.achievementId)));
    role.achievementIds = achievementItems.filter((a) => a.roleIds.includes(role.id) && !onDeliverables.has(a.id)).map((a) => a.id);
  }
  const roleRank = new Map(roles.map((r, i) => [r.id, i]));

  let featuredIds: string[];
  if (settings.pinnedAchievements) {
    featuredIds = [];
    for (const id of settings.pinnedAchievements) {
      if (achievementById.has(id)) featuredIds.push(id);
      else if (achievementRoles.has(id))
        warnings.push({ code: 'pinned_achievement_hidden', message: `A pinned achievement belongs to a hidden role and is not shown.` });
      else warnings.push({ code: 'pinned_achievement_missing', message: `A pinned achievement is no longer in your Career Journey.` });
    }
  } else {
    const rank = (a: SpotlightAchievement) => Math.min(...a.roleIds.map((r) => roleRank.get(r) ?? Infinity), Infinity);
    featuredIds = achievementItems
      .map((a, index) => ({ a, index }))
      .filter(({ a }) => /\d/.test(`${a.title} ${a.description ?? ''}`))
      .sort((x, y) => rank(x.a) - rank(y.a) || x.index - y.index)
      .slice(0, SPOTLIGHT_MAX_PINNED_ACHIEVEMENTS)
      .map(({ a }) => a.id);
  }

  // Outcomes: only sentences that exist in the Career Journey are ever published.
  const signature = strList(person.signature_outcomes);
  const choices = settings.outcomes ?? signature.slice(0, SPOTLIGHT_MAX_OUTCOMES).map((text) => ({ text, caption: undefined, evidence: undefined }));
  const candidates: EvidenceCandidate[] = [
    ...deliverables.map(({ d }) => ({ ref: { type: 'deliverable' as const, id: d.id }, text: `${d.description} ${d.impact ?? ''}` })),
    ...achievementItems.map((a) => ({ ref: { type: 'achievement' as const, id: a.id }, text: `${a.title} ${a.description ?? ''}` })),
  ];
  const outcomes = choices.flatMap((choice) => {
    if (!signature.includes(choice.text)) {
      warnings.push({ code: 'outcome_missing', message: `"${choice.text.slice(0, 60)}" is no longer one of your signature outcomes, so it isn't shown.` });
      return [];
    }
    let evidence: SpotlightEvidenceRef[];
    if (choice.evidence) {
      evidence = choice.evidence.flatMap((id): SpotlightEvidenceRef[] =>
        deliverableById.has(id) ? [{ type: 'deliverable', id }] : achievementById.has(id) ? [{ type: 'achievement', id }] : [],
      );
      if (evidence.length < choice.evidence.length)
        warnings.push({ code: 'outcome_evidence_missing', message: `Some evidence chosen for "${choice.text.slice(0, 60)}" is hidden or no longer exists.` });
    } else {
      evidence = suggestOutcomeEvidence(choice.text, candidates);
    }
    return [{ text: choice.text, lead: extractLeadMetric(choice.text), caption: str(choice.caption), evidence }];
  });

  // Capabilities and skills, each with the visible deliverables that demonstrate them.
  const deliverablesFor = (pick: (d: SpotlightDeliverable) => string[], id: string) =>
    deliverables.filter(({ d }) => pick(d).includes(id)).map(({ d }) => d.id);
  const capabilities = settings.sections.capabilities
    ? objList(cj.capabilities).filter((c) => str(c.id) && str(c.name)).map((c) => ({
        id: c.id as string,
        name: str(c.name)!,
        description: str(c.description),
        level: settings.showLevels ? str(c.maturity_level) : undefined,
        functions: objList(c.functions).map((f) => str(f.name)).filter((n): n is string => !!n),
        deliverableIds: deliverablesFor((d) => d.capabilityIds, c.id),
      }))
    : [];

  const skillSources = [
    ...objList(cj.skills_index),
    ...objList(cj.capabilities).flatMap((c) => objList(c.functions).flatMap((f) => objList(f.skills))),
  ];
  const skills = settings.sections.skills
    ? unique(skillSources.map((s) => str(s.id)).filter((id): id is string => !!id)).flatMap((id) => {
        const s = skillSources.find((x) => x.id === id && str(x.name));
        if (!s) return [];
        return [{
          id,
          name: str(s.name)!,
          category: str(s.category),
          years: num(s.years_experience) ?? undefined,
          lastUsed: str(s.last_used),
          level: settings.showLevels ? str(s.proficiency) : undefined,
          deliverableIds: deliverablesFor((d) => d.skillIds, id),
        }];
      })
    : [];

  // Glance facts, from visible roles only.
  const current = roles.find((r) => r.current);
  const visibleEntityIds = new Set<string>([
    ...visibleRoleIds,
    ...roles.flatMap((r) => r.initiatives.map((i) => i.id)),
    ...deliverables.map(({ d }) => d.id),
  ]);
  const industries = unique(
    objList(links.industries)
      .filter((l) => visibleEntityIds.has(l.entity_id ?? l.role_id))
      .map((l) => str(l.industry))
      .filter((i): i is string => !!i),
  );

  const summary = str(person.summary);
  const statedYears = summary?.match(/\b(\d{1,2})\+?\s+years?\b/i);
  if (statedYears && careerStartYear !== null) {
    const span = now.getFullYear() - careerStartYear;
    if (Math.abs(Number(statedYears[1]) - span) >= 2)
      warnings.push({
        code: 'summary_years_mismatch',
        message: `Your summary says ${statedYears[1]} years, but your roles start in ${careerStartYear} (about ${span} years). The page shows the start year; consider updating the summary.`,
      });
  }

  // Contact: a channel is shown when the owner allows it and the Profile has a value.
  const c = settings.contact;
  const contact: SpotlightSnapshot['contact'] = {};
  if (c.linkedin !== false && str(person.linkedin)) contact.linkedin = str(person.linkedin);
  if (c.website !== false && str(person.website)) contact.website = str(person.website);
  if (c.github !== false && str(person.github)) contact.github = str(person.github);
  if (c.phone === true && str(person.phone)) contact.phone = str(person.phone);
  const email = str(person.email)?.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
  if (c.email === true && email) contact.email = { user: email[1], domain: email[2] };

  const sections = settings.sections;
  const snapshot: SpotlightSnapshot = {
    schemaVersion: 1,
    builtAt: now.toISOString(),
    journeyVersion: str(cj.meta?.version) ?? '',
    visibility: settings.visibility,
    person: {
      name: str(person.name) ?? '',
      headline: str(settings.headline) ?? str(person.brand) ?? str(positioning.primary_tagline),
      summary,
      location: str(person.location),
      workPreference: str(person.work_preference),
      availability: settings.availability === 'hidden' ? null : settings.availability,
      targetRoles: settings.showTargetRoles ? strList(positioning.target_role_families) : [],
      roleOrientation: settings.showTargetRoles ? str(positioning.role_orientation) : undefined,
    },
    glance: {
      careerStartYear,
      organizationCount: new Set(roles.map((r) => r.organization.toLowerCase()).filter(Boolean)).size,
      current: current ? { title: current.title, organization: current.organization } : null,
      largestTeam,
      industries,
    },
    contact,
    outcomes,
    roles,
    achievements: { featuredIds, items: achievementItems },
    capabilities,
    skills,
    methodologies: sections.howIWork
      ? objList(cj.methodologies).filter((m) => str(m.id) && str(m.name)).map((m) => ({
          id: m.id as string,
          name: str(m.name)!,
          description: str(m.description),
          context: str(m.context),
        }))
      : [],
    principles: sections.howIWork ? strList(positioning.narrative_anchors) : [],
    education: sections.background
      ? objList(cj.education).filter((e) => str(e.id) && (str(e.institution) || str(e.program))).map((e) => ({
          id: e.id as string,
          institution: str(e.institution) ?? '',
          program: str(e.program) ?? '',
          degreeType: str(e.degree_type),
          endYear: (parseYearMonth(e.end) ?? parseYearMonth(str(e.dates)?.split(/\s*[–—-]\s*/).pop()))?.y ?? null,
          status: str(e.completion_status),
        }))
      : [],
    certifications: sections.background
      ? objList(cj.certifications).filter((x) => str(x.id) && (str(x.name) ?? str(x.title))).map((x) => ({
          id: x.id as string,
          name: (str(x.name) ?? str(x.title))!,
          issuer: str(x.issuer) ?? str(x.issuing_organization),
          year: parseYearMonth(str(x.date) ?? str(x.issued))?.y ?? null,
        }))
      : [],
    engagements: sections.background
      ? objList(cj.customer_engagements).filter((e) => e.display === true && str(e.id) && str(e.client)).map((e) => ({
          id: e.id as string,
          client: str(e.client)!,
          project: str(e.project),
          description: str(e.description),
          dates: str(e.dates),
        }))
      : [],
    sections,
    style: { skin: settings.skin, accent: settings.accent, showBadge: settings.showBadge },
  };
  return { snapshot, warnings };
}

// ---------- what changed since the last publish ----------

type Keyed = { id: string };

function diffList<T extends Keyed>(
  before: T[],
  after: T[],
  entity: SpotlightChange['entity'],
  label: (x: T) => string,
  where?: (x: T) => string | undefined,
): SpotlightChange[] {
  const prev = new Map(before.map((x) => [x.id, x]));
  const next = new Map(after.map((x) => [x.id, x]));
  const out: SpotlightChange[] = [];
  const at = (x: T) => (where ? { where: where(x) } : {});
  for (const [id, x] of next) {
    const old = prev.get(id);
    if (!old) out.push({ kind: 'added', entity, id, label: label(x), ...at(x) });
    else if (JSON.stringify(old) !== JSON.stringify(x)) out.push({ kind: 'edited', entity, id, label: label(x), ...at(x) });
  }
  for (const [id, x] of prev) if (!next.has(id)) out.push({ kind: 'removed', entity, id, label: label(x), ...at(x) });
  return out;
}

/**
 * Entity-level differences between the published snapshot and a fresh build, for the
 * "your journey changed since you published" banner. Ignores `builtAt`.
 */
export function diffSpotlightSnapshots(published: SpotlightSnapshot, fresh: SpotlightSnapshot): SpotlightChange[] {
  const roleShell = (r: SpotlightRole) => ({
    id: r.id, title: r.title, organization: r.organization, descriptor: r.descriptor, location: r.location,
    start: r.start, end: r.end, current: r.current, mode: r.mode, description: r.description, scope: r.scope,
  });
  const delivs = (s: SpotlightSnapshot) =>
    s.roles.flatMap((r) => r.initiatives.flatMap((i) => i.deliverables.map((d) => ({ ...d, where: `${r.title} at ${r.organization}`, initiative: i.name }))));
  const background = (s: SpotlightSnapshot) => [
    ...s.education.map((e) => ({ ...e, label: e.program || e.institution })),
    ...s.certifications.map((c) => ({ ...c, label: c.name })),
    ...s.engagements.map((e) => ({ ...e, label: e.client })),
    ...s.methodologies.map((m) => ({ ...m, label: m.name })),
  ];
  const profile = (s: SpotlightSnapshot) => JSON.stringify([s.person, s.contact, s.glance, s.principles]);
  const page = (s: SpotlightSnapshot) => JSON.stringify([s.visibility, s.sections, s.style, s.achievements.featuredIds]);

  return [
    ...(profile(published) !== profile(fresh) ? [{ kind: 'edited' as const, entity: 'profile' as const, id: 'profile', label: 'Introduction and contact details' }] : []),
    ...diffList(
      published.outcomes.map((o) => ({ ...o, id: o.text })),
      fresh.outcomes.map((o) => ({ ...o, id: o.text })),
      'outcome',
      (o) => o.text,
    ),
    ...diffList(published.roles.map(roleShell), fresh.roles.map(roleShell), 'role', (r) => `${r.title} at ${r.organization}`),
    ...diffList(delivs(published), delivs(fresh), 'deliverable', (d) => d.description, (d) => d.where),
    ...diffList(published.achievements.items, fresh.achievements.items, 'achievement', (a) => a.title),
    ...diffList(published.capabilities, fresh.capabilities, 'capability', (c) => c.name),
    ...diffList(published.skills, fresh.skills, 'skill', (s) => s.name),
    ...diffList(background(published), background(fresh), 'background', (b) => b.label),
    ...(page(published) !== page(fresh) ? [{ kind: 'edited' as const, entity: 'page' as const, id: 'page', label: 'Page settings' }] : []),
  ];
}

const ENTITY_NOUN: Record<SpotlightChange['entity'], [string, string]> = {
  profile: ['introduction change', 'introduction changes'],
  outcome: ['outcome', 'outcomes'],
  role: ['role', 'roles'],
  deliverable: ['deliverable', 'deliverables'],
  achievement: ['achievement', 'achievements'],
  capability: ['capability', 'capabilities'],
  skill: ['skill', 'skills'],
  background: ['background item', 'background items'],
  page: ['page setting change', 'page setting changes'],
};
const KIND_WORD: Record<SpotlightChange['kind'], string> = { added: 'new', edited: 'edited', removed: 'removed' };

/** "1 new deliverable in Senior Product Manager at Meridian Cloudworks, 1 edited achievement and 2 new skills". Empty string when nothing changed. */
export function summarizeSpotlightChanges(changes: SpotlightChange[]): string {
  const groups = new Map<string, SpotlightChange[]>();
  for (const c of changes) {
    const key = c.entity === 'profile' || c.entity === 'page' ? c.entity : `${c.kind}:${c.entity}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const parts = [...groups.values()].map((list) => {
    const { kind, entity } = list[0];
    const [one, many] = ENTITY_NOUN[entity];
    if (entity === 'profile' || entity === 'page') return one.replace(/ change$/, ' changes');
    const places = unique(list.map((c) => c.where).filter(Boolean));
    const where = places.length === 1 ? ` in ${places[0]}` : '';
    return `${list.length} ${KIND_WORD[kind]} ${list.length === 1 ? one : many}${where}`;
  });
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
