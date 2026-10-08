import { EvidenceRef, GeneratedResume, ResumeEditSuggestion, ResumeEditTarget, ResumeExperienceEntry } from '../types';
import { resolveExperienceRoleId } from './resumeBuild';
import { normalizeBullet } from './resumeEdits';
import { verifiedEvidenceRef } from './evidenceRefs';

/**
 * Recommended edits from the AI scan: the scorer points each edit at a line id
 * from resumeLinesForPrompt ("summary", "role.1.bullet.2", ...),
 * normalizeEditSuggestions turns those into text-anchored targets against the
 * resume that was scored, and applyEditSuggestion writes one into the resume
 * deterministically, with no second AI call, so the candidate gets exactly the line
 * they approved. Anchoring on text (not index) means approving one edit never
 * misplaces another; an edit whose line has since changed is "outdated".
 */

/** The shape the scoreResume schema asks the model for. */
export interface RawResumeEdit {
  op?: string;
  line?: string;
  text?: string;
  lead?: string;
  why?: string;
  keywords?: string[];
  evidenceRefs?: { type?: string; id?: string }[];
  support?: string;
}

export type EditState = 'ready' | 'outdated' | 'applied' | 'dismissed';

const same = (a: string | undefined, b: string | undefined) => (a || '').replace(/\s+/g, ' ').trim() === (b || '').replace(/\s+/g, ' ').trim();

/** Stable key for an experience entry: its Career Journey role id, else company|title. */
export function resumeRoleKey(entry: ResumeExperienceEntry, careerJourney: any): string {
  return resolveExperienceRoleId(entry, careerJourney) ?? `${entry.company}|${entry.title}`;
}

function roleIndexFor(resume: GeneratedResume, roleKey: string, careerJourney: any): number {
  return (resume.experience || []).findIndex((e) => resumeRoleKey(e, careerJourney) === roleKey);
}

const bulletLine = (b: { text: string; lead?: string }) => (b.lead ? `{label: ${b.lead}} ${b.text}` : b.text);

/** Every line of the resume with the id the scorer cites, plus the "add here" targets. */
export function resumeLinesForPrompt(resume: GeneratedResume, tagline: string, canEditTagline = true): string {
  const lines: string[] = [];
  if (canEditTagline) lines.push(`[tagline] ${tagline}`);
  lines.push(`[summary] ${resume.summary || ''}`);
  lines.push('[skills] (add a new skills row here: category in lead, terms in text)');
  (resume.skills || []).forEach((row, i) => lines.push(`[skills.${i}] {category: ${row.category}} ${row.terms}`));
  if ((resume.selectedOutcomes || []).length > 0) {
    lines.push('[outcomes] (add a Selected Outcome here: bold label in lead)');
    (resume.selectedOutcomes || []).forEach((o, i) => lines.push(`[outcome.${i}] ${bulletLine(o)}`));
  }
  (resume.experience || []).forEach((e, ri) => {
    lines.push(`[role.${ri}] ${e.company} — ${e.title} (${e.dates}) (add a bullet at the end of this role)`);
    if (e.narrative) lines.push(`[role.${ri}.narrative] ${e.narrative}`);
    (e.bullets || []).forEach((raw, bi) => lines.push(`[role.${ri}.bullet.${bi}] ${bulletLine(normalizeBullet(raw))}`));
  });
  return lines.join('\n');
}

/** Career Journey ids ("ACH-118", "ENG-005") are for evidenceRefs, not for the candidate to read. */
function stripIds(text: string): string {
  return text
    .replace(/\s*\((?:[A-Z]{2,6}-\d{1,5}(?:\s*[,/&]\s*|\s+and\s+)?)+\)/g, '')
    .replace(/\b[A-Z]{2,6}-\d{1,5}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

/**
 * Splits leading labels off a line: models often repeat a bullet's bold label
 * (or a skills row's category) inside the text, as "Label: …" or in the
 * "{label: …}" form the resume lines use. A plain label is short and has no
 * sentence punctuation; callers only split where a label is expected.
 */
export function splitLeadingLabels(text: string): { labels: string[]; text: string } {
  const labels: string[] = [];
  let rest = text.trim();
  for (;;) {
    const m = /^\{(?:label|category):\s*([^{}]{1,60})\}\s*(\S[\s\S]*)$/i.exec(rest) || /^([^:.;,{}\n]{2,60}):\s+(\S[\s\S]*)$/.exec(rest);
    if (!m || m[1].trim().split(/\s+/).length > 8) break;
    labels.push(m[1].trim());
    rest = m[2].trim();
  }
  return { labels, text: rest };
}

/** Applies the target's line conventions: skills rows hold terms only, and labels live in `lead` wherever that line type has them. */
function cleanLine(target: ResumeEditTarget, text: string, lead: string | undefined, resume: GeneratedResume, careerJourney: any): { text: string; lead?: string } {
  const split = splitLeadingLabels(text);
  const roleUsesLeads = (roleKey: string) => {
    const ri = roleIndexFor(resume, roleKey, careerJourney);
    return (resume.experience?.[ri]?.bullets || []).some((b) => !!normalizeBullet(b).lead);
  };
  switch (target.kind) {
    case 'skillsRow': return { text: split.text };
    case 'newSkillsRow': return { text: split.text, lead: lead || split.labels[0] };
    case 'outcome': return { text: split.text }; // the existing outcome keeps its label
    case 'newOutcome': return { text: split.text, lead: lead || split.labels[0] };
    case 'bullet': return roleUsesLeads(target.roleKey) ? { text: split.text } : { text };
    case 'newBullet': return roleUsesLeads(target.roleKey) ? { text: split.text, lead: lead || split.labels[0] } : { text };
    default: return { text };
  }
}

interface Resolved {
  target: ResumeEditTarget;
  label: string;
  before: string;
  rank: number;
}

/** Resolves one model edit's line id against the scored resume, or null when it points nowhere usable. */
function resolveLine(op: 'replace' | 'add', line: string, resume: GeneratedResume, tagline: string, canEditTagline: boolean, careerJourney: any): Resolved | null {
  const id = line.trim().replace(/^\[|\]$/g, '');
  const parts = id.split('.');
  const num = (s: string | undefined) => (s !== undefined && /^\d+$/.test(s) ? Number(s) : NaN);

  if (id === 'tagline') return op === 'replace' && canEditTagline ? { target: { kind: 'tagline' }, label: 'Tagline', before: tagline, rank: 0 } : null;
  if (id === 'summary') return op === 'replace' ? { target: { kind: 'summary' }, label: 'Summary', before: resume.summary || '', rank: 1 } : null;
  if (id === 'skills' || (op === 'add' && parts[0] === 'skills')) return op === 'add' ? { target: { kind: 'newSkillsRow' }, label: 'Skills · new row', before: '', rank: 2.9 } : null;
  if (parts[0] === 'skills') {
    const row = resume.skills?.[num(parts[1])];
    return row && op === 'replace' ? { target: { kind: 'skillsRow', category: row.category }, label: `Skills · ${row.category}`, before: row.terms, rank: 2 + num(parts[1]) / 100 } : null;
  }
  const outcomes = resume.selectedOutcomes || [];
  if (id === 'outcomes' || (op === 'add' && parts[0] === 'outcome')) {
    return outcomes.length > 0 && op === 'add' ? { target: { kind: 'newOutcome' }, label: 'Selected Outcomes · new', before: '', rank: 3.9 } : null;
  }
  if (parts[0] === 'outcome') {
    const o = outcomes[num(parts[1])];
    return o && op === 'replace' ? { target: { kind: 'outcome', text: o.text }, label: `Selected Outcomes · ${num(parts[1]) + 1}`, before: o.text, rank: 3 + num(parts[1]) / 100 } : null;
  }
  if (parts[0] === 'role') {
    const ri = num(parts[1]);
    const entry = resume.experience?.[ri];
    if (!entry) return null;
    const roleKey = resumeRoleKey(entry, careerJourney);
    const rank = 4 + ri;
    if (parts.length === 2) return op === 'add' ? { target: { kind: 'newBullet', roleKey }, label: `${entry.company} · new bullet`, before: '', rank: rank + 0.99 } : null;
    if (parts[2] === 'narrative') {
      return op === 'replace' && entry.narrative ? { target: { kind: 'narrative', roleKey }, label: `${entry.company} · scope paragraph`, before: entry.narrative, rank } : null;
    }
    if (parts[2] === 'bullet') {
      const bi = num(parts[3]);
      const raw = entry.bullets?.[bi];
      if (!raw) return null;
      const b = normalizeBullet(raw);
      if (op === 'add') return { target: { kind: 'newBullet', roleKey, afterText: b.text }, label: `${entry.company} · new bullet after ${bi + 1}`, before: '', rank: rank + (bi + 0.5) / 100 };
      return { target: { kind: 'bullet', roleKey, text: b.text }, label: `${entry.company} · bullet ${bi + 1}`, before: b.text, rank: rank + bi / 100 };
    }
  }
  return null;
}

/**
 * The model's edits as approvable suggestions, in resume order. Drops edits
 * that point at no real line, change nothing, or repeat another; demotes an
 * edit to 'inferred' when none of its citations is a real Career Journey item.
 */
export function normalizeEditSuggestions(
  raw: RawResumeEdit[] | undefined,
  resume: GeneratedResume,
  tagline: string,
  careerJourney: any,
  canEditTagline = true
): ResumeEditSuggestion[] {
  const seen = new Set<string>();
  const out: (ResumeEditSuggestion & { rank: number })[] = [];
  (raw || []).forEach((e, i) => {
    const op = e?.op === 'add' ? 'add' : 'replace';
    if (!e?.line) return;
    const resolved = resolveLine(op, String(e.line), resume, tagline, canEditTagline, careerJourney);
    if (!resolved) return;
    const { text, lead } = cleanLine(resolved.target, stripIds(String(e.text || '')), stripIds(String(e.lead || '')) || undefined, resume, careerJourney);
    if (!text) return;
    if (op === 'replace' && same(text, resolved.before)) return;
    if (resolved.target.kind === 'newSkillsRow' && !lead) return;
    const dedupe = `${JSON.stringify(resolved.target)}|${text.toLowerCase()}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);

    const evidenceRefs: EvidenceRef[] = [];
    for (const ref of e.evidenceRefs || []) {
      const v = verifiedEvidenceRef(careerJourney, ref);
      if (v && !evidenceRefs.some((r) => r.id === v.id)) evidenceRefs.push(v);
    }
    out.push({
      id: `edit-${i}`,
      ...resolved,
      text,
      ...(lead ? { lead } : {}),
      why: stripIds(String(e.why || '')),
      keywords: (e.keywords || []).map((k) => String(k).trim()).filter(Boolean),
      evidenceRefs,
      support: e.support === 'backed' && evidenceRefs.length > 0 ? 'backed' : 'inferred',
    });
  });
  return out.sort((a, b) => a.rank - b.rank).map(({ rank: _rank, ...s }) => s);
}

/** Whether a suggestion can still be applied to the resume as it is now. */
export function editState(s: ResumeEditSuggestion, resume: GeneratedResume, tagline: string, careerJourney: any): EditState {
  if (s.status) return s.status;
  const t = s.target;
  switch (t.kind) {
    case 'tagline': return same(tagline, s.before) ? 'ready' : 'outdated';
    case 'summary': return same(resume.summary, s.before) ? 'ready' : 'outdated';
    case 'skillsRow': {
      const row = (resume.skills || []).find((r) => same(r.category.toLowerCase(), t.category.toLowerCase()));
      return row && same(row.terms, s.before) ? 'ready' : 'outdated';
    }
    case 'newSkillsRow': return 'ready';
    case 'outcome': return (resume.selectedOutcomes || []).some((o) => same(o.text, s.before)) ? 'ready' : 'outdated';
    case 'newOutcome': return 'ready';
    case 'narrative': {
      const ri = roleIndexFor(resume, t.roleKey, careerJourney);
      return ri !== -1 && same(resume.experience[ri].narrative, s.before) ? 'ready' : 'outdated';
    }
    case 'bullet': {
      const ri = roleIndexFor(resume, t.roleKey, careerJourney);
      return ri !== -1 && (resume.experience[ri].bullets || []).some((b) => same(normalizeBullet(b).text, s.before)) ? 'ready' : 'outdated';
    }
    case 'newBullet': return roleIndexFor(resume, t.roleKey, careerJourney) !== -1 ? 'ready' : 'outdated';
  }
}

function mergeRefs(a: EvidenceRef[] | undefined, b: EvidenceRef[]): EvidenceRef[] | undefined {
  const merged = [...(a || [])];
  for (const r of b) if (!merged.some((m) => m.id === r.id)) merged.push(r);
  return merged.length > 0 ? merged : undefined;
}

/**
 * Writes one suggestion into the resume. `text` overrides the proposed line
 * (the candidate edited it before approving). Returns null when the edit is
 * outdated; `tagline` is set only for a tagline edit (it lives on the strategy).
 */
export function applyEditSuggestion(
  s: ResumeEditSuggestion,
  resume: GeneratedResume,
  tagline: string,
  careerJourney: any,
  text: string = s.text
): { resume: GeneratedResume; tagline?: string } | null {
  if (editState({ ...s, status: undefined }, resume, tagline, careerJourney) !== 'ready') return null;
  const line = text.trim();
  if (!line) return null;
  const t = s.target;
  const withEntry = (ri: number, edit: (e: ResumeExperienceEntry) => ResumeExperienceEntry) => ({
    ...resume,
    experience: resume.experience.map((e, i) => (i === ri ? edit(e) : e)),
  });

  switch (t.kind) {
    case 'tagline': return { resume, tagline: line };
    case 'summary': return { resume: { ...resume, summary: line } };
    case 'skillsRow':
      return { resume: { ...resume, skills: resume.skills.map((r) => (same(r.category.toLowerCase(), t.category.toLowerCase()) ? { ...r, terms: line } : r)) } };
    case 'newSkillsRow': return { resume: { ...resume, skills: [...(resume.skills || []), { category: s.lead || 'Skills', terms: line }] } };
    case 'outcome':
      return { resume: { ...resume, selectedOutcomes: (resume.selectedOutcomes || []).map((o) => (same(o.text, s.before) ? { ...o, text: line } : o)) } };
    case 'newOutcome': return { resume: { ...resume, selectedOutcomes: [...(resume.selectedOutcomes || []), { lead: s.lead || '', text: line }] } };
    case 'narrative': {
      const ri = roleIndexFor(resume, t.roleKey, careerJourney);
      return { resume: withEntry(ri, (e) => ({ ...e, narrative: line })) };
    }
    case 'bullet': {
      const ri = roleIndexFor(resume, t.roleKey, careerJourney);
      return {
        resume: withEntry(ri, (e) => ({
          ...e,
          bullets: (e.bullets || []).map((raw) => {
            const b = normalizeBullet(raw);
            if (!same(b.text, s.before)) return raw;
            const evidenceRefs = mergeRefs(b.evidenceRefs, s.evidenceRefs);
            return { ...b, text: line, ...(evidenceRefs ? { evidenceRefs } : {}) };
          }),
        })),
      };
    }
    case 'newBullet': {
      const ri = roleIndexFor(resume, t.roleKey, careerJourney);
      const bullet = { text: line, ...(s.lead ? { lead: s.lead } : {}), ...(s.evidenceRefs.length ? { evidenceRefs: s.evidenceRefs } : {}) };
      return {
        resume: withEntry(ri, (e) => {
          const bullets = [...(e.bullets || [])];
          const after = t.afterText ? bullets.findIndex((b) => same(normalizeBullet(b).text, t.afterText)) : -1;
          bullets.splice(after === -1 ? bullets.length : after + 1, 0, bullet);
          return { ...e, bullets };
        }),
      };
    }
  }
}
