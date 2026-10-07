/**
 * Deterministic, non-AI segmentation of raw JD text into paragraph/bullet
 * chunks with stable ids — the traceability anchor that lets a keyword or
 * fit-gap claim point back to the exact JD text it came from (EvidenceTrace).
 * Split on blank lines first; if that yields one giant blob (JDs pasted
 * without paragraph breaks), fall back to splitting on line breaks.
 *
 * Shared: the server runs it at parse time (/api/ai/parse), and promoteMatch
 * (src/store.ts) runs it when a scanned match skips straight to Parsed.
 */
export function segmentJdText(jdText: string): { id: string; text: string }[] {
  const byParagraph = jdText.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  const chunks = byParagraph.length > 3 ? byParagraph : jdText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return chunks.map((text, i) => ({ id: `jd-${i}`, text }));
}
