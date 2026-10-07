import type { LeadMetric, SpotlightAccent } from '../../types/spotlight';
import { SPOTLIGHT_ACCENT_COLORS, splitFigures } from '../../lib/spotlightView';

/** What every Spotlight section can ask the page to do. */
export interface SpotlightActions {
  openEvidence: (target: import('../../lib/spotlightView').EvidenceTarget) => void;
  goToRole: (roleId: string) => void;
}

/** A sentence with its numbers set in bold. */
export function Figures({ text }: { text: string }) {
  return (
    <>
      {splitFigures(text).map((part, i) =>
        part.figure ? (
          <span key={i} className="sp-fig">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** The large figure of an outcome: "$4M", or "3 → 11" for a change. */
export function LeadFigure({ lead }: { lead: LeadMetric }) {
  const label = lead.parts.length === 2 ? `${lead.parts[0]} to ${lead.parts[1]}` : lead.value;
  return (
    <div className="sp-numeral" aria-label={label}>
      {lead.parts.length === 2 ? (
        <>
          {lead.parts[0]}
          <span className="sp-arrow" aria-hidden="true">
            →
          </span>
          {lead.parts[1]}
        </>
      ) : (
        lead.value
      )}
    </div>
  );
}

/** CSS variables for the chosen accent; spotlight.css picks the light or dark one per theme. */
export function accentStyle(accent: SpotlightAccent): Record<string, string> {
  const c = SPOTLIGHT_ACCENT_COLORS[accent] ?? SPOTLIGHT_ACCENT_COLORS.navy;
  return { '--sp-accent-light': c.light, '--sp-accent-dark': c.dark };
}

/**
 * Profile links are owner-typed ("linkedin.com/in/…"). Only http(s) is ever linked; anything
 * else gets https:// in front, so a "javascript:" value can't become a live link.
 */
export function externalHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, '')}`;
}

export function displayUrl(value: string): string {
  return value.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

export function Arrow() {
  return <span aria-hidden="true">→</span>;
}
