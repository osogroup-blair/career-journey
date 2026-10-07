// Shared by client and server (server/careerJourneyVersioning.ts re-exports these).
// Keep it free of browser/Node-only imports.

export const ID_PREFIXES = ["SK", "CAP", "FUNC", "INIT", "DEL", "ACH", "ROLE", "EDU", "METH", "ENG", "CERT", "MAP"] as const;
export type IdPrefix = (typeof ID_PREFIXES)[number];

// Sequential ids are at most 5 digits; anything longer is a legacy random
// generateId() value that happened to be all digits and must not inflate the counter.
const SEQUENTIAL_ID = /^([A-Z]+)-(\d{1,5})$/;

function maxSuffixes(careerJourney: any): Record<string, number> {
  const maxByPrefix: Record<string, number> = {};
  for (const prefix of ID_PREFIXES) maxByPrefix[prefix] = 0;

  const visit = (value: any) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      if (typeof value.id === "string") {
        const match = value.id.match(SEQUENTIAL_ID);
        if (match && (ID_PREFIXES as readonly string[]).includes(match[1])) {
          const num = parseInt(match[2], 10);
          if (num > maxByPrefix[match[1]]) maxByPrefix[match[1]] = num;
        }
      }
      Object.values(value).forEach(visit);
    }
  };
  visit(careerJourney);
  return maxByPrefix;
}

const formatId = (prefix: string, n: number) => `${prefix}-${String(n).padStart(3, "0")}`;

// Deterministic ID assignment per JD_pipeline_SKILL.md's "Career Journey capture rules":
// SK-###, CAP-###, FUNC-###, INIT-###, DEL-###, ACH-### - never reused, always incremented
// from the highest existing suffix. Computed in code so the model never has to guess.
export function computeNextIds(careerJourney: any): Record<string, string> {
  const maxByPrefix = maxSuffixes(careerJourney);
  const nextIds: Record<string, string> = {};
  for (const prefix of ID_PREFIXES) nextIds[prefix] = formatId(prefix, maxByPrefix[prefix] + 1);
  return nextIds;
}

/**
 * Hands out sequential ids for a batch of inserts — each call to `next(prefix)` returns
 * a fresh id, so several new items created in one mutation never collide.
 */
export function createIdAllocator(careerJourney: any): (prefix: IdPrefix) => string {
  const counters = maxSuffixes(careerJourney);
  return (prefix) => {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return formatId(prefix, counters[prefix]);
  };
}

// Bumps the minor version, e.g. "3.33" -> "3.34". Never overwrites the source file;
// the skill requires a new versioned file every time.
export function computeNextVersion(currentVersion: string | undefined): string {
  if (!currentVersion) return "1.0";
  const parts = currentVersion.split(".").map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.some((p) => Number.isNaN(p))) {
    return `${currentVersion}.1`;
  }
  const [major, minor] = parts;
  return `${major}.${minor + 1}`;
}

export function versionChangesKey(version: string): string {
  return `version_${version.replace(/\./g, "_")}_changes`;
}
