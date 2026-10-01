import { useEffect, useState, type RefObject } from 'react';

/** Content height of one exported page: US Letter (11in) minus the 0.5in top/bottom margins page.pdf() uses (server/pdfRenderer.ts), at 96 CSS px per inch. */
export const PAGE_CONTENT_HEIGHT_PX = 960;

/** How close (px) a keep-with-next element must sit above a break to count as directly before it (heading/role-header margins). */
const ADJACENT_PX = 16;

export interface PageEstimate {
  /** Fractional page count, e.g. 1.4 = one full page plus 40% of a second. */
  pages: number;
  /** Where each new page starts, in unzoomed px from the top of the resume content. */
  breaks: number[];
}

interface Block {
  top: number;
  bottom: number;
  keepWhole: boolean;
  keepWithNext: boolean;
}

/**
 * Lays the preview out into pages the way Chromium's print does for the PDF:
 * an element with `break-inside: avoid` (bullets, role headers, Earlier and
 * Education rows) moves whole to the next page rather than splitting, and one
 * with `break-after: avoid` (section headings, role headers) moves along with
 * whatever follows it. It reads those rules from the templates' computed CSS,
 * so the preview can't drift from what the export does.
 */
export function paginate(blocks: Block[], contentHeight: number, pageHeight = PAGE_CONTENT_HEIGHT_PX): PageEstimate {
  const breaks: number[] = [];
  let pageStart = 0;
  while (contentHeight - pageStart > pageHeight + 0.5) {
    const boundary = pageStart + pageHeight;
    // The outermost unsplittable block crossing the page edge moves to the next page.
    const straddling = blocks.filter((b) => b.keepWhole && b.top > pageStart + 0.5 && b.top < boundary && b.bottom > boundary);
    let breakAt = straddling.length ? Math.min(...straddling.map((b) => b.top)) : boundary;
    // Anything that must stay with what follows (a heading, a role header) moves with it.
    for (let moved = true; moved; ) {
      moved = false;
      const before = blocks.find((b) => b.keepWithNext && b.top > pageStart + 0.5 && b.top < breakAt && b.bottom <= breakAt + 0.5 && breakAt - b.bottom <= ADJACENT_PX);
      if (before) {
        breakAt = before.top;
        moved = true;
      }
    }
    // A block taller than a page can't be kept whole; break at the page edge.
    if (breakAt <= pageStart + 0.5) breakAt = boundary;
    breaks.push(breakAt);
    pageStart = breakAt;
  }
  return { pages: breaks.length + (contentHeight - pageStart) / pageHeight, breaks };
}

/**
 * Page layout of the resume preview. The preview column is 7.5in wide, the
 * same as the PDF's content box, so line wrapping matches the export.
 *
 * `zoom` is the CSS zoom on the preview page; it's divided back out so the
 * result doesn't change as the column resizes. `contentKey` should change
 * whenever the resume content does (e.g. its fingerprint): reordering
 * bullets can move a break without changing the total height, which the
 * resize observer alone wouldn't notice.
 */
export function usePageEstimate(ref: RefObject<HTMLElement | null>, zoom: number, contentKey?: string): PageEstimate | null {
  const [estimate, setEstimate] = useState<PageEstimate | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured synchronously, not in requestAnimationFrame: rAF is paused in background tabs/panes.
    const measure = () => {
      const z = zoom || 1;
      const origin = el.getBoundingClientRect();
      const blocks: Block[] = [];
      el.querySelectorAll<HTMLElement>('*').forEach((node) => {
        const style = getComputedStyle(node);
        const keepWhole = style.breakInside === 'avoid';
        const keepWithNext = style.breakAfter === 'avoid';
        if (!keepWhole && !keepWithNext) return;
        const r = node.getBoundingClientRect();
        blocks.push({ top: (r.top - origin.top) / z, bottom: (r.bottom - origin.top) / z, keepWhole, keepWithNext });
      });
      setEstimate(paginate(blocks, origin.height / z));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, zoom, contentKey]);

  return estimate;
}
