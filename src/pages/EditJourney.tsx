import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import {
  ChevronLeft,
  ArrowUpRight,
  Plus,
  UserRound,
  Briefcase,
  FolderKanban,
  Trophy,
  Cpu,
  Layers,
  GraduationCap,
  BadgeCheck,
  Workflow,
  Handshake,
} from 'lucide-react';
import { useStore } from '../store';
import { Button, Card } from '../components/ui';
import { cn } from '../lib/utils';
import * as m from '../lib/journeyMutations';
import { SECTIONS, SECTION_BY_ID, isSectionId, roleLabel, type SectionId } from '../lib/journeySections';
import { EditorProvider, useEditor } from './editJourney/EditorContext';
import { SectionList, PAGE_SIZES, type ListState } from './editJourney/SectionList';
import { ProfileEditor } from './editJourney/ProfileEditor';
import { RoleEditor } from './editJourney/RoleEditor';
import { ProjectEditor } from './editJourney/ProjectEditor';
import { AchievementEditor } from './editJourney/AchievementEditor';
import { SkillEditor } from './editJourney/SkillEditor';
import { CapabilityEditor } from './editJourney/CapabilityEditor';
import { EducationEditor, CertificationEditor, MethodologyEditor, EngagementEditor } from './editJourney/ListEditors';

/**
 * Simple Career Journey editor. One section at a time, each a searchable, paginated
 * list whose rows expand into an editor. All list state (section, query, page, filters,
 * open item) lives in the URL — `#/edit?section=skills&q=okr&item=SK-001` — so deep
 * links, the global search and the back button all work.
 */

export const SECTION_ICONS: Record<SectionId, React.ComponentType<{ className?: string }>> = {
  profile: UserRound,
  roles: Briefcase,
  projects: FolderKanban,
  achievements: Trophy,
  skills: Cpu,
  capabilities: Layers,
  education: GraduationCap,
  certifications: BadgeCheck,
  methodologies: Workflow,
  engagements: Handshake,
};

const EDITORS: Partial<Record<SectionId, React.ComponentType<{ id: string }>>> = {
  roles: RoleEditor,
  projects: ProjectEditor,
  achievements: AchievementEditor,
  skills: SkillEditor,
  capabilities: CapabilityEditor,
  education: EducationEditor,
  certifications: CertificationEditor,
  methodologies: MethodologyEditor,
  engagements: EngagementEditor,
};

const DEFAULT_PAGE_SIZE = 20;

/** "+ Add" control for a section. Projects need a role, so they get a role picker alongside. */
function AddControl({ section, facets }: { section: SectionId; facets: Record<string, string> }) {
  const { cj, mutate, open } = useEditor();
  const roles = cj.roles || [];
  const [projectRole, setProjectRole] = useState<string>('');
  const targetRole = projectRole || facets.role || roles[0]?.id || '';

  const add = () => {
    const id = mutate((d, ids) => {
      switch (section) {
        case 'roles':
          return m.addRole(d, ids, { title: 'New role' });
        case 'projects':
          return targetRole ? m.addInitiative(d, ids, targetRole, { name: 'New project' }) : null;
        case 'achievements':
          return m.addAchievement(d, ids, { title: 'New achievement' }, facets.role ? [facets.role] : []);
        case 'skills':
          return m.addSkill(d, ids, { name: 'New skill' });
        case 'capabilities':
          return m.addCapability(d, ids, { name: 'New capability' });
        case 'education':
          return m.addListItem(d, ids, 'education', { institution: 'New school' });
        case 'certifications':
          return m.addListItem(d, ids, 'certifications', { name: 'New certification' });
        case 'methodologies':
          return m.addListItem(d, ids, 'methodologies', { name: 'New methodology' });
        case 'engagements':
          return m.addListItem(d, ids, 'customer_engagements', { client: 'New client' });
        default:
          return null;
      }
    });
    if (id) open(section, id);
  };

  return (
    <>
      {section === 'projects' && (
        <select
          value={targetRole}
          onChange={(e) => setProjectRole(e.target.value)}
          className="h-9 max-w-[14rem] rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600"
          aria-label="Role for the new project"
        >
          {roles.map((r: any) => (
            <option key={r.id} value={r.id}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      )}
      <Button size="sm" variant="outline" className="bg-white whitespace-nowrap" onClick={add} disabled={section === 'projects' && !targetRole}>
        <Plus className="w-3.5 h-3.5 mr-1 text-brand-600" /> Add {SECTION_BY_ID[section].singular.toLowerCase()}
      </Button>
    </>
  );
}

function EditorBody({ section, state, patchList }: { section: SectionId; state: ListState; patchList: (p: Partial<ListState>) => void }) {
  const { items, open } = useEditor();
  const def = SECTION_BY_ID[section];
  const Editor = EDITORS[section];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
      {/* Section nav: a sidebar on desktop, a select on small screens */}
      <nav className="hidden lg:block sticky top-20 space-y-0.5" aria-label="Career Journey sections">
        {SECTIONS.map((s) => {
          const Icon = SECTION_ICONS[s.id];
          const active = s.id === section;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => open(s.id)}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active ? 'bg-brand-50 text-brand-800 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={cn('w-4 h-4', active ? 'text-brand-600' : 'text-slate-400')} />
              <span className="flex-1 text-left">{s.label}</span>
              {s.list && <span className="text-xs text-slate-400 tabular-nums">{items[s.id].length}</span>}
            </button>
          );
        })}
      </nav>
      <select
        value={section}
        onChange={(e) => open(e.target.value as SectionId)}
        className="lg:hidden h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold"
        aria-label="Section"
      >
        {SECTIONS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
            {s.list ? ` (${items[s.id].length})` : ''}
          </option>
        ))}
      </select>

      <div className="min-w-0 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{def.label}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{def.description}</p>
        </div>
        {def.list && Editor ? (
          <SectionList
            key={section}
            section={def}
            items={items[section]}
            state={state}
            onChange={patchList}
            renderEditor={(id) => <Editor id={id} />}
            actions={<AddControl section={section} facets={state.facets} />}
          />
        ) : (
          <ProfileEditor />
        )}
      </div>
    </div>
  );
}

export default function EditJourney() {
  const careerJourney = useStore((s) => s.careerJourney);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const rawSection = params.get('section');
  const section: SectionId = isSectionId(rawSection) ? rawSection : 'roles';
  const sizeParam = Number(params.get('size'));
  const pageSize = PAGE_SIZES.includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;

  const state = useMemo(
    (): ListState => ({
      query: params.get('q') || '',
      page: Number(params.get('page')) || 1,
      pageSize,
      facets: Object.fromEntries([...params.entries()].filter(([k]) => k.startsWith('f.')).map(([k, v]) => [k.slice(2), v])),
      attentionOnly: params.get('attention') === '1',
      expandedId: params.get('item'),
      flashId,
    }),
    [params, pageSize, flashId]
  ) as ListState;

  // Typing, paging and filtering replace the history entry; opening a section or item pushes one.
  const patchList = useCallback(
    (patch: Partial<ListState>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const put = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key));
          if ('query' in patch) put('q', patch.query || null);
          if ('page' in patch) put('page', patch.page && patch.page > 1 ? String(patch.page) : null);
          if ('pageSize' in patch) put('size', patch.pageSize && patch.pageSize !== DEFAULT_PAGE_SIZE ? String(patch.pageSize) : null);
          if ('attentionOnly' in patch) put('attention', patch.attentionOnly ? '1' : null);
          if ('expandedId' in patch) put('item', patch.expandedId || null);
          if (patch.facets) {
            for (const key of [...next.keys()]) if (key.startsWith('f.')) next.delete(key);
            for (const [k, v] of Object.entries(patch.facets)) put(`f.${k}`, v || null);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  ) as (patch: Partial<ListState>) => void;

  const open = useCallback(
    (target: SectionId, itemId?: string) => {
      setParams((prev) => {
        const next = new URLSearchParams();
        next.set('section', target);
        if (itemId) next.set('item', itemId);
        const size = prev.get('size');
        if (size) next.set('size', size);
        return next;
      });
      clearTimeout(flashTimer.current);
      setFlashId(itemId || null);
      if (itemId) flashTimer.current = setTimeout(() => setFlashId(null), 1800);
      else window.scrollTo({ top: 0 });
    },
    [setParams]
  ) as (target: SectionId, itemId?: string) => void;

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Back-compat: Dashboard links here with router state { roleId }.
  useEffect(() => {
    const roleId = (location.state as any)?.roleId;
    if (roleId) open('roles', roleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!careerJourney) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center">
          <p className="text-sm text-slate-600">No career journey loaded yet.</p>
          <Button onClick={() => navigate('/')} className="mt-4 bg-brand-600 text-white">
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <EditorProvider open={open}>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-5">
          <div className="mx-auto max-w-6xl flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <button onClick={() => navigate('/')} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 mb-3">
                <ChevronLeft className="w-3.5 h-3.5" /> Back to Dashboard
              </button>
              <h1 className="text-2xl font-extrabold text-slate-900">Edit Career Journey</h1>
              <p className="text-sm text-slate-500 mt-1">Changes save automatically as you move between fields.</p>
            </div>
            <Link to="/journey" className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1" title="Links, vocabularies, changelog and raw JSON">
              Advanced editor <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-6">
          <EditorBody section={section} state={state} patchList={patchList} />
        </div>
      </div>
    </EditorProvider>
  );
}
