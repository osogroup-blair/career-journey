import { ReactNode, useState } from 'react';
import type { SpotlightSnapshot } from '../../types/spotlight';
import { formatMonth, glanceRows, skillGroups } from '../../lib/spotlightView';
import { Arrow, displayUrl, externalHref, Figures, LeadFigure, SpotlightActions } from './SpotlightParts';

export function SectionHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="sp-sec-head">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

const AVAILABILITY_LABEL = { open_to_work: 'Open to work', open_to_select: 'Open to select opportunities' } as const;

/**
 * Fetches the PDF and saves it, so a failure (no Chromium on the server, rate limit) shows a
 * message here instead of navigating to an error. The address only exists in the script,
 * not in the markup, which keeps naive scrapers off the expensive render.
 */
function DownloadPdf({ url, name }: { url: string; name: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');
  const download = async () => {
    setState('working');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const href = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = href;
      a.download = `${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Career'}-Spotlight.pdf`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setState('idle');
    } catch {
      setState('failed');
    }
  };
  return (
    <>
      <button type="button" className="sp-btn sp-ghost" onClick={download} disabled={state === 'working'}>
        {state === 'working' ? 'Preparing PDF…' : 'Download PDF'}
      </button>
      {state === 'failed' && (
        <span className="sp-data" role="status">
          The PDF isn't available right now. You can print this page instead.
        </span>
      )}
    </>
  );
}

export function Hero({ snapshot, onContact, pdfUrl }: { snapshot: SpotlightSnapshot; onContact: (() => void) | null; pdfUrl?: string }) {
  const { person, glance, contact } = snapshot;
  const rows = glanceRows(snapshot);
  return (
    <header className="sp-hero">
      <div className="sp-wrap sp-hero-grid">
        <div>
          {glance.current && (
            <div className="sp-eyebrow">
              {glance.current.title} · {glance.current.organization}
            </div>
          )}
          <h1>{person.name || 'Your name'}</h1>
          {person.headline && <p className="sp-tagline">{person.headline}</p>}
          {person.summary && <p className="sp-summary">{person.summary}</p>}
          <div className="sp-meta">
            {person.availability && <span className="sp-status">{AVAILABILITY_LABEL[person.availability]}</span>}
            {person.location && <span>{person.location}</span>}
            {person.workPreference && <span>{person.workPreference}</span>}
          </div>
          {(onContact || contact.linkedin || pdfUrl) && (
            <div className="sp-cta">
              {onContact && (
                <button type="button" className="sp-btn" onClick={onContact}>
                  Get in touch
                </button>
              )}
              {contact.linkedin && (
                <a className="sp-btn sp-ghost" href={externalHref(contact.linkedin)} target="_blank" rel="noopener noreferrer">
                  LinkedIn ↗
                </a>
              )}
              {pdfUrl && <DownloadPdf url={pdfUrl} name={person.name} />}
            </div>
          )}
        </div>
        {rows.length > 0 && (
          <aside className="sp-glance" aria-label="At a glance">
            <div className="sp-eyebrow">At a glance</div>
            <dl>
              {rows.map((r) => (
                <div key={r.label} className="sp-glance-row">
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        )}
      </div>
    </header>
  );
}

export function Outcomes({ snapshot, actions }: { snapshot: SpotlightSnapshot; actions: SpotlightActions }) {
  return (
    <div className="sp-outcomes">
      <div className="sp-wrap">
        <div className="sp-outcome-row" style={{ '--sp-n': snapshot.outcomes.length } as Record<string, number>}>
          {snapshot.outcomes.map((o, index) => (
            <article key={o.text} className="sp-outcome">
              {o.lead ? (
                <>
                  <LeadFigure lead={o.lead} />
                  {o.caption && <div className="sp-unit">{o.caption}</div>}
                  <p>{o.text}</p>
                </>
              ) : (
                <p className="sp-numeral-text">{o.text}</p>
              )}
              {o.evidence.length > 0 && (
                <button type="button" className="sp-link" onClick={() => actions.openEvidence({ kind: 'outcome', index })}>
                  See the evidence <Arrow />
                </button>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Achievements({ snapshot, actions }: { snapshot: SpotlightSnapshot; actions: SpotlightActions }) {
  const [category, setCategory] = useState('All');
  const [showAll, setShowAll] = useState(false);
  const byId = new Map(snapshot.achievements.items.map((a) => [a.id, a]));
  const featured = snapshot.achievements.featuredIds.map((id) => byId.get(id)!).filter(Boolean);
  const pool = showAll || !featured.length ? snapshot.achievements.items : featured;
  const categories = ['All', ...new Set(pool.map((a) => a.category).filter((c): c is string => !!c))];
  const shown = pool.filter((a) => category === 'All' || a.category === category);
  const orgOf = new Map(snapshot.roles.map((r) => [r.id, r.organization]));

  return (
    <>
      {categories.length > 2 && (
        <div className="sp-filters" role="group" aria-label="Filter by category">
          {categories.map((c) => (
            <button key={c} type="button" className="sp-filter" aria-pressed={c === category} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="sp-ach-grid">
        {shown.map((a) => (
          <article key={a.id} className="sp-ach">
            {a.category && <div className="sp-eyebrow">{a.category}</div>}
            <h3>{a.title}</h3>
            {a.description && (
              <p>
                <Figures text={a.description} />
              </p>
            )}
            <div className="sp-ach-foot">
              <span className="sp-data">{a.roleIds.map((r) => orgOf.get(r)).filter(Boolean)[0] ?? ''}</span>
              {(a.deliverableId || a.roleIds.length > 0) && (
                <button type="button" className="sp-link" onClick={() => actions.openEvidence({ kind: 'achievement', id: a.id })}>
                  Evidence <Arrow />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {featured.length > 0 && snapshot.achievements.items.length > featured.length && (
        <button
          type="button"
          className="sp-link sp-more"
          onClick={() => {
            setShowAll(!showAll);
            setCategory('All');
          }}
        >
          {showAll ? 'Show selected achievements only' : `Browse all ${snapshot.achievements.items.length} achievements`}
        </button>
      )}
    </>
  );
}

export function Capabilities({ snapshot, actions }: { snapshot: SpotlightSnapshot; actions: SpotlightActions }) {
  return (
    <div className="sp-caps">
      {snapshot.capabilities.map((c) => {
        const roles = new Set(
          snapshot.roles.filter((r) => r.initiatives.some((i) => i.deliverables.some((d) => c.deliverableIds.includes(d.id)))).map((r) => r.id),
        ).size;
        return (
          <div key={c.id} className="sp-cap">
            <div>
              <h3>{c.name}</h3>
              {c.level && <span className="sp-data sp-cap-level">{c.level}</span>}
            </div>
            <div>
              {c.description && <p className="sp-cap-desc">{c.description}</p>}
              {c.functions.length > 0 && <p className="sp-cap-fns">{c.functions.join(' · ')}</p>}
            </div>
            <div className="sp-cap-ev">
              <div className="sp-cap-n">{c.deliverableIds.length}</div>
              <div>
                <div className="sp-data">
                  {c.deliverableIds.length === 1 ? 'deliverable' : 'deliverables'}
                  {roles > 0 && ` · ${roles} ${roles === 1 ? 'role' : 'roles'}`}
                </div>
                {c.deliverableIds.length > 0 && (
                  <button type="button" className="sp-link" onClick={() => actions.openEvidence({ kind: 'capability', id: c.id })}>
                    See the work <Arrow />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Skills({ snapshot, actions }: { snapshot: SpotlightSnapshot; actions: SpotlightActions }) {
  return (
    <div className="sp-skill-groups">
      {skillGroups(snapshot).map((g) => (
        <div key={g.category} className="sp-skill-group">
          <h3>{g.category}</h3>
          <ul>
            {g.skills.map((s) => {
              const n = s.deliverableIds.length;
              const facts = [
                s.years ? `${s.years} yrs` : '',
                s.lastUsed ? `used ${formatMonth(s.lastUsed)}` : '',
                n ? `${n} deliverable${n === 1 ? '' : 's'}` : '',
                s.level ?? '',
              ].filter(Boolean);
              return (
                <li key={s.id}>
                  <button type="button" className="sp-skill" disabled={!n} onClick={() => actions.openEvidence({ kind: 'skill', id: s.id })}>
                    <span className="sp-skill-name">{s.name}</span>
                    {facts.length > 0 && <span className="sp-data">{facts.join(' · ')}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function HowIWork({ snapshot }: { snapshot: SpotlightSnapshot }) {
  return (
    <div className="sp-cols">
      {snapshot.methodologies.map((m) => (
        <div key={m.id} className="sp-principle">
          <h3>{m.name}</h3>
          {(m.description || m.context) && <p>{[m.description, m.context].filter(Boolean).join(' ')}</p>}
        </div>
      ))}
      {snapshot.principles.map((p) => (
        <div key={p} className="sp-principle">
          <h3>{p}</h3>
        </div>
      ))}
    </div>
  );
}

export function Background({ snapshot }: { snapshot: SpotlightSnapshot }) {
  const columns = [
    {
      title: 'Education',
      items: snapshot.education.map((e) => ({
        id: e.id,
        title: e.program || e.institution,
        body: [e.program ? e.institution : '', e.status && e.status !== 'Completed' ? e.status : e.endYear ? String(e.endYear) : ''].filter(Boolean).join(' · '),
      })),
    },
    {
      title: snapshot.certifications.length === 1 ? 'Certification' : 'Certifications',
      items: snapshot.certifications.map((c) => ({ id: c.id, title: c.name, body: [c.issuer, c.year].filter(Boolean).join(' · ') })),
    },
    {
      title: snapshot.engagements.length === 1 ? 'Selected engagement' : 'Selected engagements',
      items: snapshot.engagements.map((e) => ({
        id: e.id,
        title: e.client,
        body: [e.project, e.description].filter(Boolean).map(sentence).join(' ') + (e.dates ? ` ${e.dates}` : ''),
      })),
    },
  ].filter((c) => c.items.length);

  return (
    <div className="sp-cols">
      {columns.map((c) => (
        <div key={c.title} className="sp-cred">
          <h3>{c.title}</h3>
          {c.items.map((item) => (
            <div key={item.id} className="sp-cred-item">
              <div className="sp-cred-title">{item.title}</div>
              {item.body && <p>{item.body}</p>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** "Ran interviews" → "Ran interviews." — so joined fragments never end up with ".." or no stop at all. */
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function hasBackground(snapshot: SpotlightSnapshot): boolean {
  return snapshot.education.length + snapshot.certifications.length + snapshot.engagements.length > 0;
}

export function Contact({ snapshot, print }: { snapshot: SpotlightSnapshot; print: boolean }) {
  const { person, contact } = snapshot;
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const email = contact.email ? `${contact.email.user}@${contact.email.domain}` : '';
  const firstName = person.name.split(/\s+/)[0];
  const subject = firstName ? `${firstName} is open` : 'Open';
  const lede = [
    person.availability === 'open_to_work' ? `${subject} to new roles.` : person.availability === 'open_to_select' ? `${subject} to select opportunities.` : '',
    person.targetRoles.length ? `Looking for ${person.targetRoles.join(', ')}.` : '',
    person.workPreference ? `${person.workPreference.replace(/\.$/, '')}.` : '',
  ].filter(Boolean);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the address is on screen and selectable.
    }
  };

  const links: { k: string; v: string; href: string }[] = [
    contact.linkedin && { k: 'LinkedIn', v: displayUrl(contact.linkedin), href: externalHref(contact.linkedin) },
    contact.github && { k: 'GitHub', v: displayUrl(contact.github), href: externalHref(contact.github) },
    contact.website && { k: 'Website', v: displayUrl(contact.website), href: externalHref(contact.website) },
  ].filter((x): x is { k: string; v: string; href: string } => !!x);

  return (
    <div className="sp-wrap sp-contact-grid">
      <div>
        <div className="sp-eyebrow">Contact</div>
        <h2>{firstName ? `Interested in working with ${firstName}?` : 'Get in touch'}</h2>
        {lede.length > 0 && <p className="sp-lede">{lede.join(' ')}</p>}
      </div>
      <div className="sp-channels">
        {email && (
          <div className="sp-channel">
            <span className="sp-channel-k">Email</span>
            <span className="sp-channel-v" data-muted={!revealed && !print}>
              {revealed || print ? email : 'Shown when you ask for it'}
            </span>
            {revealed ? (
              <button type="button" className="sp-small-btn" onClick={copy}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            ) : (
              <button type="button" className="sp-small-btn" onClick={() => setRevealed(true)}>
                Show email
              </button>
            )}
          </div>
        )}
        {links.map((l) => (
          <div key={l.k} className="sp-channel">
            <span className="sp-channel-k">{l.k}</span>
            <span className="sp-channel-v">{l.v}</span>
            <a className="sp-small-btn" href={l.href} target="_blank" rel="noopener noreferrer">
              Open ↗
            </a>
          </div>
        ))}
        {contact.phone && (
          <div className="sp-channel">
            <span className="sp-channel-k">Phone</span>
            <span className="sp-channel-v">{contact.phone}</span>
            <span />
          </div>
        )}
        {person.location && (
          <div className="sp-channel">
            <span className="sp-channel-k">Based in</span>
            <span className="sp-channel-v">{person.location}</span>
            <span />
          </div>
        )}
      </div>
    </div>
  );
}

export function hasContact(snapshot: SpotlightSnapshot): boolean {
  const c = snapshot.contact;
  return !!(c.email || c.linkedin || c.github || c.website || c.phone);
}
