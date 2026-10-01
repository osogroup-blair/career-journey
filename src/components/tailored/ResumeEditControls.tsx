import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsDownUp, ChevronsUpDown, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { ResumeRoleMode, ResumeSectionRef } from '../../types';

/**
 * Hover controls layered over the resume preview. Rendered by
 * ResumeTemplates.tsx only when the template isn't readOnly, so nothing here
 * ever reaches the print/PDF entry.
 */

export interface ResumeEditActions {
  /** Regenerate one section with an optional instruction ("Shorter", "Emphasize leadership"). */
  onRegenerateSection?: (section: ResumeSectionRef, instruction?: string) => void;
  isSectionBusy?: (section: ResumeSectionRef) => boolean;
  /** A role was condensed/removed/restored from the preview — keeps the job's build options in step for the next regenerate. */
  onRoleModeChange?: (roleId: string, mode: ResumeRoleMode) => void;
}

const QUICK_INSTRUCTIONS: Record<ResumeSectionRef['kind'], string[]> = {
  summary: ['Shorter', 'More technical', 'Emphasize leadership', 'Lead with the strongest metric'],
  skills: ['Fewer rows', 'Put JD terms first', 'More technical', 'Less tooling, more strategy'],
  role: ['Fewer bullets', 'Shorter bullets', 'More metrics', 'Emphasize leadership'],
};

function ToolButton({ title, onClick, disabled, children, tone = 'default' }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // don't steal focus/blur an in-progress inline edit
      onClick={onClick}
      className={`p-1 rounded text-slate-500 disabled:opacity-30 disabled:cursor-not-allowed ${tone === 'danger' ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-brand-700 hover:bg-brand-50'}`}
    >
      {children}
    </button>
  );
}

/**
 * Vertical strip that sits in the page's 0.5in side padding (the gutters), so
 * hovering never covers resume text: role/section controls on the left,
 * bullet and Earlier Experience controls on the right.
 */
function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-0.5 bg-white border border-slate-200 shadow-sm rounded-md px-0.5 py-0.5 font-sans ${className}`}>
      {children}
    </div>
  );
}

export function BulletToolbar({ index, count, onMove, onRemove }: { index: number; count: number; onMove: (delta: number) => void; onRemove: () => void }) {
  return (
    <Toolbar className="absolute -right-10 top-0 z-10 transition-opacity opacity-0 pointer-events-none group-hover/bullet:opacity-100 group-hover/bullet:pointer-events-auto group-hover/bullet:z-30 focus-within:opacity-100 focus-within:pointer-events-auto">
      <ToolButton title="Move bullet up" onClick={() => onMove(-1)} disabled={index === 0}><ArrowUp className="w-3 h-3" /></ToolButton>
      <ToolButton title="Move bullet down" onClick={() => onMove(1)} disabled={index === count - 1}><ArrowDown className="w-3 h-3" /></ToolButton>
      <ToolButton title="Delete bullet" tone="danger" onClick={onRemove}><Trash2 className="w-3 h-3" /></ToolButton>
    </Toolbar>
  );
}

/** Regenerate button + small popover for an instruction. Absolutely positioned by the caller's wrapper. */
export function RegenerateSection({ section, actions, label }: { section: ResumeSectionRef; actions?: ResumeEditActions; label: string }) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const busy = !!actions?.isSectionBusy?.(section);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!actions?.onRegenerateSection) return null;

  const submit = (text?: string) => {
    actions.onRegenerateSection!(section, (text ?? instruction).trim() || undefined);
    setOpen(false);
    setInstruction('');
  };

  return (
    <div ref={ref} className="relative font-sans">
      <ToolButton title={busy ? `Regenerating ${label}…` : `Regenerate ${label}`} onClick={() => setOpen((o) => !o)} disabled={busy}>
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
      </ToolButton>
      {open && (
        <div className="absolute left-full top-0 ml-2 w-72 bg-white border border-slate-200 rounded-lg shadow-lg p-3 z-30 text-left">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700">Regenerate {label}</span>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {QUICK_INSTRUCTIONS[section.kind].map((q) => (
              <button key={q} type="button" onClick={() => submit(q)} className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:border-brand-400 hover:text-brand-700">
                {q}
              </button>
            ))}
          </div>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Or say what to change (optional)"
            className="w-full text-xs border border-slate-200 rounded-md p-2 h-16 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <button type="button" onClick={() => submit()} className="mt-2 w-full text-xs font-semibold bg-brand-600 text-white rounded-md py-1.5 hover:bg-brand-700">
            Regenerate
          </button>
        </div>
      )}
    </div>
  );
}

/** Section-level hover toolbar (summary, skills) with just the regenerate control. */
export function SectionToolbar({ section, actions, label }: { section: ResumeSectionRef; actions?: ResumeEditActions; label: string }) {
  if (!actions?.onRegenerateSection) return null;
  const busy = !!actions.isSectionBusy?.(section);
  return (
    <Toolbar className={`absolute -left-10 top-0 z-20 transition-opacity ${busy ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover/section:opacity-100 group-hover/section:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'}`}>
      <RegenerateSection section={section} actions={actions} label={label} />
    </Toolbar>
  );
}

export function RoleToolbar({ roleId, index, count, actions, onMove, onAddBullet, onCondense, onRemove }: {
  roleId: string | null;
  index: number;
  count: number;
  actions?: ResumeEditActions;
  onMove: (delta: number) => void;
  onAddBullet: () => void;
  onCondense: () => void;
  onRemove: () => void;
}) {
  const section: ResumeSectionRef | null = roleId ? { kind: 'role', roleId } : null;
  const busy = !!(section && actions?.isSectionBusy?.(section));
  return (
    <Toolbar className={`absolute -left-10 top-0 z-20 transition-opacity ${busy ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover/role:opacity-100 group-hover/role:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'}`}>
      <ToolButton title="Move role up" onClick={() => onMove(-1)} disabled={index === 0}><ArrowUp className="w-3 h-3" /></ToolButton>
      <ToolButton title="Move role down" onClick={() => onMove(1)} disabled={index === count - 1}><ArrowDown className="w-3 h-3" /></ToolButton>
      <ToolButton title="Add a bullet" onClick={onAddBullet}><Plus className="w-3 h-3" /></ToolButton>
      {section && <RegenerateSection section={section} actions={actions} label="this role" />}
      <ToolButton title="Condense to one line under Earlier Experience" onClick={onCondense}><ChevronsDownUp className="w-3 h-3" /></ToolButton>
      <ToolButton title="Remove role from this resume" tone="danger" onClick={onRemove}><Trash2 className="w-3 h-3" /></ToolButton>
    </Toolbar>
  );
}

export function EarlierRowToolbar({ canRestore, canRewrite, busy, onRestore, onRewrite, onRemove }: {
  canRestore: boolean;
  canRewrite: boolean;
  busy: boolean;
  onRestore: () => void;
  onRewrite: () => void;
  onRemove: () => void;
}) {
  return (
    <Toolbar className={`absolute -right-10 top-0 z-20 transition-opacity ${busy ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover/earlier:opacity-100 group-hover/earlier:pointer-events-auto group-hover/earlier:z-30 focus-within:opacity-100 focus-within:pointer-events-auto'}`}>
      {canRestore ? (
        <ToolButton title="Restore as a full role" onClick={onRestore}><ChevronsUpDown className="w-3 h-3" /></ToolButton>
      ) : canRewrite ? (
        <ToolButton title={busy ? 'Writing this role…' : 'Write this role in full'} onClick={onRewrite} disabled={busy}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronsUpDown className="w-3 h-3" />}
        </ToolButton>
      ) : null}
      <ToolButton title="Remove from this resume" tone="danger" onClick={onRemove}><Trash2 className="w-3 h-3" /></ToolButton>
    </Toolbar>
  );
}
