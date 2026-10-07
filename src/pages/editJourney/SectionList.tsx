import React, { useEffect, useMemo, useRef } from 'react';
import { ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { Card, Pagination, SearchInput } from '../../components/ui';
import { cn } from '../../lib/utils';
import { facetValues, type SectionDef, type SectionItem } from '../../lib/journeySections';
import { searchItems } from '../../lib/journeySearch';
import { Highlight } from '../../components/journey/Highlight';
import { paginate, pageOfIndex } from '../../lib/pagination';
import { useEditor } from './EditorContext';

export const PAGE_SIZES = [10, 20, 50];

export interface ListState {
  query: string;
  page: number;
  pageSize: number;
  facets: Record<string, string>;
  attentionOnly: boolean;
  expandedId: string | null;
  flashId: string | null;
}

export function SectionList({
  section,
  items,
  state,
  onChange,
  renderEditor,
  actions,
}: {
  key?: string; // no @types/react: JSX doesn't strip `key` (see JobTracker.tsx)
  section: SectionDef;
  items: SectionItem[];
  state: ListState;
  /** Patch the list state (URL-backed). */
  onChange: (patch: Partial<ListState>) => void;
  renderEditor: (id: string) => React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { lookups } = useEditor();
  const { query, page, pageSize, facets, attentionOnly, expandedId, flashId } = state;

  const filtered = useMemo((): SectionItem[] => {
    let list = items;
    for (const [key, value] of Object.entries(facets)) if (value) list = list.filter((i) => (i.facets[key] || []).includes(value));
    if (attentionOnly) list = list.filter((i) => i.attention);
    list = searchItems(list, query);
    // Keep the open item visible even if an edit makes it stop matching the filters.
    if (expandedId && !list.some((i) => i.id === expandedId)) {
      const open = items.find((i) => i.id === expandedId);
      if (open) list = [open, ...list];
    }
    return list;
  }, [items, facets, attentionOnly, query, expandedId]) as SectionItem[];

  const paged = paginate(filtered, page, pageSize);
  const attentionCount = useMemo(() => items.filter((i) => i.attention).length, [items]) as number;

  // Jump to the page holding the open item when it's opened from elsewhere (deep link, search, "Add").
  useEffect(() => {
    if (!expandedId) return;
    const index = filtered.findIndex((i) => i.id === expandedId);
    if (index !== -1 && pageOfIndex(index, pageSize) !== paged.page) onChange({ page: pageOfIndex(index, pageSize) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => {
    if (!flashId) return;
    const el = rowRefs.current.get(flashId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [flashId, paged.page]);

  const facetLabel = (key: string, value: string) => (key === 'role' ? lookups.name(value) : value);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <SearchInput
            value={query}
            onValueChange={(q) => onChange({ query: q, page: 1 })}
            placeholder={`Search ${section.label.toLowerCase()}…`}
            className="flex-1 min-w-0"
            aria-label={`Search ${section.label}`}
          />
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        </div>
        {(section.facets.length > 0 || attentionCount > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {section.facets.map((f) => {
              const values = facetValues(items, f.key);
              if (values.length < 2 && !facets[f.key]) return null;
              return (
                <select
                  key={f.key}
                  value={facets[f.key] || ''}
                  onChange={(e) => onChange({ facets: { ...facets, [f.key]: e.target.value }, page: 1 })}
                  className={cn(
                    'h-8 max-w-[16rem] rounded-md border px-2 text-xs bg-white',
                    facets[f.key] ? 'border-brand-400 text-brand-800' : 'border-slate-200 text-slate-600'
                  )}
                  aria-label={`Filter by ${f.label}`}
                >
                  <option value="">Any {f.label.toLowerCase()}</option>
                  {values.map((v) => (
                    <option key={v.value} value={v.value}>
                      {facetLabel(f.key, v.value)} ({v.count})
                    </option>
                  ))}
                </select>
              );
            })}
            {attentionCount > 0 && (
              <button
                type="button"
                onClick={() => onChange({ attentionOnly: !attentionOnly, page: 1 })}
                className={cn(
                  'h-8 rounded-md border px-2.5 text-xs font-semibold flex items-center gap-1',
                  attentionOnly ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                <AlertCircle className="w-3.5 h-3.5" /> Needs attention ({attentionCount})
              </button>
            )}
            {(Object.values(facets).some(Boolean) || attentionOnly || query) && (
              <button type="button" onClick={() => onChange({ facets: {}, attentionOnly: false, query: '', page: 1 })} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-sm text-slate-500">
            {items.length === 0 ? `No ${section.label.toLowerCase()} yet.` : 'Nothing matches those filters.'}
          </Card>
        )}
        {paged.pageItems.map((item) => {
          const open = item.id === expandedId;
          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) rowRefs.current.set(item.id, el);
                else rowRefs.current.delete(item.id);
              }}
              className={cn(
                'rounded-xl border bg-white transition-shadow scroll-mt-24',
                open ? 'border-brand-300 shadow-sm' : 'border-slate-200 hover:border-slate-300',
                flashId === item.id && 'ring-2 ring-brand-400 ring-offset-2'
              )}
            >
              <button
                type="button"
                onClick={() => onChange({ expandedId: open ? null : item.id })}
                className="w-full text-left px-4 py-3 flex items-start gap-3"
                aria-expanded={open}
              >
                {open ? <ChevronDown className="w-4 h-4 mt-0.5 text-brand-600 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={cn('text-sm font-semibold', open ? 'text-brand-800' : 'text-slate-900')}>
                      <Highlight text={item.title} query={query} />
                    </span>
                    <span className="text-[11px] text-slate-400">
                      <Highlight text={item.id} query={query} />
                    </span>
                  </div>
                  {item.subtitle && (
                    <div className="text-xs text-slate-500 truncate">
                      <Highlight text={item.subtitle} query={query} />
                    </div>
                  )}
                </div>
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  {item.attention && (
                    <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5" title="Needs attention">
                      {item.attention}
                    </span>
                  )}
                  {item.badges.map((b) => (
                    <span key={b} className="text-[11px] font-medium text-slate-600 bg-slate-100 rounded px-1.5 py-0.5 max-w-[12rem] truncate">
                      {b}
                    </span>
                  ))}
                </div>
              </button>
              {open && <div className="px-4 sm:px-6 pb-6 pt-2 border-t border-slate-100">{renderEditor(item.id)}</div>}
            </div>
          );
        })}
      </div>

      <Pagination
        page={paged.page}
        totalPages={paged.totalPages}
        start={paged.start}
        end={paged.end}
        total={paged.total}
        noun={section.label.toLowerCase()}
        onPageChange={(p) => onChange({ page: p, expandedId: null })}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZES}
        onPageSizeChange={(size) => onChange({ pageSize: size, page: 1 })}
      />
    </div>
  );
}
