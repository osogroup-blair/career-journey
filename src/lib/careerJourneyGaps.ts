import { CareerJourney } from '../types/careerJourney';

export type GapType = 'achievement-metric' | 'skill-stale' | 'role-thin';

export interface JourneyGap {
  id: string;
  type: GapType;
  entityId: string;
  /** What's shown to the user as the pointed, specific question. */
  question: string;
  /** The current value(s) being questioned — shown for context and used as the "before" in the review card. */
  current: Record<string, any>;
}

const HAS_NUMBER = /\d/;

function isQuantified(text: string | undefined): boolean {
  if (!text) return false;
  return HAS_NUMBER.test(text);
}

function isStale(lastUsed: string | undefined): boolean {
  if (!lastUsed) return true;
  const year = parseInt(lastUsed, 10);
  if (Number.isNaN(year)) return false; // e.g. "Present" — not stale
  return new Date().getFullYear() - year > 3;
}

/**
 * Scans for the same three weak-signal patterns computeCareerJourneyCompleteness
 * reports on, and turns each into a specific, pointed question — not a generic
 * "tell me more." Ordered by type so achievements (usually the highest-leverage
 * resume content) come first.
 */
export function computeJourneyGaps(cj: CareerJourney): JourneyGap[] {
  const gaps: JourneyGap[] = [];

  for (const ach of cj.achievements || []) {
    const text = `${ach.title || ''} ${ach.description || ''}`;
    if (!isQuantified(text)) {
      gaps.push({
        id: `gap-ach-${ach.id}`,
        type: 'achievement-metric',
        entityId: ach.id,
        question: `You wrote "${ach.title}"${ach.description ? ` — ${ach.description}` : ''}. Do you have a number for this — a %, a dollar amount, a time saved, a count? If you're not sure of the exact figure, what's your best confident estimate and how would you back it up?`,
        current: { title: ach.title, description: ach.description },
      });
    }
  }

  for (const sk of cj.skills_index || []) {
    if (isStale(sk.last_used)) {
      gaps.push({
        id: `gap-skill-${sk.id}`,
        type: 'skill-stale',
        entityId: sk.id,
        question: `"${sk.name}" is listed without a recent "last used" date. Are you still using it? If so, roughly how recently, and how would you rate your proficiency today?`,
        current: { name: sk.name, last_used: sk.last_used, proficiency: sk.proficiency },
      });
    }
  }

  for (const role of cj.roles || []) {
    if (!role.description || role.description.trim().length < 40) {
      gaps.push({
        id: `gap-role-${role.id}`,
        type: 'role-thin',
        entityId: role.id,
        question: `Your role as ${role.title} at ${role.organization} has a thin description. What were you actually responsible for day to day — scope, team, budget, whatever made this role real?`,
        current: { title: role.title, organization: role.organization, description: role.description },
      });
    }
  }

  return gaps;
}

export interface JourneyCompleteness {
  achievementsWithMetric: { count: number; total: number; pct: number };
  skillsWithRecentUse: { count: number; total: number; pct: number };
  rolesWithFullDescription: { count: number; total: number; pct: number };
}

function pct(count: number, total: number): number {
  return total === 0 ? 100 : Math.round((count / total) * 100);
}

export function computeJourneyCompleteness(cj: CareerJourney): JourneyCompleteness {
  const achievements = cj.achievements || [];
  const skills = cj.skills_index || [];
  const roles = cj.roles || [];

  const achievementsWithMetricCount = achievements.filter((a) => isQuantified(`${a.title || ''} ${a.description || ''}`)).length;
  const skillsWithRecentUseCount = skills.filter((s) => !isStale(s.last_used)).length;
  const rolesWithFullDescriptionCount = roles.filter((r) => r.description && r.description.trim().length >= 40).length;

  return {
    achievementsWithMetric: { count: achievementsWithMetricCount, total: achievements.length, pct: pct(achievementsWithMetricCount, achievements.length) },
    skillsWithRecentUse: { count: skillsWithRecentUseCount, total: skills.length, pct: pct(skillsWithRecentUseCount, skills.length) },
    rolesWithFullDescription: { count: rolesWithFullDescriptionCount, total: roles.length, pct: pct(rolesWithFullDescriptionCount, roles.length) },
  };
}
