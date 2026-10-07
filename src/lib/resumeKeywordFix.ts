import { GeneratedResume, KeywordSignal, ResumeSectionRef } from '../types';
import { resolveExperienceRoleId, roleIdsForEvidenceRef } from './resumeBuild';
import { normalize } from './resumeScore';

/**
 * "Fix missing keywords" without a full rebuild: each missing keyword goes to
 * the one resume section best placed to carry it — the experience entry for
 * the role its Career Journey evidence belongs to, else the summary (top
 * critical) or the skills rows — and only those sections are regenerated, so
 * the candidate's manual edits everywhere else survive.
 */

export interface KeywordFix {
  section: ResumeSectionRef;
  keywords: string[];
  /** Human label for the section, e.g. "Summary", "Nymbl". */
  label: string;
}

export function planKeywordFixes(
  missing: string[],
  keywords: KeywordSignal[] | undefined,
  resume: GeneratedResume | undefined,
  careerJourney: any
): KeywordFix[] {
  if (!resume || missing.length === 0) return [];
  const byPhrase = new Map((keywords || []).map((k) => [normalize(k.phrase), k]));
  const entries = (resume.experience || []).map((e) => {
    const roleId = resolveExperienceRoleId(e, careerJourney);
    return { roleId, covers: new Set([...(e.roleIds || []), ...(roleId ? [roleId] : [])]), company: e.company };
  });

  const groups = new Map<string, KeywordFix>();
  const put = (key: string, section: ResumeSectionRef, label: string, phrase: string) => {
    const g = groups.get(key) ?? { section, keywords: [], label };
    if (!g.keywords.includes(phrase)) g.keywords.push(phrase);
    groups.set(key, g);
  };

  for (const phrase of missing) {
    const k = byPhrase.get(normalize(phrase));
    const evidenceRoles = new Set((k?.evidenceRefs || []).flatMap((ref) => roleIdsForEvidenceRef(careerJourney, ref)));
    // The entry covering the most of this keyword's evidence roles; ties go to the higher (more recent) entry.
    let best: { roleId: string; company: string; hits: number } | null = null;
    for (const e of entries) {
      if (!e.roleId) continue;
      const hits = [...e.covers].filter((id) => evidenceRoles.has(id)).length;
      if (hits > 0 && (!best || hits > best.hits)) best = { roleId: e.roleId, company: e.company, hits };
    }
    if (best) put(`role:${best.roleId}`, { kind: 'role', roleId: best.roleId }, best.company, phrase);
    else if (k?.isTopCritical) put('summary', { kind: 'summary' }, 'Summary', phrase);
    else put('skills', { kind: 'skills' }, 'Skills', phrase);
  }

  const order = (f: KeywordFix) => (f.section.kind === 'summary' ? 0 : f.section.kind === 'skills' ? 1 : 2);
  return [...groups.values()].sort((a, b) => order(a) - order(b));
}

/** The regenerate instruction for one fix. Kept under the route's 500-character cap. */
export function keywordFixInstruction(fix: KeywordFix): string {
  const list = fix.keywords.map((k) => `"${k}"`).join(', ');
  const where = fix.section.kind === 'role' ? 'into this role\'s bullets' : fix.section.kind === 'skills' ? 'into the skills rows' : 'into the summary';
  const text = `Work these JD keywords ${where}, word for word, only where my Career Journey supports them: ${list}. Keep everything else in this section as close to the current text as you can.`;
  return text.length <= 500 ? text : `${text.slice(0, 497)}...`;
}
