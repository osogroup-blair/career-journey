import React from 'react';
import { EditField, EntityPicker, DeleteButton, Suggestions } from '../../components/journey/fields';
import * as m from '../../lib/journeyMutations';
import { useEditor } from './EditorContext';

export function AchievementEditor({ id }: { id: string }) {
  const { cj, mutate, open, options, categories, createSkill } = useEditor();
  const ach = (cj.achievements || []).find((a: any) => a.id === id);
  if (!ach) return null;
  const update = (patch: any) => mutate((d) => m.updateAchievement(d, id, patch));

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-[1fr_260px] gap-4">
        <EditField label="Title" value={ach.title} onCommit={(v) => update({ title: v })} />
        <EditField label="Category" value={ach.category} onCommit={(v) => update({ category: v })} list="achievement-categories" />
        <Suggestions id="achievement-categories" values={categories.achievements} />
      </div>
      <EditField
        label="Description"
        value={ach.description}
        onCommit={(v) => update({ description: v })}
        textarea
        rows={4}
        hint="Lead with the outcome. A number (%, $, time, count) makes it far stronger on a resume."
      />
      <div className="grid md:grid-cols-2 gap-4">
        <EntityPicker
          label="Roles"
          options={options.roles}
          value={m.achievementRoleIds(cj, id)}
          onChange={(roleIds) => mutate((d, ids) => m.setAchievementRoles(d, ids, id, roleIds))}
          onChipClick={(roleId) => open('roles', roleId)}
        />
        <EntityPicker
          label="Skills"
          options={options.skills}
          value={ach.skill_ids}
          onChange={(skill_ids) => update({ skill_ids })}
          onCreate={createSkill}
          createLabel="Add new skill"
          onChipClick={(skillId) => open('skills', skillId)}
        />
      </div>
      <div className="pt-4 border-t border-slate-100">
        <DeleteButton
          label="Delete achievement"
          confirmText={`Delete "${ach.title || id}"? This can't be undone.`}
          onConfirm={() => {
            mutate((d) => m.deleteAchievement(d, id));
            open('achievements');
          }}
        />
      </div>
    </div>
  );
}
