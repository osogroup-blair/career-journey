import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronsDownUp, ChevronsUpDown, Loader2, MoreVertical, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { ResumeRoleMode, ResumeSectionRef } from '../../types';

/**
 * Edit controls layered over the resume preview. Rendered by
 * ResumeTemplates.tsx only when the template isn't readOnly, so nothing here
 * ever reaches the print/PDF entry.
 *
 * Each bullet, role, section and Earlier Experience row gets one small handle
 * in the page's side gutter, revealed on hover. Clicking it opens a menu that
 * stays open until you pick something or click away, so no control depends on
 * holding a hover. Handles are one text line tall, so neighbouring handles
 * never overlap and a click can't land on the wrong row.
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

type HoverGroup = 'bullet' | 'role' | 'section' | 'earlier';

// Tailwind only generates classes it can see as literals, so each group's reveal classes are spelled out.
const REVEAL_ON_HOVER: Record<HoverGroup, string> = {
  bullet: 'group-hover/bullet:visible group-hover/bullet:opacity-100 group-hover/bullet:delay-0',
  role: 'group-hover/role:visible group-hover/role:opacity-100 group-hover/role:delay-0',
  section: 'group-hover/section:visible group-hover/section:opacity-100 group-hover/section:delay-0',
  earlier: 'group-hover/earlier:visible group-hover/earlier:opacity-100 group-hover/earlier:delay-0',
};

/**
 * Positions a handle in the gutter beside its owning element.
 * - The wrapper starts flush against the owner's edge and pads out to the
 *   handle, so the pointer stays inside the hover group on the way over.
 * - Hiding is delayed slightly, so a sloppy path doesn't lose it; hidden
 *   handles are `invisible`, so they never take clicks.
 * - It stays shown while focused, while its menu is open (data-open), or
 *   while `pinned` (the section is busy regenerating).
 */
function Gutter({ side, group, pinned, children }: { side: 'left' | 'right'; group: HoverGroup; pinned?: boolean; children: ReactNode }) {
  return (
    <div
      className={`absolute top-0 z-20 has-[[data-open=true]]:z-40 ${side === 'left' ? 'right-full pr-2.5' : 'left-full pl-2.5'} ${
        pinned
          ? 'visible opacity-100'
          : `invisible opacity-0 transition-[opacity,visibility] duration-150 delay-200 ${REVEAL_ON_HOVER[group]} focus-within:visible focus-within:opacity-100 has-[[data-open=true]]:visible has-[[data-open=true]]:opacity-100`
      }`}
    >
      {children}
    </div>
  );
}

interface MenuItem {
  label: string;
  icon: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Switches the menu to the regenerate panel instead of running an action. */
  opensRegenerate?: boolean;
}

/** Instruction chips + free text for a single-section regenerate. */
function RegeneratePanel({ section, label, onSubmit, onBack, onClose }: {
  section: ResumeSectionRef;
  label: string;
  onSubmit: (instruction?: string) => void;
  onBack?: () => void;
  onClose: () => void;
}) {
  const [instruction, setInstruction] = useState('');
  const submit = (text?: string) => onSubmit((text ?? instruction).trim() || undefined);
  return (
    <div className="w-72 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1 text-xs font-bold text-slate-700">
          {onBack && (
            <button type="button" onClick={onBack} className="text-slate-400 hover:text-slate-600 -ml-1 p-0.5" aria-label="Back to menu"><ArrowLeft className="w-3.5 h-3.5" /></button>
          )}
          Rewrite {label}
        </span>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {QUICK_INSTRUCTIONS[section.kind].map((q) => (
          <button key={q} type="button" onClick={() => submit(q)} className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-600 hover:border-brand-400 hover:text-brand-700">
            {q}
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder="Or say what to change (optional)"
        className="w-full text-xs border border-slate-200 rounded-md p-2 h-16 resize-none focus:outline-none focus:ring-1 focus:ring-brand-400"
      />
      <button type="button" onClick={() => submit()} className="mt-2 w-full text-xs font-semibold bg-brand-600 text-white rounded-md py-1.5 hover:bg-brand-700">
        Rewrite with AI
      </button>
    </div>
  );
}

/**
 * The gutter handle and its click-to-open menu. `opensTo` is the side the
 * menu grows toward (over the page content, away from the page edge).
 */
function HandleMenu({ title, icon, opensTo, items = [], regenerate, startWithRegenerate = false, busy = false }: {
  title: string;
  icon?: ReactNode;
  opensTo: 'left' | 'right';
  items?: (MenuItem | 'divider')[];
  regenerate?: { section: ResumeSectionRef; label: string; actions?: ResumeEditActions };
  startWithRegenerate?: boolean;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'regenerate'>(startWithRegenerate ? 'regenerate' : 'menu');
  const ref = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setView(startWithRegenerate ? 'regenerate' : 'menu');
  };

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} data-open={open} className="relative font-sans">
      <button
        type="button"
        title={busy ? `${title} (working…)` : title}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onMouseDown={(e) => e.preventDefault()} // don't blur an in-progress inline edit
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex items-center justify-center w-[18px] h-[18px] rounded border bg-white shadow-sm transition-colors disabled:cursor-wait ${
          open ? 'border-brand-400 text-brand-700 bg-brand-50' : 'border-slate-200 text-slate-500 hover:text-brand-700 hover:border-brand-300'
        }`}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : icon ?? <MoreVertical className="w-3 h-3" />}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-0 z-50 bg-white border border-slate-200 rounded-lg shadow-lg text-left ${opensTo === 'right' ? 'left-full ml-1.5' : 'right-full mr-1.5'}`}
        >
          {view === 'regenerate' && regenerate ? (
            <RegeneratePanel
              section={regenerate.section}
              label={regenerate.label}
              onBack={startWithRegenerate ? undefined : () => setView('menu')}
              onClose={close}
              onSubmit={(instruction) => {
                regenerate.actions?.onRegenerateSection?.(regenerate.section, instruction);
                close();
              }}
            />
          ) : (
            <ul className="w-52 py-1">
              {items.map((item, i) =>
                item === 'divider' ? (
                  <li key={`d${i}`} role="separator" className="my-1 border-t border-slate-100" />
                ) : (
                  <li key={item.label}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (item.opensRegenerate) return setView('regenerate');
                        item.onSelect?.();
                        close();
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed ${
                        item.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">{item.icon}</span>
                      {item.label}
                    </button>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const ico = 'w-3.5 h-3.5';

export function BulletToolbar({ index, count, onMove, onRemove }: { index: number; count: number; onMove: (delta: number) => void; onRemove: () => void }) {
  return (
    <Gutter side="right" group="bullet">
      <HandleMenu
        title="Bullet options"
        opensTo="left"
        items={[
          { label: 'Move up', icon: <ArrowUp className={ico} />, onSelect: () => onMove(-1), disabled: index === 0 },
          { label: 'Move down', icon: <ArrowDown className={ico} />, onSelect: () => onMove(1), disabled: index === count - 1 },
          'divider',
          { label: 'Delete bullet', icon: <Trash2 className={ico} />, onSelect: onRemove, danger: true },
        ]}
      />
    </Gutter>
  );
}

/** Section-level handle (summary, skills): opens straight into the regenerate panel. */
export function SectionToolbar({ section, actions, label }: { section: ResumeSectionRef; actions?: ResumeEditActions; label: string }) {
  if (!actions?.onRegenerateSection) return null;
  const busy = !!actions.isSectionBusy?.(section);
  return (
    <Gutter side="left" group="section" pinned={busy}>
      <HandleMenu
        title={`Rewrite ${label} with AI`}
        icon={<Sparkles className="w-3 h-3" />}
        opensTo="right"
        busy={busy}
        startWithRegenerate
        regenerate={{ section, label, actions }}
      />
    </Gutter>
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
  const canRegenerate = !!(section && actions?.onRegenerateSection);
  return (
    <Gutter side="left" group="role" pinned={busy}>
      <HandleMenu
        title="Role options"
        opensTo="right"
        busy={busy}
        regenerate={section ? { section, label: 'this role', actions } : undefined}
        items={[
          ...(canRegenerate ? [{ label: 'Rewrite with AI…', icon: <Sparkles className={ico} />, opensRegenerate: true } as MenuItem, 'divider' as const] : []),
          { label: 'Add a bullet', icon: <Plus className={ico} />, onSelect: onAddBullet },
          { label: 'Move role up', icon: <ArrowUp className={ico} />, onSelect: () => onMove(-1), disabled: index === 0 },
          { label: 'Move role down', icon: <ArrowDown className={ico} />, onSelect: () => onMove(1), disabled: index === count - 1 },
          'divider',
          { label: 'Condense to one line', icon: <ChevronsDownUp className={ico} />, onSelect: onCondense },
          { label: 'Remove from resume', icon: <Trash2 className={ico} />, onSelect: onRemove, danger: true },
        ]}
      />
    </Gutter>
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
    <Gutter side="right" group="earlier" pinned={busy}>
      <HandleMenu
        title="Earlier role options"
        opensTo="left"
        busy={busy}
        items={[
          ...(canRestore
            ? [{ label: 'Restore as a full role', icon: <ChevronsUpDown className={ico} />, onSelect: onRestore }]
            : canRewrite
              ? [{ label: 'Write this role in full', icon: <Sparkles className={ico} />, onSelect: onRewrite }]
              : []),
          { label: 'Remove from resume', icon: <Trash2 className={ico} />, onSelect: onRemove, danger: true },
        ]}
      />
    </Gutter>
  );
}
