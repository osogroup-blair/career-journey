import { ComponentType } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../ui';
import { JourneyProgress, JourneyStage } from '../../lib/journeyProgress';
import { DashboardSummary } from '../../lib/dashboardSummary';
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
}: {
  name?: string;
  targetRole?: string;
  progress: JourneyProgress;
  tiles: DashboardSummary['tiles'];
}) {
  const navigate = useNavigate();
  const firstName = name?.trim().split(/\s+/)[0];
  const Icon = STAGE_ICON[progress.stage];

  const tileDefs = [
    { label: 'Active applications', value: tiles.active, to: '/applications', icon: Briefcase },
    { label: 'Interviewing', value: tiles.interviewing, to: '/applications', icon: MessagesSquare },
    { label: 'Offers', value: tiles.offers, to: '/applications', icon: Award },
    { label: 'Matches to review', value: tiles.matchesToReview, to: '/matches', icon: Radar },
  ];

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
        {tileDefs.map(({ label, value, to, icon: TileIcon }) => (
          <Link
            key={label}
            to={to}
            className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-brand-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>{label}</span>
              <TileIcon className="w-4 h-4 text-slate-400 group-hover:text-brand-500 transition-colors" />
            </div>
            <div className="mt-1.5 text-2xl font-extrabold text-slate-900">{value}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
