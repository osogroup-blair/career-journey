import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Label } from '../ui';
import { EditField } from './fields';

// Resume-facing fields plus the three free-form structured note fields
// (team_leadership / advisory_ps_scope / organization_scale) real role data carries.
// Shown collapsed by default since most roles don't need every field.
// Shared by the Simple (/edit) and Advanced (/journey) editors.

// Sizes are numbers in real data — keep them numeric when the input is a plain number.
const numOrText = (v: string) => (/^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : v);
export function RoleResumeDetails({ role, onChange, defaultOpen = false }: { role: any; onChange: (updates: any) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const teamLeadership = typeof role.team_leadership === 'object' && role.team_leadership ? role.team_leadership : {};
  const advisoryScope = typeof role.advisory_ps_scope === 'object' && role.advisory_ps_scope ? role.advisory_ps_scope : {};
  const orgScale = typeof role.organization_scale === 'object' && role.organization_scale ? role.organization_scale : {};

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-slate-100"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />} Resume & Positioning Details
        </span>
      </button>
      {open && (
        <div className="p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <EditField label="Company Descriptor" value={role.company_descriptor} onCommit={(v) => onChange({ company_descriptor: v })} />
            <EditField label="Resume Company Descriptor" value={role.resume_company_descriptor} onCommit={(v) => onChange({ resume_company_descriptor: v })} />
            <EditField label="Resume Company URL" value={role.resume_company_url} onCommit={(v) => onChange({ resume_company_url: v })} />
            <div>
              <Label>Default on Tailored Resumes</Label>
              <select
                value={role.resume_default || ''}
                onChange={(e) => onChange({ resume_default: e.target.value || undefined })}
                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Automatic (by age)</option>
                <option value="full">Full, with bullets</option>
                <option value="condensed">One line under Earlier Experience</option>
                <option value="excluded">Leave off</option>
              </select>
            </div>
          </div>
          <EditField label="Positioning Note" value={role.positioning_note} onCommit={(v) => onChange({ positioning_note: v })} textarea rows={2} />

          <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
            <div className="space-y-1.5">
              <Label>Team Leadership</Label>
              <EditField value={teamLeadership.team_name} placeholder="Team name" onCommit={(v) => onChange({ team_leadership: { ...teamLeadership, team_name: v } })} />
              <div className="grid grid-cols-2 gap-1.5">
                <EditField value={teamLeadership.starting_size != null ? String(teamLeadership.starting_size) : ''} placeholder="Start size" onCommit={(v) => onChange({ team_leadership: { ...teamLeadership, starting_size: numOrText(v) } })} />
                <EditField value={teamLeadership.peak_size != null ? String(teamLeadership.peak_size) : ''} placeholder="Peak size" onCommit={(v) => onChange({ team_leadership: { ...teamLeadership, peak_size: numOrText(v) } })} />
              </div>
              <EditField value={teamLeadership.growth_narrative} placeholder="Growth narrative" textarea rows={2} onCommit={(v) => onChange({ team_leadership: { ...teamLeadership, growth_narrative: v } })} />
            </div>
            <div className="space-y-1.5">
              <Label>Advisory / PS Scope</Label>
              <EditField value={advisoryScope.title_external} placeholder="External title" onCommit={(v) => onChange({ advisory_ps_scope: { ...advisoryScope, title_external: v } })} />
              <EditField value={advisoryScope.clarification} placeholder="Clarification" textarea rows={2} onCommit={(v) => onChange({ advisory_ps_scope: { ...advisoryScope, clarification: v } })} />
            </div>
            <div className="space-y-1.5">
              <Label>Organization Scale</Label>
              <div className="grid grid-cols-2 gap-1.5">
                <EditField value={orgScale.approx_total_people != null ? String(orgScale.approx_total_people) : ''} placeholder="Total people" onCommit={(v) => onChange({ organization_scale: { ...orgScale, approx_total_people: numOrText(v) } })} />
                <EditField value={orgScale.approx_fte != null ? String(orgScale.approx_fte) : ''} placeholder="FTEs" onCommit={(v) => onChange({ organization_scale: { ...orgScale, approx_fte: numOrText(v) } })} />
              </div>
              <EditField value={orgScale.context} placeholder="Context" textarea rows={2} onCommit={(v) => onChange({ organization_scale: { ...orgScale, context: v } })} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
