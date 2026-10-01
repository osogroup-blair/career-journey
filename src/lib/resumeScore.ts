import { GeneratedResume, JDParse, KeywordCoverage, KeywordSignal } from '../types';

/**
 * Deterministic implementation of JD_pipeline_SKILL.md's Stage 7 keyword
 * scoring gate: weighted coverage of the JD keyword set against the resume's
 * plain text, passing at 85%+ with every top-critical skill present. Runs in
 * the browser on every edit — the AI review (/api/ai/scoreResume) is the
 * on-demand, judgement-based complement to this, not a replacement.
 */

export const KEYWORD_GATE_THRESHOLD = 85;

export interface ResumeKeywordScore extends KeywordCoverage {
  /** True when the Rating stage had no keyword breakdown and we fell back to parse.topCriticalSkills. */
  usedFallback: boolean;
}

/** Lowercased, punctuation-stripped token string — keeps + # . inside tokens so C++, C#, .NET and Node.js survive. */
export function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(' ')
    .map((t) => t.replace(/\.+$/, ''))
    .filter((t) => t && !/^[.+#]+$/.test(t))
    .join(' ');
}

function togglePlural(normalized: string): string | null {
  const words = normalized.split(' ');
  const last = words[words.length - 1];
  if (!last || !/^[a-z]+$/.test(last) || last.length < 4) return null;
  let next: string;
  if (last.endsWith('ies') && last.length > 4) next = `${last.slice(0, -3)}y`;
  else if (last.endsWith('s') && !last.endsWith('ss')) next = last.slice(0, -1);
  else if (last.endsWith('y') && !/[aeiou]y$/.test(last)) next = `${last.slice(0, -1)}ies`;
  else next = `${last}s`;
  return [...words.slice(0, -1), next].join(' ');
}

/**
 * Every normalized form a keyword may appear in: as written, each half of a
 * "Long Form (ABBR)" pair (ats_tactics.md tactic 10), spaced " / " and " or "
 * alternatives, and a singular/plural toggle of each.
 */
export function phraseVariants(phrase: string): string[] {
  const out = new Set<string>();
  const add = (p: string) => {
    const n = normalize(p);
    if (n) out.add(n);
  };
  add(phrase);
  const paren = phrase.match(/^(.*?)\s*\(([^)]+)\)\s*(.*)$/);
  if (paren) {
    add(`${paren[1]} ${paren[3]}`);
    add(paren[2]);
  }
  const parts = phrase.split(/\s+\/\s+|\s+or\s+/i);
  if (parts.length > 1) parts.forEach(add);
  for (const v of [...out]) {
    const toggled = togglePlural(v);
    if (toggled) out.add(toggled);
  }
  return [...out];
}

export function containsPhrase(normalizedText: string, phrase: string): boolean {
  const hay = ` ${normalizedText} `;
  return phraseVariants(phrase).some((v) => hay.includes(` ${v} `));
}

/** The text an ATS parser would extract — tagline, summary, skills, experience and education. Name/contact line excluded. */
export function resumeToPlainText(resume: GeneratedResume | undefined, tagline?: string): string {
  if (!resume) return '';
  const parts: string[] = [tagline || '', resume.summary || ''];
  for (const s of resume.skills || []) parts.push(s.category, s.terms);
  for (const e of resume.experience || []) {
    parts.push(e.title, e.company, e.companyDescriptor || '');
    for (const b of e.bullets || []) parts.push(typeof b === 'string' ? b : b?.text || '');
  }
  for (const ed of resume.education || []) parts.push(ed.degree, ed.institution);
  return parts.filter(Boolean).join('\n');
}

interface KeywordCheck {
  phrase: string;
  weight: number;
  critical: boolean;
  /** Whether the Rating stage found Career Journey evidence — decides "add truthfully" vs. "honest gap" when missing. */
  evidenced: boolean;
}

function coreRoleTitle(roleTitle: string): string {
  return roleTitle.split(/[,(|]|\s[-–—]\s/)[0].trim();
}

function buildChecks(keywords: KeywordSignal[] | undefined, parse: JDParse | undefined): { checks: KeywordCheck[]; unsupported: string[]; usedFallback: boolean } {
  const checks: KeywordCheck[] = [];
  const unsupported: string[] = [];
  const seen = new Set<string>();
  const push = (c: KeywordCheck) => {
    const key = normalize(c.phrase);
    if (!key || seen.has(key)) return;
    seen.add(key);
    checks.push(c);
  };

  const usable = (keywords || []).filter((k) => k.category !== 'Hard gate' && k.evidenceStatus !== 'HARD GATE');
  const usedFallback = usable.length === 0;

  if (!usedFallback) {
    for (const k of usable) {
      if (k.evidenceStatus === 'NOT SUPPORTED') {
        unsupported.push(k.phrase);
        continue;
      }
      push({
        phrase: k.phrase,
        critical: !!k.isTopCritical,
        weight: k.isTopCritical ? 3 : k.jdImportance === 'High' ? 2 : 1,
        evidenced: k.evidenceStatus === 'EVIDENCED' || k.evidenceStatus === 'PARTIAL' || k.userContextStatus === 'Approved for patch',
      });
    }
  } else {
    // No keyword breakdown — unknown evidence, so missing items are offered for rebuild,
    // where the generateResume prompt only adds them if the Career Journey supports it.
    for (const s of parse?.topCriticalSkills || []) push({ phrase: s, critical: true, weight: 3, evidenced: true });
  }

  if (parse?.roleTitle) push({ phrase: coreRoleTitle(parse.roleTitle), critical: false, weight: 2, evidenced: true });

  return { checks, unsupported, usedFallback };
}

export function scoreResumeKeywords(
  resume: GeneratedResume | undefined,
  tagline: string | undefined,
  keywords: KeywordSignal[] | undefined,
  parse: JDParse | undefined
): ResumeKeywordScore {
  const text = normalize(resumeToPlainText(resume, tagline));
  const { checks, unsupported, usedFallback } = buildChecks(keywords, parse);

  let total = 0;
  let matched = 0;
  const criticalSkillCoverage: { phrase: string; present: boolean }[] = [];
  const secondaryKeywordCoverage: { phrase: string; present: boolean }[] = [];
  const missingKeywords: string[] = [];
  const unsupportedKeywords = [...unsupported];

  for (const c of checks) {
    const present = containsPhrase(text, c.phrase);
    total += c.weight;
    if (present) matched += c.weight;
    (c.critical ? criticalSkillCoverage : secondaryKeywordCoverage).push({ phrase: c.phrase, present });
    if (!present) (c.evidenced ? missingKeywords : unsupportedKeywords).push(c.phrase);
  }

  const score = total === 0 ? 0 : Math.round((matched / total) * 100);
  return {
    score,
    threshold: KEYWORD_GATE_THRESHOLD,
    passed: total > 0 && score >= KEYWORD_GATE_THRESHOLD && criticalSkillCoverage.every((c) => c.present),
    criticalSkillCoverage,
    secondaryKeywordCoverage,
    missingKeywords,
    unsupportedKeywords,
    usedFallback,
  };
}

/** Cheap stable hash (djb2) of the resume — lets the UI tell when a saved AI score no longer matches the resume. */
export function resumeFingerprint(resume: GeneratedResume | undefined): string {
  const s = JSON.stringify(resume ?? null);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}
