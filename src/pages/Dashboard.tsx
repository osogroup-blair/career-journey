import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Button, Card } from '../components/ui';
import { computeJourneyProgress } from '../lib/journeyProgress';
import { buildDashboardSummary } from '../lib/dashboardSummary';
import { JobStage } from '../types';
import DashboardHeader from '../components/dashboard/DashboardHeader';
import PipelineCard from '../components/dashboard/PipelineCard';
import MatchesCard from '../components/dashboard/MatchesCard';
import JourneyHealthCard from '../components/dashboard/JourneyHealthCard';
import JourneySummaryCard from '../components/dashboard/JourneySummaryCard';
import { ArrowRight, FileText, MessagesSquare, FileDown, Sparkles } from 'lucide-react';

export default function Dashboard() {
  const { careerJourney, jobs, matches, matchPreferences } = useStore();
  const navigate = useNavigate();

  const [stageFilter, setStageFilter] = useState<JobStage | null>(null);

  const summary = useMemo(
    () => buildDashboardSummary(jobs, matches, matchPreferences.minMatchScore, Date.now()),
    [jobs, matches, matchPreferences.minMatchScore]
  );
  const progress = useMemo(() => {
    const p = computeJourneyProgress(careerJourney, matches, jobs);
    // The Job Tracker is reached only from the pipeline card's own link, so "go to applications"
    // becomes "continue the job at the top of the pipeline" (stalled first, then most recent).
    const top = summary.activeJobs[0];
    if (p.ctaPath === '/applications' && top) {
      return { ...p, ctaLabel: `Continue ${top.job.roleTitle}`, ctaPath: top.path };
    }
    return p;
  }, [careerJourney, matches, jobs, summary]);

  const meta: any = careerJourney?.meta || {};
  const person = careerJourney?.person;
  const targetRole =
    (typeof meta.target_role === 'string' && meta.target_role) || person?.positioning?.target_role_families?.[0] || undefined;
  const needsJourney = progress.stage === 'build';

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <DashboardHeader
          name={person?.name}
          targetRole={targetRole}
          progress={progress}
          tiles={summary.tiles}
          stageFilter={stageFilter}
          onStageFilterChange={setStageFilter}
        />

        {needsJourney ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 p-6 sm:p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-xl font-extrabold text-slate-900">Start with your Career Journey</h2>
              <p className="mt-1 text-sm text-slate-600 max-w-xl">
                It's the master record every tailored resume, cover letter, and match score is built from. Set it up once
                and keep it current as you go.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  { icon: FileText, title: 'Paste your resume', body: 'We pull out roles, achievements, and skills.' },
                  { icon: MessagesSquare, title: 'Talk it through', body: 'A guided chat builds it with you.' },
                  { icon: FileDown, title: 'Start from a template', body: 'Fill in a blank structure yourself.' },
                ].map(({ icon: Icon, title, body }) => (
                  <button
                    key={title}
                    onClick={() => navigate('/build')}
                    className="text-left rounded-xl border border-slate-200 p-4 hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
                  >
                    <Icon className="h-5 w-5 text-brand-600" />
                    <div className="mt-2 text-sm font-bold text-slate-900">{title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{body}</div>
                  </button>
                ))}
              </div>
              <Button onClick={() => navigate('/build')} className="mt-6 bg-brand-600 hover:bg-brand-700 text-white">
                Build your Career Journey <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </Card>
            <div>
              <MatchesCard matches={summary.matchesToReview} />
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3 items-start">
            <div className="lg:col-span-2">
              <PipelineCard summary={summary} stageFilter={stageFilter} onStageFilterChange={setStageFilter} />
            </div>
            <div className="space-y-6">
              <MatchesCard matches={summary.matchesToReview} />
              {careerJourney && <JourneyHealthCard careerJourney={careerJourney} />}
              {careerJourney && <JourneySummaryCard careerJourney={careerJourney} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
