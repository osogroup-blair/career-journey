import { Badge, Button } from '../ui';
import { SOURCE_LABEL, VERDICT_BADGE, GATE_BADGE } from '../MatchSummary';
import { isScanPending, scoreTier, VERDICT_LABEL, type ScoreTier } from '../../lib/matchList';
import type { JobMatch } from '../../types';
import {
  ArrowUpRight, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Filter,
  Loader2, RotateCcw, Send, Trash2, Undo2, X, XCircle
} from 'lucide-react';

const TIER_CLASS: Record<ScoreTier, string> = {
  strong: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  good: 'bg-brand-50 text-brand-700 ring-brand-200',
  fair: 'bg-amber-50 text-amber-700 ring-amber-200',
  low: 'bg-slate-100 text-slate-500 ring-slate-200',
};

function addedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days)) return '';
  if (days <= 0) return 'added today';
  if (days === 1) return 'added yesterday';
  if (days < 30) return `added ${days} days ago`;
  return `added ${new Date(iso).toLocaleDateString()}`;
}

export const CHIP_BASE = 'w-14 h-14 shrink-0 rounded-xl ring-1 ring-inset flex flex-col items-center justify-center';

export function ScoreChip({ match, pending = isScanPending(match) }: { match: JobMatch; pending?: boolean }) {
  if (pending) {
    return (
      <div className={`${CHIP_BASE} bg-slate-50 text-slate-400 ring-slate-200`} title="Scanning">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (match.matchScore == null) {
    const Icon = match.scanError ? XCircle : Filter;
    return (
      <div className={`${CHIP_BASE} bg-slate-50 ring-slate-200 ${match.scanError ? 'text-red-400' : 'text-slate-400'}`}>
        <Icon className="w-5 h-5" />
      </div>
    );
  }
  return <ScoreValueChip score={match.matchScore} />;
}

/** The colour-coded score block on its own, for anything carrying a match score. */
export function ScoreValueChip({ score, title }: { score: number; title?: string }) {
  return (
    <div className={`${CHIP_BASE} ${TIER_CLASS[scoreTier(score)]}`} title={title}>
      <span className="text-xl font-extrabold leading-none">{score}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wide mt-0.5 opacity-80">match</span>
    </div>
  );
}

export function InsightLists({ leadWith, gaps }: { leadWith: string[]; gaps: string[] }) {
  if (leadWith.length === 0 && gaps.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {leadWith.length > 0 && <InsightList items={leadWith} tone="lead" />}
      {gaps.length > 0 && <InsightList items={gaps} tone="gap" />}
    </div>
  );
}

function InsightList({ items, tone }: { items: string[]; tone: 'lead' | 'gap' }) {
  const Icon = tone === 'lead' ? CheckCircle2 : AlertTriangle;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{tone === 'lead' ? 'Lead with' : 'Gaps'}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
            <Icon className={`w-3 h-3 shrink-0 mt-0.5 ${tone === 'lead' ? 'text-emerald-500' : 'text-amber-500'}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The scan outcome under a row's title: in progress, failed, keyword-skipped, or verdict badges plus one-line strengths and gaps. */
export function MatchResultSummary({ match: m, pending, expanded }: { match: JobMatch; pending: boolean; expanded: boolean }) {
  const leadWith = m.leadWith || [];
  const gaps = m.topGaps || [];
  return (
    <>
      {pending ? (
        <p className="text-xs text-slate-500">Scoring this posting against your Career Journey…</p>
      ) : m.scanError ? (
        <p className="text-xs text-red-600 flex items-start gap-1.5">
          <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {m.scanError}
        </p>
      ) : m.dismissReason ? (
        <p className="text-xs text-slate-500 flex items-start gap-1.5">
          <Filter className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {m.dismissReason}
        </p>
      ) : (
        <>
          {(m.verdict || m.hardGateRisk) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {m.verdict && <Badge variant={VERDICT_BADGE[m.verdict] || 'default'}>{VERDICT_LABEL[m.verdict] || m.verdict}</Badge>}
              {m.hardGateRisk && <Badge variant={GATE_BADGE[m.hardGateRisk] || 'default'}>{m.hardGateRisk}</Badge>}
            </div>
          )}
          {!expanded && (leadWith.length > 0 || gaps.length > 0) && (
            <div className="space-y-1 text-xs text-slate-600">
              {leadWith.length > 0 && (
                <p className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-px" />
                  <span className="line-clamp-1"><span className="font-semibold text-slate-700">Lead with:</span> {leadWith.join(' · ')}</span>
                </p>
              )}
              {gaps.length > 0 && (
                <p className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-px" />
                  <span className="line-clamp-1"><span className="font-semibold text-slate-700">Gaps:</span> {gaps.join(' · ')}</span>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

export interface MatchRowActions {
  onPromote: (m: JobMatch) => void;
  onViewAnalysis: (m: JobMatch) => void;
  onDismiss: (m: JobMatch) => void;
  onRestore: (m: JobMatch) => void;
  onRetry: (m: JobMatch) => void;
  onScanAnyway: (m: JobMatch) => void;
  onRemove: (m: JobMatch) => void;
}

export default function MatchRow({
  match: m,
  expanded,
  onToggle,
  actions,
}: {
  // No @types/react in this project, so JSX doesn't strip `key` from locally-typed props — list it explicitly.
  key?: string;
  match: JobMatch;
  expanded: boolean;
  onToggle: () => void;
  actions: MatchRowActions;
}) {
  const pending = isScanPending(m);
  const dismissed = m.status === 'Dismissed';
  const meta = [m.locationNotes, m.compensationRange, m.source !== 'manual-paste' ? SOURCE_LABEL[m.source] : null, addedAgo(m.createdAt)]
    .filter(Boolean)
    .join(' · ');
  const leadWith = m.leadWith || [];
  const gaps = m.topGaps || [];

  const primary =
    m.status === 'Promoted' && m.promotedJobId ? (
      <Button size="sm" variant="outline" onClick={() => actions.onViewAnalysis(m)} className="bg-white">
        View analysis <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    ) : m.parse && !pending ? (
      <Button size="sm" onClick={() => actions.onPromote(m)}>
        Add to pipeline <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    ) : null;

  const secondaryBtn = 'text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1';
  const secondary = (
    <>
      {m.scanError && (
        <button onClick={() => actions.onRetry(m)} className={secondaryBtn}>
          <RotateCcw className="w-3.5 h-3.5" /> Retry
        </button>
      )}
      {m.dismissReason && (
        <button onClick={() => actions.onScanAnyway(m)} className={secondaryBtn}>
          <RotateCcw className="w-3.5 h-3.5" /> Scan anyway
        </button>
      )}
      {m.status === 'New' && !pending && (
        <button onClick={() => actions.onDismiss(m)} className={secondaryBtn}>
          <X className="w-3.5 h-3.5" /> Dismiss
        </button>
      )}
      {dismissed && !m.dismissReason && (
        <button onClick={() => actions.onRestore(m)} className={secondaryBtn}>
          <Undo2 className="w-3.5 h-3.5" /> Restore
        </button>
      )}
      <button onClick={onToggle} className={secondaryBtn} aria-expanded={expanded}>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {expanded ? 'Less' : 'Details'}
      </button>
    </>
  );

  return (
    <li className={`p-4 sm:p-5 ${dismissed ? 'bg-slate-50/60' : ''}`}>
      <div className="flex gap-4">
        <div className={dismissed ? 'opacity-60' : ''}>
          <ScoreChip match={m} />
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
            <div className="min-w-0">
              <button onClick={onToggle} className="text-left text-base font-bold text-slate-900 hover:text-brand-700 leading-snug">
                {m.roleTitle}
              </button>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{m.companyName}</span>
                {meta && <span className="text-slate-500"> · {meta}</span>}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-3 shrink-0">
              {secondary}
              {primary}
            </div>
          </div>

          <MatchResultSummary match={m} pending={pending} expanded={expanded} />

          <div className="flex sm:hidden flex-wrap items-center gap-3 pt-1">
            {primary}
            {secondary}
          </div>

          {expanded && (
            <div className="mt-3 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <InsightLists leadWith={leadWith} gaps={gaps} />
              {m.jdText && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Job description</p>
                  <div className="max-h-80 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    {m.jdText}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-4">
                  {m.sourceUrl && (
                    <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-slate-600 hover:text-brand-700 flex items-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5" /> Original posting
                    </a>
                  )}
                  {m.applyUrl && (
                    <a href={m.applyUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1">
                      <Send className="w-3.5 h-3.5" /> Apply on employer site
                    </a>
                  )}
                </div>
                <button
                  onClick={() => actions.onRemove(m)}
                  className="text-xs font-semibold text-slate-400 hover:text-red-600 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
