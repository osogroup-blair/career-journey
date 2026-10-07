import { describe, it, expect } from 'vitest';
import { buildResumeKeywordBlock, confirmedContext, keywordUse, sanitizeKeywordsForResume } from '../resumeKeywordPlan';
import type { KeywordSignal } from '../../types';

const kw = (phrase: string, patch: Partial<KeywordSignal> = {}): KeywordSignal => ({
  id: `KW-${phrase}`, phrase, category: 'Critical skill', jdImportance: 'High', evidenceStatus: 'EVIDENCED',
  evidenceRefs: [], jdRefs: [], whatCouldCount: '', recognitionPrompt: '', resumePriority: '', isTopCritical: false, ...patch,
});

describe('keywordUse', () => {
  it('sorts keywords into use / if-supported / omit / skip', () => {
    expect(keywordUse(kw('SQL'))).toBe('use');
    expect(keywordUse(kw('Docs', { evidenceStatus: 'PARTIAL' }))).toBe('use');
    expect(keywordUse(kw('SDKs', { evidenceStatus: 'MISSING / POSSIBLE' }))).toBe('if-supported');
    expect(keywordUse(kw('SDKs', { evidenceStatus: 'MISSING / POSSIBLE', userContextStatus: 'Approved for patch' }))).toBe('use');
    expect(keywordUse(kw('PCI', { evidenceStatus: 'NOT SUPPORTED' }))).toBe('omit');
    expect(keywordUse(kw('SQL', { userContextStatus: 'Rejected' }))).toBe('omit');
    expect(keywordUse(kw('US work auth', { category: 'Hard gate' }))).toBe('skip');
  });
});

describe('sanitizeKeywordsForResume', () => {
  it('keeps well-formed entries only and caps strings', () => {
    const out = sanitizeKeywordsForResume([
      { id: 'K1', phrase: '  SQL ', evidenceStatus: 'EVIDENCED', isTopCritical: true, evidenceRefs: [{ type: 'achievement', id: 'ACH-1' }, { id: 5 }, null] },
      { id: 'K2', phrase: '' },
      'nonsense',
      { phrase: 'x'.repeat(500) },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'K1', phrase: 'SQL', isTopCritical: true, evidenceRefs: [{ type: 'achievement', id: 'ACH-1' }] });
    expect(out[1].phrase).toHaveLength(160);
    expect(sanitizeKeywordsForResume(undefined)).toEqual([]);
    expect(sanitizeKeywordsForResume({})).toEqual([]);
  });
});

describe('confirmedContext', () => {
  it('joins approved entries to their keyword phrase and skips the rest', () => {
    const keywords = [kw('Kanban'), kw('Webhooks')];
    const out = confirmedContext({
      'KW-Kanban': { approvalStatus: 'Approved for patch', experienceText: 'Ran Kanban for ops', measurableOutcome: 'cycle time -30%', targetRoleId: 'ROLE-1' },
      'KW-Webhooks': { approvalStatus: 'Rejected', experienceText: 'nope' },
      'KW-gone': { approvalStatus: 'Approved for patch', experienceText: 'Built SDK' },
      'KW-empty': { approvalStatus: 'Approved for patch', experienceText: '  ' },
    }, keywords);
    expect(out).toEqual([
      { keyword: 'Kanban', experience: 'Ran Kanban for ops', outcome: 'cycle time -30%', roleId: 'ROLE-1' },
      { keyword: '(keyword no longer in the breakdown)', experience: 'Built SDK', outcome: '', roleId: '' },
    ]);
  });
});

describe('buildResumeKeywordBlock', () => {
  const keywords = [
    kw('Product demos', { evidenceRefs: [{ type: 'achievement', id: 'ACH-7' }] }),
    kw('POC', { isTopCritical: true, evidenceRefs: [{ type: 'achievement', id: 'ACH-1' }] }),
    kw('Developer tooling', { evidenceStatus: 'MISSING / POSSIBLE' }),
    kw('PCI DSS', { evidenceStatus: 'NOT SUPPORTED' }),
    kw('US work authorization', { category: 'Hard gate', evidenceStatus: 'HARD GATE' }),
  ];

  it('groups keywords, lists critical ones first and leaves hard gates out', () => {
    const block = buildResumeKeywordBlock(keywords, {}, 'resume');
    expect(block.indexOf('"POC" [top-critical] — evidence: ACH-1')).toBeLessThan(block.indexOf('"Product demos"'));
    expect(block).toContain('USE IF SUPPORTED:\n  - "Developer tooling"');
    expect(block).toContain('DO NOT CLAIM: "PCI DSS"');
    expect(block).not.toContain('work authorization');
    expect(block).toContain('honor every cautionClaims entry');
  });

  it('tells the strategy to park unsupported keywords in cautionClaims', () => {
    expect(buildResumeKeywordBlock(keywords, {}, 'strategy')).toContain('Every DO NOT CLAIM keyword goes in cautionClaims');
  });

  it('includes candidate-confirmed experience', () => {
    const block = buildResumeKeywordBlock(keywords, { 'KW-Developer tooling': { approvalStatus: 'Approved for patch', experienceText: 'Built internal CLI', measurableOutcome: '40 engineers' } }, 'resume');
    expect(block).toContain('for "Developer tooling": Built internal CLI Outcome: 40 engineers.');
  });

  it('is empty when there is nothing to say', () => {
    expect(buildResumeKeywordBlock([], {}, 'resume')).toBe('');
  });
});
