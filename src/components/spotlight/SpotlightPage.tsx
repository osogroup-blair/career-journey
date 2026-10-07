import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpotlightSnapshot } from '../../types/spotlight';
import { EvidenceTarget, formatMonth, resolveEvidence } from '../../lib/spotlightView';
import EvidenceDrawer from './EvidenceDrawer';
import { CareerArc, RoleChapter } from './SpotlightExperience';
import { accentStyle, SpotlightActions } from './SpotlightParts';
import {
  Achievements,
  Background,
  Capabilities,
  Contact,
  hasBackground,
  hasContact,
  HowIWork,
  Outcomes,
  Hero,
  SectionHead,
  Skills,
} from './SpotlightSections';
import './spotlight.css';

type SectionKey = 'outcomes' | 'arc' | 'experience' | 'achievements' | 'capabilities' | 'skills' | 'how' | 'background' | 'contact';

const NAV: { key: SectionKey; label: string }[] = [
  { key: 'outcomes', label: 'Outcomes' },
  { key: 'experience', label: 'Experience' },
  { key: 'achievements', label: 'Achievements' },
  { key: 'capabilities', label: 'Capabilities' },
  { key: 'skills', label: 'Skills' },
  { key: 'how', label: 'How I work' },
  { key: 'background', label: 'Background' },
];

/**
 * The Career Spotlight page, rendered from a snapshot and nothing else. Used by the
 * in-app editor's preview now, and by the public page once publishing exists.
 *
 * Navigation uses refs and scrollIntoView rather than #anchors: the app runs on a
 * HashRouter, and the editor can show two copies of the page at once.
 *
 * `mode` forces a theme (the editor's light/dark toggle); left undefined, the page follows
 * the viewer's system setting. `variant="print"` shows the page as it prints.
 * Each section carries data-region, so the editor can scroll its preview to the part a
 * setting affects.
 */
export default function SpotlightPage({
  snapshot,
  mode,
  variant = 'screen',
  now = new Date(),
  initialEvidence = null,
  pdfUrl,
}: {
  snapshot: SpotlightSnapshot;
  mode?: 'light' | 'dark';
  variant?: 'screen' | 'print';
  now?: Date;
  /** Opens the evidence drawer on load (the public page's ?evidence= link). */
  initialEvidence?: EvidenceTarget | null;
  /** The public page's PDF download; the editor's preview has none. */
  pdfUrl?: string;
}) {
  const [evidence, setEvidence] = useState<EvidenceTarget | null>(initialEvidence);
  const [flashRole, setFlashRole] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<SectionKey | null>(null);
  const sections = useRef(new Map<SectionKey, HTMLElement>());
  const roleHeadings = useRef(new Map<string, HTMLElement>());
  const heroEnd = useRef<HTMLDivElement | null>(null);
  const print = variant === 'print';
  const s = snapshot.sections;

  const achievements = useMemo(() => new Map(snapshot.achievements.items.map((a) => [a.id, a])), [snapshot]);
  const skillNames = useMemo(() => new Map(snapshot.skills.map((sk) => [sk.id, sk.name])), [snapshot]);
  const evidenceView = evidence ? resolveEvidence(snapshot, evidence) : null;

  const scrollTo = useCallback((el: HTMLElement | undefined) => {
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  }, []);

  const goToRole = useCallback(
    (roleId: string) => {
      setEvidence(null);
      const heading = roleHeadings.current.get(roleId);
      if (!heading) return;
      scrollTo(heading.closest('article') ?? heading);
      setFlashRole(roleId);
      window.setTimeout(() => heading.focus({ preventScroll: true }), 400);
      window.setTimeout(() => setFlashRole((r) => (r === roleId ? null : r)), 1400);
    },
    [scrollTo],
  );
  const closeEvidence = useCallback(() => setEvidence(null), []);
  const actions: SpotlightActions = useMemo(() => ({ openEvidence: setEvidence, goToRole }), [goToRole]);

  const register = (key: SectionKey) => (el: HTMLElement | null) => {
    if (el) sections.current.set(key, el);
    else sections.current.delete(key);
  };

  const visible: Record<SectionKey, boolean> = {
    outcomes: snapshot.outcomes.length > 0,
    arc: s.arc && snapshot.roles.length > 0,
    experience: snapshot.roles.length > 0,
    achievements: s.achievements && snapshot.achievements.items.length > 0,
    capabilities: s.capabilities && snapshot.capabilities.length > 0,
    skills: s.skills && snapshot.skills.length > 0,
    how: s.howIWork && snapshot.methodologies.length + snapshot.principles.length > 0,
    background: s.background && hasBackground(snapshot),
    contact: true,
  };
  const contactable = hasContact(snapshot);

  // Sticky-nav state: the name appears once the hero has scrolled away, and the section
  // under the middle of the viewport is marked current.
  useEffect(() => {
    if (print || typeof IntersectionObserver === 'undefined') return;
    const hero = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting && e.boundingClientRect.top < 0));
    if (heroEnd.current) hero.observe(heroEnd.current);
    const spy = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const key = [...sections.current.entries()].find(([, el]) => el === e.target)?.[0];
          if (key) setActive(key);
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.current.forEach((el) => spy.observe(el));
    return () => {
      hero.disconnect();
      spy.disconnect();
    };
  }, [print, snapshot]);

  const updated = formatMonth(snapshot.builtAt.slice(0, 7));

  return (
    <div className="sp" data-mode={mode} data-variant={variant} style={accentStyle(snapshot.style.accent)}>
      <nav className="sp-nav" data-scrolled={scrolled} aria-label="Sections">
        <div className="sp-wrap">
          <span className="sp-nav-name">{snapshot.person.name}</span>
          <div className="sp-nav-links">
            {NAV.filter((n) => visible[n.key]).map((n) => (
              <button
                key={n.key}
                type="button"
                aria-current={active === n.key}
                onClick={() => scrollTo(sections.current.get(n.key))}
              >
                {n.label}
              </button>
            ))}
          </div>
          {contactable && (
            <button type="button" className="sp-btn" onClick={() => scrollTo(sections.current.get('contact'))}>
              Get in touch
            </button>
          )}
        </div>
      </nav>

      <main>
        <div data-region="hero">
          <Hero snapshot={snapshot} pdfUrl={pdfUrl} onContact={contactable ? () => scrollTo(sections.current.get('contact')) : null} />
        </div>
        <div ref={heroEnd} />

        {visible.outcomes && (
          <section ref={register('outcomes')} data-region="outcomes" aria-label="Signature outcomes" className="sp-anchor">
            <Outcomes snapshot={snapshot} actions={actions} />
          </section>
        )}

        {visible.arc && (
          <section className="sp-block" data-region="arc" aria-label="Career arc">
            <div className="sp-wrap">
              <SectionHead title="Career arc">Select a role to jump to it.</SectionHead>
              <CareerArc snapshot={snapshot} now={now} actions={actions} />
            </div>
          </section>
        )}

        {visible.experience && (
          <section ref={register('experience')} className="sp-block" data-region="experience" aria-label="Experience">
            <div className="sp-wrap">
              <SectionHead title="Experience">Highlights first. Open a role to see every initiative, what was delivered, and the skills it used.</SectionHead>
              {snapshot.roles.map((role) => (
                <RoleChapter
                  key={role.id}
                  role={role}
                  achievements={achievements}
                  skillNames={skillNames}
                  flash={flashRole === role.id}
                  headingRef={(el) => {
                    if (el) roleHeadings.current.set(role.id, el);
                    else roleHeadings.current.delete(role.id);
                  }}
                  actions={actions}
                />
              ))}
            </div>
          </section>
        )}

        {visible.achievements && (
          <section ref={register('achievements')} className="sp-block" data-region="achievements" aria-label="Selected achievements">
            <div className="sp-wrap">
              <SectionHead title="Selected achievements">Each one links to the work behind it.</SectionHead>
              <Achievements snapshot={snapshot} actions={actions} />
            </div>
          </section>
        )}

        {visible.capabilities && (
          <section ref={register('capabilities')} className="sp-block" data-region="capabilities" aria-label="Capabilities">
            <div className="sp-wrap">
              <SectionHead title="What I'm built for">Capabilities, counted by the delivered work that shows them.</SectionHead>
              <Capabilities snapshot={snapshot} actions={actions} />
            </div>
          </section>
        )}

        {visible.skills && (
          <section ref={register('skills')} className="sp-block" data-region="skills" aria-label="Skills">
            <div className="sp-wrap">
              <SectionHead title="Skills">Years of use and when last used. Select a skill to see where it was applied.</SectionHead>
              <Skills snapshot={snapshot} actions={actions} />
            </div>
          </section>
        )}

        {visible.how && (
          <section ref={register('how')} className="sp-block" data-region="how" aria-label="How I work">
            <div className="sp-wrap">
              <SectionHead title="How I work">The habits behind the outcomes.</SectionHead>
              <HowIWork snapshot={snapshot} />
            </div>
          </section>
        )}

        {visible.background && (
          <section ref={register('background')} className="sp-block" data-region="background" aria-label="Background">
            <div className="sp-wrap">
              <SectionHead title="Background">Education, credentials and selected client work.</SectionHead>
              <Background snapshot={snapshot} />
            </div>
          </section>
        )}

        <section ref={register('contact')} className="sp-contact" data-region="contact" aria-label="Contact">
          <Contact snapshot={snapshot} print={print} />
          <div className="sp-wrap">
            <footer className="sp-foot">
              <span>{updated && `Updated ${updated}`}</span>
              {snapshot.style.showBadge && (
                <span>
                  Made with <b>Career Journey</b>
                </span>
              )}
            </footer>
          </div>
        </section>
      </main>

      {evidenceView && !print && (
        <EvidenceDrawer view={evidenceView} mode={mode} accent={snapshot.style.accent} onClose={closeEvidence} onGoToRole={goToRole} />
      )}
    </div>
  );
}
