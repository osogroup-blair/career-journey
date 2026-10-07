import { ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import { JourneyProgress, JourneyStage } from '../../lib/journeyProgress';
import { DashboardSummary } from '../../lib/dashboardSummary';
import { JobStage } from '../../types';
import { Sparkles, TrendingUp, Radar, Briefcase, PartyPopper, ArrowRight, Target, MessagesSquare, Award } from 'lucide-react';

const STAGE_ICON: Record<JourneyStage, ComponentType<{ className?: string }>> = {
  build: Sparkles,
  strengthen: TrendingUp,
  matches: Radar,
  applications: Briefcase,
  'steady-state': PartyPopper,
};

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardHeader({
  name,
  targetRole,
  progress,
  tiles,
  stageFilter,
  onStageFilterChange,
}: {
  name?: string;
  targetRole?: string;
  progress: JourneyProgress;
  tiles: DashboardSummary['tiles'];
  stageFilter: JobStage | null;
  /** Job tiles filter the pipeline in place rather than leaving the Dashboard. */
  onStageFilterChange: (stage: JobStage | null) => void;
}) {
  const navigate = useNavigate();
  const firstName = name?.trim().split(/\s+/)[0];
  const Icon = STAGE_ICON[progress.stage];

  const jobTiles: { label: string; value: number; stage: JobStage | null; icon: ComponentType<{ className?: string }> }[] = [
    { label: 'Active applications', value: tiles.active, stage: null, icon: Briefcase },
    { label: 'Interviewing', value: tiles.interviewing, stage: 'Interview', icon: MessagesSquare },
    { label: 'Offers', value: tiles.offers, stage: 'Offer', icon: Award },
  ];

  const filterTo = (stage: JobStage | null) => {
    onStageFilterChange(stage);
    document.getElementById('pipeline')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const tileClass = (selected: boolean) =>
    `group text-left rounded-xl border bg-white p-4 shadow-xs hover:border-brand-300 hover:shadow-sm transition-all ${
      selected ? 'border-brand-500 ring-1 ring-brand-500/30' : 'border-slate-200'
    }`;
  const tileBody = (label: string, value: number, TileIcon: ComponentType<{ className?: string }>) => (
    <>
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>{label}</span>
        <TileIcon className="w-4 h-4 text-slate-400 group-hover:text-brand-500 transition-colors" />
      </div>
      <div className="mt-1.5 text-2xl font-extrabold text-slate-900">{value}</div>
    </>
  );

  return (
    <section className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          {firstName ? `${greeting(new Date())}, ${firstName}` : 'Welcome back'}
        </h1>
        {targetRole && (
          <p className="mt-1 text-sm text-slate-500 flex items-center gap-1.5">
            <Target className="w-4 h-4 text-brand-500 shrink-0" />
            Targeting <strong className="font-semibold text-slate-700">{targetRole}</strong>
          </p>
        )}
      </div>

      {/* Next step: the one action worth taking now */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50/80 to-white shadow-sm">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Next step</p>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">{progress.headline}</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{progress.detail}</p>
          </div>
        </div>
        <Button
          onClick={() => navigate(progress.ctaPath)}
          className="bg-brand-600 hover:bg-brand-700 text-white shrink-0 self-start sm:self-auto"
        >
          {progress.ctaLabel}
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {jobTiles.map(({ label, value, stage, icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => filterTo(stage)}
            aria-pressed={stageFilter === stage}
            className={tileClass(stageFilter === stage)}
          >
            {tileBody(label, value, icon)}
          </button>
        ))}
        <Link to="/matches" className={tileClass(false)}>
          {tileBody('Matches to review', tiles.matchesToReview, Radar)}
        </Link>
      </div>
    </section>
  );
}
