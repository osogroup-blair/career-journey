import { buildCareerJourneyTemplate } from './careerJourneyTemplate';

/**
 * Fallback for accounts with no career journey saved yet. Must never be a real
 * person's data — this used to point at Blair's own career journey file, which
 * meant any fresh account (including a demo account) would silently render his
 * real resume. Use the blank, placeholder-filled template instead.
 */
export const DEFAULT_CAREER_JOURNEY = buildCareerJourneyTemplate();
