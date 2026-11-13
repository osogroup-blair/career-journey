import { z } from "zod";

export const SCOPES = [
  "journey:read",
  "ai:run",
  "jobs:read",
  "jobs:write",
  "matches:read",
  "matches:write",
  "artifacts:read",
  "artifacts:write",
  "applications:prepare",
  "applications:record",
  "interviews:write",
  "offers:write",
] as const;
export const scopeSchema = z.enum(SCOPES);
export type Scope = (typeof SCOPES)[number];
export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);
export const text = z.string().max(100_000);
export const shortText = z.string().max(2000);
export const revision = z.number().int().nonnegative();
export const stage = z.enum([
  "Intake",
  "Parsed",
  "Rating",
  "Tailored Application",
  "Apply",
  "Interview",
  "Offer",
  "Archive",
]);
export const archiveReason = z.enum([
  "Rejected",
  "No Response",
  "Withdrawn",
  "Position Filled",
  "Other",
  "Accepted Offer",
]);
export const httpsUrl = z
  .string()
  .url()
  .max(2000)
  .refine((s) => new URL(s).protocol === "https:", "HTTPS required");
export const actorSchema = z
  .object({
    type: z.enum(["user", "agent"]),
    uid: id,
    connectionId: id.optional(),
  })
  .strict();
export interface Principal {
  type: "user" | "agent" | "assistant";
  runId?: string;
  uid: string;
  connectionId?: string;
  scopes: readonly string[];
}
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireScope(p: Principal, scope: string) {
  if (p.type !== "user" && !p.scopes.includes(scope))
    throw new DomainError("SCOPE_REQUIRED", `Requires ${scope}`, 403);
}
export const mutation = { idempotencyKey: id };
export const edit = { ...mutation, expectedRevision: revision };
export const jobDetails = z
  .object({
    companyName: shortText,
    roleTitle: shortText,
    jdText: text,
    jobLink: httpsUrl.optional(),
    compensationRange: shortText.optional(),
    locationNotes: shortText.optional(),
    recruiterNotes: text.optional(),
  })
  .strict();
export const connectionInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    scopes: z.array(scopeSchema).min(1).max(SCOPES.length),
    oauthSubject: z.string().min(1).max(200).optional(),
    oauthClientId: z.string().min(1).max(200).optional(),
    expiresInDays: z.number().int().min(1).max(90).default(30),
  })
  .strict();
export const resumeContent = z
  .object({
    name: shortText,
    contactInfo: shortText,
    summary: text,
    skills: z
      .array(z.object({ category: shortText, terms: shortText }).strict())
      .max(100),
    experience: z
      .array(
        z
          .object({
            company: shortText,
            title: shortText,
            dates: shortText,
            location: shortText,
            companyDescriptor: shortText.optional(),
            companyUrl: httpsUrl.optional(),
            roleId: id.optional(),
            roleIds: z.array(id).optional(),
            narrative: shortText.optional(),
            bullets: z
              .array(
                z
                  .object({
                    text: shortText,
                    lead: shortText.optional(),
                    evidenceRefs: z
                      .array(
                        z.object({ type: z.string().max(50), id }).strict(),
                      )
                      .max(100)
                      .optional(),
                  })
                  .strict(),
              )
              .max(100),
          })
          .strict(),
      )
      .max(100),
    education: z
      .array(
        z
          .object({
            institution: shortText,
            degree: shortText,
            graduationDate: shortText,
          })
          .strict(),
      )
      .max(100),
    skillsPosition: z.enum(["top", "bottom"]).optional(),
    selectedOutcomes: z
      .array(z.object({ lead: shortText, text: shortText }).strict())
      .max(50)
      .optional(),
    earlierExperience: z
      .array(
        z
          .object({
            roleId: id,
            company: shortText,
            title: shortText,
            dates: shortText,
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict();
export const artifactInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resume"), content: resumeContent }).strict(),
  z
    .object({
      kind: z.literal("cover_letter"),
      content: z.object({ content: text }).strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("form_answers"),
      content: z
        .object({
          answers: z
            .array(z.object({ field: shortText, answer: shortText }).strict())
            .max(200),
        })
        .strict(),
    })
    .strict(),
]);
export const interview = z
  .object({
    id,
    roundName: shortText,
    scheduledAt: z.string().datetime().optional(),
    format: z.enum(["Phone", "Video", "Onsite", "Take-home"]).optional(),
    outcome: z.enum(["Scheduled", "Completed", "Passed", "Rejected"]),
    interviewerName: shortText.optional(),
    interviewerTitle: shortText.optional(),
    notes: text.optional(),
  })
  .strict();
export const offer = z
  .object({
    receivedAt: z.string().datetime(),
    baseSalary: shortText.optional(),
    bonusTarget: shortText.optional(),
    variableComp: shortText.optional(),
    benefitsNotes: text.optional(),
    otherTerms: text.optional(),
    startDate: shortText.optional(),
    decisionDeadline: shortText.optional(),
  })
  .strict();
