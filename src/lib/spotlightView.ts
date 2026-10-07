import type {
  SpotlightAccent,
  SpotlightAchievement,
  SpotlightDeliverable,
  SpotlightEvidenceRef,
  SpotlightRole,
  SpotlightSnapshot,
} from '../types/spotlight';

/**
 * Display helpers for the Career Spotlight page (src/components/spotlight/). Pure, so
 * the formatting and the evidence grouping are tested without rendering anything.
 */

/** Accent choices. Each pair is checked for readable contrast against the page in its theme (see the tests). */
export const SPOTLIGHT_ACCENT_COLORS: Record<SpotlightAccent, { name: string; light: string; dark: string }> = {
  navy: { name: 'Navy', light: '#2e4d78', dark: '#9db7da' },
  forest: { name: 'Forest', light: '#2f5d46', dark: '#8cc3a5' },
  plum: { name: 'Plum', light: '#5b3a6e', dark: '#c3a6d6' },
  graphite: { name: 'Graphite', light: '#3a3f47', dark: '#b9c0ca' },
  oxblood: { name: 'Oxblood', light: '#7a2e2e', dark: '#e0a3a3' },
};

/** Page backgrounds, kept in sync with --sp-paper in spotlight.css. */
export const SPOTLIGHT_PAPER = { light: '#f5f7fa', dark: '#0d121a' };

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------- dates ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(value: string | undefined): { y: number; m: number | null } | null {
  const match = value?.match(/^(\d{4})(?:-(\d{2}))?$/);
  if (!match) return null;
  return { y: Number(match[1]), m: match[2] ? Number(match[2]) : null };
}

/** '2022-03' → 'Mar 2022'; '2022' → '2022'. */
export function formatMonth(value: string | undefined): string {
  const p = parts(value);
  if (!p) return '';
  return p.m ? `${MONTHS[p.m - 1]} ${p.y}` : String(p.y);
}

export function formatRoleDates(role: Pick<SpotlightRole, 'start' | 'end' | 'current'>): string {
  const start = formatMonth(role.start);
  const end = role.current ? 'Now' : formatMonth(role.end);
  if (start && end) return `${start} – ${end}`;
  return start || end;
}

/** 56 → '4 yr 8 mo'; 12 → '1 yr'; 3 → '3 mo'. */
export function formatDuration(months: number | null): string {
  if (!months || months < 1) return '';
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ');
}

// ---------- figures inside sentences ----------

const FIGURE = /([$£€]?\d(?:[\d,.]*\d)?(?:\s?(?:%|x\b|[KMB]\b|bn\b|million\b|billion\b))?|#\d+)/g;

/** Splits a sentence so its numbers can be set in bold. Never changes the text. */
export function splitFigures(text: string): { text: string; figure: boolean }[] {
  const out: { text: string; figure: boolean }[] = [];
  let last = 0;
  for (const match of text.matchAll(FIGURE)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ text: text.slice(last, index), figure: false });
    out.push({ text: match[0], figure: true });
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), figure: false });
  return out;
}

// ---------- evidence ----------

export type EvidenceTarget =
  | { kind: 'outcome'; index: number }
  | { kind: 'skill'; id: string }
  | { kind: 'capability'; id: string }
  | { kind: 'achievement'; id: string };

export type EvidenceItem =
  | { type: 'deliverable'; deliverable: SpotlightDeliverable; initiative: string }
  | { type: 'achievement'; achievement: SpotlightAchievement };

export interface EvidenceGroup {
  /** Null for achievements that aren't tied to any role. */
  role: SpotlightRole | null;
  items: EvidenceItem[];
}

export interface EvidenceView {
  eyebrow: string;
  title: string;
  summary: string;
  groups: EvidenceGroup[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Resolves an outcome, skill, capability or achievement to the work that backs it, grouped by role in page order. */
export function resolveEvidence(snapshot: SpotlightSnapshot, target: EvidenceTarget): EvidenceView | null {
  const deliverables = new Map<string, { deliverable: SpotlightDeliverable; initiative: string; role: SpotlightRole }>();
  for (const role of snapshot.roles)
    for (const i of role.initiatives) for (const d of i.deliverables) deliverables.set(d.id, { deliverable: d, initiative: i.name, role });
  const achievements = new Map(snapshot.achievements.items.map((a) => [a.id, a]));

  let eyebrow: string;
  let title: string;
  let refs: SpotlightEvidenceRef[];
  if (target.kind === 'outcome') {
    const outcome = snapshot.outcomes[target.index];
    if (!outcome) return null;
    [eyebrow, title, refs] = ['Evidence for this outcome', outcome.text, outcome.evidence];
  } else if (target.kind === 'skill') {
    const skill = snapshot.skills.find((s) => s.id === target.id);
    if (!skill) return null;
    [eyebrow, title, refs] = ['Skill in practice', skill.name, skill.deliverableIds.map((id) => ({ type: 'deliverable' as const, id }))];
  } else if (target.kind === 'capability') {
    const cap = snapshot.capabilities.find((c) => c.id === target.id);
    if (!cap) return null;
    [eyebrow, title, refs] = ['Capability in practice', cap.name, cap.deliverableIds.map((id) => ({ type: 'deliverable' as const, id }))];
  } else {
    const a = achievements.get(target.id);
    if (!a) return null;
    eyebrow = 'Evidence for this achievement';
    title = a.title;
    refs = [{ type: 'achievement', id: a.id }, ...(a.deliverableId ? [{ type: 'deliverable' as const, id: a.deliverableId }] : [])];
  }

  const byRole = new Map<string | null, EvidenceItem[]>();
  const add = (roleId: string | null, item: EvidenceItem) => byRole.set(roleId, [...(byRole.get(roleId) ?? []), item]);
  let deliverableCount = 0;
  let achievementCount = 0;
  for (const ref of refs) {
    if (ref.type === 'deliverable') {
      const d = deliverables.get(ref.id);
      if (!d) continue;
      deliverableCount++;
      add(d.role.id, { type: 'deliverable', deliverable: d.deliverable, initiative: d.initiative });
    } else {
      const a = achievements.get(ref.id);
      if (!a) continue;
      achievementCount++;
      add(a.roleIds[0] ?? null, { type: 'achievement', achievement: a });
    }
  }

  const groups: EvidenceGroup[] = snapshot.roles.filter((r) => byRole.has(r.id)).map((role) => ({ role, items: byRole.get(role.id)! }));
  if (byRole.has(null)) groups.push({ role: null, items: byRole.get(null)! });

  const roleCount = groups.filter((g) => g.role).length;
  const counted = [deliverableCount && plural(deliverableCount, 'deliverable'), achievementCount && plural(achievementCount, 'achievement')].filter(Boolean);
  const summary = counted.length
    ? `${counted.join(' and ')}${roleCount ? ` across ${plural(roleCount, 'role')}` : ''}`
    : 'No linked work is shown for this yet.';
  return { eyebrow, title, summary, groups };
}

// ---------- career arc ----------

export interface ArcSegment {
  /** Role to scroll to when the segment is selected. */
  roleId: string;
  title: string;
  organization: string;
  current: boolean;
  left: number;
  width: number;
  /** Label sits at the right end, for segments that start past the middle. */
  flip: boolean;
}

export interface ArcTick {
  year: number;
  left: number;
  labelled: boolean;
}

/** Above this many roles, the oldest condensed roles share one "Earlier career" row. */
export const ARC_MAX_ROWS = 7;

const toYears = (value: string | undefined, edge: 'start' | 'end'): number | null => {
  const p = parts(value);
  if (!p) return null;
  const month = p.m ?? (edge === 'start' ? 1 : 12);
  return p.y + (edge === 'start' ? month - 1 : month) / 12;
};

/** Rows for the career timeline, newest first, positioned as percentages of the span from the first role to now. */
export function careerArc(snapshot: SpotlightSnapshot, now: Date = new Date()): { segments: ArcSegment[]; ticks: ArcTick[]; nowLeft: number } | null {
  const nowYears = now.getFullYear() + now.getMonth() / 12 + 1 / 24;
  const dated = snapshot.roles
    .map((role) => ({ role, start: toYears(role.start, 'start'), end: role.current ? nowYears : toYears(role.end, 'end') }))
    .filter((r): r is { role: SpotlightRole; start: number; end: number } => r.start !== null && r.end !== null && r.end > r.start);
  if (!dated.length) return null;

  const firstYear = Math.floor(Math.min(...dated.map((r) => r.start)));
  const lastYear = now.getFullYear() + 1;
  const span = lastYear - firstYear;
  const pct = (years: number) => ((years - firstYear) / span) * 100;

  let rows: { roleId: string; title: string; organization: string; current: boolean; start: number; end: number }[] = dated
    .sort((a, b) => b.start - a.start)
    .map(({ role, start, end }) => ({ roleId: role.id, title: role.title, organization: role.organization, current: role.current, start, end }));

  if (rows.length > ARC_MAX_ROWS) {
    const fullStarts = dated.filter((r) => r.role.mode === 'full').map((r) => r.start);
    const earliestFull = fullStarts.length ? Math.min(...fullStarts) : Infinity;
    const earlier = dated.filter((r) => r.role.mode === 'condensed' && r.end <= earliestFull);
    if (earlier.length >= 2) {
      const ids = new Set(earlier.map((r) => r.role.id));
      const newest = earlier.reduce((a, b) => (b.start > a.start ? b : a));
      rows = rows.filter((r) => !ids.has(r.roleId));
      rows.push({
        roleId: newest.role.id,
        title: 'Earlier career',
        organization: plural(earlier.length, 'role'),
        current: false,
        start: Math.min(...earlier.map((r) => r.start)),
        end: Math.max(...earlier.map((r) => r.end)),
      });
    }
  }

  const step = span <= 12 ? 1 : span <= 24 ? 2 : 5;
  const ticks: ArcTick[] = [];
  for (let y = firstYear; y < lastYear; y++) ticks.push({ year: y, left: pct(y), labelled: (y - firstYear) % step === 0 });

  return {
    segments: rows.map((r) => {
      const left = pct(r.start);
      return { roleId: r.roleId, title: r.title, organization: r.organization, current: r.current, left, width: Math.max(pct(r.end) - left, 1.5), flip: left > 50 };
    }),
    ticks,
    nowLeft: pct(nowYears),
  };
}

// ---------- misc ----------

/** "Since 2015 · 3 companies" style facts, skipping anything unknown. */
export function glanceRows(snapshot: SpotlightSnapshot): { label: string; value: string }[] {
  const g = snapshot.glance;
  const rows: { label: string; value: string }[] = [];
  if (g.careerStartYear) rows.push({ label: 'Working since', value: `${g.careerStartYear}${g.organizationCount > 1 ? ` · ${g.organizationCount} organizations` : ''}` });
  if (g.current) rows.push({ label: 'Now', value: `${g.current.title}, ${g.current.organization}` });
  if (g.largestTeam) rows.push({ label: 'Largest team', value: `${g.largestTeam} people` });
  if (g.industries.length) rows.push({ label: 'Industries', value: g.industries.join(', ') });
  if (snapshot.person.targetRoles.length) rows.push({ label: 'Looking for', value: snapshot.person.targetRoles.join(', ') });
  return rows;
}

/** Skills grouped by category, most recently used first within each group. */
export function skillGroups(snapshot: SpotlightSnapshot): { category: string; skills: SpotlightSnapshot['skills'] }[] {
  const groups = new Map<string, SpotlightSnapshot['skills']>();
  for (const s of snapshot.skills) {
    const key = s.category || 'Other';
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.entries()].map(([category, skills]) => ({
    category,
    skills: [...skills].sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '') || (b.years ?? 0) - (a.years ?? 0)),
  }));
}
