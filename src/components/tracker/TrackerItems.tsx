import { useState } from 'react';
import { Button, Textarea } from '../ui';
import { CHIP_BASE, ScoreValueChip } from '../matches/MatchRow';
import { STAGE_LABELS } from '../../lib/jobPipeline';
import { JobStatusBadges, JobStageEditor, MoveSelect, hasStageEditor, shortDate, stageSummary, updatedAgo } from './TrackerParts';
import type { ArchiveReason, JobAnalysis, JobStage } from '../../types';
import { ArrowUpRight, Briefcase, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

const ARCHIVE_REASONS: ArchiveReason[] = ['Rejected', 'No Response', 'Withdrawn', 'Position Filled', 'Other', 'Accepted Offer'];

export interface JobItemActions {
  onOpen: (job: JobAnalysis) => void;
  onMove: (job: JobAnalysis, stage: JobStage) => void;
  onUpdate: (job: JobAnalysis, updates: Partial<JobAnalysis>) => void;
  onDelete: (job: JobAnalysis) => void;
  onRestore: (job: JobAnalysis) => void;
}

function DetailsToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1" aria-expanded={open}>
      {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      {open ? 'Less' : 'Details'}
    </button>
  );
}

/** A draggable card in a Board column. */
export function JobBoardCard({
  job,
  score,
  actions,
}: {
  // No @types/react in this project, so JSX doesn't strip `key` from locally-typed props — list it explicitly.
  key?: string;
  job: JobAnalysis;
  score?: number;
  actions: JobItemActions;
}) {
  const [open, setOpen] = useState(false);
  const summary = stageSummary(job);

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs hover:shadow-md hover:border-slate-300 transition-all space-y-2 cursor-grab active:cursor-grabbing"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', job.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => actions.onOpen(job)} className="min-w-0 text-left group">
          <div className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-brand-700">{job.roleTitle}</div>
          <div className="text-xs font-semibold text-slate-500 truncate">{job.companyName}</div>
        </button>
        {score != null && (
          <span className="shrink-0 rounded-md bg-slate-50 px-1.5 py-0.5 text-xs font-extrabold text-slate-700 ring-1 ring-inset ring-slate-200" title="Match score from the quick scan">
            {score}
          </span>
        )}
      </div>

      <JobStatusBadges job={job} />
      {summary && <p className="text-xs text-slate-500">{summary}</p>}

      {open && hasStageEditor(job) && (
        <div className="pt-2 border-t border-slate-100">
          <JobStageEditor job={job} onUpdate={(u) => actions.onUpdate(job, u)} />
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-slate-400">{updatedAgo(job.updatedAt)}</span>
        <div className="flex items-center gap-2">
          {hasStageEditor(job) && <DetailsToggle open={open} onClick={() => setOpen((v) => !v)} />}
          <MoveSelect job={job} onMove={(s) => actions.onMove(job, s)} onDelete={() => actions.onDelete(job)} className="h-7 max-w-[92px]" />
        </div>
      </div>
    </div>
  );
}

/** A full-width row in the List view, laid out like a Matches row. */
export function TrackerRow({
  job,
  score,
  actions,
}: {
  key?: string;
  job: JobAnalysis;
  score?: number;
  actions: JobItemActions;
}) {
  const [open, setOpen] = useState(false);
  const meta = [job.locationNotes, job.compensationRange, updatedAgo(job.updatedAt)].filter(Boolean).join(' · ');
  const summary = stageSummary(job);

  const buttons = (
    <>
      {hasStageEditor(job) && <DetailsToggle open={open} onClick={() => setOpen((v) => !v)} />}
      <MoveSelect job={job} onMove={(s) => actions.onMove(job, s)} onDelete={() => actions.onDelete(job)} />
      <Button size="sm" onClick={() => actions.onOpen(job)}>
        Open <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    </>
  );

  return (
    <li className="p-4 sm:p-5">
      <div className="flex gap-4">
        {score != null ? (
          <ScoreValueChip score={score} title="Match score from the quick scan" />
        ) : (
          <div className={`${CHIP_BASE} bg-slate-50 text-slate-400 ring-slate-200`}>
            <Briefcase className="w-5 h-5" />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
            <div className="min-w-0">
              <button onClick={() => actions.onOpen(job)} className="text-left text-base font-bold text-slate-900 hover:text-brand-700 leading-snug">
                {job.roleTitle}
              </button>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{job.companyName}</span>
                {meta && <span className="text-slate-500"> · {meta}</span>}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-3 shrink-0">{buttons}</div>
          </div>
          <JobStatusBadges job={job} showStage />
          {summary && <p className="text-xs text-slate-500">{summary}</p>}
          <div className="flex sm:hidden flex-wrap items-center gap-3 pt-1">{buttons}</div>
          {open && hasStageEditor(job) && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
              <JobStageEditor job={job} onUpdate={(u) => actions.onUpdate(job, u)} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** An archived job: where it fell off, why, feedback notes, and a way back. */
export function ArchivedRow({ job, actions }: { key?: string; job: JobAnalysis; actions: JobItemActions }) {
  const [open, setOpen] = useState(false);
  const fellOff = job.archivedFromStage ? STAGE_LABELS[job.archivedFromStage] : null;
  const meta = [fellOff ? `fell off at ${fellOff}` : '', job.archivedAt ? `archived ${shortDate(job.archivedAt)}` : ''].filter(Boolean).join(' · ');

  return (
    <li className="p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={() => actions.onOpen(job)} className="text-left text-base font-bold text-slate-800 hover:text-brand-700 leading-snug">
            {job.roleTitle}
          </button>
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-700">{job.companyName}</span>
            {meta && <span className="text-slate-500"> · {meta}</span>}
          </p>
          {!open && job.archiveNotes && <p className="mt-1 text-xs text-slate-500 line-clamp-1">{job.archiveNotes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <select
            value={job.archiveReason || 'Rejected'}
            onChange={(e) => actions.onUpdate(job, { archiveReason: e.target.value as ArchiveReason })}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600"
            aria-label="Archive reason"
          >
            {ARCHIVE_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <DetailsToggle open={open} onClick={() => setOpen((v) => !v)} />
          <Button size="sm" variant="outline" onClick={() => actions.onRestore(job)} className="bg-white">
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Restore{fellOff ? ` to ${fellOff}` : ''}
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Feedback / notes</span>
          <Textarea
            value={job.archiveNotes || ''}
            onChange={(e) => actions.onUpdate(job, { archiveNotes: e.target.value })}
            placeholder="What did you learn? Feedback from the employer?"
            className="text-xs min-h-[64px] mt-1"
          />
        </div>
      )}
    </li>
  );
}
