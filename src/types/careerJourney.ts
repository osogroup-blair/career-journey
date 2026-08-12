import { z } from 'zod';

/**
 * Canonical Career Journey schema — reverse-engineered from Blair's real, hand-maintained
 * data (`blair_boylan_career_journey_v3_35.json`), not from the app's original sample data.
 *
 * Two structural things worth knowing before editing this file:
 *
 * 1. Deliverables and functions are nested, not flat. The real evidence lives at
 *    `roles[].initiatives[].deliverables[]` (each with `impact`, `capability_alignment`,
 *    `skill_ids`) and `capabilities[].functions[].skills[]` (each function has its own
 *    nested skills, distinct from the top-level `skills_index`). The top-level
 *    `functions[]` and `deliverables[]` arrays are a separate, much smaller legacy index
 *    left over from the app's original flat sample data — kept here (so nothing is ever
 *    silently dropped on import/export) but treated as legacy, not the source of truth.
 *
 * 2. `links.keywords` and `links.industries` use different field names in the real data
 *    than the app's editor currently assumes (`term` not `keyword`; `entity_id`/`entity_type`
 *    not `role_id`). This schema follows the real data. Reconciling the editor UI to match
 *    is Phase 2 work, not done here.
 *
 * Every object schema below is `.passthrough()`: unknown fields survive parsing untouched.
 * That's deliberate — a stricter schema would silently drop fields on a future version
 * of the data this schema hasn't seen yet, which is exactly the bug this file exists to fix.
 */

const RatingLevel = z.string(); // free-text enum values, governed by `vocabularies`, not hardcoded here

export const PositioningSchema = z
  .object({
    primary_tagline: z.string().optional(),
    target_role_families: z.array(z.string()).default([]),
    role_orientation: z.string().optional(),
    narrative_anchors: z.array(z.string()).default([]),
  })
  .passthrough();

export const PersonSchema = z
  .object({
    name: z.string().default(''),
    brand: z.string().optional(),
    summary: z.string().optional(),
    location: z.string().optional(),
    signature_outcomes: z.array(z.string()).default([]),
    phone: z.string().optional(),
    email: z.string().optional(),
    linkedin: z.string().optional(),
    website: z.string().optional(),
    github: z.string().optional(),
    work_preference: z.string().optional(),
    resume_contact_preference: z.string().optional(),
    positioning: PositioningSchema.optional(),
  })
  .passthrough();

export const EducationEntrySchema = z
  .object({
    id: z.string(),
    institution: z.string().default(''),
    program: z.string().default(''),
    degree_type: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    // Legacy single-string date field some older records may still carry.
    dates: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    capability_alignment: z.array(z.string()).default([]),
    skills_reinforced: z.array(z.string()).default([]),
    achievements: z.array(z.any()).default([]),
    completion_status: z.string().optional(),
    resume_display: z.string().optional(),
  })
  .passthrough();

// Shape not yet populated in real data (empty array as of v3.35) — kept loose on purpose.
export const CertificationEntrySchema = z.object({ id: z.string() }).passthrough();

export const CapabilitySkillSchema = z
  .object({
    id: z.string(),
    name: z.string().default(''),
    description: z.string().optional(),
    proficiency: RatingLevel.optional(),
    last_used: z.string().optional(),
  })
  .passthrough();

export const CapabilityFunctionSchema = z
  .object({
    id: z.string(),
    name: z.string().default(''),
    description: z.string().optional(),
    competency_level: RatingLevel.optional(),
    value_stream_stage: z.string().optional(),
    skills: z.array(CapabilitySkillSchema).default([]),
  })
  .passthrough();

export const CapabilitySchema = z
  .object({
    id: z.string(),
    name: z.string().default(''),
    description: z.string().optional(),
    maturity_level: RatingLevel.optional(),
    // Real data nests full function objects here. Some older/sample data used a flat
    // array of function-id strings instead — both are accepted; ids-only entries are
    // left as-is rather than coerced, since coercing would fabricate data.
    functions: z.array(z.union([CapabilityFunctionSchema, z.string()])).default([]),
  })
  .passthrough();

export const InitiativeDeliverableSchema = z
  .object({
    id: z.string(),
    description: z.string().default(''),
    impact: z.string().optional(),
    capability_alignment: z.array(z.string()).default([]),
    skill_ids: z.array(z.string()).default([]),
  })
  .passthrough();

export const InitiativeSchema = z
  .object({
    id: z.string(),
    name: z.string().default(''),
    description: z.string().optional(),
    deliverables: z.array(InitiativeDeliverableSchema).default([]),
  })
  .passthrough();

export const RoleSchema = z
  .object({
    id: z.string(),
    organization: z.string().default(''),
    // Back-compat alias some UI/back-compat code still writes to. Kept in sync at the
    // normalizer level, not enforced here.
    company: z.string().optional(),
    title: z.string().default(''),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    dates: z.string().optional(),
    location: z.string().optional(),
    description: z.string().optional(),
    initiatives: z.array(InitiativeSchema).default([]),
    positioning_note: z.string().optional(),
    company_descriptor: z.string().optional(),
    resume_company_descriptor: z.string().optional(),
    resume_company_url: z.string().optional(),
    // Free-form structured notes — shape varies per role (e.g. team_leadership carries
    // team_name/starting_size/peak_size/growth_narrative on some roles), so left loose
    // rather than over-fitted to one role's fields.
    team_leadership: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
    advisory_ps_scope: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
    organization_scale: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
    // Legacy embedded evidence (pre-dates the top-level achievements[]/deliverables[]
    // + links.timeline_mappings model). Real data keeps these as empty arrays on every
    // role; kept here only so nothing is dropped if an older import still uses them.
    deliverables: z.array(z.any()).default([]),
    achievements: z.array(z.any()).default([]),
    skills: z.array(z.string()).default([]),
  })
  .passthrough();

export const AchievementSchema = z
  .object({
    id: z.string(),
    title: z.string().default(''),
    description: z.string().optional(),
    category: z.string().optional(),
    // Sparse traceability fields — only present on achievements enriched after the
    // "traceability_mapping_changes" pass (10 of 120 as of v3.35). Optional by design.
    role_ids: z.array(z.string()).optional(),
    skill_ids: z.array(z.string()).optional(),
  })
  .passthrough();

export const SkillIndexEntrySchema = z
  .object({
    id: z.string(),
    name: z.string().default(''),
    category: z.string().optional(),
    proficiency: RatingLevel.optional(),
    years_experience: z.number().optional(),
    last_used: z.string().optional(),
  })
  .passthrough();

export const VocabulariesSchema = z
  .object({
    maturity_levels: z.array(z.string()).default([]),
    competency_levels: z.array(z.string()).default([]),
    proficiency_levels: z.array(z.string()).default([]),
    value_stream_stages: z.array(z.string()).default([]),
  })
  .passthrough();

export const KeywordLinkSchema = z
  .object({
    term: z.string().optional(),
    // Legacy field name the editor currently reads/writes; kept alongside `term` so
    // nothing is lost either direction until Phase 2 reconciles the UI.
    keyword: z.string().optional(),
    entity_id: z.string().optional(),
    entity_type: z.string().optional(),
  })
  .passthrough();

export const IndustryLinkSchema = z
  .object({
    industry: z.string().optional(),
    entity_id: z.string().optional(),
    entity_type: z.string().optional(),
    // Legacy field name the editor currently reads/writes.
    role_id: z.string().optional(),
  })
  .passthrough();

export const EducationAlignmentLinkSchema = z
  .object({ education_id: z.string().optional(), capability_id: z.string().optional() })
  .passthrough();

export const DeliverableFunctionLinkSchema = z
  .object({ function_id: z.string().optional(), deliverable_id: z.string().optional() })
  .passthrough();

export const DeliverableAchievementLinkSchema = z
  .object({ achievement_id: z.string().optional(), deliverable_id: z.string().optional() })
  .passthrough();

export const TimelineMappingSchema = z
  .object({
    id: z.string().optional(),
    entity_type: z.string(),
    entity_id: z.string(),
    role_id: z.string().optional(),
    initiative_id: z.string().nullable().optional(),
    context: z.string().optional(),
  })
  .passthrough();

export const LinksSchema = z
  .object({
    keywords: z.array(KeywordLinkSchema).default([]),
    industries: z.array(IndustryLinkSchema).default([]),
    education_alignment: z.array(EducationAlignmentLinkSchema).default([]),
    deliverable_function: z.array(DeliverableFunctionLinkSchema).default([]),
    certification_alignment: z.array(z.any()).default([]),
    deliverable_achievement: z.array(DeliverableAchievementLinkSchema).default([]),
    timeline_mappings: z.array(TimelineMappingSchema).default([]),
  })
  .passthrough();

export const ApplicationArtifactSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    audience: z.string().optional(),
    positioning: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const ApplicationArtifactsSchema = z
  .object({
    description: z.string().optional(),
    artifacts: z.array(ApplicationArtifactSchema).default([]),
  })
  .passthrough();

// Answers carry one or more `version_for_<audience>` keys alongside `question` —
// dynamic per-audience keys, so left as passthrough rather than enumerated.
export const InterviewAnswerSchema = z.object({ question: z.string().optional() }).passthrough();

export const InterviewAnswersSchema = z
  .object({
    description: z.string().optional(),
    answers: z.array(InterviewAnswerSchema).default([]),
  })
  .passthrough();

export const MethodologySchema = z
  .object({
    id: z.string(),
    name: z.string().default(''),
    description: z.string().optional(),
    context: z.string().optional(),
  })
  .passthrough();

export const CustomerEngagementSchema = z
  .object({
    id: z.string(),
    client: z.string().default(''),
    project: z.string().optional(),
    description: z.string().optional(),
    dates: z.string().optional(),
    display: z.boolean().optional(),
  })
  .passthrough();

// Legacy top-level index, superseded by capabilities[].functions[] in real data.
// Kept editable (not deleted) so existing references to FN-* ids aren't silently lost.
export const LegacyFunctionSchema = z
  .object({ id: z.string(), name: z.string().default(''), description: z.string().optional() })
  .passthrough();

// Legacy top-level index, superseded by roles[].initiatives[].deliverables[] in real data.
export const LegacyDeliverableSchema = z
  .object({
    id: z.string(),
    title: z.string().default(''),
    description: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

export const MetaSchema = z
  .object({
    owner: z.string().default(''),
    version: z.string().default('0.1'),
    framework: z.string().optional(),
    description: z.string().optional(),
    last_updated: z.string().optional(),
    // Marks a file built by buildCareerJourneyTemplate() — lets import tell a blank
    // starter apart from a user's real data without guessing from content.
    template: z.boolean().optional(),
  })
  // Every `version_X_Y_changes` / `traceability_mapping_changes`-style key lands here.
  .catchall(z.union([z.array(z.string()), z.boolean(), z.string()])) as unknown as z.ZodType<{
  owner: string;
  version: string;
  framework?: string;
  description?: string;
  last_updated?: string;
  template?: boolean;
  [changelogKey: string]: string | string[] | boolean | undefined;
}>;

export const CareerJourneySchema = z
  .object({
    meta: MetaSchema.default({ owner: '', version: '0.1' }),
    person: PersonSchema.default({ name: '', signature_outcomes: [] }),
    education: z.array(EducationEntrySchema).default([]),
    certifications: z.array(CertificationEntrySchema).default([]),
    capabilities: z.array(CapabilitySchema).default([]),
    roles: z.array(RoleSchema).default([]),
    achievements: z.array(AchievementSchema).default([]),
    skills_index: z.array(SkillIndexEntrySchema).default([]),
    vocabularies: VocabulariesSchema.default({
      maturity_levels: [],
      competency_levels: [],
      proficiency_levels: [],
      value_stream_stages: [],
    }),
    links: LinksSchema.default({
      keywords: [],
      industries: [],
      education_alignment: [],
      deliverable_function: [],
      certification_alignment: [],
      deliverable_achievement: [],
      timeline_mappings: [],
    }),
    application_artifacts: ApplicationArtifactsSchema.default({ artifacts: [] }),
    interview_answers: InterviewAnswersSchema.default({ answers: [] }),
    methodologies: z.array(MethodologySchema).default([]),
    customer_engagements: z.array(CustomerEngagementSchema).default([]),
    // Legacy top-level indexes — see module doc comment.
    functions: z.array(LegacyFunctionSchema).default([]),
    deliverables: z.array(LegacyDeliverableSchema).default([]),
  })
  .passthrough();

export type CareerJourney = z.infer<typeof CareerJourneySchema>;
export type Person = z.infer<typeof PersonSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type Achievement = z.infer<typeof AchievementSchema>;
export type SkillIndexEntry = z.infer<typeof SkillIndexEntrySchema>;
export type Links = z.infer<typeof LinksSchema>;
