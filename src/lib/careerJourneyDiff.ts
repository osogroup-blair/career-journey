// Structural, field-level diff between the current Career Journey and a proposed
// replacement — used by PatchReview so "Approve & Merge JSON" shows exactly what
// changes per role before it overwrites the user's real data, not just an AI summary.

interface EvidenceItem {
  id?: string;
  description?: string;
}

export interface RoleDiff {
  roleId: string;
  roleTitle: string;
  addedSkills: string[];
  removedSkills: string[];
  addedDeliverables: string[];
  removedDeliverables: string[];
  changedDeliverables: { before: string; after: string }[];
  addedAchievements: string[];
  removedAchievements: string[];
  changedAchievements: { before: string; after: string }[];
}

function diffStringList(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  return {
    added: after.filter((v) => !beforeSet.has(v)),
    removed: before.filter((v) => !afterSet.has(v)),
  };
}

function diffEvidenceList(before: EvidenceItem[], after: EvidenceItem[]) {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: { before: string; after: string }[] = [];

  const beforeById = new Map(before.filter((b) => b.id).map((b) => [b.id, b]));
  const beforeWithoutId = before.filter((b) => !b.id);
  const matchedBeforeIds = new Set<string>();

  for (const item of after) {
    if (item.id && beforeById.has(item.id)) {
      matchedBeforeIds.add(item.id);
      const prev = beforeById.get(item.id)!;
      if ((prev.description || '') !== (item.description || '')) {
        changed.push({ before: prev.description || '', after: item.description || '' });
      }
    } else if (item.description && beforeWithoutId.some((b) => b.description === item.description)) {
      // Unchanged item that never had an id — ignore.
    } else {
      added.push(item.description || '(no description)');
    }
  }

  for (const item of before) {
    if (item.id && !matchedBeforeIds.has(item.id) && !after.some((a) => a.id === item.id)) {
      removed.push(item.description || '(no description)');
    }
  }

  return { added, removed, changed };
}

/**
 * Compares roles[] between two Career Journey objects. Matches roles by id when
 * present, falling back to title+organization. Only returns roles with at least
 * one actual change, so an unaffected role never shows up as noise.
 */
export function diffCareerJourneyRoles(before: any, after: any): RoleDiff[] {
  const beforeRoles: any[] = Array.isArray(before?.roles) ? before.roles : [];
  const afterRoles: any[] = Array.isArray(after?.roles) ? after.roles : [];

  const matchKey = (r: any) => r.id || `${r.title || ''}::${r.organization || r.company || ''}`;
  const beforeByKey = new Map(beforeRoles.map((r) => [matchKey(r), r]));

  const diffs: RoleDiff[] = [];

  for (const afterRole of afterRoles) {
    const beforeRole = beforeByKey.get(matchKey(afterRole)) || {};

    const skills = diffStringList(
      Array.isArray(beforeRole.skills) ? beforeRole.skills : [],
      Array.isArray(afterRole.skills) ? afterRole.skills : []
    );
    const deliverables = diffEvidenceList(
      Array.isArray(beforeRole.deliverables) ? beforeRole.deliverables : [],
      Array.isArray(afterRole.deliverables) ? afterRole.deliverables : []
    );
    const achievements = diffEvidenceList(
      Array.isArray(beforeRole.achievements) ? beforeRole.achievements : [],
      Array.isArray(afterRole.achievements) ? afterRole.achievements : []
    );

    const hasChanges =
      skills.added.length || skills.removed.length ||
      deliverables.added.length || deliverables.removed.length || deliverables.changed.length ||
      achievements.added.length || achievements.removed.length || achievements.changed.length;

    if (hasChanges) {
      diffs.push({
        roleId: afterRole.id || matchKey(afterRole),
        roleTitle: `${afterRole.title || 'Untitled role'}${afterRole.organization || afterRole.company ? ` at ${afterRole.organization || afterRole.company}` : ''}`,
        addedSkills: skills.added,
        removedSkills: skills.removed,
        addedDeliverables: deliverables.added,
        removedDeliverables: deliverables.removed,
        changedDeliverables: deliverables.changed,
        addedAchievements: achievements.added,
        removedAchievements: achievements.removed,
        changedAchievements: achievements.changed,
      });
    }
  }

  return diffs;
}
