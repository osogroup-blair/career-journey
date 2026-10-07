import type { StillOpenSalary } from '../types/discovery';

/**
 * Display strings for StillOpen listing fields — shared by the Discover rows
 * and the scan → match → job hand-off (they land in a job's compensationRange
 * and locationNotes, which the job header shows).
 */

/** "USD 120k–150k", "EUR 600 / day (board estimate)" — never converted or annualised, same as StillOpen. */
export function formatSalary(s?: StillOpenSalary | null): string {
  if (!s || (s.min == null && s.max == null)) return '';
  const fmt = (n?: number | null) => (n == null ? '' : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const range = s.min != null && s.max != null && s.min !== s.max ? `${fmt(s.min)}–${fmt(s.max)}` : fmt(s.max ?? s.min);
  const period = s.period && s.period !== 'year' ? ` / ${s.period}` : '';
  return `${s.currency ? `${s.currency} ` : ''}${range}${period}${s.source === 'estimate' ? ' (board estimate)' : ''}`;
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACTOR: 'Contract',
  TEMPORARY: 'Temporary',
  INTERN: 'Internship',
  PER_DIEM: 'Per diem',
  VOLUNTEER: 'Volunteer',
  OTHER: 'Other',
};

/** "Remote — United Kingdom, Ireland +3 · Full-time". Every StillOpen listing is fully remote. */
export function formatLocationNotes(locations: string[], employmentType?: string | null): string {
  const where = locations.length ? `Remote — ${locations.slice(0, 3).join(', ')}${locations.length > 3 ? ` +${locations.length - 3}` : ''}` : 'Remote';
  const type = employmentType ? EMPLOYMENT_LABEL[employmentType] || employmentType : '';
  return type ? `${where} · ${type}` : where;
}
