import { z } from "zod";

// Mirrors the pre-migration hand-written Gemini schemas in server.ts exactly
// (same fields, same required/optional split) — these are the two Phase 3
// pilot endpoints (payment-system-plan.md), chosen as one simple/flat
// (keywords) and one nested (fitScore) case to prove the abstraction.

const EvidenceRefSchema = z.object({
  type: z.string().describe("'deliverable' | 'achievement' | 'skill' | 'role'"),
  id: z.string(),
});

const JdRefSchema = z.object({
  segmentId: z.string(),
});

export const KeywordSignalSchema = z.object({
  id: z.string(),
  phrase: z.string(),
  category: z.string().describe("Exactly one of: 'Critical skill' | 'Required keyword' | 'Secondary keyword' | 'Hard gate' | 'Domain signal' | 'Tool / platform'"),
  jdImportance: z.string().describe("'High' | 'Medium' | 'Low'"),
  evidenceStatus: z.string().describe("'EVIDENCED' | 'PARTIAL' | 'MISSING / POSSIBLE' | 'NOT SUPPORTED' | 'HARD GATE'"),
  evidenceRefs: z.array(EvidenceRefSchema),
  jdRefs: z.array(JdRefSchema),
  whatCouldCount: z.string(),
  recognitionPrompt: z.string(),
  resumePriority: z.string(),
  isTopCritical: z.boolean(),
  userContextStatus: z.string(),
});

export const KeywordsResponseSchema = z.array(KeywordSignalSchema);

const RatingDimensionSchema = z.object({
  rating: z.string(),
  rationale: z.string(),
});

const LeadWithGapEntrySchema = z.object({
  text: z.string(),
  evidenceRefs: z.array(EvidenceRefSchema).optional(),
  jdRefs: z.array(JdRefSchema).optional(),
});

export const FitAnalysisSchema = z.object({
  roleScopeFit: RatingDimensionSchema,
  industryDomainFit: RatingDimensionSchema,
  seniorityStageFit: RatingDimensionSchema,
  technicalAiFit: RatingDimensionSchema,
  overallVerdict: z.string().describe("'PASS' | 'BORDERLINE' | 'SKIP'"),
  rationale: z.string(),
  leadWith: z.array(LeadWithGapEntrySchema),
  gaps: z.array(LeadWithGapEntrySchema),
});
