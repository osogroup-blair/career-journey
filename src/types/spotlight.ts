import { z } from 'zod';

/**
 * Career Spotlight — the public, read-only page a candidate sends to people who
 * might hire them (see career-spotlight-plan.md).
 *
 * Two shapes live here:
 * - `SpotlightSettings`: the owner's curation choices. Arrives in a request body
 *   once publishing exists, so every field falls back to its default on bad input
 *   instead of failing the whole parse.
 * - `SpotlightSnapshot`: the public projection built by `buildSpotlightSnapshot`
 *   (src/lib/spotlightSnapshot.ts). Anything not declared on it is never published.
 */

export const SPOTLIGHT_ACCENTS = ['navy', 'forest', 'plum', 'graphite', 'oxblood'] as const;
export type SpotlightAccent = (typeof SPOTLIGHT_ACCENTS)[number];

export const SPOTLIGHT_ROLE_MODES = ['full', 'condensed', 'excluded'] as const;
export type SpotlightRoleMode = (typeof SPOTLIGHT_ROLE_MODES)[number];

export const SPOTLIGHT_MAX_OUTCOMES = 3;
export const SPOTLIGHT_MAX_PINNED_ACHIEVEMENTS = 6;
export const SPOTLIGHT_MAX_CAPTION = 40;
export const SPOTLIGHT_MAX_HEADLINE = 160;

const SectionsSchema = z.object({
  arc: z.boolean().catch(true),
  achievements: z.boolean().catch(true),
  capabilities: z.boolean().catch(true),
  skills: z.boolean().catch(true),
  howIWork: z.boolean().catch(true),
  background: z.boolean().catch(true),
});

// Undefined means "use the default for this channel": shown when the Profile has a
// value, except email and phone, which are shown only when the owner turns them on.
const ContactSchema = z.object({
  linkedin: z.boolean().optional().catch(undefined),
  website: z.boolean().optional().catch(undefined),
  github: z.boolean().optional().catch(undefined),
  email: z.boolean().optional().catch(undefined),
  phone: z.boolean().optional().catch(undefined),
});

export const SpotlightOutcomeChoiceSchema = z.object({
  // Must match one of person.signature_outcomes exactly; the snapshot never
  // publishes outcome text that isn't in the Career Journey.
  text: z.string(),
  caption: z.string().optional().catch(undefined),
  // Deliverable/achievement ids. Undefined means "suggest them" (suggestOutcomeEvidence).
  evidence: z.array(z.string()).optional().catch(undefined),
});

export const SpotlightSettingsSchema = z.object({
  slug: z.string().optional().catch(undefined),
  visibility: z.enum(['unlisted', 'public']).catch('unlisted'),
  headline: z.string().optional().catch(undefined),
  availability: z.enum(['open_to_work', 'open_to_select', 'hidden']).catch('open_to_select'),
  showTargetRoles: z.boolean().catch(false),
  // Undefined means "the first three signature outcomes"; [] means the owner chose none.
  outcomes: z.array(SpotlightOutcomeChoiceSchema).optional().catch(undefined),
  // Per-role overrides of the résumé default. Values are checked against
  // SPOTLIGHT_ROLE_MODES in normalizeSpotlightSettings, so one bad value can't
  // wipe the rest.
  roles: z.record(z.string(), z.string()).catch({}),
  // Undefined means "suggest them"; [] means the owner pinned none.
  pinnedAchievements: z.array(z.string()).optional().catch(undefined),
  sections: SectionsSchema.catch(SectionsSchema.parse({})),
  showLevels: z.boolean().catch(false),
  contact: ContactSchema.catch({}),
  accent: z.enum(SPOTLIGHT_ACCENTS).catch('navy'),
  showBadge: z.boolean().catch(true),
});

export type SpotlightSettings = z.infer<typeof SpotlightSettingsSchema>;
export type SpotlightOutcomeChoice = z.infer<typeof SpotlightOutcomeChoiceSchema>;
export type SpotlightSections = z.infer<typeof SectionsSchema>;

// ---------- Snapshot (public) ----------

export type SpotlightAvailability = 'open_to_work' | 'open_to_select';

/** The leading figure of a sentence. `parts` has two entries for a change ("3 to 11" → ['3', '11']). */
export interface LeadMetric {
  value: string;
  parts: string[];
}

export interface SpotlightEvidenceRef {
  type: 'deliverable' | 'achievement';
  id: string;
}

export interface SpotlightDeliverable {
  id: string;
  description: string;
  impact?: string;
  lead: LeadMetric | null;
  skillIds: string[];
  capabilityIds: string[];
  /** Set when an achievement is linked to this deliverable; the achievement is then shown here, not again under the role. */
  achievementId?: string;
}

export interface SpotlightInitiative {
  id: string;
  name: string;
  description?: string;
  deliverables: SpotlightDeliverable[];
}

export interface SpotlightRole {
  id: string;
  title: string;
  organization: string;
  descriptor?: string;
  location?: string;
  /** 'YYYY-MM', or 'YYYY' when the month is unknown. */
  start?: string;
  /** Undefined when current or unknown; see `current`. */
  end?: string;
  current: boolean;
  durationMonths: number | null;
  mode: Exclude<SpotlightRoleMode, 'excluded'>;
  description?: string;
  scope: string[];
  /** Up to two deliverable ids to show before the role is expanded. */
  highlightIds: string[];
  initiatives: SpotlightInitiative[];
  /** Achievements linked to this role but not to any of its deliverables. */
  achievementIds: string[];
}

export interface SpotlightAchievement {
  id: string;
  title: string;
  description?: string;
  category?: string;
  roleIds: string[];
  deliverableId?: string;
}

export interface SpotlightOutcome {
  text: string;
  lead: LeadMetric | null;
  caption?: string;
  evidence: SpotlightEvidenceRef[];
}

export interface SpotlightCapability {
  id: string;
  name: string;
  description?: string;
  level?: string;
  functions: string[];
  deliverableIds: string[];
}

export interface SpotlightSkill {
  id: string;
  name: string;
  category?: string;
  years?: number;
  lastUsed?: string;
  level?: string;
  deliverableIds: string[];
}

export interface SpotlightSnapshot {
  schemaVersion: 1;
  builtAt: string;
  journeyVersion: string;
  visibility: 'unlisted' | 'public';
  person: {
    name: string;
    headline?: string;
    summary?: string;
    location?: string;
    workPreference?: string;
    availability: SpotlightAvailability | null;
    targetRoles: string[];
    roleOrientation?: string;
  };
  glance: {
    careerStartYear: number | null;
    organizationCount: number;
    current: { title: string; organization: string } | null;
    largestTeam: number | null;
    industries: string[];
  };
  contact: {
    linkedin?: string;
    website?: string;
    github?: string;
    phone?: string;
    /** Split so the published page never contains the address as one string; joined in the browser on click. */
    email?: { user: string; domain: string };
  };
  outcomes: SpotlightOutcome[];
  roles: SpotlightRole[];
  achievements: { featuredIds: string[]; items: SpotlightAchievement[] };
  capabilities: SpotlightCapability[];
  skills: SpotlightSkill[];
  methodologies: { id: string; name: string; description?: string; context?: string }[];
  principles: string[];
  education: { id: string; institution: string; program: string; degreeType?: string; endYear: number | null; status?: string }[];
  certifications: { id: string; name: string; issuer?: string; year: number | null }[];
  engagements: { id: string; client: string; project?: string; description?: string; dates?: string }[];
  sections: SpotlightSections;
  style: { accent: SpotlightAccent; showBadge: boolean };
}

export type SpotlightWarningCode =
  | 'outcome_missing'
  | 'outcome_evidence_missing'
  | 'pinned_achievement_missing'
  | 'pinned_achievement_hidden'
  | 'summary_years_mismatch'
  | 'no_visible_roles';

export interface SpotlightWarning {
  code: SpotlightWarningCode;
  message: string;
}

export interface SpotlightChange {
  kind: 'added' | 'removed' | 'edited';
  entity: 'profile' | 'outcome' | 'role' | 'deliverable' | 'achievement' | 'capability' | 'skill' | 'background' | 'page';
  id: string;
  label: string;
  /** "Title at Organization" for deliverables, so the banner can say where a change is. */
  where?: string;
}
