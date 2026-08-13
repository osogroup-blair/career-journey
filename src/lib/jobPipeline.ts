import { JobAnalysis, JobStage } from '../types';

/** Kanban column order — also the per-job stage stepper order. `Archive` is excluded from Kanban columns (see JobTracker's Archived tab). */
export const STAGE_ORDER: JobStage[] = [
  'Intake',
  'Parsed',
  'Rating',
  'Tailored Application',
  'Apply',
  'Interview',
  'Offer',
  'Archive',
];

export const KANBAN_STAGES: JobStage[] = STAGE_ORDER.filter((s) => s !== 'Archive');

export const STAGE_LABELS: Record<JobStage, string> = {
  Intake: 'Intake',
  Parsed: 'Parsed',
  Rating: 'Rating',
  'Tailored Application': 'Tailored Application',
  Apply: 'Apply',
  Interview: 'Interview',
  Offer: 'Offer',
  Archive: 'Archive',
};

/** Route path segment for each stage's dedicated screen. */
export const STAGE_PATHS: Record<JobStage, string> = {
  Intake: 'intake',
  Parsed: 'parsed',
  Rating: 'rating',
  'Tailored Application': 'tailored',
  Apply: 'apply',
  Interview: 'interview',
  Offer: 'offer',
  Archive: 'apply',
};

/**
 * Explicit allow-list of stages a job can move to from its current stage.
 * Replaces the old implicit ratchet (deriveStageFloor/advanceStage) — every
 * transition here is a named, deliberate gate rather than "whichever is furthest."
 */
export function getAvailableTransitions(job: Pick<JobAnalysis, 'stage' | 'ratingFinalizedAt' | 'resume'>): JobStage[] {
  switch (job.stage) {
    case 'Intake':
      return ['Parsed'];
    case 'Parsed':
      return ['Rating', 'Archive'];
    case 'Rating':
      return job.ratingFinalizedAt && job.resume ? ['Tailored Application', 'Archive'] : ['Archive'];
    case 'Tailored Application':
      return ['Apply', 'Archive'];
    case 'Apply':
      return ['Interview', 'Archive'];
    case 'Interview':
      return ['Offer', 'Archive'];
    case 'Offer':
      return ['Archive'];
    case 'Archive':
      return [];
    default:
      return [];
  }
}

export function canAdvance(job: Pick<JobAnalysis, 'stage' | 'ratingFinalizedAt' | 'resume'>, target: JobStage): boolean {
  return getAvailableTransitions(job).includes(target);
}

/**
 * The only automatic transition in the pipeline: Intake -> Parsed once a parse
 * completes successfully. Every other transition is a deliberate user action
 * (see getAvailableTransitions) so scores/gates can't silently advance a job.
 * Called after every AI task completes.
 */
export function advanceStageIfEligible(job: Pick<JobAnalysis, 'stage' | 'parse'>): JobStage {
  if (job.stage === 'Intake' && job.parse) return 'Parsed';
  return job.stage as JobStage;
}

/**
 * The furthest stage inferable purely from what data exists on a legacy record,
 * used both to migrate old jobs and to backfill archivedFromStage when none was
 * recorded. Never returns Apply/Interview/Offer/Archive — those require explicit
 * user action and aren't derivable from data alone.
 */
function deriveStageFromData(job: any): JobStage {
  if (job.resume) return 'Tailored Application';
  if (job.fitAnalysis) return 'Rating';
  if (job.parse) return 'Parsed';
  return 'Intake';
}

const LEGACY_PIPELINE_STAGE_MAP: Record<string, JobStage> = {
  Saved: 'Intake',
  Rated: 'Rating',
  'Resume Created': 'Tailored Application',
  Applied: 'Apply',
  Interview: 'Interview',
  Archive: 'Archive',
};

/**
 * One-time shim for jobs persisted under the old `status`/`pipelineStage` fields
 * (pre stage-model-unification). Idempotent — a job that already has a valid
 * `stage` passes through unchanged.
 */
export function migrateLegacyJob(job: any): JobAnalysis {
  if (job.stage && STAGE_ORDER.includes(job.stage)) {
    return job as JobAnalysis;
  }

  const legacyPipelineStage: string | undefined = job.pipelineStage;
  let stage: JobStage;

  if (legacyPipelineStage === 'Saved' && job.parse) {
    stage = 'Parsed';
  } else if (legacyPipelineStage && LEGACY_PIPELINE_STAGE_MAP[legacyPipelineStage]) {
    stage = LEGACY_PIPELINE_STAGE_MAP[legacyPipelineStage];
  } else {
    stage = deriveStageFromData(job);
  }

  const migrated: JobAnalysis = { ...job, stage };
  delete (migrated as any).status;
  delete (migrated as any).pipelineStage;

  if (stage === 'Archive' && !migrated.archivedFromStage) {
    migrated.archivedFromStage = deriveStageFromData(job);
  }

  return migrated;
}
