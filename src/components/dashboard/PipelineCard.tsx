import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '../ui';
import { KANBAN_STAGES, STAGE_LABELS } from '../../lib/jobPipeline';
import { DashboardSummary } from '../../lib/dashboardSummary';
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

export default function PipelineCard({ summary }: { summary: DashboardSummary }) {
  const { stageCounts, activeJobs } = summary;
  const rows = activeJobs.slice(0, MAX_ROWS);

  return (
    <Card className="overflow-hidden">
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
        <div className="flex items-center gap-1 min-w-max">
          {KANBAN_STAGES.map((stage, i) => (
            <Fragment key={stage}>
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
              <Link
                to="/applications"
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  stageCounts[stage] > 0 ? 'bg-brand-50 text-brand-800 hover:bg-brand-100' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                }`}
              >
                {STAGE_LABELS[stage]}
                <span className={`rounded-full px-1.5 text-[11px] ${stageCounts[stage] > 0 ? 'bg-white text-brand-700' : 'bg-white text-slate-400'}`}>
                  {stageCounts[stage]}
                </span>
              </Link>
            </Fragment>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
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

      {activeJobs.length > MAX_ROWS && (
        <Link to="/applications" className="block px-5 py-3 text-center text-xs font-semibold text-brand-600 hover:bg-slate-50 border-t border-slate-100">
          View all {activeJobs.length} applications
        </Link>
      )}
    </Card>
  );
}
