import { CareerJourney, CareerJourneySchema } from '../types/careerJourney';
import { normalizeCareerJourney } from './careerJourneyNormalize';

const KNOWN_TOP_LEVEL_KEYS = Object.keys(CareerJourneySchema.shape) as (keyof CareerJourney)[];

export interface CareerJourneyImportResult {
  data: CareerJourney;
  /** Human-readable schema validation issues found in the raw file — surfaced, not hidden, even though normalization still fills gaps. */
  issues: string[];
  /** Top-level sections the raw file was missing that got filled with empty defaults. */
  addedSections: string[];
  /** True when meta.template is set — a blank starter, not a user's real data. */
  isTemplate: boolean;
}

/**
 * Parses, validates, and normalizes an uploaded Career Journey JSON file. Used by
 * both the Navbar's global import and the Advanced Editor's import, so behavior
 * (validation surfaced, missing-sections detected, template vs. backup distinguished)
 * is identical everywhere a file can be loaded.
 */
export function parseCareerJourneyImport(jsonText: string): CareerJourneyImportResult {
  const raw = JSON.parse(jsonText);

  const validation = CareerJourneySchema.safeParse(raw);
  const issues = validation.success
    ? []
    : validation.error.issues.slice(0, 15).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);

  const rawObj = raw && typeof raw === 'object' ? raw : {};
  const addedSections = KNOWN_TOP_LEVEL_KEYS.filter((key) => rawObj[key as string] === undefined);

  const data = normalizeCareerJourney(raw);
  const isTemplate = Boolean((rawObj as any).meta?.template);

  return { data, issues, addedSections, isTemplate };
}
