import { useState } from 'react';
import type { SpotlightAchievement, SpotlightDeliverable, SpotlightRole, SpotlightSnapshot } from '../../types/spotlight';
import { careerArc, formatDuration, formatRoleDates } from '../../lib/spotlightView';
import { Figures, SpotlightActions } from './SpotlightParts';

/** Roles as a staircase on a timeline: each row starts where the role started, newest on top. */
export function CareerArc({ snapshot, now, actions }: { snapshot: SpotlightSnapshot; now: Date; actions: SpotlightActions }) {
  const arc = careerArc(snapshot, now);
  if (!arc) return null;
  let labelled = 0;
  return (
    <div className="sp-arc">
      <div className="sp-arc-axis" aria-hidden="true">
          {arc.ticks.map((t) => (
            <div
              key={t.year}
              className="sp-arc-tick"
              style={{ left: `${t.left}%` }}
              data-labelled={t.labelled ? (labelled++ % 2 ? 'odd' : 'even') : 'no'}
            >
              {t.labelled && <span>{t.year}</span>}
            </div>
          ))}
        <div className="sp-arc-tick" data-now="true" style={{ left: `${arc.nowLeft}%` }}>
          <span>Now</span>
        </div>
      </div>
      <ol className="sp-arc-rows">
          {arc.segments.map((s) => (
            <li key={s.roleId + s.title} className="sp-arc-row">
              <button
                type="button"
                aria-label={`${s.title}, ${s.organization}. Go to this role.`}
                className="sp-arc-seg"
                data-flip={s.flip}
                data-current={s.current}
                style={{ left: `${s.left}%`, width: `${s.width}%` }}
                onClick={() => actions.goToRole(s.roleId)}
              >
                <span className="sp-arc-label">
                  <b>{s.title}</b>
                  <span>{s.organization}</span>
                </span>
                <span className="sp-arc-bar" />
              </button>
            </li>
          ))}
      </ol>
    </div>
  );
}

/** The career as a list, newest first — the Technical and Classic skins' version of the arc. */
export function CareerLog({ snapshot, actions }: { snapshot: SpotlightSnapshot; actions: SpotlightActions }) {
  if (!snapshot.roles.length) return null;
  return (
    <ol className="sp-log">
      {snapshot.roles.map((r) => (
        <li key={r.id}>
          <button type="button" className="sp-log-row" data-current={r.current} onClick={() => actions.goToRole(r.id)}>
            <span className="sp-log-dates">{formatRoleDates(r)}</span>
            <span className="sp-log-role">
              <b>{r.title}</b>
              <span>{r.organization}</span>
            </span>
            <span className="sp-log-dur">{formatDuration(r.durationMonths)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function condensedLine(role: SpotlightRole, deliverables: SpotlightDeliverable[]): string {
  const first = deliverables.find((d) => d.id === role.highlightIds[0]);
  return first?.impact ?? role.description ?? deliverables[0]?.description ?? '';
}

export function RoleChapter({
  role,
  achievements,
  skillNames,
  flash,
  headingRef,
  actions,
}: {
  key?: string; // no @types/react: JSX doesn't strip `key` (see JobTracker.tsx)
  role: SpotlightRole;
  achievements: Map<string, SpotlightAchievement>;
  skillNames: Map<string, string>;
  flash: boolean;
  headingRef: (el: HTMLElement | null) => void;
  actions: SpotlightActions;
}) {
  const [open, setOpen] = useState(false);
  const deliverables = role.initiatives.flatMap((i) => i.deliverables.map((d) => ({ d, initiative: i.name })));
  const highlights = role.highlightIds.map((id) => deliverables.find((x) => x.d.id === id)!).filter(Boolean);
  const also = role.achievementIds.map((id) => achievements.get(id)).filter((a): a is SpotlightAchievement => !!a);
  const initiatives = role.initiatives.filter((i) => i.deliverables.length || i.description);
  const condensed = role.mode === 'condensed';
  const duration = formatDuration(role.durationMonths);

  const scope = role.scope.length > 0 && (
    <div className="sp-chips">
      {role.scope.map((s) => (
        <span key={s} className="sp-chip">
          {s}
        </span>
      ))}
    </div>
  );
  const alsoLine = also.length > 0 && (
    <p className="sp-also">
      Also:{' '}
      {also.map((a, i) => (
        <span key={a.id}>
          {i > 0 && ', '}
          <b>{a.title}</b>
        </span>
      ))}
      .
    </p>
  );
  const full = (
    <div className="sp-inits">
      {initiatives.map((i) => (
        <div key={i.id} className="sp-init">
          <h4>{i.name}</h4>
          {i.description && <p>{i.description}</p>}
          {i.deliverables.length > 0 && (
            <ul className="sp-dels">
              {i.deliverables.map((d) => (
                <li key={d.id}>
                  <p className="sp-what">{d.description}</p>
                  {d.impact && (
                    <p className="sp-impact">
                      <Figures text={d.impact} />
                      {d.achievementId && achievements.has(d.achievementId) && (
                        <span className="sp-ach-mark" title={achievements.get(d.achievementId)!.title}>
                          Achievement
                        </span>
                      )}
                    </p>
                  )}
                  {d.skillIds.some((id) => skillNames.has(id)) && (
                    <div className="sp-tags">
                      {d.skillIds
                        .filter((id) => skillNames.has(id))
                        .map((id) => (
                          <button key={id} type="button" className="sp-tag" onClick={() => actions.openEvidence({ kind: 'skill', id })}>
                            {skillNames.get(id)}
                          </button>
                        ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );

  const canExpand = condensed || initiatives.length > 0;
  const toggleLabel = condensed
    ? open
      ? 'Hide details'
      : 'Show details'
    : open
      ? 'Show highlights only'
      : `Show all ${initiatives.length} initiative${initiatives.length === 1 ? '' : 's'}`;

  return (
    <article className="sp-role" data-flash={flash} aria-label={`${role.title}, ${role.organization}`}>
      <div className="sp-role-side">
        <span className="sp-role-dates">{formatRoleDates(role)}</span>
        {duration && <span className="sp-muted">{duration}</span>}
        {role.location && <span className="sp-muted">{role.location}</span>}
      </div>
      <div>
        <h3 ref={headingRef} tabIndex={-1}>
          {role.title}
        </h3>
        <p className="sp-org">
          <b>{role.organization}</b>
          {role.descriptor && ` · ${role.descriptor}`}
        </p>
        {condensed ? (
          <>
            <p className="sp-condensed sp-collapse-alt" data-open={open}>
              <Figures text={condensedLine(role, deliverables.map((x) => x.d))} />
            </p>
            <div className="sp-collapse" data-open={open}>
              {scope}
              {role.description && <p className="sp-desc">{role.description}</p>}
              {full}
              {alsoLine}
            </div>
          </>
        ) : (
          <>
            {scope}
            {role.description && <p className="sp-desc">{role.description}</p>}
            <div className="sp-collapse-alt" data-open={open}>
              {highlights.length > 0 && (
                <ul className="sp-impacts">
                  {highlights.map(({ d, initiative }) => (
                    <li key={d.id}>
                      <Figures text={d.impact ?? d.description} />
                      {initiative && <span className="sp-ctx">{initiative}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {alsoLine}
            </div>
            <div className="sp-collapse" data-open={open}>
              {full}
              {alsoLine}
            </div>
          </>
        )}
        {canExpand && (
          <button type="button" className="sp-link sp-role-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            {toggleLabel}
          </button>
        )}
      </div>
    </article>
  );
}
