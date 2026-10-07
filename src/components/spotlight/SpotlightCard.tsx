import type { SpotlightSnapshot } from '../../types/spotlight';
import { accentStyle, LeadFigure } from './SpotlightParts';
import { skinInfo } from '../../lib/spotlightSkins';
import './spotlight.css';
import './spotlight-skins.css';

/**
 * The 1200×630 link-preview image (Open Graph), screenshotted by server/pdfRenderer.ts when
 * a page is published. Shows what a hiring manager should take from a Slack or LinkedIn
 * unfurl in one glance: who, what level, and the strongest result.
 */
export default function SpotlightCard({ snapshot, address }: { snapshot: SpotlightSnapshot; address?: string }) {
  const { person, glance } = snapshot;
  const outcome = snapshot.outcomes.find((o) => o.lead) ?? null;
  return (
    <div className="sp sp-card" data-skin={skinInfo(snapshot.style.skin).id} data-mode="light" data-solo={!outcome?.lead} style={accentStyle(snapshot.style.accent)}>
      <div className="sp-card-main">
        {glance.current && (
          <div className="sp-eyebrow">
            {glance.current.title} · {glance.current.organization}
          </div>
        )}
        <div className="sp-card-name">{person.name}</div>
        {person.headline && <div className="sp-card-headline">{person.headline}</div>}
      </div>
      {outcome?.lead && (
        <div className="sp-card-outcome">
          <LeadFigure lead={outcome.lead} />
          <p>{outcome.caption || outcome.text}</p>
        </div>
      )}
      <div className="sp-card-foot">
        <span>{address}</span>
        <span>{glance.careerStartYear ? `Working since ${glance.careerStartYear}` : ''}</span>
      </div>
    </div>
  );
}
