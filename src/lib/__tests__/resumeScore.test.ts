import { describe, it, expect } from 'vitest';
import { scoreResumeKeywords, containsPhrase, normalize, resumeFingerprint } from '../resumeScore';
import type { GeneratedResume, JDParse, KeywordSignal } from '../../types';

function resume(overrides: Partial<GeneratedResume> = {}): GeneratedResume {
  return {
    name: 'Jane Doe',
    contactInfo: 'jane@example.com',
    summary: 'Platform leader who built Application Programming Interface (API) gateways in C++ and .NET.',
    skills: [{ category: 'Cloud', terms: 'Kubernetes, AWS, Terraform' }],
    experience: [
      {
        company: 'Acme',
        title: 'Senior Software Engineer',
        dates: 'Jan 2020 - Present',
        location: 'Remote',
        bullets: [{ text: 'Rebuilt payment pipelines for 3 regions.' }],
      },
    ],
    education: [{ institution: 'UT', degree: 'BS Computer Science', graduationDate: '2015' }],
    ...overrides,
  };
}

function kw(phrase: string, extra: Partial<KeywordSignal> = {}): KeywordSignal {
  return {
    id: phrase,
    phrase,
    category: 'Required keyword',
    jdImportance: 'Medium',
    evidenceStatus: 'EVIDENCED',
    evidenceRefs: [],
    jdRefs: [],
    whatCouldCount: '',
    recognitionPrompt: '',
    resumePriority: '',
    isTopCritical: false,
    ...extra,
  };
}

const parse = (extra: Partial<JDParse> = {}): JDParse => ({
  company: 'Co', roleTitle: '', reportingLine: '', teamScope: '', mustHaves: [], niceToHaves: [],
  strategicSignals: [], industryDomain: [], stageSignals: [], topCriticalSkills: [], hardGates: [], ...extra,
});

describe('phrase matching', () => {
  const text = normalize('Built Application Programming Interface (API) gateways in C++ and .NET; Node.js services. Shipped data pipelines.');

  it('matches either half of an acronym pair', () => {
    expect(containsPhrase(text, 'API')).toBe(true);
    expect(containsPhrase(text, 'Application Programming Interface')).toBe(true);
    expect(containsPhrase(normalize('Designed API gateways'), 'Application Programming Interface (API)')).toBe(true);
  });

  it('keeps symbol-bearing tech names intact', () => {
    expect(containsPhrase(text, 'C++')).toBe(true);
    expect(containsPhrase(text, '.NET')).toBe(true);
    expect(containsPhrase(text, 'Node.js')).toBe(true);
    expect(containsPhrase(text, 'C#')).toBe(false);
  });

  it('toggles singular/plural on the last word', () => {
    expect(containsPhrase(text, 'data pipeline')).toBe(true);
    expect(containsPhrase(normalize('owned the data pipeline'), 'data pipelines')).toBe(true);
  });

  it('respects word boundaries', () => {
    expect(containsPhrase(normalize('JavaScript'), 'Java')).toBe(false);
  });

  it('splits spaced slash and "or" alternatives', () => {
    expect(containsPhrase(text, 'Golang / C++')).toBe(true);
    expect(containsPhrase(text, 'Rust or .NET')).toBe(true);
  });
});

describe('scoreResumeKeywords', () => {
  it('weights critical keywords 3x and passes at 85% with all critical present', () => {
    const r = scoreResumeKeywords(resume(), undefined, [
      kw('Kubernetes', { isTopCritical: true }),
      kw('AWS', { isTopCritical: true }),
      kw('Terraform', { jdImportance: 'High' }),
      kw('Golang'),
    ], parse());
    // matched 3+3+2 of 9
    expect(r.score).toBe(89);
    expect(r.passed).toBe(true);
    expect(r.missingKeywords).toEqual(['Golang']);
  });

  it('fails the gate when a critical skill is missing even above 85%', () => {
    const present = ['Kubernetes', 'AWS', 'Terraform', 'C++', '.NET', 'API', 'gateways', 'payment pipelines', 'Senior Software Engineer', 'Platform'];
    const r = scoreResumeKeywords(resume(), undefined, [
      kw('Kafka', { isTopCritical: true }),
      ...present.map((p) => kw(p, { jdImportance: 'High' })),
    ], parse());
    // matched 20 of 23
    expect(r.score).toBe(87);
    expect(r.passed).toBe(false);
    expect(r.criticalSkillCoverage).toEqual([{ phrase: 'Kafka', present: false }]);
  });

  it('excludes hard gates and NOT SUPPORTED keywords from the score', () => {
    const r = scoreResumeKeywords(resume(), undefined, [
      kw('AWS'),
      kw('Security clearance', { category: 'Hard gate' }),
      kw('Fortran', { evidenceStatus: 'NOT SUPPORTED' }),
    ], parse());
    expect(r.score).toBe(100);
    expect(r.unsupportedKeywords).toEqual(['Fortran']);
    expect([...r.criticalSkillCoverage, ...r.secondaryKeywordCoverage].map((c) => c.phrase)).toEqual(['AWS']);
  });

  it('splits missing keywords into evidenced (addable) and honest gaps', () => {
    const r = scoreResumeKeywords(resume(), undefined, [
      kw('Golang', { evidenceStatus: 'PARTIAL' }),
      kw('Kafka', { evidenceStatus: 'MISSING / POSSIBLE' }),
      kw('Spark', { evidenceStatus: 'MISSING / POSSIBLE', userContextStatus: 'Approved for patch' }),
    ], parse());
    expect(r.missingKeywords).toEqual(['Golang', 'Spark']);
    expect(r.unsupportedKeywords).toEqual(['Kafka']);
  });

  it('falls back to parse.topCriticalSkills and checks the core role title', () => {
    const r = scoreResumeKeywords(resume(), undefined, [], parse({ topCriticalSkills: ['Kubernetes', 'Kafka'], roleTitle: 'Senior Software Engineer, Payments' }));
    expect(r.usedFallback).toBe(true);
    expect(r.criticalSkillCoverage).toEqual([{ phrase: 'Kubernetes', present: true }, { phrase: 'Kafka', present: false }]);
    expect(r.secondaryKeywordCoverage).toEqual([{ phrase: 'Senior Software Engineer', present: true }]);
    expect(r.missingKeywords).toEqual(['Kafka']);
    expect(r.passed).toBe(false);
  });

  it('counts the tagline as resume text', () => {
    const r = scoreResumeKeywords(resume(), 'Head of Platform Engineering', [kw('Platform Engineering')], parse());
    expect(r.score).toBe(100);
  });

  it('returns 0 and not passed with nothing to score', () => {
    const r = scoreResumeKeywords(resume(), undefined, [], parse());
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });
});

describe('resumeFingerprint', () => {
  it('changes when the resume changes', () => {
    expect(resumeFingerprint(resume())).toBe(resumeFingerprint(resume()));
    expect(resumeFingerprint(resume())).not.toBe(resumeFingerprint(resume({ summary: 'x' })));
  });
});
