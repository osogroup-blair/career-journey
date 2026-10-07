import React from 'react';
import { Badge } from './ui';
import type { JobMatch, MatchSource } from '../types';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export const SOURCE_LABEL: Record<MatchSource, string> = {
  'manual-paste': 'Pasted',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  stillopen: 'StillOpen',
};

export const VERDICT_BADGE: Record<string, 'success' | 'warning' | 'destructive'> = {
  PASS: 'success',
  BORDERLINE: 'warning',
  SKIP: 'destructive',
};

export const GATE_BADGE: Record<string, 'success' | 'warning' | 'destructive'> = {
  'CLEAR TO APPLY': 'success',
  'VERIFY FIRST': 'warning',
  'LIKELY AUTO-REJECT': 'destructive',
};

export function MatchVerdictBadges({ match }: { match: Pick<JobMatch, 'verdict' | 'hardGateRisk'> }) {
  if (!match.verdict && !match.hardGateRisk) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {match.verdict && <Badge variant={VERDICT_BADGE[match.verdict] || 'default'}>{match.verdict}</Badge>}
      {match.hardGateRisk && <Badge variant={GATE_BADGE[match.hardGateRisk] || 'default'}>{match.hardGateRisk}</Badge>}
    </div>
  );
}

/**
 * The light-scan result a job was promoted from (Matches / Discover), shown on
 * the job's Intake overview so the triage reasoning isn't lost once the job is
 * in the pipeline. It's the quick scan's view — Rating's full fit analysis is
 * the one to trust once it has run.
 */
export function MatchSummaryCard({ match }: { match: JobMatch }) {
  const scannedOn = new Date(match.updatedAt || match.createdAt).toLocaleDateString();
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <MatchVerdictBadges match={match} />
          <p className="text-xs text-slate-500">
            Quick scan from {match.source === 'stillopen' ? 'Discover' : 'Matches'} · {SOURCE_LABEL[match.source]} · {scannedOn}
          </p>
        </div>
        {match.matchScore != null && (
          <div className="text-right shrink-0">
            <div className="text-3xl font-extrabold text-brand-700 leading-none">{match.matchScore}</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-1">Match score</div>
          </div>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {match.leadWith && match.leadWith.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Lead with</p>
            <ul className="space-y-1">
              {match.leadWith.map((l, i) => (
                <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {match.topGaps && match.topGaps.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Top gaps</p>
            <ul className="space-y-1">
              {match.topGaps.map((g, i) => (
                <li key={i} className="text-xs text-slate-700 flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
