import type { ComponentType, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Shared building blocks for the Jobs pages (Matches, Discover, Job Tracker):
 * a compact light header, a tab strip with counts, and a progress banner.
 */

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  meta,
  actions,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
          <Icon className="w-6 h-6 text-brand-600" />
          {title}
        </h1>
        <p className="mt-1 text-sm text-slate-500 max-w-2xl">{subtitle}</p>
        {meta && <div className="mt-1 text-xs text-brand-600 flex flex-wrap items-center gap-x-3 gap-y-1">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </section>
  );
}

export function ViewTabs<T extends string>({
  views,
  labels,
  counts,
  value,
  onChange,
  label,
}: {
  views: readonly T[];
  labels: Record<T, string>;
  counts?: Partial<Record<T, number>>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="border-b border-slate-200 px-4 sm:px-5">
      <nav className="flex gap-5 overflow-x-auto -mb-px" aria-label={label}>
        {views.map((v) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
              value === v ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {labels[v]}
            {counts?.[v] != null && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${value === v ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                {counts[v]}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** The filter/search/sort strip under the tabs. */
export function ListToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 px-4 sm:px-5 py-3 bg-slate-50/60 border-b border-slate-100">
      {children}
    </div>
  );
}

/** Single-select pill filter, e.g. fit verdict or pipeline stage. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  counts,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
            value === o ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {label(o)}
          {counts?.[o] != null && <span className="ml-1 opacity-70">{counts[o]}</span>}
        </button>
      ))}
    </div>
  );
}

export function SortSelect<T extends string>({ value, onChange, labels }: { value: T; onChange: (v: T) => void; labels: Record<T, string> }) {
  return (
    <label className="lg:ml-auto flex items-center gap-2 text-xs text-slate-500">
      Sort
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
      >
        {(Object.keys(labels) as T[]).map((s) => (
          <option key={s} value={s}>{labels[s]}</option>
        ))}
      </select>
    </label>
  );
}

export function ProgressBanner({ label, progress }: { label: string; progress: { done: number; total: number } }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
      <div className="flex items-center justify-between text-xs font-semibold text-brand-800">
        <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {label}</span>
        <span>{progress.done} of {progress.total}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-brand-100 overflow-hidden">
        <div className="h-full bg-brand-600 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
      </div>
    </div>
  );
}
