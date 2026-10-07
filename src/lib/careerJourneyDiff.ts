// What a staged Career Journey patch actually changes, entity by entity, so the
// Rating stage's "Approve & Merge" shows the real edits to the candidate's data
// before they overwrite it — not just the AI's own summary of them.
//
// Career Journey evidence is stored by id in several collections (roles hold
// achievement/skill ids; descriptions live in top-level achievements and
// skills_index; deliverables sit under roles[].initiatives[]), so the diff
// works per collection, matching entities by id.

export interface EntityChange {
  id: string;
  label: string;
  /** Top-level fields whose value differs. */
  fields: string[];
  /** Before/after of the main text field, when it's one of the changed fields. */
  text?: { before: string; after: string };
}

export interface CollectionDiff {
  collection: string;
  label: string;
  added: { id: string; label: string }[];
  removed: { id: string; label: string }[];
  changed: EntityChange[];
}

const COLLECTIONS: { key: string; label: string; collect: (cj: any) => any[] }[] = [
  { key: 'roles', label: 'Roles', collect: (cj) => (Array.isArray(cj?.roles) ? cj.roles : []) },
  {
    key: 'deliverables',
    label: 'Deliverables',
    collect: (cj) => [
      ...(Array.isArray(cj?.deliverables) ? cj.deliverables : []),
      ...(cj?.roles || []).flatMap((r: any) => [
        ...(Array.isArray(r?.deliverables) ? r.deliverables.filter((d: any) => d && typeof d === 'object') : []),
        ...(r?.initiatives || []).flatMap((i: any) => (Array.isArray(i?.deliverables) ? i.deliverables : [])),
      ]),
    ],
  },
  { key: 'achievements', label: 'Achievements', collect: (cj) => (Array.isArray(cj?.achievements) ? cj.achievements : []) },
  { key: 'skills_index', label: 'Skills', collect: (cj) => (Array.isArray(cj?.skills_index) ? cj.skills_index : []) },
  { key: 'capabilities', label: 'Capabilities', collect: (cj) => (Array.isArray(cj?.capabilities) ? cj.capabilities : []) },
  { key: 'education', label: 'Education', collect: (cj) => (Array.isArray(cj?.education) ? cj.education : []) },
  { key: 'certifications', label: 'Certifications', collect: (cj) => (Array.isArray(cj?.certifications) ? cj.certifications : []) },
];

const TEXT_FIELDS = ['description', 'title', 'name'];

function entityLabel(e: any): string {
  if (e?.title && (e.organization || e.company)) return `${e.title} at ${e.organization || e.company}`;
  const text = e?.title || e?.name || e?.description || e?.institution || e?.id || '(untitled)';
  return String(text).length > 140 ? `${String(text).slice(0, 137)}…` : String(text);
}

function byId(items: any[]): Map<string, any> {
  const out = new Map<string, any>();
  for (const item of items) if (item && typeof item === 'object' && typeof item.id === 'string') out.set(item.id, item);
  return out;
}

/** Collections with at least one added, removed or changed entity. Unchanged collections are left out. */
export function diffCareerJourney(before: any, after: any): CollectionDiff[] {
  const out: CollectionDiff[] = [];
  for (const c of COLLECTIONS) {
    const prev = byId(c.collect(before));
    const next = byId(c.collect(after));
    const added = [...next.entries()].filter(([id]) => !prev.has(id)).map(([id, e]) => ({ id, label: entityLabel(e) }));
    const removed = [...prev.entries()].filter(([id]) => !next.has(id)).map(([id, e]) => ({ id, label: entityLabel(e) }));
    const changed: EntityChange[] = [];
    for (const [id, e] of next) {
      const p = prev.get(id);
      if (!p) continue;
      const keys = new Set([...Object.keys(p), ...Object.keys(e)]);
      // A role's nested initiatives/deliverables are diffed in their own collection, not as a role field.
      const fields = [...keys].filter((k) => !(c.key === 'roles' && k === 'initiatives') && JSON.stringify(p[k]) !== JSON.stringify(e[k]));
      if (fields.length === 0) continue;
      const textField = TEXT_FIELDS.find((f) => fields.includes(f) && (typeof p[f] === 'string' || typeof e[f] === 'string'));
      changed.push({ id, label: entityLabel(e), fields, ...(textField ? { text: { before: String(p[textField] ?? ''), after: String(e[textField] ?? '') } } : {}) });
    }
    if (added.length || removed.length || changed.length) out.push({ collection: c.key, label: c.label, added, removed, changed });
  }
  return out;
}
