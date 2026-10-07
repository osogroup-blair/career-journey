import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { SpotlightAccent } from '../../types/spotlight';
import { EvidenceView, formatRoleDates } from '../../lib/spotlightView';
import { accentStyle, Arrow, Figures } from './SpotlightParts';

/**
 * "Show me the proof": the work behind an outcome, skill, capability or achievement,
 * grouped by role. Rendered in a portal because the page's container query makes it the
 * containing block for position: fixed; .sp-layer carries the page's theme across.
 */
export default function EvidenceDrawer({
  view,
  mode,
  accent,
  onClose,
  onGoToRole,
}: {
  view: EvidenceView;
  mode?: 'light' | 'dark';
  accent: SpotlightAccent;
  onClose: () => void;
  onGoToRole: (roleId: string) => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('button, a[href]')];
      if (!focusable.length) return;
      const [first, last] = [focusable[0], focusable[focusable.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      returnTo?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <div className="sp-layer" data-mode={mode} style={accentStyle(accent)}>
      <div className="sp-scrim" onClick={onClose} />
      <aside ref={panel} className="sp-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sp-drawer-head">
          <div>
            <div className="sp-eyebrow">{view.eyebrow}</div>
            <h2 id={titleId}>{view.title}</h2>
            <p className="sp-drawer-sub">{view.summary}</p>
          </div>
          <button ref={closeButton} type="button" className="sp-x" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="sp-drawer-body">
          {view.groups.length === 0 && <p className="sp-drawer-empty">Nothing on this page is linked to it yet.</p>}
          {view.groups.map((group) => (
            <div key={group.role?.id ?? 'unlinked'} className="sp-ev-role">
              <div className="sp-ev-rh">
                <b>{group.role ? `${group.role.title} · ${group.role.organization}` : 'Not tied to a role'}</b>
                {group.role && <span>{formatRoleDates(group.role)}</span>}
              </div>
              {group.items.map((item) =>
                item.type === 'deliverable' ? (
                  <div key={`d-${item.deliverable.id}`} className="sp-ev-item">
                    <div className="sp-ev-kind">Deliverable{item.initiative ? ` · ${item.initiative}` : ''}</div>
                    <p className="sp-what">{item.deliverable.description}</p>
                    {item.deliverable.impact && (
                      <p className="sp-impact">
                        <Figures text={item.deliverable.impact} />
                      </p>
                    )}
                  </div>
                ) : (
                  <div key={`a-${item.achievement.id}`} className="sp-ev-item">
                    <div className="sp-ev-kind">Achievement{item.achievement.category ? ` · ${item.achievement.category}` : ''}</div>
                    <p className="sp-what">{item.achievement.title}</p>
                    {item.achievement.description && (
                      <p className="sp-impact">
                        <Figures text={item.achievement.description} />
                      </p>
                    )}
                  </div>
                ),
              )}
              {group.role && (
                <button type="button" className="sp-link" onClick={() => onGoToRole(group.role!.id)}>
                  Go to this role <Arrow />
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
