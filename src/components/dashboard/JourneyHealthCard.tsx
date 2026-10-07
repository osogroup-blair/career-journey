import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../ui';
import { CareerJourney } from '../../types/careerJourney';
import { averageCompleteness, computeJourneyCompleteness, computeJourneyGaps } from '../../lib/careerJourneyGaps';
import { ArrowRight, HeartPulse } from 'lucide-react';

function barColor(pct: number) {
  if (pct >= 70) return 'bg-green-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function JourneyHealthCard({ careerJourney }: { careerJourney: CareerJourney }) {
  const completeness = useMemo(() => computeJourneyCompleteness(careerJourney), [careerJourney]);
  const gapCount = useMemo(() => computeJourneyGaps(careerJourney).length, [careerJourney]);
  const overall = averageCompleteness(completeness);

  const bars = [
    { label: 'Achievements with a number', ...completeness.achievementsWithMetric },
    { label: 'Skills used recently', ...completeness.skillsWithRecentUse },
    { label: 'Roles fully described', ...completeness.rolesWithFullDescription },
  ];

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-brand-600" />
          Career Journey health
        </h2>
        <span className="text-2xl font-extrabold text-slate-900">{overall}%</span>
      </div>

      <div className="mt-4 space-y-3">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium text-slate-600">{b.label}</span>
              <span className="text-slate-500">
                {b.count}/{b.total}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${barColor(b.pct)}`} style={{ width: `${b.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      {gapCount > 0 ? (
        <Link
          to="/strengthen"
          className="mt-4 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800 hover:bg-brand-100 transition-colors"
        >
          <span>
            {gapCount} gap{gapCount === 1 ? '' : 's'} to strengthen
          </span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      ) : (
        <p className="mt-4 text-xs text-slate-500">No gaps found. Your evidence is in good shape.</p>
      )}
    </Card>
  );
}
