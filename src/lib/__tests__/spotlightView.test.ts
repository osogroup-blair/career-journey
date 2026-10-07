import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import demo from '../demo/demoCareerJourney.json';
import { buildSpotlightSnapshot } from '../spotlightSnapshot';
import {
  ARC_MAX_ROWS,
  SPOTLIGHT_ACCENT_COLORS,
  SPOTLIGHT_PAPER,
  careerArc,
  contrastRatio,
  formatDuration,
  formatMonth,
  formatRoleDates,
  glanceRows,
  resolveEvidence,
  skillGroups,
  splitFigures,
} from '../spotlightView';
import SpotlightPage from '../../components/spotlight/SpotlightPage';

const NOW = new Date('2026-10-07T12:00:00Z');
const snap = (settings: unknown = {}, cj: any = structuredClone(demo)) => buildSpotlightSnapshot(cj, settings, NOW).snapshot;

describe('accent colours', () => {
  it.each(Object.entries(SPOTLIGHT_ACCENT_COLORS))('%s is readable as text and as a button in both themes', (_, c) => {
    expect(contrastRatio(c.light, SPOTLIGHT_PAPER.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.dark, SPOTLIGHT_PAPER.dark)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('formatting', () => {
  it('formats months, ranges and durations', () => {
    expect(formatMonth('2022-03')).toBe('Mar 2022');
    expect(formatMonth('2022')).toBe('2022');
    expect(formatMonth(undefined)).toBe('');
    expect(formatRoleDates({ start: '2022-03', current: true })).toBe('Mar 2022 – Now');
    expect(formatRoleDates({ start: '2018-06', end: '2022-02', current: false })).toBe('Jun 2018 – Feb 2022');
    expect(formatDuration(56)).toBe('4 yr 8 mo');
    expect(formatDuration(12)).toBe('1 yr');
    expect(formatDuration(3)).toBe('3 mo');
    expect(formatDuration(null)).toBe('');
  });

  it('splits out figures without changing the text', () => {
    const text = 'Reached $4M ARR within 18 months; became the #2 revenue driver, up 35%.';
    const parts = splitFigures(text);
    expect(parts.map((p) => p.text).join('')).toBe(text);
    expect(parts.filter((p) => p.figure).map((p) => p.text)).toEqual(['$4M', '18', '#2', '35%']);
  });
});

describe('resolveEvidence', () => {
  it('groups an outcome’s evidence by role, in page order', () => {
    const view = resolveEvidence(snap(), { kind: 'outcome', index: 0 })!;
    expect(view.title).toMatch(/\$4M ARR/);
    expect(view.groups.map((g) => g.role?.id)).toEqual(['ROLE-001']);
    expect(view.summary).toBe('1 deliverable and 1 achievement across 1 role');
  });

  it('lists a skill’s deliverables across roles', () => {
    const view = resolveEvidence(snap(), { kind: 'skill', id: 'SK-006' })!;
    expect(view.groups.map((g) => g.role?.id)).toEqual(['ROLE-001', 'ROLE-003']);
    expect(view.summary).toBe('2 deliverables across 2 roles');
  });

  it('shows an achievement with the deliverable it is linked to', () => {
    const view = resolveEvidence(snap(), { kind: 'achievement', id: 'ACH-001' })!;
    expect(view.groups[0].items.map((i) => i.type)).toEqual(['achievement', 'deliverable']);
  });

  it('puts achievements with no role in their own group, and returns null for unknown targets', () => {
    const cj: any = structuredClone(demo);
    cj.achievements.push({ id: 'ACH-050', title: 'Spoke at ProductCon' });
    const view = resolveEvidence(snap({}, cj), { kind: 'achievement', id: 'ACH-050' })!;
    expect(view.groups).toEqual([{ role: null, items: [expect.objectContaining({ type: 'achievement' })] }]);
    expect(resolveEvidence(snap(), { kind: 'skill', id: 'SK-404' })).toBeNull();
  });
});

describe('careerArc', () => {
  it('places roles newest first on a span from the first role to next year', () => {
    const arc = careerArc(snap(), NOW)!;
    expect(arc.segments.map((s) => s.roleId)).toEqual(['ROLE-001', 'ROLE-002', 'ROLE-003']);
    expect(arc.ticks[0]).toMatchObject({ year: 2015, left: 0, labelled: true });
    expect(arc.segments[0]).toMatchObject({ current: true, flip: true });
    expect(arc.segments[2].flip).toBe(false);
    for (const s of arc.segments) expect(s.left + s.width).toBeLessThanOrEqual(100.0001);
  });

  it('folds the oldest condensed roles into one row when there are many', () => {
    const cj: any = structuredClone(demo);
    for (let i = 0; i < 6; i++)
      cj.roles.push({ id: `OLD-${i}`, organization: `Old Co ${i}`, title: 'Analyst', start_date: `${2003 + i * 2}-01`, end_date: `${2004 + i * 2}-12`, resume_default: 'condensed', initiatives: [] });
    const arc = careerArc(snap({}, cj), NOW)!;
    expect(arc.segments.length).toBeLessThanOrEqual(ARC_MAX_ROWS);
    expect(arc.segments.at(-1)).toMatchObject({ title: 'Earlier career', organization: '6 roles', roleId: 'OLD-5' });
  });

  it('returns null when no role has usable dates', () => {
    const cj: any = structuredClone(demo);
    cj.roles.forEach((r: any) => {
      delete r.start_date;
      delete r.dates;
    });
    expect(careerArc(snap({}, cj), NOW)).toBeNull();
  });
});

describe('glance and skills', () => {
  it('builds the at-a-glance rows from known facts only', () => {
    expect(glanceRows(snap())).toEqual([
      { label: 'Working since', value: '2015 · 3 organizations' },
      { label: 'Now', value: 'Senior Product Manager, Meridian Cloudworks' },
      { label: 'Industries', value: 'B2B SaaS, Logistics, E-commerce / Retail' },
    ]);
  });

  it('groups skills by category, most recently used first', () => {
    const groups = skillGroups(snap());
    expect(groups.find((g) => g.category === 'Product Strategy')!.skills.map((s) => s.id)).toEqual(['SK-001', 'SK-002']);
  });
});

describe('SpotlightPage', () => {
  it('renders the demo snapshot with every section', () => {
    const html = renderToStaticMarkup(createElement(SpotlightPage, { snapshot: snap(), now: NOW }));
    for (const text of ['Jordan Rivera', 'Product leader who ships', '$4M', 'Career arc', 'Senior Product Manager', 'Selected achievements', 'What I&#x27;m built for', 'Skills', 'How I work', 'Background', 'Interested in working with Jordan?', 'Made with']) {
      expect(html).toContain(text);
    }
  });

  it('never puts the email address in the markup, even in print', () => {
    const settings = { contact: { email: true } };
    expect(renderToStaticMarkup(createElement(SpotlightPage, { snapshot: snap(settings), now: NOW }))).not.toContain('jordan.rivera@example.com');
    // Print shows it, because a printed page can't be clicked.
    expect(renderToStaticMarkup(createElement(SpotlightPage, { snapshot: snap(settings), now: NOW, variant: 'print' }))).toContain('jordan.rivera@example.com');
  });

  it('renders an almost empty journey without crashing', () => {
    const html = renderToStaticMarkup(createElement(SpotlightPage, { snapshot: buildSpotlightSnapshot({ person: { name: 'Sam' } }, {}, NOW).snapshot, now: NOW }));
    expect(html).toContain('Sam');
    expect(html).not.toContain('Career arc');
  });
});
