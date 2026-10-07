/**
 * HTML job ad → plain text that keeps its structure: paragraphs, headings and
 * lists separated by blank lines, list items as "- " bullets on their own lines. The
 * structure matters downstream — segmentJdText (src/lib/jdSegments.ts) splits
 * on blank lines to build the JD segments Rating cites.
 *
 * `decodeEntitiesFirst`: Greenhouse and Lever deliver their content fields
 * entity-escaped ("&lt;div&gt;"), so those have to be decoded before tags can
 * be found. Normal markup (StillOpen's description_html) must NOT be decoded
 * first, or a literal "&lt;" in the ad's text would be read as a tag — its
 * entities are decoded after the tags are gone instead.
 */
export function htmlToText(html: string, { decodeEntitiesFirst = false }: { decodeEntitiesFirst?: boolean } = {}): string {
  let s = html;
  if (decodeEntitiesFirst) s = decodeEntities(s);
  s = s
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    // Bullets on consecutive lines; paragraphs, headings and whole lists separated by a blank line.
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/(p|div|ul|ol|h[1-6])>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  if (!decodeEntitiesFirst) s = decodeEntities(s);
  return s
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}
