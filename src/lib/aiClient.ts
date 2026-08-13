import { JDParse, KeywordSignal, FitAnalysis, HardGateAudit, ResumeStrategy, KeywordCoverage, CareerJourneyPatch, ExperienceContext, GeneratedResume, ClarificationQuestion, CoverLetter, JobMatchScanResult, SourcedJobPosting } from '../types';
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

export async function parseJobDescription(jdText: string, companyName: string, roleTitle: string): Promise<JDParse & { jdSegments: { id: string; text: string }[] }> {
  const res = await apiPost('/api/ai/parse', { jdText, company: companyName, roleTitle });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function generateKeywordBreakdown(parse: JDParse, careerJourney: any, jdSegments?: { id: string; text: string }[]): Promise<KeywordSignal[]> {
  const res = await apiPost('/api/ai/keywords', { parse, careerJourney, jdSegments });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function scoreFit(parse: JDParse, careerJourney: any, contextEntries: Record<string, any>, gateClarifications?: Record<string, any>, jdSegments?: { id: string; text: string }[]): Promise<FitAnalysis> {
  const res = await apiPost('/api/ai/fitScore', { parse, careerJourney, contextEntries, gateClarifications, jdSegments });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function auditHardGates(parse: JDParse, careerJourney: any, gateClarifications?: Record<string, any>, jdSegments?: { id: string; text: string }[]): Promise<HardGateAudit> {
  const res = await apiPost('/api/ai/auditGates', { parse, careerJourney, gateClarifications, jdSegments });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function stageCareerJourneyPatch(careerJourney: any, contextEntries: Record<string, ExperienceContext>): Promise<{ summary: CareerJourneyPatch, updatedCareerJourney: any }> {
  const res = await apiPost('/api/ai/patchJourney', { careerJourney, contextEntries });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function generateResumeStrategy(parse: JDParse, careerJourney: any, contextEntries: Record<string, ExperienceContext>, remediation?: string[]): Promise<ResumeStrategy> {
  const res = await apiPost('/api/ai/resumeStrategy', { parse, careerJourney, contextEntries, remediation });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function generateFullResume(careerJourney: any, strategy: ResumeStrategy, parse: JDParse, remediation?: string[]): Promise<GeneratedResume> {
  const res = await apiPost('/api/ai/generateResume', { careerJourney, strategy, parse, remediation });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function fetchCompanyJobs(boardToken: string): Promise<{ source: 'greenhouse' | 'lever'; jobs: SourcedJobPosting[] }> {
  const res = await apiPost('/api/sources/fetchCompanyJobs', { boardToken });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `No jobs found for "${boardToken}"`);
  return await res.json();
}

export async function fetchJobFromUrl(url: string): Promise<{ jdText: string; companyName?: string; roleTitle?: string } | { error: string }> {
  const res = await apiPost('/api/sources/fetchJobFromUrl', { url });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Could not fetch "${url}"`);
  return await res.json();
}

export async function scanJobMatch(jdText: string, careerJourney: any, archiveLearnings?: string): Promise<JobMatchScanResult> {
  const res = await apiPost('/api/ai/liteScan', { jdText, careerJourney, archiveLearnings });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function generateClarifyingQuestions(parse: JDParse, careerJourney: any, keywords: KeywordSignal[]): Promise<ClarificationQuestion[]> {
  const res = await apiPost('/api/ai/clarifyQuestions', { parse, careerJourney, keywords });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function generateCoverLetter(parse: JDParse, careerJourney: any, fitAnalysis: FitAnalysis | undefined, resumeStrategy: ResumeStrategy | undefined): Promise<CoverLetter> {
  const res = await apiPost('/api/ai/coverLetter', { parse, careerJourney, fitAnalysis, resumeStrategy });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function buildJourneyFromResume(resumeText: string): Promise<{ draftCareerJourney: any; notes: string[] }> {
  const res = await apiPost('/api/ai/buildJourneyFromResume', { resumeText });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function refineFromInterviewAnswer(
  entityType: 'achievement' | 'skill' | 'role',
  current: Record<string, any>,
  question: string,
  answer: string
): Promise<{ title?: string; description?: string; last_used?: string; proficiency?: string; years_experience?: number; summary: string }> {
  const res = await apiPost('/api/ai/refineFromInterviewAnswer', { entityType, current, question, answer });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function sendApplicationAssistantMessage(
  transcript: { role: 'user' | 'assistant'; content: string }[],
  parse: JDParse,
  careerJourney: any,
  resume: GeneratedResume | undefined,
  fitAnalysis: FitAnalysis | undefined
): Promise<{ reply: string }> {
  const res = await apiPost('/api/ai/applicationAssistant', { transcript, parse, careerJourney, resume, fitAnalysis });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function generateFormAnswers(
  fields: { id: string; label: string; fieldType: string; options?: string[] }[],
  parse: JDParse,
  careerJourney: any,
  resume: GeneratedResume | undefined
): Promise<{ answers: Record<string, string> }> {
  const res = await apiPost('/api/ai/generateFormAnswers', { fields, parse, careerJourney, resume });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function generateInterviewPrep(round: any, parse: JDParse, fitAnalysis: FitAnalysis | undefined, careerJourney: any) {
  const res = await apiPost('/api/ai/interviewPrep', { round, parse, fitAnalysis, careerJourney });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function sendInterviewPrepChatMessage(transcript: { role: 'user' | 'assistant'; content: string }[], round: any, parse: JDParse, careerJourney: any): Promise<{ reply: string }> {
  const res = await apiPost('/api/ai/interviewPrepChat', { transcript, round, parse, careerJourney });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function getOfferGuidance(offer: any, parse: JDParse, careerJourney: any) {
  const res = await apiPost('/api/ai/offerGuidance', { offer, parse, careerJourney });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function compareOffers(offers: { jobId: string; companyName: string; roleTitle: string; offer: any }[], careerJourney: any) {
  const res = await apiPost('/api/ai/compareOffers', { offers, careerJourney });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export interface AdminPromptConfig {
  id: string;
  label: string;
  description: string;
  stage: string;
  template: string;
  updatedAt: string | null;
  version: number;
}

export async function getAdminPrompts(): Promise<Record<string, AdminPromptConfig>> {
  const res = await fetch('/api/admin/prompts', { headers: await authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function saveAdminPrompt(id: string, template: string): Promise<AdminPromptConfig> {
  const res = await apiPost(`/api/admin/prompts/${id}`, { template });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function restoreAdminPromptDefault(id: string): Promise<AdminPromptConfig> {
  const res = await apiPost(`/api/admin/prompts/${id}/restore`, {});
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function testRunAdminPrompt(id: string, template: string): Promise<{ output: any }> {
  const res = await apiPost(`/api/admin/prompts/${id}/testRun`, { template });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Test run failed');
  return await res.json();
}

export async function buildJourneyChat(
  transcript: { role: 'user' | 'assistant'; content: string }[],
  currentDraft: any
): Promise<{ assistantMessage: string; updatedDraft: any; readyForReview: boolean }> {
  const res = await apiPost('/api/ai/buildJourneyChat', { transcript, currentDraft });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}
