import { describe, it, expect } from 'vitest';
import {
  addKeyword, averagePhraseWords, carryContextForward, cleanKeywordBreakdown, editKeyword, mergeKeywords,
  needsReanalysis, removeKeywords, toggleCritical, MAX_TOP_CRITICAL,
} from '../keywordList';
import type { ExperienceContext, KeywordSignal } from '../../types';

const kw = (id: string, phrase: string, patch: Partial<KeywordSignal> = {}): KeywordSignal => ({
  id, phrase, category: 'Secondary keyword', jdImportance: 'Medium', evidenceStatus: 'MISSING / POSSIBLE',
  evidenceRefs: [], jdRefs: [], whatCouldCount: '', recognitionPrompt: '', resumePriority: '', isTopCritical: false, ...patch,
});
const ctx = (keywordId: string, patch: Partial<ExperienceContext> = {}): ExperienceContext => ({
  id: `CTX-${keywordId}`, keywordId, experienceText: 'did it', whereItHappened: '', whenItHappened: '', peopleTeams: '', toolsPlatforms: '',
  measurableOutcome: '', proof: '', confidenceLevel: 'Medium', canAddToCareerJourney: 'Yes', proposedAdditionType: 'Add new deliverable',
  notes: '', approvalStatus: 'Approved for patch', ...patch,
});

describe('cleanKeywordBreakdown', () => {
  it('merges duplicates by phrase or alias, keeping the stronger evidence and both sets of refs', () => {
    const out = cleanKeywordBreakdown([
      kw('K1', 'CI/CD', { aliases: ['continuous integration / continuous deployment'], evidenceRefs: [{ type: 'achievement', id: 'ACH-1' }], jdRefs: [{ segmentId: 'jd-1' }] }),
      kw('K2', 'Continuous Integration / Continuous Deployment', { evidenceStatus: 'EVIDENCED', isTopCritical: true, jdImportance: 'High', evidenceRefs: [{ type: 'achievement', id: 'ACH-2' }], jdRefs: [{ segmentId: 'jd-1' }] }),
      kw('K3', '  Microservices  ', { aliases: ['microservices', 'Micro-services', ''] }),
      kw('K4', ''),
    ]);
    expect(out.map((k) => k.phrase)).toEqual(['CI/CD', 'Microservices']);
    expect(out[0]).toMatchObject({ evidenceStatus: 'EVIDENCED', isTopCritical: true, jdImportance: 'High' });
    expect(out[0].evidenceRefs.map((r) => r.id)).toEqual(['ACH-1', 'ACH-2']);
    expect(out[0].jdRefs).toEqual([{ segmentId: 'jd-1' }]);
    expect(out[1].aliases).toEqual(['Micro-services']);
  });

  it('files gate verdicts as hard gates and never merges a gate with a skill', () => {
    const out = cleanKeywordBreakdown([
      kw('G1', 'Work authorization', { evidenceStatus: 'UNCERTAIN' as any, isTopCritical: true }),
      kw('G2', '7+ years experience', { category: 'Hard gate', evidenceStatus: 'CLEAR' as any }),
    ]);
    expect(out.every((k) => k.category === 'Hard gate' && k.evidenceStatus === 'HARD GATE' && !k.isTopCritical)).toBe(true);
  });

  it(`caps top-critical at ${MAX_TOP_CRITICAL}, High importance first`, () => {
    const raw = Array.from({ length: 10 }, (_, i) => kw(`K${i}`, `Term ${String.fromCharCode(65 + i)}`, { isTopCritical: true, jdImportance: i === 9 ? 'High' : 'Medium' }));
    const out = cleanKeywordBreakdown(raw);
    expect(out.filter((k) => k.isTopCritical)).toHaveLength(MAX_TOP_CRITICAL);
    expect(out[9].isTopCritical).toBe(true);
    expect(out[8].isTopCritical).toBe(false);
  });

  it('drops model aliases that are a broader or narrower form of the term', () => {
    const [k] = cleanKeywordBreakdown([kw('K', 'Post-sale adoption', { aliases: ['adoption', 'post-sale adoption tracking', 'customer adoption', 'Post-sale Adoption'] })]);
    expect(k.aliases).toEqual(['customer adoption']);
  });

  it('makes ids unique', () => {
    const out = cleanKeywordBreakdown([kw('K1', 'SQL'), kw('K1', 'Python'), kw('', 'Go')]);
    expect(new Set(out.map((k) => k.id)).size).toBe(3);
  });
});

describe('reanalysis heuristic', () => {
  it('flags sentence-style breakdowns, ignoring hard gates', () => {
    const terms = [kw('1', 'CI/CD'), kw('2', 'Product demos'), kw('3', 'Work authorization in the United States required', { category: 'Hard gate' })];
    expect(averagePhraseWords(terms)).toBe(1.5);
    expect(needsReanalysis(terms)).toBe(false);
    expect(needsReanalysis([kw('1', 'Strong data fluency: comfortable writing SQL and building dashboards')])).toBe(true);
    expect(needsReanalysis([])).toBe(false);
  });
});

describe('table edits', () => {
  const state = () => ({
    keywords: [kw('A', 'Proofs of concept', { evidenceStatus: 'EVIDENCED' }), kw('B', 'POCs'), kw('C', 'Demos')],
    contextEntries: { B: ctx('B') } as Record<string, ExperienceContext>,
  });

  it('edits phrase and aliases, dropping an alias equal to the phrase', () => {
    const next = editKeyword(state(), 'C', { phrase: 'Product demos', aliases: ['demos', 'product demos', ''] });
    expect(next.keywords[2]).toMatchObject({ phrase: 'Product demos', aliases: ['demos'] });
    // Hand-entered aliases aren't held to the model's strictness.
  });

  it('toggles critical', () => {
    expect(toggleCritical(state(), 'A').keywords[0].isTopCritical).toBe(true);
  });

  it('removes keywords and their context', () => {
    const next = removeKeywords(state(), ['B']);
    expect(next.keywords.map((k) => k.id)).toEqual(['A', 'C']);
    expect(next.contextEntries).toEqual({});
  });

  it('merges into the first id and moves approved context to the survivor', () => {
    const next = mergeKeywords(state(), ['A', 'B']);
    expect(next.keywords.map((k) => k.id)).toEqual(['A', 'C']);
    expect(next.keywords[0]).toMatchObject({ phrase: 'Proofs of concept', aliases: ['POCs'], evidenceStatus: 'EVIDENCED' });
    expect(next.contextEntries.A).toMatchObject({ keywordId: 'A', keywordPhrase: 'Proofs of concept' });
    expect(next.contextEntries.B).toBeUndefined();
    expect(mergeKeywords(state(), ['A'])).toEqual(state());
  });

  it('adds a new unevidenced keyword, ignoring duplicates', () => {
    const next = addKeyword(state(), { id: 'NEW', phrase: '  Developer   tooling ' });
    expect(next.keywords[3]).toMatchObject({ id: 'NEW', phrase: 'Developer tooling', evidenceStatus: 'MISSING / POSSIBLE', isTopCritical: false });
    expect(addKeyword(state(), { id: 'DUP', phrase: 'demos' }).keywords).toHaveLength(3);
    expect(addKeyword(state(), { id: 'BLANK', phrase: '  ' }).keywords).toHaveLength(3);
  });
});

describe('carryContextForward', () => {
  it('stamps phrases, re-attaches approved context to a matching new keyword and keeps the rest', () => {
    const oldKeywords = [kw('OLD-1', 'Kanban'), kw('OLD-2', 'Running proofs-of-concept for enterprise buyers'), kw('OLD-3', 'Webhooks')];
    const fresh = [kw('NEW-1', 'Kanban boards', { aliases: ['Kanban'] }), kw('NEW-2', 'POCs'), kw('NEW-3', 'Webhooks')];
    const out = carryContextForward(oldKeywords, fresh, {
      'OLD-1': ctx('OLD-1'),
      'OLD-2': ctx('OLD-2'),
      'OLD-3': ctx('OLD-3', { approvalStatus: 'Rejected' }),
    });
    expect(out.contextEntries['NEW-1']).toMatchObject({ keywordId: 'NEW-1', keywordPhrase: 'Kanban' });
    expect(out.keywords[0]).toMatchObject({ userContextStatus: 'Approved for patch', evidenceStatus: 'EVIDENCED' });
    expect(out.contextEntries['OLD-2']).toMatchObject({ keywordPhrase: 'Running proofs-of-concept for enterprise buyers' });
    expect(out.contextEntries['OLD-3'].keywordPhrase).toBe('Webhooks'); // rejected: stamped but not re-attached
    expect(out.keywords[2].userContextStatus).toBeUndefined();
  });
});
