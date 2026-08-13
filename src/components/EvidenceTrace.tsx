import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EvidenceRef, JdRef } from '../types';
import { Link2, X } from 'lucide-react';

function resolveEvidenceRef(careerJourney: any, ref: EvidenceRef): { label: string; snippet: string } | null {
  if (!careerJourney) return null;
  if (ref.type === 'role') {
    const role = (careerJourney.roles || []).find((r: any) => r.id === ref.id);
    if (!role) return null;
    return { label: `Role — ${role.title || role.id}`, snippet: `${role.organization || role.company || ''} ${role.dates || ''}`.trim() };
  }
  if (ref.type === 'deliverable') {
    for (const role of careerJourney.roles || []) {
      for (const initiative of role.initiatives || []) {
        const d = (initiative.deliverables || []).find((d: any) => d.id === ref.id);
        if (d) return { label: `Deliverable — ${role.title || role.id}`, snippet: d.description || d.impact || ref.id };
      }
    }
    return null;
  }
  if (ref.type === 'achievement') {
    const a = (careerJourney.achievements || []).find((a: any) => a.id === ref.id);
    if (!a) return null;
    return { label: 'Achievement', snippet: a.description || a.title || ref.id };
  }
  if (ref.type === 'skill') {
    const s = (careerJourney.skills_index || []).find((s: any) => s.id === ref.id);
    if (!s) return null;
    return { label: 'Skill', snippet: `${s.name}${s.proficiency ? ` — ${s.proficiency}` : ''}${s.years_experience ? `, ${s.years_experience}y` : ''}` };
  }
  if (ref.type === 'education') {
    const e = (careerJourney.education || []).find((e: any) => e.id === ref.id);
    if (!e) return null;
    return { label: 'Education', snippet: `${e.institution || ''} ${e.degree || ''}`.trim() || ref.id };
  }
  return null;
}

interface EvidenceTraceProps {
  evidenceRefs?: EvidenceRef[];
  jdRefs?: JdRef[];
  jdSegments?: { id: string; text: string }[];
  careerJourney: any;
}

/**
 * Small trust-building chip next to any AI claim (keyword match, fit gap,
 * hard-gate reason): click to see exactly which JD text and which real Career
 * Journey item the claim is based on. Renders nothing if there's nothing to
 * trace (e.g. the model left refs empty rather than inventing one).
 */
export default function EvidenceTrace({ evidenceRefs, jdRefs, jdSegments, careerJourney }: EvidenceTraceProps) {
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
          className="absolute z-50 left-0 top-full mt-1 w-80 rounded-lg border border-slate-200 bg-white shadow-xl p-3 text-left"
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
                  onClick={() => navigate('/edit')}
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
