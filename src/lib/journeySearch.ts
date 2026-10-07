import type { SectionId, SectionItem } from './journeySections';

/**
 * Token-AND substring search over the editor's section items. At ~700 entities a
 * linear scan is instant, so there's no index library — every token must appear
 * somewhere in the item's haystack; hits in the title rank first.
 */

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function matchesTokens(item: SectionItem, tokens: string[]): boolean {
  return tokens.every((t) => item.text.includes(t));
}

function score(item: SectionItem, tokens: string[]): number {
  const title = item.title.toLowerCase();
  const id = item.id.toLowerCase();
  let s = 0;
  for (const t of tokens) {
    if (id === t) s += 100;
    if (title.startsWith(t)) s += 10;
    else if (title.includes(t)) s += 5;
    if (item.subtitle.toLowerCase().includes(t)) s += 1;
  }
  return s;
}

/** Filters by query, keeping the original order when the query is empty. */
export function searchItems(items: SectionItem[], query: string): SectionItem[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return items;
  return items
    .map((item, index) => ({ item, index, s: matchesTokens(item, tokens) ? score(item, tokens) : -1 }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .map((x) => x.item);
}

export interface SearchGroup {
  section: SectionId;
  total: number;
  items: SectionItem[];
}

/** Cross-section search for the global palette, grouped and capped per section. */
export function searchAll(itemsBySection: Record<SectionId, SectionItem[]>, query: string, perSection = 5): SearchGroup[] {
  if (tokenize(query).length === 0) return [];
  const groups: SearchGroup[] = [];
  for (const [section, items] of Object.entries(itemsBySection) as [SectionId, SectionItem[]][]) {
    const hits = searchItems(items, query);
    if (hits.length) groups.push({ section, total: hits.length, items: hits.slice(0, perSection) });
  }
  return groups;
}

/** Splits text into hit/non-hit runs for highlighting. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const tokens = tokenize(query);
  if (!text || tokens.length === 0) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const marks = new Array(text.length).fill(false);
  for (const t of tokens) {
    let from = 0;
    while (true) {
      const at = lower.indexOf(t, from);
      if (at === -1) break;
      for (let i = at; i < at + t.length; i++) marks[i] = true;
      from = at + t.length;
    }
  }
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: marks[i] });
  }
  return parts;
}
