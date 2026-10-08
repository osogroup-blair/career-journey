import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export type InspectorTone = 'good' | 'warn' | 'bad' | 'brand' | 'neutral';

const TONE: Record<InspectorTone, string> = {
  good: 'bg-green-50 text-green-700 border-green-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  bad: 'bg-red-50 text-red-700 border-red-200',
  brand: 'bg-brand-50 text-brand-700 border-brand-200',
  neutral: 'bg-slate-50 text-slate-500 border-slate-200',
};

/**
 * One section of the resume editor's right-hand column: a header that is the
 * accordion toggle and always shows the section's status (score, count, "All
 * clear"), so the collapsed column still reads as a dashboard. The column
 * opens one section at a time (TailoredApplicationStage owns which).
 */
export default function InspectorSection({ id, title, icon, summary, tone = 'neutral', open, onToggle, children }: {
  id: string;
  title: string;
  icon: React.ReactNode;
  summary?: string;
  tone?: InspectorTone;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-lg border bg-white shadow-sm', open ? 'border-slate-300' : 'border-slate-200')}>
      <button
        type="button"
        id={`${id}-header`}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={onToggle}
        className={cn('w-full flex items-center gap-2 px-4 py-3 text-left rounded-lg hover:bg-slate-50 transition-colors', open && 'rounded-b-none border-b border-slate-100')}
      >
        <span className="shrink-0 text-slate-500">{icon}</span>
        <span className="flex-1 min-w-0 text-sm font-bold text-slate-900 truncate">{title}</span>
        {summary && <span className={cn('shrink-0 text-[11px] font-semibold border rounded-full px-2 py-0.5', TONE[tone])}>{summary}</span>}
        <ChevronDown className={cn('w-4 h-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={`${id}-body`} role="region" aria-labelledby={`${id}-header`} className="px-4 pt-3 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}
