import React from 'react';
import { Plus } from 'lucide-react';
import { Button, Card, Label } from '../../components/ui';
import { EditField, EntityPicker, DeleteButton } from '../../components/journey/fields';
import * as m from '../../lib/journeyMutations';
import { roleLabel } from '../../lib/journeySections';
import { useEditor } from './EditorContext';

// `key` listed explicitly: no @types/react here, so JSX doesn't strip it (see JobTracker.tsx).
function DeliverableCard({ deliverable }: { key?: string; deliverable: any }) {
  const { mutate, options, open, createSkill } = useEditor();
  const update = (patch: any) => mutate((d) => m.updateDeliverable(d, deliverable.id, patch));
  return (
    <Card className="p-4 border-slate-200 bg-slate-50/50 space-y-3">
      <div className="text-[11px] font-semibold text-slate-400">{deliverable.id}</div>
      <EditField label="What you delivered" value={deliverable.description} onCommit={(v) => update({ description: v })} textarea rows={3} />
      <EditField label="Impact" value={deliverable.impact} onCommit={(v) => update({ impact: v })} textarea rows={2} placeholder="Why it mattered — outcome, metric, who benefited." />
      <div className="grid md:grid-cols-2 gap-4">
        <EntityPicker
          label="Capabilities"
          options={options.capabilities}
          value={deliverable.capability_alignment}
          onChange={(capability_alignment) => update({ capability_alignment })}
          onChipClick={(capId) => open('capabilities', capId)}
        />
        <EntityPicker
          label="Skills"
          options={options.skills}
          value={deliverable.skill_ids}
          onChange={(skill_ids) => update({ skill_ids })}
          onCreate={createSkill}
          createLabel="Add new skill"
          onChipClick={(skillId) => open('skills', skillId)}
        />
      </div>
      <DeleteButton label="Remove deliverable" confirmText="Remove this deliverable?" onConfirm={() => mutate((d) => m.deleteDeliverable(d, deliverable.id))} />
    </Card>
  );
}

export function ProjectEditor({ id }: { id: string }) {
  const { cj, mutate, open } = useEditor();
  const found = m.findInitiative(cj, id);
  if (!found) return null;
  const { role, initiative } = found;
  const update = (patch: any) => mutate((d) => m.updateInitiative(d, id, patch));
  const deliverables = initiative.deliverables || [];

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <EditField label="Project name" value={initiative.name} onCommit={(v) => update({ name: v })} />
        <div>
          <Label>Role</Label>
          <select
            value={role.id}
            onChange={(e) => mutate((d) => m.moveInitiative(d, id, e.target.value))}
            className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
          >
            {(cj.roles || []).map((r: any) => (
              <option key={r.id} value={r.id}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <EditField label="Description" value={initiative.description} onCommit={(v) => update({ description: v })} textarea rows={4} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="mb-0">Deliverables ({deliverables.length})</Label>
          <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => mutate((d, ids) => m.addDeliverable(d, ids, id))}>
            <Plus className="w-3.5 h-3.5 mr-1 text-brand-600" /> Add deliverable
          </Button>
        </div>
        <div className="space-y-3">
          {deliverables.length === 0 && <p className="text-xs text-slate-400">No deliverables yet.</p>}
          {deliverables.map((d: any) => (
            <DeliverableCard key={d.id} deliverable={d} />
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
        <button type="button" onClick={() => open('roles', role.id)} className="text-xs font-semibold text-brand-600 hover:text-brand-800">
          Open role: {roleLabel(role)}
        </button>
        <DeleteButton
          label="Delete project"
          confirmText={`Delete "${initiative.name || id}" and its ${deliverables.length} deliverables? This can't be undone.`}
          onConfirm={() => {
            mutate((d) => m.deleteInitiative(d, id));
            open('projects');
          }}
        />
      </div>
    </div>
  );
}
