import React from 'react';
import { Card, Label } from '../../components/ui';
import { TagInput } from '../../components/TagInput';
import { EditField, StringListField } from '../../components/journey/fields';
import * as m from '../../lib/journeyMutations';
import { useEditor } from './EditorContext';

export function ProfileEditor() {
  const { cj, mutate } = useEditor();
  const person = cj.person || {};
  const positioning = person.positioning || {};
  const update = (patch: any) => mutate((d) => m.updatePerson(d, patch));
  const updatePositioning = (patch: any) => mutate((d) => m.updatePositioning(d, patch));

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Contact</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <EditField label="Name" value={person.name} onCommit={(v) => update({ name: v })} />
          <EditField label="Location" value={person.location} onCommit={(v) => update({ location: v })} />
          <EditField label="Email" value={person.email} onCommit={(v) => update({ email: v })} />
          <EditField label="Phone" value={person.phone} onCommit={(v) => update({ phone: v })} />
          <EditField label="LinkedIn" value={person.linkedin} onCommit={(v) => update({ linkedin: v })} />
          <EditField label="Website" value={person.website} onCommit={(v) => update({ website: v })} />
          <EditField label="GitHub" value={person.github} onCommit={(v) => update({ github: v })} />
          <EditField label="Work preference" value={person.work_preference} onCommit={(v) => update({ work_preference: v })} placeholder="e.g. Remote-first, US" />
        </div>
        <EditField
          label="Resume contact preference"
          value={person.resume_contact_preference}
          onCommit={(v) => update({ resume_contact_preference: v })}
          textarea
          rows={2}
          hint="Which contact details appear on generated resumes, and how."
        />
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Summary & brand</h3>
        <EditField label="Brand line" value={person.brand} onCommit={(v) => update({ brand: v })} />
        <EditField label="Summary" value={person.summary} onCommit={(v) => update({ summary: v })} textarea rows={5} />
        <StringListField label="Signature outcomes" values={person.signature_outcomes} onCommit={(signature_outcomes) => update({ signature_outcomes })} addLabel="Add outcome" />
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Positioning</h3>
        <EditField label="Primary tagline" value={positioning.primary_tagline} onCommit={(v) => updatePositioning({ primary_tagline: v })} textarea rows={2} />
        <EditField label="Role orientation" value={positioning.role_orientation} onCommit={(v) => updatePositioning({ role_orientation: v })} />
        <div>
          <Label>Target role families</Label>
          <TagInput
            tags={positioning.target_role_families || []}
            onChange={(target_role_families) => updatePositioning({ target_role_families })}
            placeholder="Add a role family and press Enter"
          />
        </div>
        <StringListField label="Narrative anchors" values={positioning.narrative_anchors} onCommit={(narrative_anchors) => updatePositioning({ narrative_anchors })} addLabel="Add anchor" />
      </Card>
    </div>
  );
}
