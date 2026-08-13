import { JobAnalysis, PipelineStage } from '../types';

export const STAGE_ORDER: PipelineStage[] = ['Saved', 'Rated', 'Resume Created', 'Applied', 'Interview', 'Archive'];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  Saved: 'Saved',
  Rated: 'Rated',
  'Resume Created': 'Resume Created',
  Applied: 'Applied',
  Interview: 'Interview',
  Archive: 'Archive',
};

/** The furthest stage the app can infer purely from what's already on the job — never Applied/Interview/Archive, those require an explicit user action. */
export function deriveStageFloor(job: Pick<JobAnalysis, 'fitAnalysis' | 'resume'>): PipelineStage {
  if (job.resume) return 'Resume Created';
  if (job.fitAnalysis) return 'Rated';
  return 'Saved';
}

/** Returns whichever stage is later in the pipeline — used so auto-derived progress never regresses a manually-advanced card. */
export function advanceStage(current: PipelineStage | undefined, floor: PipelineStage): PipelineStage {
  const currentIndex = STAGE_ORDER.indexOf(current ?? 'Saved');
  const floorIndex = STAGE_ORDER.indexOf(floor);
  return STAGE_ORDER[Math.max(currentIndex, floorIndex)];
}
