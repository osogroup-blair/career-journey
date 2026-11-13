import { z } from "zod";
import { id } from "../agent/contracts";
export const contextSchema = z
  .object({
    schemaVersion: z.literal(1),
    pathname: z
      .string()
      .max(300)
      .regex(/^\/(?:[\w/-]*)$/),
    contextVersion: z.number().int().nonnegative(),
    jobId: id.optional(),
    tabId: z.string().max(60).optional(),
    sectionId: z.string().max(60).optional(),
    selectedEntity: z
      .object({
        type: z.enum([
          "role",
          "achievement",
          "skill",
          "keyword",
          "artifact",
          "interview",
        ]),
        id,
      })
      .strict()
      .optional(),
    filters: z
      .object({
        query: z.string().max(200).optional(),
        view: z.string().max(40).optional(),
        stage: z.string().max(60).optional(),
        sort: z.string().max(40).optional(),
        verdict: z.string().max(40).optional(),
      })
      .strict()
      .optional(),
    hasUnsavedChanges: z.boolean(),
    timezone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
  })
  .strict();
export type PageContext = z.infer<typeof contextSchema>;
// A flat response works across the existing provider schema adapters. Arguments are
// JSON text here, then validated against the selected tool's strict Zod contract.
export const decisionSchema = z
  .object({
    kind: z.enum(["answer", "tool", "clarification"]),
    message: z.string().max(12000),
    tool: z.string().max(80),
    argumentsJson: z.string().max(40000),
  })
  .strict();
export const terminal = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
  "needs_input",
]);
export const assistantCollections = [
  "assistantThreads",
  "assistantMessages",
  "assistantRuns",
  "assistantSteps",
  "assistantEvents",
  "assistantApprovals",
  "assistantJourneyProposals",
];
export const enabled = () => process.env.ASSISTANT_ENABLED === "true";
export const writesEnabled = () =>
  enabled() && process.env.ASSISTANT_WRITES_ENABLED === "true";
export const proposalsEnabled = () =>
  writesEnabled() && process.env.ASSISTANT_JOURNEY_PROPOSALS_ENABLED === "true";
export function limit(name: string, fallback: number, max: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : fallback;
}
