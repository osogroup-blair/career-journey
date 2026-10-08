import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Pencil, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button, LoadingButton, Textarea } from '../ui';
import InspectorSection, { InspectorTone } from './InspectorSection';
import EvidenceTrace from '../EvidenceTrace';
import { cn } from '../../lib/utils';
import { EditState, editState } from '../../lib/resumeEditSuggestions';
import { GeneratedResume, ResumeAiScore, ResumeEditSuggestion } from '../../types';

/**
 * The scan → resume bridge: every recommended edit from the AI scan as a line
 * item showing where it goes, the before/after, which keywords it adds and
 * what backs it. Approve writes it into the resume as shown (or as reworded
 * with Edit); nothing changes until the candidate approves. Inferred edits
 * need a one-by-one confirm and are left out of "Approve all backed".
 */
export default function RecommendedEdits({ open: isOpen, onToggle, score, resume, tagline, careerJourney, isStale, isScoring, onScan, onApply, onDismiss }: {
  open: boolean;
  onToggle: () => void;
  score?: ResumeAiScore;
  resume: GeneratedResume;
  tagline: string;
  careerJourney: any;
  /** The resume changed since the scan. */
  isStale: boolean;
  isScoring: boolean;
  onScan: () => void;
  onApply: (ids: string[], texts?: Record<string, string>) => void;
  onDismiss: (id: string, dismissed: boolean) => void;
}) {
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [showHandled, setShowHandled] = useState(false);

  const scanButton = (label: string, variant: 'default' | 'outline' = 'default') => (
    <LoadingButton size="sm" variant={variant} className="w-full" onClick={onScan} isLoading={isScoring} loadingLabel="Scanning…">
      {variant === 'default' ? <Sparkles className="w-3.5 h-3.5 mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />} {label}
    </LoadingButton>
  );

  const section = (summary: string, tone: InspectorTone, body: any) => (
    <InspectorSection id="recommended-edits" title="Recommended edits" icon={<Sparkles className="w-4 h-4 text-brand-500" />} summary={summary} tone={tone} open={isOpen} onToggle={onToggle}>
      <div className="space-y-3">{body}</div>
    </InspectorSection>
  );
  const intro = <p className="text-[11px] text-slate-500">Lines the scan would add or change to lift your keyword match and ATS score. Nothing changes until you approve it.</p>;

  if (!score) {
    return section('Not scanned', 'neutral', (
      <>
        <p className="text-xs text-slate-600">Run a scan to get keyword and ATS fixes as line items you can approve straight into the resume.</p>
        {scanButton('Scan & recommend edits')}
        <p className="text-[11px] text-slate-400">Uses AI quota.</p>
      </>
    ));
  }

  if (!score.edits) {
    return section('Re-scan', 'warn', (
      <>
        <p className="text-xs text-slate-600">This scan is from before approvable edits existed. Re-scan to turn its advice into lines you can add.</p>
        {(score.suggestions || []).length > 0 && (
          <ul className="space-y-1.5 text-[11px] text-slate-500 max-h-48 overflow-auto">
            {(score.suggestions || []).map((s, i) => (
              <li key={i}><span className="font-semibold text-slate-700">{s.area}{s.keyword ? ` · ${s.keyword}` : ''}:</span> {s.suggestion}</li>
            ))}
          </ul>
        )}
        {scanButton('Re-scan for edits')}
      </>
    ));
  }

  const rows = score.edits.map((edit) => ({ edit, state: editState(edit, resume, tagline, careerJourney) }));
  const open = rows.filter((r) => r.state === 'ready' || r.state === 'outdated');
  const handled = rows.filter((r) => r.state === 'applied' || r.state === 'dismissed');
  const backedReady = open.filter((r) => r.state === 'ready' && r.edit.support === 'backed' && editing[r.edit.id] === undefined);
  const appliedCount = handled.filter((r) => r.state === 'applied').length;

  const approve = (edit: ResumeEditSuggestion) => {
    const text = editing[edit.id];
    onApply([edit.id], text !== undefined ? { [edit.id]: text } : undefined);
    setEditing(({ [edit.id]: _done, ...rest }) => rest);
  };

  const row = ({ edit, state }: { edit: ResumeEditSuggestion; state: EditState }) => {
    const inferred = edit.support === 'inferred';
    const draft = editing[edit.id];
    const isAdd = !edit.before;
    if (state === 'applied' || state === 'dismissed') {
      return (
        <li key={edit.id} className="flex items-center gap-2 text-[11px] text-slate-500 py-1">
          {state === 'applied' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <X className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          <span className="flex-1 min-w-0 truncate"><span className="font-semibold">{edit.label}</span> · {edit.lead ? `${edit.lead}: ` : ''}{edit.text}</span>
          {state === 'dismissed' && (
            <button type="button" className="font-semibold text-brand-600 hover:text-brand-800 shrink-0" onClick={() => onDismiss(edit.id, false)}>Restore</button>
          )}
        </li>
      );
    }
    return (
      <li key={edit.id} className={cn('border-l-4 pl-3 py-2', state === 'outdated' ? 'border-l-slate-200 opacity-60' : inferred ? 'border-l-amber-400' : 'border-l-green-500')}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold text-slate-800">{edit.label}</span>
          <span className={cn('text-[10px] font-semibold shrink-0', inferred ? 'text-amber-700' : 'text-green-700')}>
            {inferred ? 'Inferred · confirm it’s true' : 'Backed by your Career Journey'}
          </span>
        </div>
        {edit.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {edit.keywords.map((k) => <span key={k} className="text-[10px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded px-1.5 py-0.5">+ {k}</span>)}
          </div>
        )}
        {!isAdd && <p className="text-[11px] text-slate-400 line-through mt-1.5 line-clamp-2">{edit.before}</p>}
        {draft !== undefined ? (
          <Textarea className="mt-1.5 text-xs min-h-[72px]" value={draft} onChange={(e) => setEditing((d) => ({ ...d, [edit.id]: e.target.value }))} autoFocus />
        ) : (
          <p className="text-xs text-slate-800 mt-1">
            {isAdd && <span className="text-green-700 font-semibold">+ </span>}
            {edit.lead && <span className="font-semibold">{edit.lead}: </span>}
            {edit.text}
          </p>
        )}
        {(edit.why || edit.evidenceRefs.length > 0) && (
          <div className="flex items-start gap-1.5 mt-1">
            {edit.why && <p className="text-[11px] text-slate-500 flex-1">{edit.why}</p>}
            <EvidenceTrace evidenceRefs={edit.evidenceRefs} careerJourney={careerJourney} align="right" />
          </div>
        )}
        {state === 'outdated' ? (
          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500">
            <span className="flex-1">This line changed since the scan.</span>
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onDismiss(edit.id, true)}>Dismiss</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <Button size="sm" className="h-6 text-[10px]" onClick={() => approve(edit)} disabled={draft !== undefined && !draft.trim()} title={inferred ? 'Approving confirms this is true' : undefined}>
              <CheckCircle2 className="w-3 h-3 mr-1" /> {inferred ? 'It’s true, add it' : isAdd ? 'Add' : 'Approve'}
            </Button>
            {draft === undefined ? (
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setEditing((d) => ({ ...d, [edit.id]: edit.text }))}>
                <Pencil className="w-3 h-3 mr-1" /> Edit
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setEditing(({ [edit.id]: _gone, ...rest }) => rest)}>Cancel edit</Button>
            )}
            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-slate-500" onClick={() => onDismiss(edit.id, true)}>Dismiss</Button>
          </div>
        )}
      </li>
    );
  };

  const readyCount = open.filter((r) => r.state === 'ready').length;
  return section(readyCount > 0 ? `${readyCount} to review` : 'Done', readyCount > 0 ? 'brand' : 'good', (
    <>
      <div className="flex items-start gap-2">
        <div className="flex-1">{intro}</div>
        {backedReady.length > 1 && (
          <Button size="sm" className="h-7 text-[11px] shrink-0" onClick={() => onApply(backedReady.map((r) => r.edit.id))} title="Applies every edit backed by your Career Journey. Inferred ones stay for you to confirm.">
            Approve {backedReady.length} backed
          </Button>
        )}
      </div>

      {open.length > 0 ? (
        <ul className="space-y-2.5">{open.map(row)}</ul>
      ) : (
        <p className="text-xs text-slate-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          {score.edits.length === 0 ? 'The scan had no edits to recommend.' : 'All recommendations handled.'} Shape length and order in the preview: hover a bullet or role to move or remove it.
        </p>
      )}

      {handled.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <button type="button" className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700" onClick={() => setShowHandled((v) => !v)}>
            {showHandled ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {appliedCount} applied · {handled.length - appliedCount} dismissed
          </button>
          {showHandled && <ul className="mt-1">{handled.map(row)}</ul>}
        </div>
      )}

      {isStale && (
        <div className="pt-2 border-t border-slate-100 space-y-1.5">
          <p className="text-[11px] text-slate-500">The resume changed since this scan. Re-scan to check the new score and get fresh recommendations.</p>
          {scanButton('Re-scan', 'outline')}
        </div>
      )}
    </>
  ));
}
