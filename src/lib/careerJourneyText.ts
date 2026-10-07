/**
 * Deterministic plain-text CV from a Career Journey — the snapshot Job
 * Discovery's search profile is derived from (src/pages/Discover.tsx). Not a
 * resume: no tailoring, no AI, and deliberately no contact details (phone,
 * email, profile links), since the text is sent to an AI model and only needs
 * to say what the candidate does, not how to reach them.
 *
 * Deterministic so "is my CV out of date?" is just a string comparison
 * against a fresh render — no version bookkeeping needed.
 */

const MAX_SKILLS = 30;
const MAX_ROLES = 8;
const MAX_POINTS_PER_ROLE = 4;

function clean(s: unknown): string {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
}

function roleDates(role: any): string {
  const dates = clean(role.dates);
  if (dates) return dates;
  const start = clean(role.start_date);
  const end = clean(role.end_date);
  return start || end ? `${start || '?'} – ${end || 'Present'}` : '';
}

// "Present"/missing end dates sort first, then by start date, newest first.
function recencyKey(role: any): string {
  const end = clean(role.end_date).toLowerCase();
  const current = !end || end === 'present' || end === 'current';
  return `${current ? '9' : '0'}${clean(role.start_date) || '0000'}`;
}

function rolePoints(role: any, achievements: any[]): string[] {
  const points: string[] = [];
  for (const a of achievements) {
    if (Array.isArray(a.role_ids) && a.role_ids.includes(role.id)) {
      const text = clean(a.title) || clean(a.description);
      if (text) points.push(text);
    }
  }
  for (const initiative of role.initiatives || []) {
    for (const d of initiative?.deliverables || []) {
      const desc = clean(d?.description);
      const impact = clean(d?.impact);
      if (desc) points.push(impact ? `${desc} — ${impact}` : desc);
    }
  }
  for (const a of role.achievements || []) {
    const text = typeof a === 'string' ? clean(a) : clean(a?.title) || clean(a?.description);
    if (text) points.push(text);
  }
  return Array.from(new Set(points)).slice(0, MAX_POINTS_PER_ROLE);
}

const PROFICIENCY_RANK: Record<string, number> = { expert: 4, advanced: 3, intermediate: 2, proficient: 2, beginner: 1, basic: 1 };

function topSkills(cj: any): string[] {
  const entries: any[] = Array.isArray(cj.skills_index) ? cj.skills_index : [];
  return entries
    .filter((s) => clean(s?.name))
    .map((s, i) => ({
      name: clean(s.name),
      score: (PROFICIENCY_RANK[clean(s.proficiency).toLowerCase()] || 0) * 100 + (Number(s.years_experience) || 0),
      i,
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_SKILLS)
    .map((s) => s.name);
}

export function careerJourneyToText(cj: any): string {
  if (!cj || typeof cj !== 'object') return '';
  const person = cj.person || {};
  const positioning = person.positioning || {};
  const lines: string[] = [];
  const section = (title: string, body: string[]) => {
    const filtered = body.filter(Boolean);
    if (filtered.length === 0) return;
    lines.push('', title.toUpperCase(), ...filtered);
  };

  const name = clean(person.name);
  const headline = clean(positioning.primary_tagline) || clean(person.brand);
  if (name) lines.push(name);
  if (headline) lines.push(headline);

  section('Target roles', [(positioning.target_role_families || []).map(clean).filter(Boolean).join('; ')]);
  section('Location & work preference', [
    clean(person.location) && `Location: ${clean(person.location)}`,
    clean(person.work_preference) && `Preference: ${clean(person.work_preference)}`,
  ]);
  section('Summary', [clean(person.summary)]);
  section('Signature outcomes', (person.signature_outcomes || []).map((o: unknown) => clean(o) && `- ${clean(o)}`));
  section('Top skills', [topSkills(cj).join(', ')]);

  const roles: any[] = (Array.isArray(cj.roles) ? cj.roles : [])
    .filter((r) => clean(r?.title) || clean(r?.organization) || clean(r?.company))
    .sort((a, b) => recencyKey(b).localeCompare(recencyKey(a)))
    .slice(0, MAX_ROLES);
  const achievements: any[] = Array.isArray(cj.achievements) ? cj.achievements : [];
  const roleLines: string[] = [];
  for (const role of roles) {
    const org = clean(role.organization) || clean(role.company);
    const dates = roleDates(role);
    roleLines.push(`${[clean(role.title), org].filter(Boolean).join(' — ')}${dates ? ` (${dates})` : ''}`);
    if (clean(role.description)) roleLines.push(`  ${clean(role.description)}`);
    for (const p of rolePoints(role, achievements)) roleLines.push(`  - ${p}`);
  }
  section('Experience', roleLines);

  section(
    'Education',
    (cj.education || []).map((e: any) => {
      const what = clean(e?.resume_display) || [clean(e?.program), clean(e?.institution)].filter(Boolean).join(', ');
      return what && `- ${what}`;
    })
  );
  section(
    'Certifications',
    (cj.certifications || []).map((c: any) => {
      const what = [clean(c?.name), clean(c?.issuer)].filter(Boolean).join(', ');
      return what && `- ${what}`;
    })
  );

  return lines.join('\n').trim();
}
