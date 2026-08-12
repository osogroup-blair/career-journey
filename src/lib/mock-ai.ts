import { JDParse, KeywordSignal, FitAnalysis, HardGateAudit, ResumeStrategy, KeywordCoverage, CareerJourneyPatch, ExperienceContext, GeneratedResume, ClarificationQuestion, CoverLetter } from '../types';
import { generateId } from './utils';

export async function mockParseJobDescription(jdText: string, companyName: string, roleTitle: string): Promise<JDParse> {
  const res = await fetch('/api/ai/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jdText, company: companyName, roleTitle })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockGenerateKeywordBreakdown(parse: JDParse, careerJourney: any): Promise<KeywordSignal[]> {
  const res = await fetch('/api/ai/keywords', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parse, careerJourney })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockScoreFit(parse: JDParse, careerJourney: any, contextEntries: Record<string, any>, gateClarifications?: Record<string, any>): Promise<FitAnalysis> {
  const res = await fetch('/api/ai/fitScore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parse, careerJourney, contextEntries, gateClarifications })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockAuditHardGates(parse: JDParse, careerJourney: any, gateClarifications?: Record<string, any>): Promise<HardGateAudit> {
  const res = await fetch('/api/ai/auditGates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parse, careerJourney, gateClarifications })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockStageCareerJourneyPatch(careerJourney: any, contextEntries: Record<string, ExperienceContext>): Promise<{ summary: CareerJourneyPatch, updatedCareerJourney: any }> {
  const res = await fetch('/api/ai/patchJourney', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ careerJourney, contextEntries })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockGenerateResumeStrategy(parse: JDParse, careerJourney: any, contextEntries: Record<string, ExperienceContext>, remediation?: string[]): Promise<ResumeStrategy> {
  const res = await fetch('/api/ai/resumeStrategy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parse, careerJourney, contextEntries, remediation })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockScoreKeywordCoverage(strategy: ResumeStrategy, keywords: KeywordSignal[]): Promise<KeywordCoverage> {
  const res = await fetch('/api/ai/keywordCoverage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy, keywords })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockGenerateFullResume(careerJourney: any, strategy: ResumeStrategy, parse: JDParse, remediation?: string[]): Promise<GeneratedResume> {
  const res = await fetch('/api/ai/generateResume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ careerJourney, strategy, parse, remediation })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockGenerateClarifyingQuestions(parse: JDParse, careerJourney: any, keywords: KeywordSignal[]): Promise<ClarificationQuestion[]> {
  const res = await fetch('/api/ai/clarifyQuestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parse, careerJourney, keywords })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockGenerateCoverLetter(parse: JDParse, careerJourney: any, fitAnalysis: FitAnalysis | undefined, resumeStrategy: ResumeStrategy | undefined): Promise<CoverLetter> {
  const res = await fetch('/api/ai/coverLetter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parse, careerJourney, fitAnalysis, resumeStrategy })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}
