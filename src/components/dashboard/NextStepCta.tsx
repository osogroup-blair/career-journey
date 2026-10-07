import { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { JourneyProgress, JourneyStage } from '../../lib/journeyProgress';
import { useLocalPreference } from '../../hooks/useLocalPreference';
import { Sparkles, TrendingUp, Radar, Briefcase, PartyPopper, ArrowRight, Minimize2, Maximize2, X, Lightbulb } from 'lucide-react';

const STAGE_ICON: Record<JourneyStage, ComponentType<{ className?: string }>> = {
  build: Sparkles,
  strengthen: TrendingUp,
  matches: Radar,
  applications: Briefcase,
  'steady-state': PartyPopper,
};

type Mode = 'full' | 'compact' | 'hidden';

const iconBtn = 'flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors';

/** The one action worth taking now. Sits in the title row; the user can shrink it to a pill or hide it. */
export default function NextStepCta({ progress }: { progress: JourneyProgress }) {
  const [mode, setMode] = useLocalPreference<Mode>('dashboard.nextStep.mode', 'full');
  const Icon = STAGE_ICON[progress.stage];

  if (mode === 'hidden') {
    return (
      <button
        type="button"
        onClick={() => setMode('compact')}
        className="inline-flex items-center gap-1.5 self-start lg:self-center rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white hover:text-brand-700 transition-colors"
      >
        <Lightbulb className="h-3.5 w-3.5" />
        Next step
      </button>
    );
  }

  if (mode === 'compact') {
    return (
      <div className="inline-flex max-w-full items-center self-start lg:self-center rounded-full border border-brand-200 bg-white pl-1 pr-1.5 py-1 shadow-xs">
        <Link
          to={progress.ctaPath}
          title={progress.headline}
          className="group flex min-w-0 items-center gap-2 rounded-full py-0.5 pl-1 pr-2.5 text-sm font-semibold text-slate-800 hover:text-brand-700"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">{progress.ctaLabel}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-brand-500 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <span className="mx-0.5 h-4 w-px bg-slate-200" />
        <button type="button" onClick={() => setMode('full')} className={iconBtn} aria-label="Expand next step" title="Expand">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => setMode('hidden')} className={iconBtn} aria-label="Hide next step" title="Hide">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full lg:max-w-xl items-center gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50/80 to-white p-3 pl-4 shadow-sm">
      <div className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">Next step</p>
        <p className="text-sm font-bold text-slate-900 truncate">{progress.headline}</p>
        <p className="text-xs text-slate-500 line-clamp-2">{progress.detail}</p>
      </div>
      <Link
        to={progress.ctaPath}
        className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-700 transition-colors max-w-[11rem]"
      >
        <span className="truncate">{progress.ctaLabel}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <div className="flex shrink-0 flex-col gap-0.5 border-l border-brand-100 pl-1.5">
        <button type="button" onClick={() => setMode('compact')} className={iconBtn} aria-label="Minimise next step" title="Minimise">
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => setMode('hidden')} className={iconBtn} aria-label="Hide next step" title="Hide">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
