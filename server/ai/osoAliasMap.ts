import { OSO_DEFAULT_ALIAS } from "./osoClient";

/**
 * Starting prompt → Oso alias assignments (verified with `npm run verify:oso`). Prompts
 * not listed use the global default (OSO_DEFAULT_MODEL, "oso/reasoning"). Applied
 * as per-prompt overrides by `npm run migrate:oso`, so admins can see and edit
 * them on the AI Prompts page afterwards.
 */
export const PROMPT_OSO_ALIASES: Record<string, string> = {
  // oso/fast — extraction, classification, chat and short structured drafts (1–4s in verify:oso).
  parse: "oso/fast",
  clarifyQuestions: "oso/fast",
  auditGates: "oso/fast",
  liteScan: "oso/fast",
  applicationAssistant: "oso/fast",
  interviewPrepChat: "oso/fast",
  patchJourney: "oso/fast",
  buildJourneyChat: "oso/fast",
  refineFromInterviewAnswer: "oso/fast",
  generateFormAnswers: "oso/fast",
  interviewPrep: "oso/fast",
  // oso/reasoning — nested schemas and multi-step judgement/long-form writing. (oso/fast
  // returned jdRefs as strings for `keywords`, so it stays here.)
  keywords: "oso/reasoning",
  fitScore: "oso/reasoning",
  resumeStrategy: "oso/reasoning",
  compareOffers: "oso/reasoning",
  offerGuidance: "oso/reasoning",
  generateResume: "oso/reasoning",
  coverLetter: "oso/reasoning",
  buildJourneyFromResume: "oso/reasoning",
};

/** Alias for any prompt not listed above — oso/general has been the slow/flaky one, so it is not used. */
export const DEFAULT_OSO_ALIAS = OSO_DEFAULT_ALIAS;

export function osoAliasForPrompt(promptId: string): string {
  return PROMPT_OSO_ALIASES[promptId] ?? DEFAULT_OSO_ALIAS;
}
