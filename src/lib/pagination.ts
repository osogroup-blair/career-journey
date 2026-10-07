/** Page maths for the editor lists. Pages are 1-based; an out-of-range page clamps to the last one (e.g. after deleting the only item on it). */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const startIndex = (current - 1) * pageSize;
  return {
    page: current,
    totalPages,
    pageItems: items.slice(startIndex, startIndex + pageSize),
    start: items.length === 0 ? 0 : startIndex + 1,
    end: Math.min(startIndex + pageSize, items.length),
    total: items.length,
  };
}

/** The page an item index lands on. */
export function pageOfIndex(index: number, pageSize: number) {
  return Math.floor(Math.max(0, index) / pageSize) + 1;
}
