import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../ui';
import { CareerJourney } from '../../types/careerJourney';
import { toRoleView } from '../../lib/careerJourneyRoleEvidence';
import { ArrowRight, Compass } from 'lucide-react';

const MAX_ROLES = 3;
const MAX_SKILLS = 8;

// Parses "2022-01" / "2019-04" / "Present" style strings into a rough month count.
function parseMonthIndex(value?: string): number | null {
  if (!value) return null;
  if (/present/i.test(value)) {
    const now = new Date();
    return now.getFullYear() * 12 + now.getMonth();
  }
  const match = value.match(/(\d{4})(?:-(\d{2}))?/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = match[2] ? parseInt(match[2], 10) - 1 : 0;
  return year * 12 + month;
}

function computeYearsOfExperience(roles: any[]): number | null {
  const starts = roles.map((r) => parseMonthIndex(r.start_date || r.dates)).filter((v): v is number => v !== null);
  const ends = roles.map((r) => parseMonthIndex(r.end_date || r.dates) ?? parseMonthIndex(new Date().toISOString())).filter((v): v is number => v !== null);
  if (starts.length === 0) return null;
  const earliest = Math.min(...starts);
  const latest = Math.max(...ends, earliest);
  return Math.max(0, Math.round(((latest - earliest) / 12) * 10) / 10);
}

export default function JourneySummaryCard({ careerJourney }: { careerJourney: CareerJourney }) {
  const roles = useMemo(() => (careerJourney.roles || []).map((r: any) => toRoleView(careerJourney, r)), [careerJourney]);

  const recentRoles = useMemo(
    () =>
      [...roles]
        .sort((a: any, b: any) => (parseMonthIndex(b.start_date || b.dates) ?? 0) - (parseMonthIndex(a.start_date || a.dates) ?? 0))
        .slice(0, MAX_ROLES),
    [roles]
  );

  // Skills ranked by how many roles used them — a rough proxy for what the journey leads with.
  const topSkills = useMemo(() => {
    const counts = new Map<string, number>();
    roles.forEach((r: any) => (r.skills || []).forEach((s: string) => counts.set(s, (counts.get(s) || 0) + 1)));
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    if (ranked.length === 0) return (careerJourney.skills_index || []).map((s: any) => s.name).filter(Boolean).slice(0, MAX_SKILLS);
    return ranked.slice(0, MAX_SKILLS);
  }, [roles, careerJourney]);

  const years = useMemo(() => computeYearsOfExperience(roles), [roles]);
  const achievementCount = careerJourney.achievements?.length || 0;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Compass className="w-4 h-4 text-brand-600" />
          Your Career Journey
        </h2>
        <Link to="/edit" className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1">
          Open editor <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {[
          years !== null ? `${years}+ years` : null,
          `${roles.length} role${roles.length === 1 ? '' : 's'}`,
          `${achievementCount} achievement${achievementCount === 1 ? '' : 's'}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <ul className="mt-3 space-y-1">
        {recentRoles.map((role: any) => (
          <li key={role.id}>
            <Link
              to={`/edit?section=roles&item=${encodeURIComponent(role.id)}`}
              className="group block rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50 transition-colors"
            >
              <div className="text-sm font-semibold text-slate-900 truncate group-hover:text-brand-700">{role.title}</div>
              <div className="text-xs text-slate-500 truncate">
                {role.company || role.organization}
                {role.dates && <span className="text-slate-400"> · {role.dates}</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {topSkills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topSkills.map((s: string) => (
            <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {s}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
