import { ComponentType, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLocalPreference } from '../../hooks/useLocalPreference';

/** A collapsible Dashboard band. When collapsed it keeps a one-line summary so the numbers stay glanceable. */
export default function DashboardSection({
  id,
  title,
  icon: Icon,
  summary,
  children,
}: {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  /** Shown in the header only while collapsed. */
  summary?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useLocalPreference(`dashboard.section.${id}.open`, true);
  const bodyId = `dashboard-section-${id}`;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="group flex w-full items-center gap-2 py-1 text-left"
      >
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        <Icon className="h-4 w-4 shrink-0 text-brand-600" />
        <h2 className="shrink-0 text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-slate-800 transition-colors">
          {title}
        </h2>
        {!open && summary && <span className="min-w-0 truncate text-xs text-slate-500">· {summary}</span>}
        <span className="mx-2 h-px min-w-4 flex-1 bg-slate-200" />
        <span className="shrink-0 text-xs font-semibold text-slate-400 group-hover:text-brand-600 transition-colors">
          {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open && (
        <div id={bodyId} className="mt-3 space-y-6">
          {children}
        </div>
      )}
    </section>
  );
}
