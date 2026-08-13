import { JobAnalysis } from '../types';

/**
 * Compiles a compact digest of past application outcomes (rejections, no-response,
 * withdrawals, offers accepted) so the Matches triage scan can weigh a new posting
 * against what's actually happened before, not just static keyword/fit overlap.
 * Capped and most-recent-first to keep the prompt small.
 */
export function buildArchiveLearningsSummary(jobs: Record<string, JobAnalysis>, limit = 15): string {
  const archived = Object.values(jobs)
    .filter((j) => j.stage === 'Archive' && j.archiveReason)
    .sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''))
    .slice(0, limit);

  if (archived.length === 0) return '';

  const lines = archived.map((j) => {
    const stageNote = j.archivedFromStage ? ` (fell off at ${j.archivedFromStage})` : '';
    const feedback = j.archiveNotes ? ` — feedback: ${j.archiveNotes}` : '';
    return `- ${j.companyName} — ${j.roleTitle}: ${j.archiveReason}${stageNote}${feedback}`;
  });

  return lines.join('\n');
}
