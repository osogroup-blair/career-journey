import React from 'react';
import { EditField, EntityPicker, StringListField, CheckboxField, DeleteButton } from '../../components/journey/fields';
import * as m from '../../lib/journeyMutations';
import type { FlatListKey } from '../../lib/journeyMutations';
import type { SectionId } from '../../lib/journeySections';
import { useEditor } from './EditorContext';

// Editors for the flat top-level lists: education, certifications, methodologies, client engagements.

function useListItem(key: FlatListKey, id: string) {
  const { cj, mutate } = useEditor();
  const item = (cj[key] || []).find((x: any) => x.id === id);
  const update = (patch: any) => mutate((d) => m.updateListItem(d, key, id, patch));
  return { item, update };
}

function DeleteFooter({ listKey, section, id, name }: { listKey: FlatListKey; section: SectionId; id: string; name: string }) {
  const { mutate, open } = useEditor();
  return (
    <div className="pt-4 border-t border-slate-100">
      <DeleteButton
        label="Delete"
        confirmText={`Delete "${name || id}"? This can't be undone.`}
        onConfirm={() => {
          mutate((d) => m.deleteListItem(d, listKey, id));
          open(section);
        }}
      />
    </div>
  );
}

export function EducationEditor({ id }: { id: string }) {
  const { options, open, createSkill } = useEditor();
  const { item, update } = useListItem('education', id);
  if (!item) return null;
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <EditField label="Institution" value={item.institution} onCommit={(v) => update({ institution: v })} />
        <EditField label="Program" value={item.program} onCommit={(v) => update({ program: v })} />
        <EditField label="Degree type" value={item.degree_type} onCommit={(v) => update({ degree_type: v })} placeholder="e.g. BS, Coursework" />
        <EditField label="Location" value={item.location} onCommit={(v) => update({ location: v })} />
        <EditField label="Start" value={item.start} onCommit={(v) => update({ start: v })} placeholder="YYYY" />
        <EditField label="End" value={item.end} onCommit={(v) => update({ end: v })} placeholder="YYYY" />
        <EditField label="Completion status" value={item.completion_status} onCommit={(v) => update({ completion_status: v })} />
        <EditField label="How it reads on a resume" value={item.resume_display} onCommit={(v) => update({ resume_display: v })} />
      </div>
      <EditField label="Description" value={item.description} onCommit={(v) => update({ description: v })} textarea rows={4} />
      <StringListField label="Achievements" values={item.achievements} onCommit={(achievements) => update({ achievements })} />
      <div className="grid md:grid-cols-2 gap-4">
        <EntityPicker label="Capabilities" options={options.capabilities} value={item.capability_alignment} onChange={(capability_alignment) => update({ capability_alignment })} onChipClick={(c) => open('capabilities', c)} />
        <EntityPicker label="Skills reinforced" options={options.skills} value={item.skills_reinforced} onChange={(skills_reinforced) => update({ skills_reinforced })} onCreate={createSkill} createLabel="Add new skill" onChipClick={(s) => open('skills', s)} />
      </div>
      <DeleteFooter listKey="education" section="education" id={id} name={item.institution} />
    </div>
  );
}

export function CertificationEditor({ id }: { id: string }) {
  const { item, update } = useListItem('certifications', id);
  if (!item) return null;
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <EditField label="Name" value={item.name} onCommit={(v) => update({ name: v })} />
        <EditField label="Issuer" value={item.issuer} onCommit={(v) => update({ issuer: v })} />
        <EditField label="Date" value={item.date} onCommit={(v) => update({ date: v })} placeholder="YYYY-MM" />
        <EditField label="Status" value={item.status} onCommit={(v) => update({ status: v })} placeholder="e.g. Active, Expired" />
        <EditField label="Credential URL" value={item.url} onCommit={(v) => update({ url: v })} className="sm:col-span-2" />
      </div>
      <DeleteFooter listKey="certifications" section="certifications" id={id} name={item.name} />
    </div>
  );
}

export function MethodologyEditor({ id }: { id: string }) {
  const { item, update } = useListItem('methodologies', id);
  if (!item) return null;
  return (
    <div className="space-y-5">
      <EditField label="Name" value={item.name} onCommit={(v) => update({ name: v })} />
      <EditField label="Description" value={item.description} onCommit={(v) => update({ description: v })} textarea rows={3} />
      <EditField label="Where you applied it" value={item.context} onCommit={(v) => update({ context: v })} textarea rows={2} />
      <DeleteFooter listKey="methodologies" section="methodologies" id={id} name={item.name} />
    </div>
  );
}

export function EngagementEditor({ id }: { id: string }) {
  const { item, update } = useListItem('customer_engagements', id);
  if (!item) return null;
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <EditField label="Client" value={item.client} onCommit={(v) => update({ client: v })} />
        <EditField label="Project" value={item.project} onCommit={(v) => update({ project: v })} />
        <EditField label="Dates" value={item.dates} onCommit={(v) => update({ dates: v })} placeholder="e.g. 2021-11 to 2022-02" />
      </div>
      <EditField label="Description" value={item.description} onCommit={(v) => update({ description: v })} textarea rows={3} />
      <CheckboxField label="Show on resumes" checked={item.display !== false} onCommit={(display) => update({ display })} />
      <DeleteFooter listKey="customer_engagements" section="engagements" id={id} name={item.client} />
    </div>
  );
}
