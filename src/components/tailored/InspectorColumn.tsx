import React, { useRef, useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { cn } from '../../lib/utils';

export const INSPECTOR_DEFAULT_WIDTH = 384;
const MIN_WIDTH = 320;
const MAX_WIDTH = 960;
/** Room the resume preview always keeps beside the column. */
const MIN_PREVIEW = 440;
const KEY_STEP = 32;

/**
 * The resume editor's right-hand column at xl+: resizable from a drag handle
 * on its left edge (or the arrow keys on the focused handle, double-click to
 * reset) and hideable to a slim rail, so the preview can take the full width.
 * Below xl it stacks under the preview at full width, with no handle or rail.
 */
export default function InspectorColumn({ width, onWidthChange, hidden, onHiddenChange, attention, children }: {
  width: number;
  onWidthChange: (width: number) => void;
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
  /** Items waiting on the candidate (edits to review + urgent claims), shown on the rail. */
  attention: number;
  children: React.ReactNode;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const clamp = (w: number) => {
    const row = handleRef.current?.parentElement?.clientWidth ?? 0;
    const max = row > 0 ? Math.min(MAX_WIDTH, row - MIN_PREVIEW) : MAX_WIDTH;
    return Math.round(Math.max(MIN_WIDTH, Math.min(Math.max(MIN_WIDTH, max), w)));
  };
  const shown = dragWidth ?? clamp(width);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = shown;
    let latest = startWidth;
    const previousSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    const move = (ev: PointerEvent) => {
      latest = clamp(startWidth + startX - ev.clientX);
      setDragWidth(latest);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.style.userSelect = previousSelect;
      setDragWidth(null);
      onWidthChange(latest);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') onWidthChange(clamp(shown + KEY_STEP));
    else if (e.key === 'ArrowRight') onWidthChange(clamp(shown - KEY_STEP));
    else if (e.key === 'Home') onWidthChange(INSPECTOR_DEFAULT_WIDTH);
    else return;
    e.preventDefault();
  };

  if (hidden) {
    return (
      <div ref={handleRef} className="hidden xl:block shrink-0 self-stretch pl-4">
        <button
          type="button"
          onClick={() => onHiddenChange(false)}
          title="Show the review panel"
          className="sticky top-0 flex flex-col items-center gap-2 w-10 py-3 rounded-lg border border-slate-200 bg-white shadow-sm text-slate-500 hover:text-slate-800 hover:bg-slate-50"
        >
          <PanelRightOpen className="w-4 h-4" />
          {attention > 0 && <span className="min-w-[20px] h-5 px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center">{attention}</span>}
          <span className="text-[11px] font-semibold [writing-mode:vertical-rl] rotate-180">Review panel</span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the review panel"
        aria-valuenow={shown}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onDoubleClick={() => onWidthChange(INSPECTOR_DEFAULT_WIDTH)}
        className="group hidden xl:flex shrink-0 self-stretch w-6 justify-center cursor-col-resize touch-none focus:outline-none"
      >
        <div className={cn('sticky top-0 h-[calc(100vh-9.5rem)] w-1 rounded-full transition-colors', dragWidth !== null ? 'bg-brand-500' : 'bg-transparent group-hover:bg-slate-300 group-focus-visible:bg-brand-400')} />
      </div>
      <aside
        style={{ '--inspector-w': `${shown}px` } as React.CSSProperties}
        className="w-full xl:w-[var(--inspector-w)] shrink-0 xl:sticky xl:top-0 xl:max-h-[calc(100vh-9.5rem)] xl:overflow-y-auto xl:pr-1 space-y-3"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Review</span>
          <button
            type="button"
            onClick={() => onHiddenChange(true)}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            title="Hide the review panel and give the resume the full width"
          >
            <PanelRightClose className="w-3.5 h-3.5" /> Hide
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
