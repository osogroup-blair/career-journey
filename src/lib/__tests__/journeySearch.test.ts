import { describe, it, expect } from 'vitest';
import demo from '../demo/demoCareerJourney.json';
import { buildSectionItems, facetValues, sectionForId } from '../journeySections';
import { searchItems, searchAll, highlightParts, tokenize } from '../journeySearch';
import { paginate, pageOfIndex } from '../pagination';

const items = buildSectionItems(demo);

describe('buildSectionItems', () => {
  it('flattens every section', () => {
    expect(items.roles).toHaveLength(3);
    expect(items.projects).toHaveLength(3);
    expect(items.achievements).toHaveLength(3);
    expect(items.skills).toHaveLength(7);
    expect(items.capabilities).toHaveLength(3);
    expect(items.education).toHaveLength(1);
    expect(items.engagements).toHaveLength(1);
  });

  it('resolves linked names into the search text', () => {
    const project = items.projects.find((p) => p.id === 'INIT-001')!;
    expect(project.facets.role).toEqual(['ROLE-001']);
    const role = (demo as any).roles[0];
    expect(project.text).toContain(String(role.title).toLowerCase());
  });

  it('records where each skill is used', () => {
    const skill = items.skills.find((s) => s.id === 'SK-001')!;
    expect(skill.attention).toBeUndefined();
  });

  it('finds the section for an id', () => {
    expect(sectionForId(items, 'DEL-001')).toBeNull();
    expect(sectionForId(items, 'INIT-002')).toBe('projects');
    expect(sectionForId(items, 'SK-010')).toBe('skills');
  });

  it('lists facet values by frequency', () => {
    const values = facetValues(items.projects, 'role');
    expect(values.map((v) => v.value).sort()).toEqual(['ROLE-001', 'ROLE-002', 'ROLE-003']);
  });

  it('tolerates an empty journey', () => {
    expect(buildSectionItems(null).skills).toEqual([]);
  });
});

describe('search', () => {
  it('requires every token and ranks title hits first', () => {
    const skillName = (demo as any).skills_index[0].name as string;
    const hits = searchItems(items.skills, skillName);
    expect(hits[0].id).toBe('SK-001');
  });

  it('matches ids exactly', () => {
    expect(searchItems(items.skills, 'sk-010').map((s) => s.id)).toEqual(['SK-010']);
  });

  it('returns everything for an empty query', () => {
    expect(searchItems(items.skills, '   ')).toBe(items.skills);
  });

  it('groups global results per section', () => {
    const groups = searchAll(items, 'ROLE-001');
    expect(groups.map((g) => g.section)).toContain('roles');
    expect(searchAll(items, '')).toEqual([]);
  });

  it('highlights every token occurrence', () => {
    expect(highlightParts('Data Platform data', 'data')).toEqual([
      { text: 'Data', hit: true },
      { text: ' Platform ', hit: false },
      { text: 'data', hit: true },
    ]);
    expect(tokenize('  a  B ')).toEqual(['a', 'b']);
  });
});

describe('paginate', () => {
  const list = Array.from({ length: 45 }, (_, i) => i);
  it('slices pages', () => {
    expect(paginate(list, 2, 20)).toMatchObject({ page: 2, totalPages: 3, start: 21, end: 40 });
  });
  it('clamps an out-of-range page to the last one', () => {
    expect(paginate(list, 9, 20)).toMatchObject({ page: 3, start: 41, end: 45 });
    expect(paginate([], 3, 20)).toMatchObject({ page: 1, totalPages: 1, start: 0, end: 0 });
  });
  it('finds the page for an index', () => {
    expect(pageOfIndex(0, 20)).toBe(1);
    expect(pageOfIndex(40, 20)).toBe(3);
  });
});
