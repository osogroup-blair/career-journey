import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EvidenceRef, JdRef } from '../types';
import { Link2, X } from 'lucide-react';
import { editPathFor } from '../lib/journeySections';
import { resolveEvidenceRef } from '../lib/evidenceRefs';

interface EvidenceTraceProps {
  evidenceRefs?: EvidenceRef[];
  jdRefs?: JdRef[];
  jdSegments?: { id: string; text: string }[];
  careerJourney: any;
  /** Which edge the popover lines up with; 'right' for chips near the right of a narrow container. */
  align?: 'left' | 'right';
}

/**
 * Small trust-building chip next to any AI claim (keyword match, fit gap,
 * hard-gate reason): click to see exactly which JD text and which real Career
 * Journey item the claim is based on. Renders nothing if there's nothing to
 * trace (e.g. the model left refs empty rather than inventing one).
 */
export default function EvidenceTrace({ evidenceRefs, jdRefs, jdSegments, careerJourney, align = 'left' }: EvidenceTraceProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const resolvedEvidence = (evidenceRefs || [])
    .map((ref) => ({ ref, resolved: resolveEvidenceRef(careerJourney, ref) }))
    .filter((r) => r.resolved);
  const resolvedJd = (jdRefs || [])
    .map((ref) => (jdSegments || []).find((s) => s.id === ref.segmentId))
    .filter(Boolean) as { id: string; text: string }[];

  if (resolvedEvidence.length === 0 && resolvedJd.length === 0) return null;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 border border-brand-100 rounded px-1.5 py-0.5 transition-colors"
        title="Show traceability"
      >
        <Link2 className="w-2.5 h-2.5" /> trace
      </button>
      {open && (
        <div
          className={`absolute z-50 ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 w-80 max-w-[85vw] rounded-lg border border-slate-200 bg-white shadow-xl p-3 text-left`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Traceability</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {resolvedJd.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">From the job description</div>
              {resolvedJd.map((seg) => (
                <p key={seg.id} className="text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded p-2 mb-1 leading-relaxed">
                  {seg.text}
                </p>
              ))}
            </div>
          )}
          {resolvedEvidence.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">From your Career Journey</div>
              {resolvedEvidence.map(({ ref, resolved }) => (
                <button
                  key={`${ref.type}-${ref.id}`}
                  onClick={() => navigate(editPathFor(careerJourney, ref.type, ref.id))}
                  className="w-full text-left text-xs bg-emerald-50 border border-emerald-100 rounded p-2 mb-1 leading-relaxed hover:bg-emerald-100 transition-colors"
                >
                  <span className="font-bold text-emerald-800">{resolved!.label}</span>
                  <span className="block text-emerald-900/80 mt-0.5">{resolved!.snippet}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
