const ID_PREFIXES = ["SK", "CAP", "FUNC", "INIT", "DEL", "ACH"] as const;

// Deterministic ID assignment per JD_pipeline_SKILL.md's "Career Journey capture rules":
// SK-###, CAP-###, FUNC-###, INIT-###, DEL-###, ACH-### - never reused, always incremented
// from the highest existing suffix. Computed server-side so the model never has to guess.
export function computeNextIds(careerJourney: any): Record<string, string> {
  const maxByPrefix: Record<string, number> = {};
  for (const prefix of ID_PREFIXES) maxByPrefix[prefix] = 0;

  const visit = (value: any) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object") {
      if (typeof value.id === "string") {
        const match = value.id.match(/^([A-Z]+)-(\d+)$/);
        if (match && (ID_PREFIXES as readonly string[]).includes(match[1])) {
          const num = parseInt(match[2], 10);
          if (num > maxByPrefix[match[1]]) maxByPrefix[match[1]] = num;
        }
      }
      Object.values(value).forEach(visit);
    }
  };
  visit(careerJourney);

  const nextIds: Record<string, string> = {};
  for (const prefix of ID_PREFIXES) {
    nextIds[prefix] = `${prefix}-${String(maxByPrefix[prefix] + 1).padStart(3, "0")}`;
  }
  return nextIds;
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
