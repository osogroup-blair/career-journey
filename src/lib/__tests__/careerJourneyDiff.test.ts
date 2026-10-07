import { describe, it, expect } from 'vitest';
import { diffCareerJourney } from '../careerJourneyDiff';

const before = {
  roles: [{ id: 'R1', title: 'CSO', organization: 'Nymbl', achievements: ['ACH-1'], initiatives: [{ id: 'I1', deliverables: [{ id: 'DEL-1', description: 'Pitch to Close' }] }] }],
  achievements: [{ id: 'ACH-1', description: 'Scaled revenue' }, { id: 'ACH-2', description: 'Old win' }],
  skills_index: [{ id: 'SK-1', name: 'SQL' }],
};

describe('diffCareerJourney', () => {
  it('reports added, changed and removed entities per collection, with readable labels', () => {
    const after = JSON.parse(JSON.stringify(before));
    after.achievements[0].description = 'Scaled revenue from $1.5M to $9.2M';
    after.achievements.splice(1, 1);
    after.achievements.push({ id: 'ACH-3', description: 'Ran Kanban for ops' });
    after.roles[0].achievements.push('ACH-3');
    after.roles[0].initiatives[0].deliverables.push({ id: 'DEL-2', description: 'Kanban board' });
    after.skills_index.push({ id: 'SK-2', name: 'Kanban' });
    const diff = diffCareerJourney(before, after);
    expect(diff.map((d) => d.collection)).toEqual(['roles', 'deliverables', 'achievements', 'skills_index']);
    const roles = diff[0];
    expect(roles.changed[0]).toMatchObject({ id: 'R1', label: 'CSO at Nymbl', fields: ['achievements'] }); // initiatives diffed as deliverables, not as a role field
    expect(diff[1].added).toEqual([{ id: 'DEL-2', label: 'Kanban board' }]);
    const ach = diff[2];
    expect(ach.added).toEqual([{ id: 'ACH-3', label: 'Ran Kanban for ops' }]);
    expect(ach.removed).toEqual([{ id: 'ACH-2', label: 'Old win' }]);
    expect(ach.changed[0].text).toEqual({ before: 'Scaled revenue', after: 'Scaled revenue from $1.5M to $9.2M' });
    expect(diff[3].added).toEqual([{ id: 'SK-2', label: 'Kanban' }]);
  });

  it('is empty when nothing changed', () => {
    expect(diffCareerJourney(before, JSON.parse(JSON.stringify(before)))).toEqual([]);
  });
});
