import { useStore } from '../../store';
import { Badge, Button, Input, Textarea } from '../ui';
import { VERDICT_BADGE } from '../MatchSummary';
import { VERDICT_LABEL } from '../../lib/matchList';
import { STAGE_LABELS, getAvailableTransitions } from '../../lib/jobPipeline';
import { nextInterview, stalledDays } from '../../lib/dashboardSummary';
import { generateId } from '../../lib/utils';
import type { InterviewRound, JobAnalysis, JobStage } from '../../types';
import { CalendarClock, CalendarPlus, Clock, Loader2, X } from 'lucide-react';

const ROUND_OUTCOMES: InterviewRound['outcome'][] = ['Scheduled', 'Completed', 'Passed', 'Rejected'];

/** "Oct 9". Date-only strings (YYYY-MM-DD) are read as local dates so they don't shift a day west of UTC. */
export function shortDate(value?: string): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function updatedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return '';
  if (days <= 0) return 'updated today';
  if (days === 1) return 'updated yesterday';
  if (days < 30) return `updated ${days} days ago`;
  return `updated ${shortDate(iso)}`;
}

/** Working / fit verdict / stalled / next interview — the at-a-glance state of a job. */
export function JobStatusBadges({ job, showStage }: { job: JobAnalysis; showStage?: boolean }) {
  const isBusy = useStore((s) => Object.values(s.activeAiTasks).some((t) => t.jobId === job.id));
  const now = Date.now();
  const stalled = stalledDays(job, now);
  const next = job.stage === 'Interview' ? nextInterview(job, now) : null;
  const verdict = job.fitAnalysis?.overallVerdict;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showStage && (
        <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-1 text-[10px] font-bold uppercase tracking-tight text-brand-700 ring-1 ring-inset ring-brand-100">
          {STAGE_LABELS[job.stage]}
        </span>
      )}
      {isBusy && (
        <Badge variant="outline" className="flex items-center gap-1">
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Working…
        </Badge>
      )}
      {verdict && <Badge variant={VERDICT_BADGE[verdict] || 'default'}>{VERDICT_LABEL[verdict] || verdict}</Badge>}
      {next && (
        <Badge variant="outline" className="flex items-center gap-1 text-brand-700 border-brand-200">
          <CalendarClock className="w-3 h-3" /> {next.roundName} {shortDate(next.scheduledAt)}
        </Badge>
      )}
      {stalled != null && (
        <Badge variant="warning" className="flex items-center gap-1" title="No activity for a while — follow up or archive it">
          <Clock className="w-3 h-3" /> Stalled {stalled}d
        </Badge>
      )}
    </div>
  );
}

/** One line of stage-specific progress, e.g. "Applied Oct 3 · Referral" or "2 rounds · 1 scheduled". */
export function stageSummary(job: JobAnalysis): string {
  if (job.stage === 'Apply') {
    return [job.appliedAt ? `Applied ${shortDate(job.appliedAt)}` : 'Application date not set', job.applicationMethod].filter(Boolean).join(' · ');
  }
  if (job.stage === 'Interview') {
    const rounds = job.interviews || [];
    if (rounds.length === 0) return 'No rounds logged yet';
    const scheduled = rounds.filter((r) => r.outcome === 'Scheduled').length;
    return `${rounds.length} round${rounds.length === 1 ? '' : 's'}${scheduled ? ` · ${scheduled} scheduled` : ''}`;
  }
  if (job.stage === 'Offer' && job.offer?.decisionDeadline) return `Decide by ${shortDate(job.offer.decisionDeadline)}`;
  return '';
}

/** Whether a job's stage has inline fields worth opening on the board/list. */
export function hasStageEditor(job: JobAnalysis): boolean {
  return job.stage === 'Apply' || job.stage === 'Interview';
}

/** The Apply-date / method fields and the interview-round log, editable in place. */
export function JobStageEditor({ job, onUpdate }: { job: JobAnalysis; onUpdate: (updates: Partial<JobAnalysis>) => void }) {
  const updateRound = (id: string, updates: Partial<InterviewRound>) =>
    onUpdate({ interviews: (job.interviews || []).map((r) => (r.id === id ? { ...r, ...updates } : r)) });

  if (job.stage === 'Apply') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Applied on</span>
          <Input type="date" value={job.appliedAt || ''} onChange={(e) => onUpdate({ appliedAt: e.target.value })} className="h-8 text-xs mt-0.5" />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Method</span>
          <Input
            placeholder="Company site, referral..."
            value={job.applicationMethod || ''}
            onChange={(e) => onUpdate({ applicationMethod: e.target.value })}
            className="h-8 text-xs mt-0.5"
          />
        </label>
      </div>
    );
  }

  if (job.stage === 'Interview') {
    return (
      <div className="space-y-2">
        {(job.interviews || []).map((round) => (
          <div key={round.id} className="p-2 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Input value={round.roundName} onChange={(e) => updateRound(round.id, { roundName: e.target.value })} className="h-7 text-xs font-semibold flex-1" />
              <button
                onClick={() => onUpdate({ interviews: (job.interviews || []).filter((r) => r.id !== round.id) })}
                className="text-slate-400 hover:text-red-600 shrink-0"
                aria-label="Delete round"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <Input type="date" value={round.scheduledAt || ''} onChange={(e) => updateRound(round.id, { scheduledAt: e.target.value })} className="h-7 text-xs flex-1" />
              <select
                value={round.outcome}
                onChange={(e) => updateRound(round.id, { outcome: e.target.value as InterviewRound['outcome'] })}
                className="h-7 text-xs rounded-md border border-slate-200 bg-white px-1.5"
              >
                {ROUND_OUTCOMES.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <Textarea placeholder="Notes..." value={round.notes || ''} onChange={(e) => updateRound(round.id, { notes: e.target.value })} className="text-xs min-h-[40px]" />
          </div>
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate({ interviews: [...(job.interviews || []), { id: generateId('RND'), roundName: 'New Round', outcome: 'Scheduled' }] })}
          className="w-full h-8 text-xs bg-white"
        >
          <CalendarPlus className="w-3.5 h-3.5 mr-1" /> Add round
        </Button>
      </div>
    );
  }

  return null;
}

/** Native select so it never gets clipped by a scrolling column or card. */
export function MoveSelect({ job, onMove, onDelete, className = '' }: { job: JobAnalysis; onMove: (s: JobStage) => void; onDelete: () => void; className?: string }) {
  const transitions = getAvailableTransitions(job);
  return (
    <select
      value=""
      onChange={(e) => {
        const v = e.target.value;
        if (v === '__delete') {
          if (confirm(`Delete "${job.roleTitle}" at ${job.companyName}? This can't be undone.`)) onDelete();
        } else if (v) {
          onMove(v as JobStage);
        }
      }}
      className={`h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 hover:border-slate-300 ${className}`}
      aria-label="Move or delete"
    >
      <option value="">Move…</option>
      {transitions.map((s) => (
        <option key={s} value={s}>{s === 'Archive' ? 'Archive' : `Move to ${STAGE_LABELS[s]}`}</option>
      ))}
      <option value="__delete">Delete…</option>
    </select>
  );
}
