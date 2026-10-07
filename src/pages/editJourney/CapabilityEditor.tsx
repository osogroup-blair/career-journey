import React from 'react';
import { Plus, ArrowUpCircle } from 'lucide-react';
import { Button, Card, Label } from '../../components/ui';
import { EditField, EntityPicker, SelectField, DeleteButton } from '../../components/journey/fields';
import * as m from '../../lib/journeyMutations';
import { roleLabel } from '../../lib/journeySections';
import { useEditor } from './EditorContext';

// `key` listed explicitly: no @types/react here, so JSX doesn't strip it (see JobTracker.tsx).
function FunctionCard({ fn }: { key?: string; fn: any }) {
  const { mutate, options, vocab, open, createSkill } = useEditor();
  const update = (patch: any) => mutate((d) => m.updateFunction(d, fn.id, patch));
  return (
    <Card className="p-4 border-slate-200 bg-slate-50/50 space-y-3">
      <div className="text-[11px] font-semibold text-slate-400">{fn.id}</div>
      <EditField label="Function" value={fn.name} onCommit={(v) => update({ name: v })} />
      <div className="grid sm:grid-cols-2 gap-3">
        <SelectField label="Competency" value={fn.competency_level} options={vocab.competency_levels} onCommit={(v) => update({ competency_level: v })} />
        <SelectField label="Value stream stage" value={fn.value_stream_stage} options={vocab.value_stream_stages} onCommit={(v) => update({ value_stream_stage: v })} />
      </div>
      <EditField label="Description" value={fn.description} onCommit={(v) => update({ description: v })} textarea rows={2} />
      <EntityPicker
        label="Skills"
        options={options.skills}
        value={(fn.skills || []).map((s: any) => s.id)}
        onChange={(skillIds) => mutate((d) => m.setFunctionSkills(d, fn.id, skillIds))}
        onCreate={createSkill}
        createLabel="Add new skill"
        onChipClick={(skillId) => open('skills', skillId)}
      />
      <DeleteButton label="Remove function" confirmText={`Remove "${fn.name || fn.id}"?`} onConfirm={() => mutate((d) => m.deleteFunction(d, fn.id))} />
    </Card>
  );
}

export function CapabilityEditor({ id }: { id: string }) {
  const { cj, mutate, vocab, open, options } = useEditor();
  const cap = (cj.capabilities || []).find((c: any) => c.id === id);
  if (!cap) return null;
  const update = (patch: any) => mutate((d) => m.updateCapability(d, id, patch));
  const functions = cap.functions || [];
  // One chip per project, however many of its deliverables align to this capability.
  const projects = [...new Map(m.capabilityDeliverables(cj, id).map((x) => [x.initiative.id, x])).values()];

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-[1fr_220px] gap-4">
        <EditField label="Capability" value={cap.name} onCommit={(v) => update({ name: v })} />
        <SelectField label="Maturity" value={cap.maturity_level} options={vocab.maturity_levels} onCommit={(v) => update({ maturity_level: v })} />
      </div>
      <EditField label="Description" value={cap.description} onCommit={(v) => update({ description: v })} textarea rows={3} />

      <div className="grid md:grid-cols-2 gap-4">
        <EntityPicker
          label="Roles"
          options={options.roles}
          value={m.capabilityRoleIds(cj, id)}
          onChange={(roleIds) => mutate((d, ids) => m.setCapabilityRoles(d, ids, id, roleIds))}
          onChipClick={(roleId) => open('roles', roleId)}
        />
        <EntityPicker
          label="Education"
          options={options.education}
          value={m.referrerIds(cj.education, 'capability_alignment', id)}
          onChange={(eduIds) => mutate((d) => m.setReferrers(d.education, 'capability_alignment', id, eduIds))}
          onChipClick={(eduId) => open('education', eduId)}
        />
      </div>

      <div>
        <Label>Project deliverables ({projects.length})</Label>
        <div className="flex flex-wrap gap-1.5">
          {projects.length === 0 && <span className="text-xs text-slate-400">No deliverables are aligned to this capability. Link it from a deliverable on the project.</span>}
          {projects.map(({ role, initiative }) => (
            <button key={initiative.id} type="button" onClick={() => open('projects', initiative.id)} className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-brand-50 hover:text-brand-800">
              {initiative.name || initiative.id} <span className="text-slate-400">· {roleLabel(role)}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="mb-0">Functions ({functions.length})</Label>
          <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => mutate((d, ids) => m.addFunction(d, ids, id, { name: 'New function' }))}>
            <Plus className="w-3.5 h-3.5 mr-1 text-brand-600" /> Add function
          </Button>
        </div>
        <div className="space-y-3">
          {functions.length === 0 && <p className="text-xs text-slate-400">No functions yet.</p>}
          {functions.map((fn: any) =>
            typeof fn === 'string' ? (
              <div key={fn} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span>
                  Legacy function reference <strong>{fn}</strong>
                </span>
                <button type="button" onClick={() => mutate((d) => m.upgradeLegacyFunction(d, id, fn))} className="font-semibold flex items-center gap-1 hover:underline">
                  <ArrowUpCircle className="w-3.5 h-3.5" /> Upgrade
                </button>
              </div>
            ) : (
              <FunctionCard key={fn.id} fn={fn} />
            )
          )}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <DeleteButton
          label="Delete capability"
          confirmText={`Delete "${cap.name || id}" and its ${functions.length} functions? Projects and education lose their link to it. This can't be undone.`}
          onConfirm={() => {
            mutate((d) => m.deleteCapability(d, id));
            open('capabilities');
          }}
        />
      </div>
    </div>
  );
}
