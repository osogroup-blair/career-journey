import type { App } from "firebase-admin/app";
import { getKnowledgeFiles, PIPELINE_KNOWLEDGE_FILE_NAMES, BUILDER_KNOWLEDGE_FILE_NAME } from "../knowledge";
import { getPromptAiConfigFor } from "../promptAiConfig";

const PIPELINE_PREAMBLE_INTRO =
  "Reference material below is the candidate's job-application pipeline: project instructions plus five skill files (JD pipeline, cover letter, voice, ATS tactics, JD signal map). Follow these rules exactly wherever they apply to the task requested after the reference material. Do not summarize or explain the reference material back; use it silently to inform your output.";

// The 3 "Career Journey Builder" prompts (buildJourneyFromResume,
// buildJourneyChat, refineFromInterviewAnswer) use only the Builder file by
// default — the pipeline prompts' project_instructions.md/JD_pipeline_SKILL.md/
// etc. don't apply to extracting a fresh Career Journey from a resume.
const BUILDER_PROMPT_IDS = new Set(["buildJourneyFromResume", "buildJourneyChat", "refineFromInterviewAnswer"]);

export function defaultKnowledgeFilesFor(promptId: string): string[] {
  return BUILDER_PROMPT_IDS.has(promptId) ? [BUILDER_KNOWLEDGE_FILE_NAME] : PIPELINE_KNOWLEDGE_FILE_NAMES;
}

function joinFiles(names: string[]): string {
  const files = getKnowledgeFiles();
  return names
    .filter((name) => name in files)
    .map((name) => `<<< ${name} >>>\n${files[name]}`)
    .join("\n\n");
}

/**
 * Builds a preamble from an explicit file list — the part of
 * buildKnowledgePreamble that doesn't need a Firestore read, split out so
 * callers that already resolved (or are previewing an unsaved override of)
 * the file selection, like the contextSize/testRun admin routes, don't have
 * to re-derive it or duplicate the framing text.
 */
export function buildKnowledgePreambleFromFiles(promptId: string, names: string[]): string {
  if (BUILDER_PROMPT_IDS.has(promptId)) {
    // Builder prompts historically had no framing intro, just the file body
    // followed by "---" — preserve that exactly for unchanged behavior when
    // no override is configured.
    return `${joinFiles(names)}\n\n---\n`;
  }
  return `${PIPELINE_PREAMBLE_INTRO}\n\n${joinFiles(names)}\n\n---\n`;
}

/**
 * Builds the knowledge preamble for one prompt, honoring that prompt's admin-
 * configured file selection (server/promptAiConfig.ts) or falling back to the
 * default set for its family (pipeline vs. Builder) — same shape/wording as
 * the old shared KNOWLEDGE_PREAMBLE/CAREER_JOURNEY_BUILDER_KNOWLEDGE constants
 * this replaces, just per-prompt instead of one constant for everyone.
 */
export async function buildKnowledgePreamble(app: App | null, promptId: string): Promise<string> {
  const names = await resolveKnowledgeSelection(app, promptId);
  return buildKnowledgePreambleFromFiles(promptId, names);
}

/** Resolves just the selected file names for a prompt, without building the string — used by the context-size estimator. */
export async function resolveKnowledgeSelection(app: App | null, promptId: string, override?: string[] | null): Promise<string[]> {
  if (override !== undefined) return override ?? defaultKnowledgeFilesFor(promptId);
  const cfg = await getPromptAiConfigFor(app, promptId);
  return cfg.includedKnowledge ?? defaultKnowledgeFilesFor(promptId);
}
