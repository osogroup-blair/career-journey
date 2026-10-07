import { Badge, Button } from '../ui';
import { CHIP_BASE, ScoreChip, MatchResultSummary, InsightLists } from '../matches/MatchRow';
import { describeEvidence } from '../../lib/discoveryRank';
import { formatSalary, relativeTime } from '../../lib/discoveryFormat';
import type { JobMatch } from '../../types';
import type { DiscoveredJob } from '../../types/discovery';
import {
  ArrowUpRight, CheckSquare, ChevronDown, ChevronUp, ExternalLink, Loader2, Radar, Send, Square, Undo2, X, XCircle
} from 'lucide-react';

function RelevanceChip({ score, scanning }: { score: number; scanning: boolean }) {
  if (scanning) {
    return (
      <div className={`${CHIP_BASE} bg-slate-50 text-slate-400 ring-slate-200`} title="Scanning">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  return (
    <div className={`${CHIP_BASE} bg-white text-slate-400 ring-slate-200`} title="Relevance from title, searches and evidence — not an AI score. Scan it for a match score.">
      <span className="text-lg font-bold leading-none">{score}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wide mt-0.5">relevance</span>
    </div>
  );
}

export interface DiscoverRowActions {
  onToggleSelect: (job: DiscoveredJob) => void;
  onScan: (job: DiscoveredJob) => void;
  onPromote: (job: DiscoveredJob) => void;
  onViewAnalysis: (match: JobMatch) => void;
  onDismiss: (job: DiscoveredJob) => void;
  onRestore: (job: DiscoveredJob) => void;
}

export default function DiscoverRow({
  job,
  score,
  match,
  scanning,
  error,
  isNew,
  selected,
  expanded,
  onToggleExpand,
  actions,
}: {
  // No @types/react in this project, so JSX doesn't strip `key` from locally-typed props — list it explicitly.
  key?: string;
  job: DiscoveredJob;
  score: number;
  match?: JobMatch;
  scanning: boolean;
  error?: string;
  isNew: boolean;
  selected: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  actions: DiscoverRowActions;
}) {
  const dismissed = job.userState === 'dismissed';
  const evidence = describeEvidence(job);
  const salary = formatSalary(job.salary);
  const where = job.locations.length > 0 ? `${job.locations.slice(0, 3).join(', ')}${job.locations.length > 3 ? ` +${job.locations.length - 3}` : ''}` : '';
  const meta = [where, salary, job.postedAt ? `posted ${relativeTime(job.postedAt)}` : ''].filter(Boolean).join(' · ');

  const primary =
    match?.status === 'Promoted' && match.promotedJobId ? (
      <Button size="sm" variant="outline" onClick={() => actions.onViewAnalysis(match)} className="bg-white">
        View analysis <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    ) : match?.parse && !scanning ? (
      <Button size="sm" onClick={() => actions.onPromote(job)}>
        Add to pipeline <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    ) : !job.matchId && !scanning ? (
      <Button size="sm" variant="outline" onClick={() => actions.onScan(job)} className="bg-white">
        <Radar className="w-3.5 h-3.5 mr-1" /> Scan
      </Button>
    ) : null;

  const secondaryBtn = 'text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1';
  const secondary = (
    <>
      {dismissed ? (
        <button onClick={() => actions.onRestore(job)} className={secondaryBtn}>
          <Undo2 className="w-3.5 h-3.5" /> Restore
        </button>
      ) : job.userState !== 'promoted' && !scanning ? (
        <button onClick={() => actions.onDismiss(job)} className={secondaryBtn}>
          <X className="w-3.5 h-3.5" /> Dismiss
        </button>
      ) : null}
      <button onClick={onToggleExpand} className={secondaryBtn} aria-expanded={expanded}>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {expanded ? 'Less' : 'Details'}
      </button>
    </>
  );

  return (
    <li className={`p-4 sm:p-5 ${dismissed ? 'bg-slate-50/60' : selected ? 'bg-brand-50/40' : ''}`}>
      <div className="flex gap-3 sm:gap-4">
        <div className="pt-1 w-4 shrink-0">
          {!job.matchId && (
            <button
              onClick={() => actions.onToggleSelect(job)}
              className="text-slate-400 hover:text-brand-600"
              aria-label={selected ? 'Deselect' : 'Select for scanning'}
            >
              {selected ? <CheckSquare className="w-4 h-4 text-brand-600" /> : <Square className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className={dismissed ? 'opacity-60' : ''}>
          {match ? <ScoreChip match={match} pending={scanning} /> : <RelevanceChip score={score} scanning={scanning} />}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={onToggleExpand} className="text-left text-base font-bold text-slate-900 hover:text-brand-700 leading-snug">
                  {job.title}
                </button>
                {job.canonicalUrl && (
                  <a href={job.canonicalUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-600" aria-label="View on StillOpen">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {isNew && <Badge variant="success">New</Badge>}
              </div>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{job.company}</span>
                {meta && <span className="text-slate-500"> · {meta}</span>}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              {secondary}
              {primary}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={evidence.tone}>{evidence.label}</Badge>
            {job.matchedQueries.map((q) => (
              <span key={q} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">{q}</span>
            ))}
          </div>

          {error && (
            <p className="text-xs text-red-600 flex items-start gap-1.5">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
            </p>
          )}
          {match ? (
            <MatchResultSummary match={match} pending={scanning} expanded={expanded} />
          ) : scanning ? (
            <p className="text-xs text-slate-500">Scoring this listing against your Career Journey…</p>
          ) : null}

          <div className="flex sm:hidden flex-wrap items-center gap-3 pt-1">
            {primary}
            {secondary}
          </div>

          {expanded && (
            <div className="mt-3 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              {match ? (
                <>
                  <InsightLists leadWith={match.leadWith || []} gaps={match.topGaps || []} />
                  {match.jdText && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Job description</p>
                      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                        {match.jdText}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-500">
                  Not scanned yet. A scan scores this listing against your Career Journey and pulls in the full job description.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4">
                {job.canonicalUrl && (
                  <a href={job.canonicalUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-600 hover:text-brand-700 flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5" /> View on StillOpen
                  </a>
                )}
                {match?.applyUrl && (
                  <a href={match.applyUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1">
                    <Send className="w-3.5 h-3.5" /> Apply on employer site
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
