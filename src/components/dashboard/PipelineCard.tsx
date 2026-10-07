import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '../ui';
import { KANBAN_STAGES, STAGE_LABELS } from '../../lib/jobPipeline';
import { DashboardSummary } from '../../lib/dashboardSummary';
import { JobStage } from '../../types';
import { AlertTriangle, ArrowRight, Briefcase, CalendarClock, ChevronRight, Hourglass } from 'lucide-react';

const MAX_ROWS = 6;

/** "Thu, Oct 9, 2:00 PM" when a time was given, "Thu, Oct 9" for a bare date. */
function formatWhen(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const hasTime = value.includes('T');
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export default function PipelineCard({
  summary,
  stageFilter,
  onStageFilterChange,
}: {
  summary: DashboardSummary;
  /** null = every active stage. */
  stageFilter: JobStage | null;
  onStageFilterChange: (stage: JobStage | null) => void;
}) {
  const { stageCounts, activeJobs } = summary;
  const [showAll, setShowAll] = useState(false);
  const filtered = stageFilter ? activeJobs.filter((j) => j.job.stage === stageFilter) : activeJobs;
  const rows = showAll ? filtered : filtered.slice(0, MAX_ROWS);

  return (
    <Card id="pipeline" className="overflow-hidden scroll-mt-20">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-brand-600" />
          Your pipeline
        </h2>
        <Link to="/applications" className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1">
          Open Job Tracker <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Stage strip */}
      <div className="px-5 pt-4 pb-4 border-b border-slate-100 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max" role="group" aria-label="Filter by stage">
          <button
            type="button"
            onClick={() => onStageFilterChange(null)}
            aria-pressed={stageFilter === null}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              stageFilter === null ? 'bg-brand-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            All
            <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${stageFilter === null ? 'bg-white/20 text-white' : 'bg-white text-slate-500'}`}>
              {activeJobs.length}
            </span>
          </button>
          {KANBAN_STAGES.map((stage, i) => {
            const selected = stageFilter === stage;
            const hasJobs = stageCounts[stage] > 0;
            return (
              <Fragment key={stage}>
                {i === 0 ? (
                  <span className="mx-1.5 h-4 w-px bg-slate-200 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                )}
                <button
                  type="button"
                  onClick={() => onStageFilterChange(selected ? null : stage)}
                  aria-pressed={selected}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    selected
                      ? 'bg-brand-600 text-white'
                      : hasJobs
                        ? 'bg-brand-50 text-brand-800 hover:bg-brand-100'
                        : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {STAGE_LABELS[stage]}
                  <span
                    className={`rounded-full px-1.5 text-[11px] ${
                      selected ? 'bg-white/20 text-white' : hasJobs ? 'bg-white text-brand-700' : 'bg-white text-slate-400'
                    }`}
                  >
                    {stageCounts[stage]}
                  </span>
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>

      {rows.length === 0 && stageFilter ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold text-slate-700">Nothing in {STAGE_LABELS[stageFilter]} right now</p>
          <button
            type="button"
            onClick={() => onStageFilterChange(null)}
            className="mt-2 text-xs font-semibold text-brand-600 hover:text-brand-800"
          >
            Show all stages
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No applications in flight</p>
          <p className="text-xs text-slate-500 mt-1">
            Promote a match, or use <strong>New Job Analysis</strong> to tailor for a posting you already have.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map(({ job, stalledDays, nextInterview, path }) => (
            <li key={job.id}>
              <Link to={path} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-bold text-slate-900 truncate group-hover:text-brand-700">{job.roleTitle}</span>
                    <span className="text-xs text-slate-500 truncate">{job.companyName}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={job.stage === 'Offer' ? 'success' : 'default'}>{STAGE_LABELS[job.stage]}</Badge>
                    {stalledDays !== null && (
                      <Badge variant="warning" className="gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {job.stage === 'Apply' ? `No response ${stalledDays}d` : `Stalled ${stalledDays}d`}
                      </Badge>
                    )}
                    {nextInterview && (
                      <span className="flex items-center gap-1 text-slate-600">
                        <CalendarClock className="w-3.5 h-3.5 text-brand-500" />
                        Next: {nextInterview.roundName}, {formatWhen(nextInterview.scheduledAt!)}
                      </span>
                    )}
                    {job.stage === 'Offer' && job.offer?.decisionDeadline && (
                      <span className="flex items-center gap-1 text-slate-600">
                        <Hourglass className="w-3.5 h-3.5 text-brand-500" />
                        Decide by {formatWhen(job.offer.decisionDeadline)}
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 shrink-0 transition-colors" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > MAX_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="block w-full px-5 py-3 text-center text-xs font-semibold text-brand-600 hover:bg-slate-50 border-t border-slate-100"
        >
          {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
        </button>
      )}
    </Card>
  );
}
