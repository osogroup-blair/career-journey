import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Plus, X, AlertTriangle, Trash2 } from 'lucide-react';
import { Button, Input, Label, Textarea } from '../ui';
import { cn } from '../../lib/utils';

// Every field here commits on blur (or on select/toggle), never per keystroke: each
// commit rewrites the whole Career Journey document to storage.

export function EditField({
  label,
  value,
  onCommit,
  placeholder,
  textarea = false,
  rows = 3,
  className = '',
  list,
  hint,
}: {
  label?: string;
  value: string | undefined;
  onCommit: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
  className?: string;
  /** id of a <datalist> to suggest values from. */
  list?: string;
  hint?: string;
}) {
  const [local, setLocal] = useState(value || '');
  const fieldId = useId();

  useEffect(() => {
    setLocal(value || '');
  }, [value]);

  const commit = () => {
    if (local !== (value || '')) onCommit(local);
  };

  return (
    <div className={className}>
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      {textarea ? (
        <Textarea id={fieldId} value={local} placeholder={placeholder} rows={rows} onChange={(e) => setLocal(e.target.value)} onBlur={commit} />
      ) : (
        <Input
          id={fieldId}
          value={local}
          placeholder={placeholder}
          list={list}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      )}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onCommit,
  placeholder,
  className = '',
}: {
  label: string;
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <EditField
      label={label}
      value={value == null ? '' : String(value)}
      placeholder={placeholder}
      className={className}
      onCommit={(v) => {
        const trimmed = v.trim();
        if (trimmed === '') return onCommit(undefined);
        const n = Number(trimmed);
        if (!Number.isNaN(n)) onCommit(n);
      }}
    />
  );
}

export function SelectField({
  label,
  value,
  options,
  onCommit,
  allowEmpty = true,
  className = '',
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onCommit: (v: string) => void;
  allowEmpty?: boolean;
  className?: string;
}) {
  // A stored value outside the vocabulary is still shown rather than silently replaced.
  const all = value && !options.includes(value) ? [...options, value] : options;
  const fieldId = useId();
  return (
    <div className={className}>
      <Label htmlFor={fieldId}>{label}</Label>
      <select
        id={fieldId}
        value={value || ''}
        onChange={(e) => onCommit(e.target.value)}
        className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
      >
        {allowEmpty && <option value="">—</option>}
        {all.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckboxField({ label, checked, onCommit }: { label: string; checked: boolean; onCommit: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onCommit(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
      {label}
    </label>
  );
}

/** Editable list of free-text lines (signature outcomes, narrative anchors, education achievements). */
export function StringListField({
  label,
  values,
  onCommit,
  placeholder,
  addLabel = 'Add',
}: {
  label: string;
  values: string[] | undefined;
  onCommit: (v: string[]) => void;
  placeholder?: string;
  addLabel?: string;
}) {
  const list = Array.isArray(values) ? values : [];
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="mb-0">{label}</Label>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onCommit([...list, ''])}>
          <Plus className="w-3.5 h-3.5 mr-1" /> {addLabel}
        </Button>
      </div>
      <div className="space-y-2">
        {list.length === 0 && <p className="text-xs text-slate-400">None yet.</p>}
        {list.map((v, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <EditField
              className="flex-1"
              value={v}
              textarea
              rows={2}
              placeholder={placeholder}
              onCommit={(next) => onCommit(list.map((x, i) => (i === idx ? next : x)))}
            />
            <button
              type="button"
              onClick={() => onCommit(list.filter((_, i) => i !== idx))}
              className="mt-2 p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
              title="Remove"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface PickerOption {
  id: string;
  label: string;
  hint?: string;
}

/**
 * Searchable multi-select that stores ids and shows names. Ids with no matching option
 * (dangling references, or legacy free-text values) still render, flagged, so nothing
 * is hidden or silently dropped.
 */
export function EntityPicker({
  label,
  options,
  value,
  onChange,
  placeholder = 'Search to add…',
  onCreate,
  createLabel = 'Create',
  onChipClick,
}: {
  label?: string;
  options: PickerOption[];
  value: string[] | undefined;
  onChange: (ids: string[]) => void;
  placeholder?: string;
  /** If set, offers "Create '<query>'" when nothing matches exactly; returns the new id. */
  onCreate?: (label: string) => string | undefined;
  createLabel?: string;
  onChipClick?: (id: string) => void;
}) {
  const selected = Array.isArray(value) ? value : [];
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const matches = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const pool = options.filter((o) => !selected.includes(o.id));
    if (tokens.length === 0) return pool.slice(0, 8);
    return pool.filter((o) => tokens.every((t) => `${o.id} ${o.label} ${o.hint || ''}`.toLowerCase().includes(t))).slice(0, 8);
  }, [options, selected, query]);

  const exact = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());
  const canCreate = !!onCreate && query.trim().length > 1 && !exact;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const add = (id: string) => {
    if (!selected.includes(id)) onChange([...selected, id]);
    setQuery('');
    setActive(0);
  };

  const create = () => {
    const id = onCreate?.(query.trim());
    if (id) add(id);
  };

  const total = matches.length + (canCreate ? 1 : 0);

  return (
    <div ref={boxRef}>
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {selected.length === 0 && <span className="text-xs text-slate-400">None linked yet.</span>}
        {selected.map((id) => {
          const opt = byId.get(id);
          return (
            <span
              key={id}
              title={opt ? `${id}${opt.hint ? ` · ${opt.hint}` : ''}` : `${id} isn't in your Career Journey`}
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md',
                opt ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-800 border border-amber-200'
              )}
            >
              {!opt && <AlertTriangle className="w-3 h-3" />}
              {onChipClick && opt ? (
                <button type="button" className="hover:underline" onClick={() => onChipClick(id)}>
                  {opt.label}
                </button>
              ) : (
                opt?.label || id
              )}
              <button type="button" onClick={() => onChange(selected.filter((x) => x !== id))} className="text-slate-400 hover:text-red-600" title="Remove">
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
      </div>
      <div className="relative">
        <Input
          id={fieldId}
          value={query}
          placeholder={placeholder}
          className="h-9 text-sm"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(0, total - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (active < matches.length) add(matches[active].id);
              else if (canCreate) create();
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {open && total > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-64 overflow-auto">
            {matches.map((o, i) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(o.id)}
                className={cn('w-full text-left px-3 py-2 text-sm flex items-baseline gap-2', i === active ? 'bg-brand-50' : 'hover:bg-slate-50')}
              >
                <span className="font-medium text-slate-800 truncate">{o.label}</span>
                <span className="text-[11px] text-slate-400 shrink-0">{o.id}</span>
                {o.hint && <span className="text-[11px] text-slate-400 truncate">{o.hint}</span>}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={create}
                className={cn('w-full text-left px-3 py-2 text-sm text-brand-700 font-semibold border-t border-slate-100', active === matches.length ? 'bg-brand-50' : 'hover:bg-slate-50')}
              >
                <Plus className="w-3.5 h-3.5 inline mr-1" /> {createLabel} “{query.trim()}”
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** <datalist> of existing values, for free-text fields like category. */
export function Suggestions({ id, values }: { id: string; values: string[] }) {
  return (
    <datalist id={id}>
      {values.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}

export function DeleteButton({ label, confirmText, onConfirm }: { label: string; confirmText: string; onConfirm: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(confirmText)) onConfirm();
      }}
      className="text-sm font-semibold text-red-600 hover:text-red-800 flex items-center gap-1.5"
    >
      <Trash2 className="w-4 h-4" /> {label}
    </button>
  );
}
