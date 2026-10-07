import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '../ui';
import { cn } from '../../lib/utils';
import { CLAIM_KIND_LABELS, ClaimFlag, ClaimLocation } from '../../lib/resumeClaims';
import { GeneratedResume, ResumeSectionRef } from '../../types';

export interface ClaimActions {
  onKeep: (flag: ClaimFlag) => void;
  /** Null when the flagged item can't simply be removed (the summary, a title). */
  removeLabel: (flag: ClaimFlag) => string | null;
  onRemove: (flag: ClaimFlag) => void;
  /** The section an AI rewrite would redo, or null where there's none (an outcome). */
  rewriteSection: (flag: ClaimFlag) => ResumeSectionRef | null;
  onRewrite: (flag: ClaimFlag) => void;
  isRewriting: (flag: ClaimFlag) => boolean;
}

export function claimLocationLabel(location: ClaimLocation, resume: GeneratedResume): string {
  switch (location.section) {
    case 'summary': return 'Summary';
    case 'skills': return `Skills · ${resume.skills?.[location.row]?.category || `row ${location.row + 1}`}`;
    case 'outcome': return `Selected Outcomes · ${location.index + 1}`;
    case 'title': return `${resume.experience?.[location.roleIndex]?.company || 'Role'} · title`;
    case 'narrative': return `${resume.experience?.[location.roleIndex]?.company || 'Role'} · scope paragraph`;
    case 'bullet': return `${resume.experience?.[location.roleIndex]?.company || 'Role'} · bullet ${location.bulletIndex + 1}`;
  }
}

const SEVERITY_STYLE: Record<ClaimFlag['severity'], string> = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-500',
  low: 'border-l-slate-300',
};

/** Shows `text` with the first occurrence of `detail` highlighted (case-insensitive, punctuation-tolerant). */
function Highlighted({ text, detail }: { text: string; detail: string }) {
  const words = detail.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const match = words.length ? new RegExp(words.join('[\\s\\W]+'), 'i').exec(text) : null;
  if (!match) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.index)}
      <mark className="bg-amber-200/70 rounded-sm px-0.5">{match[0]}</mark>
      {text.slice(match.index + match[0].length)}
    </>
  );
}

/**
 * The Claims panel beside the resume preview: every open honesty flag from
 * flagResumeClaims, worst first, each with Keep (stop flagging it), Remove
 * (drop the item) and Rewrite (AI-redo its section with a targeted
 * instruction). Low-severity flags collapse behind a toggle.
 */
export default function ClaimReviewPanel({ flags, resume, actions, keptCount }: {
  flags: ClaimFlag[];
  resume: GeneratedResume;
  actions: ClaimActions;
  keptCount: number;
}) {
  const [showLow, setShowLow] = useState(false);
  const main = flags.filter((f) => f.severity !== 'low');
  const low = flags.filter((f) => f.severity === 'low');

  if (flags.length === 0) {
    return (
      <Card>
        <CardContent className="py-4 flex items-start gap-2 text-sm text-emerald-800">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            No claims to review: every number is in your Career Journey and nothing is copied from the JD.
            {keptCount > 0 && <span className="text-slate-500"> ({keptCount} kept by you.)</span>}
          </span>
        </CardContent>
      </Card>
    );
  }

  const row = (flag: ClaimFlag) => {
    const removeLabel = actions.removeLabel(flag);
    const section = actions.rewriteSection(flag);
    const busy = actions.isRewriting(flag);
    return (
      <li key={flag.key} className={cn('border-l-4 pl-3 py-2', SEVERITY_STYLE[flag.severity])}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs font-bold text-slate-800">{CLAIM_KIND_LABELS[flag.kind]}</span>
          <span className="text-[10px] text-slate-400 shrink-0">{claimLocationLabel(flag.location, resume)}</span>
        </div>
        <p className="text-[11px] text-slate-600 mt-0.5">{flag.message}</p>
        <p className="text-[11px] text-slate-500 mt-1 line-clamp-3 italic"><Highlighted text={flag.text} detail={flag.detail} /></p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => actions.onKeep(flag)} title="It's accurate. Stop flagging it.">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Keep
          </Button>
          {removeLabel && (
            <Button size="sm" variant="outline" className="h-6 text-[10px] text-red-700" onClick={() => actions.onRemove(flag)}>{removeLabel}</Button>
          )}
          {section && (
            <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={busy} onClick={() => actions.onRewrite(flag)} title="Ask the AI to redo this section without the problem">
              {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null} Rewrite
            </Button>
          )}
        </div>
      </li>
    );
  };

  return (
    <Card className="border-amber-200">
      <CardHeader className="border-b pb-3">
        <CardTitle className="text-base flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-amber-600" /> Claims to review
          <span className="text-xs font-normal text-slate-500">({flags.length})</span>
        </CardTitle>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Things the AI wrote that your Career Journey doesn't back up, or that echo the JD word for word. You decide: keep what's true, remove or rewrite the rest.
          {keptCount > 0 && ` ${keptCount} kept by you.`}
        </p>
      </CardHeader>
      <CardContent className="pt-3">
        {main.length > 0 && <ul className="space-y-2">{main.map(row)}</ul>}
        {low.length > 0 && (
          <div className={cn(main.length > 0 && 'mt-3 pt-2 border-t border-slate-100')}>
            <button type="button" className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700" onClick={() => setShowLow((v) => !v)}>
              {showLow ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {low.length} lower-priority {low.length === 1 ? 'check' : 'checks'} (reframed titles, uncited bullets)
            </button>
            {showLow && <ul className="space-y-2 mt-2">{low.map(row)}</ul>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
