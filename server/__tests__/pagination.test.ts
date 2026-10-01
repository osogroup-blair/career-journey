import { describe, it, expect } from 'vitest';
import { paginate } from '../../src/hooks/usePageEstimate';

const PAGE = 100;
const bullet = (top: number, bottom: number) => ({ top, bottom, keepWhole: true, keepWithNext: false });
const heading = (top: number, bottom: number) => ({ top, bottom, keepWhole: false, keepWithNext: true });
const roleHeader = (top: number, bottom: number) => ({ top, bottom, keepWhole: true, keepWithNext: true });

describe('paginate (preview page breaks mirror the PDF print rules)', () => {
  it('fits on one page with no breaks', () => {
    expect(paginate([bullet(10, 40)], 80, PAGE)).toEqual({ pages: 0.8, breaks: [] });
  });

  it('breaks at the page edge when nothing there must stay whole', () => {
    expect(paginate([], 150, PAGE).breaks).toEqual([100]);
  });

  it('moves a bullet that crosses the page edge to the next page whole', () => {
    expect(paginate([bullet(60, 90), bullet(92, 120)], 150, PAGE).breaks).toEqual([92]);
  });

  it('never leaves a section heading or role header alone at the bottom of a page', () => {
    // Heading + role header sit at the bottom; the first bullet crosses the edge.
    const blocks = [heading(70, 78), roleHeader(84, 94), bullet(98, 130), bullet(132, 160)];
    expect(paginate(blocks, 170, PAGE).breaks).toEqual([70]);
  });

  it('keeps a heading with content that starts right after the page edge', () => {
    expect(paginate([heading(88, 96), bullet(100, 120)], 150, PAGE).breaks).toEqual([88]);
  });

  it('still splits a role between bullets rather than moving the whole role', () => {
    const blocks = [roleHeader(20, 30), bullet(34, 60), bullet(62, 88), bullet(90, 116), bullet(118, 140)];
    expect(paginate(blocks, 150, PAGE).breaks).toEqual([90]);
  });

  it('breaks at the edge when an unsplittable block is taller than a page', () => {
    expect(paginate([bullet(0, 250)], 250, PAGE).breaks).toEqual([100, 200]);
  });

  it('reports fractional pages from the last break', () => {
    expect(paginate([bullet(92, 120)], 150, PAGE).pages).toBeCloseTo(1 + 58 / PAGE);
  });
});
