import { CareerJourney, CareerJourneySchema } from '../types/careerJourney';

/**
 * The single place that turns "whatever JSON someone handed us" into a valid
 * `CareerJourney` — replaces the two separate, drifting sanitizers that used to live
 * in `CareerJourney.tsx` (`normalizeOntology`) and `store.ts` (`setCareerJourney`'s
 * inline logic). Both now call this.
 *
 * Schema-driven: every top-level key the schema knows about gets a sensible default
 * when missing. Unknown keys (anything the schema hasn't seen yet — a future version's
 * new section, or a field only this user's data happens to carry) pass through
 * untouched via `.passthrough()` on every object schema, so round-tripping through
 * this function never silently drops data.
 */
export function normalizeCareerJourney(input: unknown): CareerJourney {
  const result = CareerJourneySchema.safeParse(input);
  if (result.success) return result.data;

  // Malformed input (wrong type on a required field, etc.) — don't throw and lose the
  // user's data. Fall back to parsing an empty shell merged with whatever passthrough
  // fields survive a loose merge, and surface the validation error for debugging.
  console.error('Career Journey failed schema validation, applying best-effort defaults:', result.error.issues);
  const shell = CareerJourneySchema.parse({});
  const loose = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {};
  return { ...shell, ...loose, meta: { ...shell.meta, ...(loose.meta as object) } } as CareerJourney;
}

/** Validates without normalizing — used before export/save so a broken in-memory state can't be persisted. */
export function validateCareerJourney(input: unknown) {
  return CareerJourneySchema.safeParse(input);
}
