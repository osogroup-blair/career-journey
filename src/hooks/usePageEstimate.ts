import { useEffect, useState, type RefObject } from 'react';

/** Content height of one exported page: US Letter (11in) minus the 0.5in top/bottom margins page.pdf() uses (server/pdfRenderer.ts), at 96 CSS px per inch. */
export const PAGE_CONTENT_HEIGHT_PX = 960;

/**
 * Estimated page count of the resume preview: the rendered template's height
 * divided by one page's content height. The preview column is 7.5in wide,
 * the same as the PDF's content box, so line wrapping matches. It runs
 * slightly low because print pagination also pushes break-inside-avoid
 * blocks onto the next page, so treat it as approximate.
 *
 * `zoom` is the CSS zoom on the preview page; it's divided back out so the
 * estimate doesn't change as the column resizes.
 */
export function usePageEstimate(ref: RefObject<HTMLElement | null>, zoom: number): number | null {
  const [heightPx, setHeightPx] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeightPx(el.getBoundingClientRect().height / (zoom || 1));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, zoom]);

  return heightPx === null ? null : heightPx / PAGE_CONTENT_HEIGHT_PX;
}
