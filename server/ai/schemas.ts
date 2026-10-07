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

// Job Discovery search profile (third endpoint on this abstraction). Plain
// strings rather than the z.enum/transform validators in
// src/types/discovery.ts: z.toJSONSchema can't express transforms, and the
// route re-validates every value against StillOpen's real enums afterwards,
// dropping anything the model invents rather than failing the whole call.
export const DiscoverySearchProfileAiSchema = z.object({
  queries: z.array(z.string()).describe("3-6 short keyword searches (1-4 words each), e.g. 'product manager', 'growth product'"),
  loc: z.array(z.string()).describe("0-3 location filters: 2-letter country codes ('uk' for the United Kingdom, 'us', 'de') or 'worldwide' | 'emea' | 'apac' | 'latam' | 'na'"),
  level: z.array(z.string()).describe("Usually empty. Only from: junior | mid | senior | lead | manager | head"),
  area: z.array(z.string()).describe("0-2 from: consulting | content | customer | design | engineering | finance | healthcare | legal | operations | people | product | sales_marketing"),
  payMin: z.number().nullable().describe("null, or one of 40000 | 60000 | 80000 | 100000 | 120000 | 150000 | 200000"),
  rationale: z.string().describe("One or two sentences on why these searches fit the CV"),
});
