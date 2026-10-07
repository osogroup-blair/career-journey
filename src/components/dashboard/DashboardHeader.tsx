import { JourneyProgress } from '../../lib/journeyProgress';
import NextStepCta from './NextStepCta';
import { Target } from 'lucide-react';

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Title row: greeting + target role on the left, the next-step CTA on the right. */
export default function DashboardHeader({
  name,
  targetRole,
  progress,
}: {
  name?: string;
  targetRole?: string;
  progress: JourneyProgress;
}) {
  const firstName = name?.trim().split(/\s+/)[0];

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
      <NextStepCta progress={progress} />
    </header>
  );
}
