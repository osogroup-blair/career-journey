/**
 * Top-level CareerJourneySchema sections (src/types/careerJourney.ts) that a
 * prompt's admin-configured `careerJourneyFields` selection can include or
 * omit. Kept as a plain string list (not imported from the Zod schema) since
 * this needs to be usable from both client and server bundles without
 * pulling in the full schema module.
 */
export const CAREER_JOURNEY_FIELDS = [
  "meta",
  "person",
  "education",
  "certifications",
  "capabilities",
  "roles",
  "achievements",
  "skills_index",
  "vocabularies",
  "links",
  "application_artifacts",
  "interview_answers",
  "methodologies",
  "customer_engagements",
  "functions",
  "deliverables",
] as const;

export type CareerJourneyField = (typeof CAREER_JOURNEY_FIELDS)[number];

/**
 * Projects a Career Journey object down to only the given top-level fields
 * before it's woven into a prompt. `fields` null/undefined means "send
 * everything" — today's behavior, and the default for every prompt until an
 * admin narrows it via server/promptAiConfig.ts's careerJourneyFields.
 */
export function projectCareerJourney(careerJourney: any, fields: readonly string[] | null | undefined): any {
  if (!careerJourney || !fields) return careerJourney;
  const projected: Record<string, any> = {};
  for (const field of fields) {
    if (field in careerJourney) projected[field] = careerJourney[field];
  }
  return projected;
}

/**
 * A couple of prompts (clarifyQuestions, compareOffers) don't send whole
 * top-level sections — they already narrow down to a specific hand-picked
 * sub-shape before this ever ran. Centralized here so server.ts's real route
 * handler and the admin Test Run / context-size preview apply the exact same
 * extraction to whatever `projectCareerJourney` selection comes out of, and
 * can't drift apart. Runs *after* the top-level field projection, so
 * excluding a field a prompt's extractor reads from (e.g. excluding "roles"
 * for clarifyQuestions) still zeroes that prompt's Career Journey input —
 * that's what makes the admin's field toggle meaningful for these two.
 */
export const CAREER_JOURNEY_EXTRACTORS: Record<string, (careerJourney: any) => any> = {
  clarifyQuestions: (cj) => (cj?.roles || []).map((r: any) => ({ id: r.id, organization: r.organization, title: r.title })),
  compareOffers: (cj) => cj?.person?.positioning || {},
};

export function applyCareerJourneyExtractor(promptId: string, careerJourney: any): any {
  const extractor = CAREER_JOURNEY_EXTRACTORS[promptId];
  return extractor ? extractor(careerJourney) : careerJourney;
}
