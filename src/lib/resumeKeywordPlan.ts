import { EvidenceRef, ExperienceContext, KeywordSignal } from '../types';

/**
 * The Rating stage's keyword breakdown and the candidate's confirmed context,
 * turned into the "JD Keyword Plan" block the resumeStrategy / generateResume
 * / regenerateResumeSection prompts get. Without it the writer only saw the
 * job parse's handful of top skills, while the keyword gate (resumeScore.ts)
 * graded the resume against this full list. Lives in code, not the prompt
 * template, for the same reason as buildResumeConstraintsBlock: an admin
 * prompt override can't drop it.
 */

export type KeywordUse = 'use' | 'if-supported' | 'omit' | 'skip';

const MAX_KEYWORDS = 80;
const MAX_CONTEXT_ENTRIES = 40;

/** How the resume may use a keyword: evidenced or candidate-confirmed → use; no evidence yet → only if the Career Journey honestly supports it; unsupported or rejected → leave out; hard gates aren't resume keywords. */
export function keywordUse(k: KeywordSignal): KeywordUse {
  if (k.category === 'Hard gate' || k.evidenceStatus === 'HARD GATE') return 'skip';
  if (k.userContextStatus === 'Approved for patch') return 'use';
  if (k.userContextStatus === 'Rejected' || k.evidenceStatus === 'NOT SUPPORTED') return 'omit';
  if (k.evidenceStatus === 'EVIDENCED' || k.evidenceStatus === 'PARTIAL') return 'use';
  return 'if-supported';
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Validates a keyword list from a request body: keeps only well-formed entries with a phrase, trims strings, caps the count. */
export function sanitizeKeywordsForResume(raw: unknown): KeywordSignal[] {
  if (!Array.isArray(raw)) return [];
  const out: KeywordSignal[] = [];
  for (const k of raw.slice(0, MAX_KEYWORDS)) {
    if (!k || typeof k !== 'object') continue;
    const phrase = str((k as any).phrase, 160);
    if (!phrase) continue;
    const evidenceRefs: EvidenceRef[] = Array.isArray((k as any).evidenceRefs)
      ? (k as any).evidenceRefs
          .filter((r: any) => r && typeof r.id === 'string' && typeof r.type === 'string')
          .slice(0, 12)
          .map((r: any) => ({ type: r.type, id: r.id.slice(0, 40) }))
      : [];
    out.push({
      id: str((k as any).id, 40),
      phrase,
      category: str((k as any).category, 40) as KeywordSignal['category'],
      jdImportance: str((k as any).jdImportance, 10) as KeywordSignal['jdImportance'],
      evidenceStatus: str((k as any).evidenceStatus, 30) as KeywordSignal['evidenceStatus'],
      evidenceRefs,
      jdRefs: [],
      whatCouldCount: '',
      recognitionPrompt: '',
      resumePriority: '',
      isTopCritical: (k as any).isTopCritical === true,
      ...((k as any).userContextStatus ? { userContextStatus: str((k as any).userContextStatus, 30) as KeywordSignal['userContextStatus'] } : {}),
    });
  }
  return out;
}

export interface ConfirmedContext {
  keyword: string;
  experience: string;
  outcome: string;
  roleId: string;
}

/** The candidate's approved Rating-stage context (Keyword Breakdown "I have this" + Gap Interview), each joined to the keyword it supports. */
export function confirmedContext(contextEntries: unknown, keywords: KeywordSignal[]): ConfirmedContext[] {
  if (!contextEntries || typeof contextEntries !== 'object') return [];
  const phraseById = new Map(keywords.map((k) => [k.id, k.phrase]));
  const out: ConfirmedContext[] = [];
  for (const [keywordId, entry] of Object.entries(contextEntries as Record<string, Partial<ExperienceContext>>).slice(0, MAX_CONTEXT_ENTRIES)) {
    if (!entry || typeof entry !== 'object' || entry.approvalStatus !== 'Approved for patch') continue;
    const experience = str(entry.experienceText, 1200);
    if (!experience) continue;
    out.push({
      keyword: phraseById.get(keywordId) || str((entry as any).keywordPhrase, 160) || '(keyword no longer in the breakdown)',
      experience,
      outcome: str(entry.measurableOutcome, 300),
      roleId: str(entry.targetRoleId, 40),
    });
  }
  return out;
}

function keywordLine(k: KeywordSignal): string {
  const tags = [k.isTopCritical ? 'top-critical' : '', k.userContextStatus === 'Approved for patch' ? 'candidate-confirmed' : '']
    .filter(Boolean)
    .join(', ');
  const refs = (k.evidenceRefs || []).map((r) => r.id).join(', ');
  return `  - "${k.phrase}"${tags ? ` [${tags}]` : ''}${refs ? ` — evidence: ${refs}` : ''}`;
}

export function buildResumeKeywordBlock(
  keywords: KeywordSignal[],
  contextEntries: unknown,
  purpose: 'strategy' | 'resume'
): string {
  const usable = keywords.filter((k) => keywordUse(k) !== 'skip');
  const context = confirmedContext(contextEntries, keywords);
  if (usable.length === 0 && context.length === 0) return '';

  const use = usable.filter((k) => keywordUse(k) === 'use').sort((a, b) => Number(b.isTopCritical) - Number(a.isTopCritical));
  const ifSupported = usable.filter((k) => keywordUse(k) === 'if-supported');
  const omit = usable.filter((k) => keywordUse(k) === 'omit');

  const lines = ['JD Keyword Plan (from the candidate\'s Rating stage — the finished resume is scored against this exact list):'];
  if (purpose === 'strategy') {
    lines.push(
      '- Plan where every USE keyword lands in keywordPlacement, in the JD\'s exact wording, and work the top-critical ones into headerTagline, executiveSummary, selectedOutcomes or the first skillRows.',
      '- USE IF SUPPORTED keywords go in the plan only where the Career Journey or the candidate-confirmed experience below honestly supports them.',
      '- Every DO NOT CLAIM keyword goes in cautionClaims. Never list a keyword you are leaving out inside keywordPlacement.'
    );
  } else {
    lines.push(
      '- Use every USE keyword at least once in the JD\'s exact wording — in the summary, a skills row, or a bullet for the role its evidence comes from. Top-critical keywords belong in the summary or the strongest bullets of the most relevant role.',
      '- USE IF SUPPORTED keywords appear only where the Career Journey or the candidate-confirmed experience below honestly supports them.',
      '- DO NOT CLAIM keywords stay out of the resume entirely, skills rows included. Also honor every cautionClaims entry in the Resume Strategy.',
      '- Keep the JD\'s wording but never the JD\'s claims: a keyword only goes where the candidate\'s real work backs it.'
    );
  }
  if (use.length > 0) lines.push('USE:', ...use.map(keywordLine));
  if (ifSupported.length > 0) lines.push('USE IF SUPPORTED:', ...ifSupported.map(keywordLine));
  if (omit.length > 0) lines.push(`DO NOT CLAIM: ${omit.map((k) => `"${k.phrase}"`).join(', ')}`);
  if (context.length > 0) {
    lines.push(
      'Candidate-confirmed experience (added during Rating — true, usable evidence; use the candidate\'s numbers exactly):',
      ...context.map((c) => `  - for "${c.keyword}": ${c.experience}${c.outcome ? ` Outcome: ${c.outcome}.` : ''}${c.roleId ? ` (role ${c.roleId})` : ''}`)
    );
  }
  return lines.join('\n');
}
