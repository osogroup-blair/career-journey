import { CareerJourney } from '../types/careerJourney';
import { JobAnalysis, JobMatch } from '../types';
import { computeJourneyCompleteness } from './careerJourneyGaps';

export type JourneyStage = 'build' | 'strengthen' | 'matches' | 'applications' | 'steady-state';

export interface JourneyProgress {
  stage: JourneyStage;
  headline: string;
  detail: string;
  ctaLabel: string;
  ctaPath: string;
}

const MIN_ROLES_FOR_A_REAL_JOURNEY = 1;
const THIN_COMPLETENESS_PCT = 40;

/**
 * A single, ordered read of where the user is in the product's real flow —
 * Build -> Strengthen -> Matches -> Applications — so the UI can point at
 * the one next action worth taking instead of presenting 6 destinations as equals.
 */
export function computeJourneyProgress(
  careerJourney: CareerJourney | null | undefined,
  matches: Record<string, JobMatch>,
  jobs: Record<string, JobAnalysis>
): JourneyProgress {
  const roles = careerJourney?.roles || [];

  if (!careerJourney || roles.length < MIN_ROLES_FOR_A_REAL_JOURNEY) {
    return {
      stage: 'build',
      headline: 'Start your Career Journey',
      detail: 'Build a master record of your roles, achievements, and skills — from a resume, a guided chat, or a blank template.',
      ctaLabel: 'Build your Career Journey',
      ctaPath: '/build',
    };
  }

  const completeness = computeJourneyCompleteness(careerJourney);
  const avgCompleteness = Math.round(
    (completeness.achievementsWithMetric.pct + completeness.skillsWithRecentUse.pct + completeness.rolesWithFullDescription.pct) / 3
  );

  if (avgCompleteness < THIN_COMPLETENESS_PCT) {
    return {
      stage: 'strengthen',
      headline: 'Strengthen your Career Journey',
      detail: `Only ${avgCompleteness}% of your evidence is fully quantified. A few pointed questions will make your achievements sharper and more credible.`,
      ctaLabel: 'Strengthen your evidence',
      ctaPath: '/strengthen',
    };
  }

  const matchList = Object.values(matches);
  if (matchList.length === 0) {
    return {
      stage: 'matches',
      headline: 'Find your first Matches',
      detail: 'Your Career Journey is solid enough to score against real postings. Paste a few job descriptions to see how you stack up.',
      ctaLabel: 'Find Matches',
      ctaPath: '/matches',
    };
  }

  const unreviewedMatches = matchList.filter((m) => m.status === 'New').length;
  if (unreviewedMatches > 0) {
    return {
      stage: 'matches',
      headline: `${unreviewedMatches} Match${unreviewedMatches === 1 ? '' : 'es'} waiting for review`,
      detail: 'Promote the ones worth pursuing into a full tailoring pipeline, or dismiss the rest.',
      ctaLabel: 'Review Matches',
      ctaPath: '/matches',
    };
  }

  const jobList = Object.values(jobs);
  const activeJobs = jobList.filter((j) => j.status !== 'Resume Build Ready');
  if (jobList.length === 0) {
    return {
      stage: 'applications',
      headline: 'Promote a Match into a tailoring project',
      detail: 'When a Match looks worth pursuing, promote it to run the full fit, ATS, and resume strategy pipeline.',
      ctaLabel: 'View Matches',
      ctaPath: '/matches',
    };
  }
  if (activeJobs.length > 0) {
    return {
      stage: 'applications',
      headline: `${activeJobs.length} application${activeJobs.length === 1 ? '' : 's'} in progress`,
      detail: 'Pick up where you left off in the tailoring pipeline.',
      ctaLabel: 'Go to Applications',
      ctaPath: '/applications',
    };
  }

  return {
    stage: 'steady-state',
    headline: 'Your Career Journey is in good shape',
    detail: 'Keep it fresh as you gain new experience, or check Matches for new postings worth pursuing.',
    ctaLabel: 'Find new Matches',
    ctaPath: '/matches',
  };
}
