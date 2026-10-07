import { ExperienceContext, GeneratedResume, KeywordSignal } from '../types';
import { containsAny, normalize } from './resumeScore';
import { confirmedContext, keywordUse } from './resumeKeywordPlan';

/**
 * Deterministic honesty checks on a tailored resume — the "flag it, the
 * candidate decides" half of resume-quality-plan.md Phase 3. Runs in the
 * browser on every edit, like the keyword gate. Nothing here changes the
 * resume; the Claims panel offers Keep / Remove / Rewrite for each flag.
 *
 * The evidence base is the Career Journey plus the candidate's approved
 * Rating-stage context. A flag is a prompt to look, not proof of a problem:
 * a number may be written differently in the Career Journey, a JD phrase may
 * be the candidate's own wording too.
 */

export type ClaimFlagKind = 'invented-number' | 'jd-copy' | 'unsupported-term' | 'unknown-evidence' | 'no-evidence' | 'title-reframe';

export type ClaimLocation =
  | { section: 'summary' }
  | { section: 'skills'; row: number }
  | { section: 'outcome'; index: number }
  | { section: 'title'; roleIndex: number }
  | { section: 'narrative'; roleIndex: number }
  | { section: 'bullet'; roleIndex: number; bulletIndex: number };

export interface ClaimFlag {
  /** Stable across reorders: kind + the flagged item's text + the detail. Editing the text gives a new key, so the item is checked again. */
  key: string;
  kind: ClaimFlagKind;
  severity: 'high' | 'medium' | 'low';
  location: ClaimLocation;
  /** The offending figure, phrase, term or title segment. */
  detail: string;
  /** The text of the flagged item, for context. */
  text: string;
  message: string;
}

export const CLAIM_KIND_LABELS: Record<ClaimFlagKind, string> = {
  'invented-number': 'Number not in your Career Journey',
  'jd-copy': 'Copied from the job description',
  'unsupported-term': 'Claims a skill with no evidence',
  'unknown-evidence': 'Cites evidence that doesn\'t exist',
  'no-evidence': 'No evidence cited',
  'title-reframe': 'Reframed title',
};

const SEVERITY: Record<ClaimFlagKind, ClaimFlag['severity']> = {
  'invented-number': 'high',
  'jd-copy': 'medium',
  'unsupported-term': 'medium',
  'unknown-evidence': 'medium',
  'no-evidence': 'low',
  'title-reframe': 'low',
};

/** Words in a row the JD and resume must share before it counts as copied. */
const JD_COPY_WORDS = 5;
/** A copied run must also carry this many words that are neither JD keywords nor filler — otherwise it's keyword mirroring, which is the point. */
const JD_COPY_NOVEL_WORDS = 2;
const STOPWORDS = new Set('a an and are as at be by for from in into is it of on or our that the their them they this to was we with you your across both through while who'.split(' '));

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Lowercased, non-breaking spaces flattened, and a unit glued to its number ("1.5 m" → "1.5m", "30 %" → "30%"). */
function numberText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[   ]/g, ' ')
    .replace(/(\d)\s+(%|m\b|k\b|x\b|million\b|percent\b)/g, '$1$2');
}

/** Figures worth checking: percentages, money, multiples, "20+" counts and any multi-digit number that isn't a year. */
export function extractNumbers(text: string): string[] {
  const out = new Set<string>();
  const flat = numberText(text);
  for (const m of flat.matchAll(/\$?\d[\d,]*(?:\.\d+)?(?:%|m\b|k\b|x\b|\+)?/g)) {
    // Named lists ("Fortune 500", "Global 2000", "S&P 500", "Inc. 5000") aren't metrics.
    if (/(fortune|global|s&p|inc\.?)\s*$/.test(flat.slice(Math.max(0, (m.index ?? 0) - 8), m.index))) continue;
    const tok = m[0].replace(/[,.]+$/, '').replace(/,(?=\d{3}\b)/g, '');
    const bare = tok.replace(/^\$/, '');
    if (/^(19|20)\d{2}$/.test(bare)) continue; // a year
    if (/^\d$/.test(bare)) continue; // single digits ("1 to 4") are too common to check
    out.add(tok);
  }
  return [...out];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whether the evidence states this figure, allowing $/no-$, "m"/"million", "%"/"percent", and "20+" for "20". */
function evidenceHasNumber(evidence: string, tok: string): boolean {
  const core = tok.replace(/^\$/, '').replace(/\+$/, '');
  const forms = new Set([core, core.replace(/m$/, 'million'), core.replace(/%$/, 'percent'), core.replace(/k$/, ',000'), core.replace(/k$/, '000')]);
  return [...forms].some((f) => new RegExp(`(?<![\\d.])\\$?${escapeRegExp(f)}(?![\\d])`).test(evidence));
}

function ngrams(words: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(' '));
  return out;
}

/** Runs of JD_COPY_WORDS+ words shared with the JD but not with the evidence, merged into whole phrases, that say more than the JD's keywords. */
function copiedPhrases(text: string, jdGrams: Set<string>, evidenceGrams: Set<string>, keywordWords: Set<string>): string[] {
  const words = normalize(text).split(' ').filter(Boolean);
  const hits: boolean[] = [];
  for (let i = 0; i + JD_COPY_WORDS <= words.length; i++) {
    const gram = words.slice(i, i + JD_COPY_WORDS).join(' ');
    hits.push(jdGrams.has(gram) && !evidenceGrams.has(gram));
  }
  const phrases: string[] = [];
  for (let i = 0; i < hits.length; i++) {
    if (!hits[i]) continue;
    let j = i;
    while (j + 1 < hits.length && hits[j + 1]) j++;
    const phrase = words.slice(i, j + JD_COPY_WORDS);
    if (phrase.filter((w) => !STOPWORDS.has(w) && !keywordWords.has(w)).length >= JD_COPY_NOVEL_WORDS) phrases.push(phrase.join(' '));
    i = j;
  }
  return phrases;
}

function collectIds(node: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => collectIds(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'id' && typeof v === 'string') out.add(v);
      else collectIds(v, out);
    }
  }
  return out;
}

export interface ClaimCheckInput {
  resume: GeneratedResume | undefined;
  careerJourney: any;
  keywords?: KeywordSignal[];
  contextEntries?: Record<string, ExperienceContext>;
  jdText?: string;
}

export function flagResumeClaims({ resume, careerJourney, keywords, contextEntries, jdText }: ClaimCheckInput): ClaimFlag[] {
  if (!resume) return [];
  const context = confirmedContext(contextEntries, keywords || []);
  const evidenceRaw = [JSON.stringify(careerJourney ?? {}), ...context.map((c) => `${c.experience} ${c.outcome}`)].join('\n');
  const evidenceNumbers = numberText(evidenceRaw);
  const evidenceNorm = normalize(evidenceRaw);
  const evidenceGrams = ngrams(evidenceNorm.split(' ').filter(Boolean), JD_COPY_WORDS);
  const jdGrams = jdText ? ngrams(normalize(jdText).split(' ').filter(Boolean), JD_COPY_WORDS) : new Set<string>();
  const ids = collectIds(careerJourney, new Set<string>());
  const keywordWords = new Set((keywords || []).flatMap((k) => [k.phrase, ...(k.aliases || [])]).flatMap((p) => normalize(p).split(' ')).filter(Boolean));
  const riskyTerms = (keywords || [])
    .filter((k) => keywordUse(k) === 'omit' || keywordUse(k) === 'if-supported')
    .map((k) => ({ phrase: k.phrase, forms: [k.phrase, ...(k.aliases || [])] }))
    .filter((t) => !containsAny(evidenceNorm, t.forms));

  const flags: ClaimFlag[] = [];
  const add = (kind: ClaimFlagKind, location: ClaimLocation, text: string, detail: string, message: string) => {
    flags.push({ key: `${kind}:${hash(normalize(text))}:${normalize(detail)}`, kind, severity: SEVERITY[kind], location, detail, text, message });
  };

  /** The checks every free-text item gets: numbers, copied JD wording, unsupported terms. */
  const checkText = (location: ClaimLocation, text: string, opts: { jdCopy?: boolean } = {}) => {
    if (!text?.trim()) return;
    for (const n of extractNumbers(text)) {
      if (!evidenceHasNumber(evidenceNumbers, n)) add('invented-number', location, text, n, `"${n}" doesn't appear in your Career Journey. Keep it only if it's true and you can back it up.`);
    }
    if (opts.jdCopy !== false) {
      for (const p of copiedPhrases(text, jdGrams, evidenceGrams, keywordWords)) add('jd-copy', location, text, p, `"${p}" is the job description's wording, not yours. Recruiters notice copied phrases.`);
    }
    const norm = normalize(text);
    for (const t of riskyTerms) {
      if (containsAny(norm, t.forms)) add('unsupported-term', location, text, t.phrase, `Claims "${t.phrase}", which your Career Journey doesn't evidence.`);
    }
  };

  checkText({ section: 'summary' }, resume.summary || '');
  (resume.skills || []).forEach((s, row) => checkText({ section: 'skills', row }, `${s.category}: ${s.terms}`, { jdCopy: false }));
  (resume.selectedOutcomes || []).forEach((o, index) => checkText({ section: 'outcome', index }, [o.lead, o.text].filter(Boolean).join(': ')));

  const roles: any[] = careerJourney?.roles || [];
  (resume.experience || []).forEach((entry, roleIndex) => {
    // Title: every "|" segment should be a real title (or the candidate's own resume_title) of a role this entry covers.
    const covered = roles.filter((r) => (entry.roleIds?.length ? entry.roleIds : [entry.roleId]).includes(r?.id));
    const known = covered.flatMap((r) => [r.title, ...String(r.resume_title || '').split('|')]).map((t) => normalize(String(t || ''))).filter(Boolean);
    if (known.length > 0) {
      for (const segment of String(entry.title || '').split('|').map((s) => s.trim()).filter(Boolean)) {
        const seg = normalize(segment);
        if (!known.some((k) => k === seg || k.includes(seg) || seg.includes(k))) {
          add('title-reframe', { section: 'title', roleIndex }, entry.title, segment, `"${segment}" isn't one of your recorded titles. Fine if it honestly describes your scope; otherwise use your real title.`);
        }
      }
    }
    if (entry.narrative) checkText({ section: 'narrative', roleIndex }, entry.narrative);
    (entry.bullets || []).forEach((raw, bulletIndex) => {
      const b = typeof raw === 'string' ? { text: raw } : raw;
      const text = [b.lead, b.text].filter(Boolean).join(': ');
      const location: ClaimLocation = { section: 'bullet', roleIndex, bulletIndex };
      checkText(location, text);
      const refs = (b as any).evidenceRefs || [];
      if (refs.length === 0) {
        add('no-evidence', location, text, 'no evidence', 'This bullet doesn\'t cite a deliverable or achievement from your Career Journey.');
      } else {
        for (const ref of refs) {
          if (ref?.id && !ids.has(ref.id)) add('unknown-evidence', location, text, ref.id, `Cites ${ref.id}, which isn't in your Career Journey.`);
        }
      }
    });
  });

  const rank = { high: 0, medium: 1, low: 2 };
  return flags.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Flags the candidate hasn't chosen to keep. */
export function openClaimFlags(flags: ClaimFlag[], decisions: Record<string, 'kept'> | undefined): ClaimFlag[] {
  return flags.filter((f) => decisions?.[f.key] !== 'kept');
}

/** Preview-highlight key for a flag's item: "b:<role>:<bullet>", "o:<index>", "n:<role>", or null for summary/skills/title. */
export function flagItemKey(location: ClaimLocation): string | null {
  if (location.section === 'bullet') return `b:${location.roleIndex}:${location.bulletIndex}`;
  if (location.section === 'outcome') return `o:${location.index}`;
  if (location.section === 'narrative') return `n:${location.roleIndex}`;
  return null;
}

/** Removes the skill terms in one row that name `forms` (a keyword's phrase and aliases). */
export function removeSkillTerm(resume: GeneratedResume, row: number, forms: string[]): GeneratedResume {
  const skills = (resume.skills || []).map((s, i) => {
    if (i !== row) return s;
    const sep = s.terms.includes('•') ? ' • ' : ', ';
    const terms = s.terms.split(/\s*[•,;]\s*/).filter((t) => t && !containsAny(normalize(t), forms));
    return { ...s, terms: terms.join(sep) };
  });
  return { ...resume, skills };
}
