import { EvidenceRef, ExperienceContext, JdRef, KeywordSignal } from '../types';
import { normalize } from './resumeScore';

/**
 * Pure operations on a job's keyword breakdown: the server-side cleanup run on
 * every fresh extraction (/api/ai/keywords), and the edits the Rating stage's
 * Keyword Breakdown table offers (edit, delete, merge, star, add). Keywords
 * are ATS terms — "CI/CD", "Product demos" — not requirement sentences; the
 * sentence a term came from lives in requirementText.
 */

export const MAX_TOP_CRITICAL = 8;
const MAX_ALIASES = 4;
/** Above this average phrase length, a breakdown predates term-style extraction and is worth re-analyzing. */
const REANALYZE_AVG_WORDS = 4;

const STATUS_RANK: Record<string, number> = { EVIDENCED: 4, PARTIAL: 3, 'MISSING / POSSIBLE': 2, 'NOT SUPPORTED': 1 };
const IMPORTANCE_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
/** Verdicts the auditGates step uses; a keyword carrying one is a hard gate the model filed as a keyword. */
const GATE_VERDICTS = new Set(['CLEAR', 'UNCERTAIN', 'FAIL', 'HARD GATE']);

export function isHardGate(k: KeywordSignal): boolean {
  return k.category === 'Hard gate' || GATE_VERDICTS.has(String(k.evidenceStatus).toUpperCase());
}

/** True when one normalized phrase is a whole-word part of the other ("cloud" / "cloud infrastructure"). */
function nested(a: string, b: string): boolean {
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
}

/**
 * Trims, dedupes and caps aliases. With `strict` (model output), it also drops
 * an alias that's just a broader or narrower form of the phrase ("adoption"
 * for "Post-sale adoption", "pipeline management" for "Pipeline"): those
 * aren't the same term, and a loose alias lets the keyword gate pass on words
 * the JD didn't ask for. Hand-entered aliases are kept as the candidate wrote them.
 */
function cleanAliases(phrase: string, aliases: unknown, strict = false): string[] {
  const own = normalize(phrase);
  const seen = new Set<string>([own]);
  const out: string[] = [];
  for (const a of Array.isArray(aliases) ? aliases : []) {
    if (typeof a !== 'string') continue;
    const trimmed = a.trim();
    const key = normalize(trimmed);
    if (!trimmed || !key || seen.has(key)) continue;
    if (strict && nested(own, key)) continue;
    seen.add(key);
    out.push(trimmed.slice(0, 80));
    if (out.length >= MAX_ALIASES) break;
  }
  return out;
}

/** Every normalized form a keyword answers to — its phrase plus aliases. */
export function keywordKeys(k: Pick<KeywordSignal, 'phrase' | 'aliases'>): string[] {
  return [k.phrase, ...(k.aliases || [])].map(normalize).filter(Boolean);
}

function unionBy<T>(a: T[] | undefined, b: T[] | undefined, key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return [...(a || []), ...(b || [])].filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Folds `other` into `target`: target's phrase wins, other's phrase and aliases become aliases, evidence and JD refs union, the stronger status/importance/critical flag wins. */
export function mergeKeywordInto(target: KeywordSignal, other: KeywordSignal): KeywordSignal {
  const status = (STATUS_RANK[other.evidenceStatus] ?? 0) > (STATUS_RANK[target.evidenceStatus] ?? 0) ? other.evidenceStatus : target.evidenceStatus;
  const importance = (IMPORTANCE_RANK[other.jdImportance] ?? 0) > (IMPORTANCE_RANK[target.jdImportance] ?? 0) ? other.jdImportance : target.jdImportance;
  return {
    ...target,
    aliases: cleanAliases(target.phrase, [...(target.aliases || []), other.phrase, ...(other.aliases || [])]),
    requirementText: target.requirementText || other.requirementText,
    evidenceStatus: status,
    jdImportance: importance,
    isTopCritical: target.isTopCritical || other.isTopCritical,
    evidenceRefs: unionBy<EvidenceRef>(target.evidenceRefs, other.evidenceRefs, (r) => `${r.type}:${r.id}`),
    jdRefs: unionBy<JdRef>(target.jdRefs, other.jdRefs, (r) => r.segmentId),
    userContextStatus: target.userContextStatus === 'Approved for patch' || other.userContextStatus === 'Approved for patch' ? 'Approved for patch' : target.userContextStatus,
  };
}

/**
 * Cleanup for a fresh extraction: trims phrases and aliases, files gate
 * verdicts as hard gates, merges duplicates (same phrase or alias), caps
 * top-critical at MAX_TOP_CRITICAL (High-importance first, then JD order),
 * and makes ids unique.
 */
export function cleanKeywordBreakdown(raw: KeywordSignal[]): KeywordSignal[] {
  const merged: KeywordSignal[] = [];
  const ownerByKey = new Map<string, number>();
  for (const k of raw || []) {
    const phrase = typeof k?.phrase === 'string' ? k.phrase.trim().replace(/\s+/g, ' ') : '';
    if (!phrase || !normalize(phrase)) continue;
    let kw: KeywordSignal = {
      ...k,
      phrase,
      aliases: cleanAliases(phrase, k.aliases, true),
      requirementText: typeof k.requirementText === 'string' ? k.requirementText.trim() : '',
      evidenceRefs: Array.isArray(k.evidenceRefs) ? k.evidenceRefs : [],
      jdRefs: Array.isArray(k.jdRefs) ? k.jdRefs : [],
    };
    if (isHardGate(kw)) kw = { ...kw, category: 'Hard gate', evidenceStatus: 'HARD GATE', isTopCritical: false };
    const keys = keywordKeys(kw);
    const existing = keys.map((key) => ownerByKey.get(key)).find((i) => i !== undefined);
    if (existing !== undefined && isHardGate(merged[existing]) === isHardGate(kw)) {
      merged[existing] = mergeKeywordInto(merged[existing], kw);
      keywordKeys(merged[existing]).forEach((key) => ownerByKey.set(key, existing));
      continue;
    }
    merged.push(kw);
    keys.forEach((key) => { if (!ownerByKey.has(key)) ownerByKey.set(key, merged.length - 1); });
  }

  const critical = merged
    .map((k, i) => ({ k, i }))
    .filter(({ k }) => k.isTopCritical)
    .sort((a, b) => (IMPORTANCE_RANK[b.k.jdImportance] ?? 0) - (IMPORTANCE_RANK[a.k.jdImportance] ?? 0) || a.i - b.i)
    .slice(0, MAX_TOP_CRITICAL)
    .map(({ i }) => i);
  const keepCritical = new Set(critical);

  const ids = new Set<string>();
  return merged.map((k, i) => {
    let id = typeof k.id === 'string' && k.id.trim() ? k.id.trim() : `KW-${i + 1}`;
    for (let n = 2; ids.has(id); n++) id = `${k.id || 'KW'}-${n}`;
    ids.add(id);
    return { ...k, id, isTopCritical: keepCritical.has(i) };
  });
}

export function averagePhraseWords(keywords: KeywordSignal[] | undefined): number {
  const usable = (keywords || []).filter((k) => !isHardGate(k));
  if (usable.length === 0) return 0;
  return usable.reduce((n, k) => n + k.phrase.trim().split(/\s+/).length, 0) / usable.length;
}

/** True for breakdowns extracted before keywords were short ATS terms. */
export function needsReanalysis(keywords: KeywordSignal[] | undefined): boolean {
  return averagePhraseWords(keywords) > REANALYZE_AVG_WORDS;
}

// ---------------------------------------------------------------------------
// Table edits. Each takes and returns { keywords, contextEntries } so context
// the candidate added (keyed by keyword id) follows its keyword.

export interface KeywordState {
  keywords: KeywordSignal[];
  contextEntries: Record<string, ExperienceContext>;
}

export function editKeyword(state: KeywordState, id: string, patch: { phrase?: string; aliases?: string[] }): KeywordState {
  return {
    ...state,
    keywords: state.keywords.map((k) => {
      if (k.id !== id) return k;
      const phrase = patch.phrase?.trim() || k.phrase;
      return { ...k, phrase, aliases: cleanAliases(phrase, patch.aliases ?? k.aliases) };
    }),
  };
}

export function toggleCritical(state: KeywordState, id: string): KeywordState {
  return { ...state, keywords: state.keywords.map((k) => (k.id === id ? { ...k, isTopCritical: !k.isTopCritical } : k)) };
}

export function removeKeywords(state: KeywordState, ids: string[]): KeywordState {
  const drop = new Set(ids);
  return {
    keywords: state.keywords.filter((k) => !drop.has(k.id)),
    contextEntries: Object.fromEntries(Object.entries(state.contextEntries).filter(([id]) => !drop.has(id))),
  };
}

/** Merges `ids` into the first of them, which keeps its phrase and position. The first approved context among them moves to the survivor if it has none. */
export function mergeKeywords(state: KeywordState, ids: string[]): KeywordState {
  const [targetId, ...rest] = ids;
  const target = state.keywords.find((k) => k.id === targetId);
  const others = rest.map((id) => state.keywords.find((k) => k.id === id)).filter((k): k is KeywordSignal => !!k && k.id !== targetId);
  if (!target || others.length === 0) return state;
  const merged = others.reduce(mergeKeywordInto, target);
  const contextEntries = { ...state.contextEntries };
  if (!contextEntries[targetId]) {
    const moved = others.map((k) => contextEntries[k.id]).find((c) => c?.approvalStatus === 'Approved for patch');
    if (moved) contextEntries[targetId] = { ...moved, keywordId: targetId, keywordPhrase: target.phrase };
  }
  for (const k of others) delete contextEntries[k.id];
  const drop = new Set(others.map((k) => k.id));
  return {
    keywords: state.keywords.filter((k) => !drop.has(k.id)).map((k) => (k.id === targetId ? merged : k)),
    contextEntries,
  };
}

/** A keyword the candidate adds by hand. It starts unevidenced; "I have this" is how they back it up. */
export function addKeyword(state: KeywordState, input: { id: string; phrase: string; aliases?: string[]; isTopCritical?: boolean }): KeywordState {
  const phrase = input.phrase.trim().replace(/\s+/g, ' ');
  if (!phrase) return state;
  const keys = new Set(state.keywords.flatMap(keywordKeys));
  if (keys.has(normalize(phrase))) return state;
  const kw: KeywordSignal = {
    id: input.id,
    phrase,
    aliases: cleanAliases(phrase, input.aliases),
    requirementText: '',
    category: 'Required keyword',
    jdImportance: input.isTopCritical ? 'High' : 'Medium',
    evidenceStatus: 'MISSING / POSSIBLE',
    evidenceRefs: [],
    jdRefs: [],
    whatCouldCount: '',
    recognitionPrompt: '',
    resumePriority: '',
    isTopCritical: !!input.isTopCritical,
    userContextStatus: 'Not reviewed',
  };
  return { ...state, keywords: [...state.keywords, kw] };
}

/**
 * Re-analysis replaces every keyword id. Before it does: stamp each context
 * entry with the phrase it was saved against, then re-attach approved
 * entries to a new keyword with the same phrase or alias (marking it
 * candidate-confirmed). Entries with no match keep their old key; their
 * stamped phrase still tells the resume writer what they support.
 */
export function carryContextForward(oldKeywords: KeywordSignal[] | undefined, newKeywords: KeywordSignal[], contextEntries: Record<string, ExperienceContext> | undefined): KeywordState {
  const oldPhrase = new Map((oldKeywords || []).map((k) => [k.id, k.phrase]));
  const byKey = new Map<string, KeywordSignal>();
  for (const k of newKeywords) for (const key of keywordKeys(k)) if (!byKey.has(key)) byKey.set(key, k);

  const entries: Record<string, ExperienceContext> = {};
  const confirmed = new Set<string>();
  for (const [id, entry] of Object.entries(contextEntries || {})) {
    const keywordPhrase = entry.keywordPhrase || oldPhrase.get(id);
    const stamped = keywordPhrase ? { ...entry, keywordPhrase } : entry;
    const match = keywordPhrase && entry.approvalStatus === 'Approved for patch' ? byKey.get(normalize(keywordPhrase)) : undefined;
    if (match && !entries[match.id]) {
      entries[match.id] = { ...stamped, keywordId: match.id };
      confirmed.add(match.id);
    } else {
      entries[id] = stamped;
    }
  }
  return {
    keywords: newKeywords.map((k) => (confirmed.has(k.id) ? { ...k, userContextStatus: 'Approved for patch' as const, evidenceStatus: 'EVIDENCED' as const } : k)),
    contextEntries: entries,
  };
}
