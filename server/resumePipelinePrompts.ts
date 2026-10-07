import type { App } from "firebase-admin/app";
import { getActivePrompt } from "./promptStore";
import { buildKnowledgePreamble } from "./ai/knowledgePreamble";
import { getPromptAiConfigFor } from "./promptAiConfig";
import { projectCareerJourney } from "./careerJourneyProjection";
import { projectCareerJourneyForResume, buildResumeConstraintsBlock, stripCareerJourneyNoise } from "../src/lib/resumeBuild";
import { buildResumeKeywordBlock } from "../src/lib/resumeKeywordPlan";
import type { KeywordSignal, ResumeBuildOptions } from "../src/types";

/**
 * Prompt text for the job pipeline's parse → keywords → resumeStrategy →
 * generateResume → regenerateResumeSection calls. The routes in server.ts own
 * the AI client, usage tracking and response handling; this module owns what
 * the model is sent, so server/scripts/evalResume.ts can run exactly the same
 * prompts outside a request.
 */

/** Narrows a Career Journey to a prompt's admin-configured careerJourneyFields (null selection sends everything). */
export async function projectCareerJourneyForPrompt(app: App | null, promptId: string, careerJourney: any): Promise<any> {
  const cfg = await getPromptAiConfigFor(app, promptId);
  return projectCareerJourney(careerJourney, cfg.careerJourneyFields);
}

export async function parseContents(app: App | null, input: { jdText: string; company?: string; roleTitle?: string }): Promise<string> {
  return `${await buildKnowledgePreamble(app, "parse")}
${getActivePrompt('parse')}

Company: ${input.company || ''}
Role: ${input.roleTitle || ''}

Job Description:
${input.jdText}`;
}

export async function keywordsPrompt(app: App | null, input: { parse: any; careerJourney: any; jdSegments?: any[] }): Promise<{ systemPrompt: string; prompt: string }> {
  const projectedCareerJourney = await projectCareerJourneyForPrompt(app, "keywords", stripCareerJourneyNoise(input.careerJourney));
  return {
    systemPrompt: `${await buildKnowledgePreamble(app, "keywords")}${getActivePrompt('keywords')}`,
    prompt: `Job Parse:
${JSON.stringify(input.parse, null, 2)}

JD Segments (cite these ids in jdRefs):
${JSON.stringify(input.jdSegments || [], null, 2)}

Candidate Career Journey Context (cite real ids from here in evidenceRefs):
${JSON.stringify(projectedCareerJourney || {})}
`,
  };
}

export interface ResumeStrategyInput {
  parse: any;
  careerJourney: any;
  contextEntries: unknown;
  keywords: KeywordSignal[];
  options: ResumeBuildOptions;
  remediation?: string[];
}

export async function resumeStrategyContents(app: App | null, input: ResumeStrategyInput): Promise<string> {
  const { parse, careerJourney, contextEntries, keywords, options, remediation } = input;
  const projectedCareerJourney = await projectCareerJourneyForPrompt(app, "resumeStrategy", projectCareerJourneyForResume(careerJourney, options));
  return `${await buildKnowledgePreamble(app, "resumeStrategy")}
${getActivePrompt('resumeStrategy')}
${remediation && remediation.length > 0 ? `\nThis is a REBUILD after a failed Stage 7 keyword gate. Work these missing keywords truthfully into keywordPlacement, skillRows, and/or selectedOutcomes wherever the Career Journey honestly supports them - never fabricate evidence for one that has none: ${remediation.join(', ')}\n` : ''}
Generate a Resume Strategy for this job posting based on candidate's context.

Job Parse:
${JSON.stringify(parse)}
Career Journey:
${JSON.stringify(projectedCareerJourney)}

${buildResumeKeywordBlock(keywords, contextEntries, "strategy")}

${buildResumeConstraintsBlock(options, careerJourney, "strategy", keywords)}

Output a detailed strategy.`;
}

export interface GenerateResumeInput extends ResumeStrategyInput {
  strategy: any;
}

export async function generateResumeContents(app: App | null, input: GenerateResumeInput): Promise<string> {
  const { parse, careerJourney, contextEntries, keywords, options, remediation, strategy } = input;
  const projectedCareerJourney = await projectCareerJourneyForPrompt(app, "generateResume", projectCareerJourneyForResume(careerJourney, options));
  return `${await buildKnowledgePreamble(app, "generateResume")}
${getActivePrompt('generateResume')}
${remediation && remediation.length > 0 ? `\nThis is a REBUILD after a failed keyword gate. These keywords are missing and must be truthfully worked into the summary, skills, or a role bullet if any honest evidence supports them (do not fabricate experience for a keyword that has none): ${remediation.join(', ')}\n` : ''}

Career Journey:
${JSON.stringify(projectedCareerJourney)}

Resume Strategy:
${JSON.stringify(strategy, null, 2)}

Job Parse:
${JSON.stringify(parse, null, 2)}

${buildResumeKeywordBlock(keywords, contextEntries, "resume")}

${buildResumeConstraintsBlock(options, careerJourney, "resume", keywords)}`;
}

export interface RegenerateSectionInput {
  target: string;
  instruction: string;
  resume: any;
  strategy: any;
  parse: any;
  careerJourney: any;
  contextEntries: unknown;
  keywords: KeywordSignal[];
  options: ResumeBuildOptions;
}

export async function regenerateResumeSectionContents(app: App | null, input: RegenerateSectionInput): Promise<string> {
  const { target, instruction, resume, strategy, parse, careerJourney, contextEntries, keywords, options } = input;
  const projectedCareerJourney = await projectCareerJourneyForPrompt(app, "regenerateResumeSection", projectCareerJourneyForResume(careerJourney, options));
  return `${await buildKnowledgePreamble(app, "regenerateResumeSection")}
${getActivePrompt('regenerateResumeSection')}

Section to rewrite: ${target}
Candidate's instruction: ${instruction}

Current Resume:
${JSON.stringify(resume, null, 2)}

Resume Strategy:
${JSON.stringify(strategy || {}, null, 2)}

Job Parse:
${JSON.stringify(parse, null, 2)}

Career Journey:
${JSON.stringify(projectedCareerJourney)}

${buildResumeKeywordBlock(keywords, contextEntries, "resume")}

${buildResumeConstraintsBlock(options, careerJourney, "resume", keywords)}`;
}
