import {
  DiscoverySearchProfileSchema,
  MAX_DISCOVERY_QUERIES,
  STILLOPEN_AREAS,
  STILLOPEN_LEVELS,
  STILLOPEN_PAY_STEPS,
  StillOpenLocSchema,
  type DiscoverySearchProfile,
} from "../../src/types/discovery";

/**
 * Turns the model's search-profile suggestion into one StillOpen will accept.
 * Values it invented (a region StillOpen doesn't have, a level outside the
 * fixed list, a pay figure between steps) are dropped and reported back, so
 * the page can say what was left out instead of failing the whole call.
 */
export function sanitizeAiSearchProfile(raw: {
  queries?: unknown;
  loc?: unknown;
  level?: unknown;
  area?: unknown;
  payMin?: unknown;
}): { searchProfile: DiscoverySearchProfile | null; dropped: string[] } {
  const dropped: string[] = [];
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  const seen = new Set<string>();
  const queries: string[] = [];
  for (const q of strings(raw.queries)) {
    const clean = q.replace(/["()]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    queries.push(clean);
  }

  const loc: string[] = [];
  for (const l of strings(raw.loc)) {
    const parsed = StillOpenLocSchema.safeParse(l);
    if (parsed.success && !loc.includes(parsed.data)) loc.push(parsed.data);
    else if (!parsed.success) dropped.push(`location "${l}"`);
  }

  const level = strings(raw.level)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => {
      const ok = (STILLOPEN_LEVELS as readonly string[]).includes(l);
      if (!ok) dropped.push(`level "${l}"`);
      return ok;
    }) as DiscoverySearchProfile["level"];

  const area = strings(raw.area)
    .map((a) => a.trim().toLowerCase().replace(/[\s&/]+/g, "_"))
    .filter((a) => {
      const ok = (STILLOPEN_AREAS as readonly string[]).includes(a);
      if (!ok) dropped.push(`area "${a}"`);
      return ok;
    }) as DiscoverySearchProfile["area"];

  let payMin: number | null = null;
  if (typeof raw.payMin === "number") {
    if ((STILLOPEN_PAY_STEPS as readonly number[]).includes(raw.payMin)) payMin = raw.payMin;
    else dropped.push(`minimum pay ${raw.payMin}`);
  }

  if (queries.length > MAX_DISCOVERY_QUERIES) dropped.push(`${queries.length - MAX_DISCOVERY_QUERIES} extra search(es)`);
  const parsed = DiscoverySearchProfileSchema.safeParse({
    queries: queries.slice(0, MAX_DISCOVERY_QUERIES),
    loc: loc.slice(0, 3),
    level: Array.from(new Set(level)).slice(0, 3),
    area: Array.from(new Set(area)).slice(0, 2),
    payMin,
  });
  return { searchProfile: parsed.success ? parsed.data : null, dropped };
}
