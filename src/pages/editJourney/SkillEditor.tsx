import React, { useMemo } from 'react';
import { Label } from '../../components/ui';
import { EditField, EntityPicker, NumberField, SelectField, DeleteButton, Suggestions } from '../../components/journey/fields';
import * as m from '../../lib/journeyMutations';
import { roleLabel, type SectionId } from '../../lib/journeySections';
import { useEditor } from './EditorContext';

/** Every place a skill id is referenced, for the "Used in" list and the delete warning. */
function skillUsage(cj: any, skillId: string) {
  const used: { section: SectionId; id: string; label: string }[] = [];
  for (const role of cj.roles || []) {
    if ((role.skills || []).includes(skillId)) used.push({ section: 'roles', id: role.id, label: roleLabel(role) });
    for (const i of role.initiatives || []) {
      if ((i.deliverables || []).some((d: any) => (d.skill_ids || []).includes(skillId))) used.push({ section: 'projects', id: i.id, label: i.name || i.id });
    }
  }
  for (const cap of cj.capabilities || []) {
    for (const fn of cap.functions || []) {
      if (fn && typeof fn === 'object' && (fn.skills || []).some((s: any) => s.id === skillId)) used.push({ section: 'capabilities', id: cap.id, label: `${cap.name} › ${fn.name}` });
    }
  }
  for (const a of cj.achievements || []) if ((a.skill_ids || []).includes(skillId)) used.push({ section: 'achievements', id: a.id, label: a.title || a.id });
  for (const e of cj.education || []) if ((e.skills_reinforced || []).includes(skillId)) used.push({ section: 'education', id: e.id, label: e.institution || e.id });
  return used;
}

export function SkillEditor({ id }: { id: string }) {
  const { cj, mutate, open, vocab, categories, options } = useEditor();
  const skill = (cj.skills_index || []).find((s: any) => s.id === id);
  const usage = useMemo(() => skillUsage(cj, id), [cj, id]);
  // Deliverables are edited on their project, so they stay a read-only list here.
  const projects = usage.filter((u) => u.section === 'projects');
  if (!skill) return null;
  const update = (patch: any) => mutate((d) => m.updateSkill(d, id, patch));

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <EditField label="Name" value={skill.name} onCommit={(v) => update({ name: v })} />
        <EditField label="Category" value={skill.category} onCommit={(v) => update({ category: v })} list="skill-categories" />
        <Suggestions id="skill-categories" values={categories.skills} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <SelectField label="Proficiency" value={skill.proficiency} options={vocab.proficiency_levels} onCommit={(v) => update({ proficiency: v })} />
        <NumberField label="Years" value={skill.years_experience} onCommit={(v) => update({ years_experience: v })} placeholder="e.g. 5" />
        <EditField label="Last used" value={skill.last_used} onCommit={(v) => update({ last_used: v })} placeholder="Present or YYYY" />
      </div>
      <EditField label="Description" value={skill.description} onCommit={(v) => update({ description: v })} textarea rows={2} placeholder="Optional — what this skill looks like in your work." />

      <div className="grid md:grid-cols-2 gap-4">
        <EntityPicker
          label="Roles"
          options={options.roles}
          value={m.skillRoleIds(cj, id)}
          onChange={(roleIds) => mutate((d, ids) => m.setSkillRoles(d, ids, id, roleIds))}
          onChipClick={(roleId) => open('roles', roleId)}
        />
        <EntityPicker
          label="Capability functions"
          options={options.functions}
          value={m.skillFunctionIds(cj, id)}
          onChange={(fnIds) => mutate((d) => m.setSkillFunctions(d, id, fnIds))}
          onChipClick={(fnId) => open('capabilities', m.findFunction(cj, fnId)?.capability.id)}
        />
        <EntityPicker
          label="Achievements"
          options={options.achievements}
          value={m.referrerIds(cj.achievements, 'skill_ids', id)}
          onChange={(achIds) => mutate((d) => m.setReferrers(d.achievements, 'skill_ids', id, achIds))}
          onChipClick={(achId) => open('achievements', achId)}
        />
        <EntityPicker
          label="Education"
          options={options.education}
          value={m.referrerIds(cj.education, 'skills_reinforced', id)}
          onChange={(eduIds) => mutate((d) => m.setReferrers(d.education, 'skills_reinforced', id, eduIds))}
          onChipClick={(eduId) => open('education', eduId)}
        />
      </div>

      <div>
        <Label>Project deliverables ({projects.length})</Label>
        <div className="flex flex-wrap gap-1.5">
          {projects.length === 0 && <span className="text-xs text-slate-400">No deliverables use this skill. Link it from a deliverable on the project.</span>}
          {projects.map((u, idx) => (
            <button key={`${u.id}-${idx}`} type="button" onClick={() => open(u.section, u.id)} className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-brand-50 hover:text-brand-800">
              {u.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <DeleteButton
          label="Delete skill"
          confirmText={`Delete "${skill.name || id}"?${usage.length ? ` It will be unlinked from ${usage.length} place${usage.length === 1 ? '' : 's'}.` : ''} This can't be undone.`}
          onConfirm={() => {
            mutate((d) => m.deleteSkill(d, id));
            open('skills');
          }}
        />
      </div>
    </div>
  );
}
