import { JDParse, KeywordSignal, FitAnalysis, HardGateAudit, ResumeStrategy, KeywordCoverage, CareerJourneyPatch, ExperienceContext, GeneratedResume, ClarificationQuestion, CoverLetter, JobMatchScanResult, SourcedJobPosting } from '../types';
import { generateId } from './utils';
import { auth } from './firebase';

// No-op when Firebase isn't configured; once it is, every API call carries the
// signed-in user's ID token so server.ts's requireFirebaseAuth can verify it.
async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth?.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiPost(path: string, body: any): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body)
  });
}

export async function mockParseJobDescription(jdText: string, companyName: string, roleTitle: string): Promise<JDParse> {
  const res = await apiPost('/api/ai/parse', { jdText, company: companyName, roleTitle });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockGenerateKeywordBreakdown(parse: JDParse, careerJourney: any): Promise<KeywordSignal[]> {
  const res = await apiPost('/api/ai/keywords', { parse, careerJourney });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockScoreFit(parse: JDParse, careerJourney: any, contextEntries: Record<string, any>, gateClarifications?: Record<string, any>): Promise<FitAnalysis> {
  const res = await apiPost('/api/ai/fitScore', { parse, careerJourney, contextEntries, gateClarifications });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockAuditHardGates(parse: JDParse, careerJourney: any, gateClarifications?: Record<string, any>): Promise<HardGateAudit> {
  const res = await apiPost('/api/ai/auditGates', { parse, careerJourney, gateClarifications });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockStageCareerJourneyPatch(careerJourney: any, contextEntries: Record<string, ExperienceContext>): Promise<{ summary: CareerJourneyPatch, updatedCareerJourney: any }> {
  const res = await apiPost('/api/ai/patchJourney', { careerJourney, contextEntries });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockGenerateResumeStrategy(parse: JDParse, careerJourney: any, contextEntries: Record<string, ExperienceContext>, remediation?: string[]): Promise<ResumeStrategy> {
  const res = await apiPost('/api/ai/resumeStrategy', { parse, careerJourney, contextEntries, remediation });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockScoreKeywordCoverage(strategy: ResumeStrategy, keywords: KeywordSignal[]): Promise<KeywordCoverage> {
  const res = await apiPost('/api/ai/keywordCoverage', { strategy, keywords });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockGenerateFullResume(careerJourney: any, strategy: ResumeStrategy, parse: JDParse, remediation?: string[]): Promise<GeneratedResume> {
  const res = await apiPost('/api/ai/generateResume', { careerJourney, strategy, parse, remediation });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function fetchCompanyJobs(boardToken: string): Promise<{ source: 'greenhouse' | 'lever'; jobs: SourcedJobPosting[] }> {
  const res = await apiPost('/api/sources/fetchCompanyJobs', { boardToken });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `No jobs found for "${boardToken}"`);
  return await res.json();
}

export async function scanJobMatch(jdText: string, careerJourney: any): Promise<JobMatchScanResult> {
  const res = await apiPost('/api/ai/liteScan', { jdText, careerJourney });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockGenerateClarifyingQuestions(parse: JDParse, careerJourney: any, keywords: KeywordSignal[]): Promise<ClarificationQuestion[]> {
  const res = await apiPost('/api/ai/clarifyQuestions', { parse, careerJourney, keywords });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function mockGenerateCoverLetter(parse: JDParse, careerJourney: any, fitAnalysis: FitAnalysis | undefined, resumeStrategy: ResumeStrategy | undefined): Promise<CoverLetter> {
  const res = await apiPost('/api/ai/coverLetter', { parse, careerJourney, fitAnalysis, resumeStrategy });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}
