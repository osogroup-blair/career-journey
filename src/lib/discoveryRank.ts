import { INDEPENDENTLY_VERIFIED, type DiscoveredJob, type EvidenceType } from '../types/discovery';

/**
 * Cheap, deterministic ordering for the Discover list — no AI. StillOpen
 * returns its own order per query; this re-ranks the merged set by how well
 * each title lines up with what the candidate is targeting, so the listings
 * worth a scan float to the top without spending one on every row.
 *
 * Score parts (higher is better):
 *  - matched by more than one of the saved searches (up to +30)
 *  - title words shared with target role families / CV skills (up to +40)
 *  - StillOpen independently re-checked it (+15), vs. age-only evidence (-10)
 *  - recency of posting (up to +15, fading over 30 days)
 */

const STOP_WORDS = new Set(['and', 'or', 'of', 'the', 'a', 'an', 'to', 'in', 'for', 'with', 'remote', '100', 'm', 'f', 'd', 'x', 'w']);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

export interface RankContext {
  /** Target role families from the Career Journey, e.g. "Senior Product Manager". */
  targetRoles: string[];
  /** Top skill names / CV keywords — weaker signal than target roles. */
  skills: string[];
}

const EVIDENCE_POINTS: Partial<Record<EvidenceType, number>> = { age_inferred: -10 };

export function scoreDiscoveredJob(job: DiscoveredJob, ctx: RankContext, now = new Date()): number {
  const title = new Set(tokenize(job.title));
  let score = Math.min(30, Math.max(0, (job.matchedQueries?.length || 1) - 1) * 10);

  // Best single target role: share of that role's words found in the title.
  let roleOverlap = 0;
  for (const role of ctx.targetRoles) {
    const words = tokenize(role);
    if (words.length === 0) continue;
    const hits = words.filter((w) => title.has(w)).length;
    roleOverlap = Math.max(roleOverlap, hits / words.length);
  }
  score += roleOverlap * 30;

  const skillWords = new Set(ctx.skills.flatMap(tokenize));
  const skillHits = [...title].filter((w) => skillWords.has(w)).length;
  score += Math.min(10, skillHits * 5);

  if (job.evidenceType && INDEPENDENTLY_VERIFIED.includes(job.evidenceType)) score += 15;
  else if (job.evidenceType) score += EVIDENCE_POINTS[job.evidenceType] ?? 0;

  if (job.postedAt) {
    const ageDays = (now.getTime() - new Date(job.postedAt).getTime()) / 86_400_000;
    if (Number.isFinite(ageDays)) score += Math.max(0, 15 * (1 - ageDays / 30));
  }
  return Math.round(score);
}

export function rankDiscoveredJobs(jobs: DiscoveredJob[], ctx: RankContext, now = new Date()): { job: DiscoveredJob; score: number }[] {
  return jobs
    .map((job) => ({ job, score: scoreDiscoveredJob(job, ctx, now) }))
    .sort((a, b) => b.score - a.score || (b.job.postedAt || '').localeCompare(a.job.postedAt || ''));
}

/** Plain-language evidence wording — StillOpen's terms forbid presenting a listing as verified when its evidence says otherwise. */
export function describeEvidence(job: Pick<DiscoveredJob, 'evidenceType' | 'verifiedAt' | 'status'>, now = new Date()): { label: string; tone: 'success' | 'default' | 'warning' } {
  if (job.status === 'unknown') return { label: 'Status not re-checked', tone: 'warning' };
  if (job.status === 'unconfirmed') return { label: 'Unconfirmed — may have closed', tone: 'warning' };
  const ago = (iso?: string | null) => {
    if (!iso) return '';
    const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
    return days <= 0 ? ' today' : days === 1 ? ' yesterday' : ` ${days} days ago`;
  };
  switch (job.evidenceType) {
    case 'ats_verified':
      return { label: `Checked on employer's ATS${ago(job.verifiedAt)}`, tone: 'success' };
    case 'board_verified':
      return { label: `Listing re-checked${ago(job.verifiedAt)}`, tone: 'success' };
    case 'employer_board':
      return { label: 'On employer board at last read', tone: 'default' };
    case 'employer_attested':
      return { label: 'Employer says still open (unverified)', tone: 'default' };
    case 'age_inferred':
      return { label: 'Not recently confirmed', tone: 'warning' };
    default:
      return { label: 'No evidence stated', tone: 'warning' };
  }
}
