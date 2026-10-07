import React from 'react';
import { Plus, FolderKanban, Trophy } from 'lucide-react';
import { Button, Label } from '../../components/ui';
import { EditField, EntityPicker, DeleteButton } from '../../components/journey/fields';
import { RoleResumeDetails } from '../../components/journey/RoleResumeDetails';
import { getRoleAchievements } from '../../lib/careerJourneyRoleEvidence';
import * as m from '../../lib/journeyMutations';
import { useEditor } from './EditorContext';

export function RoleEditor({ id }: { id: string }) {
  const { cj, mutate, open, options, createSkill } = useEditor();
  const role = (cj.roles || []).find((r: any) => r.id === id);
  if (!role) return null;

  const update = (patch: any) => mutate((d) => m.updateRole(d, id, patch));
  const achievements = getRoleAchievements(cj, id);

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <EditField label="Title" value={role.title} onCommit={(v) => update({ title: v })} placeholder="e.g. Chief Strategy Officer" />
        <EditField label="Company" value={role.organization || role.company} onCommit={(v) => update({ organization: v, company: v })} placeholder="e.g. Acme Corp" />
        <EditField label="Start" value={role.start_date} onCommit={(v) => update({ start_date: v })} placeholder="YYYY-MM" />
        <EditField label="End" value={role.end_date} onCommit={(v) => update({ end_date: v })} placeholder="YYYY-MM or Present" />
        <EditField label="Location" value={role.location} onCommit={(v) => update({ location: v })} placeholder="e.g. Remote" className="sm:col-span-2" />
      </div>

      <EditField
        label="Description"
        value={role.description}
        onCommit={(v) => update({ description: v })}
        textarea
        rows={6}
        placeholder="What you were accountable for, the scope, and the context."
        hint="The main narrative for this role — resume generation and fit scoring read this."
      />

      <RoleResumeDetails role={role} onChange={update} />

      <EntityPicker
        label="Skills used in this role"
        options={options.skills}
        value={role.skills}
        onChange={(skills) => update({ skills })}
        onCreate={createSkill}
        createLabel="Add new skill"
        onChipClick={(skillId) => open('skills', skillId)}
      />

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="mb-0 flex items-center gap-1.5">
            <FolderKanban className="w-3.5 h-3.5" /> Projects ({(role.initiatives || []).length})
          </Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="bg-white"
            onClick={() => {
              const newId = mutate((d, ids) => m.addInitiative(d, ids, id, { name: 'New project' }));
              if (newId) open('projects', newId);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-brand-600" /> Add project
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(role.initiatives || []).length === 0 && <span className="text-xs text-slate-400">No projects yet.</span>}
          {(role.initiatives || []).map((i: any) => (
            <button key={i.id} type="button" onClick={() => open('projects', i.id)} className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-brand-50 hover:text-brand-800">
              {i.name || i.id} <span className="text-slate-400">· {(i.deliverables || []).length}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="mb-0 flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5" /> Achievements ({achievements.length})
          </Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="bg-white"
            onClick={() => {
              const newId = mutate((d, ids) => m.addAchievement(d, ids, { title: 'New achievement' }, [id]));
              if (newId) open('achievements', newId);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-brand-600" /> Add achievement
          </Button>
        </div>
        <ul className="space-y-1">
          {achievements.length === 0 && <li className="text-xs text-slate-400">No achievements linked yet.</li>}
          {achievements.map((a: any) => (
            <li key={a.id}>
              <button type="button" onClick={() => open('achievements', a.id)} className="text-left text-sm text-slate-700 hover:text-brand-700 hover:underline">
                <span className="text-[11px] text-slate-400 mr-1.5">{a.id}</span>
                {a.title}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <DeleteButton
          label="Delete this role"
          confirmText={`Delete "${role.title || id}"? Its ${(role.initiatives || []).length} projects go with it, and achievements lose their link to this role. This can't be undone.`}
          onConfirm={() => {
            mutate((d) => m.deleteRole(d, id));
            open('roles');
          }}
        />
      </div>
    </div>
  );
}
