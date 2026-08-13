import { useMemo, ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { computeJourneyProgress, JourneyStage } from '../lib/journeyProgress';
import { Button } from './ui';
import { Sparkles, TrendingUp, Radar, Briefcase, PartyPopper, ArrowRight } from 'lucide-react';

const STAGE_ICON: Record<JourneyStage, ComponentType<{ className?: string }>> = {
  build: Sparkles,
  strengthen: TrendingUp,
  matches: Radar,
  applications: Briefcase,
  'steady-state': PartyPopper,
};

export default function JourneyGuide() {
  const navigate = useNavigate();
  const careerJourney = useStore((state) => state.careerJourney);
  const matches = useStore((state) => state.matches);
  const jobs = useStore((state) => state.jobs);

  const progress = useMemo(
    () => computeJourneyProgress(careerJourney, matches, jobs),
    [careerJourney, matches, jobs]
  );

  const Icon = STAGE_ICON[progress.stage];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50/80 to-white shadow-sm mb-6">
      <div className="flex items-start gap-3 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Your Journey</p>
          <h3 className="text-sm font-bold text-slate-900">{progress.headline}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{progress.detail}</p>
        </div>
      </div>
      <Button
        onClick={() => navigate(progress.ctaPath)}
        size="sm"
        className="bg-brand-600 hover:bg-brand-700 text-white shrink-0 self-start sm:self-auto"
      >
        {progress.ctaLabel}
        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
      </Button>
    </div>
  );
}
