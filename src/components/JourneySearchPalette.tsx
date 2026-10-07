import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, CornerDownLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { SECTION_BY_ID, type SectionId, type SectionItem } from '../lib/journeySections';
import { searchAll } from '../lib/journeySearch';
import { Highlight } from './journey/Highlight';

/**
 * Cmd/Ctrl-K search across every Career Journey section. Results are grouped by
 * section; Enter opens the item in the Simple editor, and each group links to the
 * full filtered list.
 */
export function JourneySearchPalette({
  open,
  onClose,
  items,
  onOpenItem,
  onOpenSection,
}: {
  open: boolean;
  onClose: () => void;
  items: Record<SectionId, SectionItem[]>;
  onOpenItem: (section: SectionId, id: string) => void;
  onOpenSection: (section: SectionId, query: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => searchAll(items, query, 6), [items, query]) as ReturnType<typeof searchAll>;
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]) as SectionItem[];

  useEffect(() => {
    if (open) {
      setActive(0);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (item: SectionItem | undefined) => {
    if (!item) return;
    onOpenItem(item.section, item.id);
    onClose();
  };

  let index = -1;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[10vh]" onMouseDown={onClose} role="presentation">
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search your Career Journey"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, flat.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(flat[active]);
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Search roles, projects, skills, achievements…"
            className="flex-1 h-12 bg-transparent text-sm focus:outline-none"
            aria-label="Search everything"
          />
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" title="Close (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {!query.trim() && <p className="px-3 py-6 text-center text-xs text-slate-400">Type to search every section. Ids work too, e.g. SK-012.</p>}
          {query.trim() && groups.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">No matches for “{query}”.</p>}
          {groups.map((group) => (
            <div key={group.section} className="mb-2">
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{SECTION_BY_ID[group.section].label}</span>
                {group.total > group.items.length && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSection(group.section, query);
                      onClose();
                    }}
                    className="text-[11px] font-semibold text-brand-600 hover:text-brand-800"
                  >
                    All {group.total} →
                  </button>
                )}
              </div>
              {group.items.map((item) => {
                index += 1;
                const isActive = index === active;
                const i = index;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-active={isActive}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(item)}
                    className={cn('w-full text-left rounded-lg px-3 py-2 flex items-start gap-3', isActive ? 'bg-brand-50' : 'hover:bg-slate-50')}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        <Highlight text={item.title} query={query} />
                        <span className="ml-2 text-[11px] text-slate-400">{item.id}</span>
                      </div>
                      {item.subtitle && (
                        <div className="text-xs text-slate-500 truncate">
                          <Highlight text={item.subtitle} query={query} />
                        </div>
                      )}
                    </div>
                    {isActive && <CornerDownLeft className="w-3.5 h-3.5 text-brand-500 mt-1 shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
