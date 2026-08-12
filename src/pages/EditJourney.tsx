import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { generateId } from '../lib/utils';
import { Button, Card, Input, Label, Textarea } from '../components/ui';
import {
  ChevronLeft,
  Briefcase,
  Cpu,
  Plus,
  Trash2,
  X,
  ArrowUpRight,
  Award,
} from 'lucide-react';

const PROFICIENCY_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

// A text/textarea field with its own local state, committed to the store on blur.
// Avoids a store write (and localStorage serialization) on every keystroke.
function EditField({
  label,
  value,
  onCommit,
  placeholder,
  textarea = false,
  rows = 3,
  className = '',
}: {
  label?: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
  className?: string;
}) {
  const [local, setLocal] = useState(value || '');

  useEffect(() => {
    setLocal(value || '');
  }, [value]);

  const commit = () => {
    if (local !== value) onCommit(local);
  };

  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      {textarea ? (
        <Textarea
          value={local}
          placeholder={placeholder}
          rows={rows}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <Input
          value={local}
          placeholder={placeholder}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
        />
      )}
    </div>
  );
}

function SkillTagEditor({ skills, onChange }: { skills: string[]; onChange: (skills: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const addSkill = () => {
    const v = draft.trim();
    if (!v) return;
    if (!skills.some((s) => s.toLowerCase() === v.toLowerCase())) {
      onChange([...skills, v]);
    }
    setDraft('');
  };

  return (
    <div>
      <Label>Skills Used in This Role</Label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {(skills || []).map((sk, idx) => (
          <span key={idx} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md bg-slate-100 text-slate-700">
            {sk}
            <button
              onClick={() => onChange(skills.filter((_, i) => i !== idx))}
              className="text-slate-400 hover:text-red-600"
              title="Remove skill"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {(!skills || skills.length === 0) && <span className="text-xs text-slate-400">No skills tagged yet.</span>}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSkill();
            }
          }}
          placeholder="Add a skill and press Enter"
          className="h-9 text-sm"
        />
        <Button type="button" size="sm" variant="outline" onClick={addSkill} className="bg-white shrink-0">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

const RoleEditForm: React.FC<{ role: any; onDeleteRole: () => void }> = ({ role, onDeleteRole }) => {
  const { updateRole, addAchievementToRole, updateAchievementAtIndex, deleteAchievementAtIndex, addDeliverableToRole, updateDeliverableAtIndex, deleteDeliverableAtIndex } = useStore();

  const achievements = role.achievements || [];
  const deliverables = role.deliverables || [];

  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 gap-4">
        <EditField label="Role Title" value={role.title} onCommit={(v) => updateRole(role.id, { title: v })} placeholder="e.g. Senior Product Engineer" />
        <EditField
          label="Company"
          value={role.company || role.organization}
          onCommit={(v) => updateRole(role.id, { company: v, organization: v })}
          placeholder="e.g. Acme Corp"
        />
        <EditField label="Dates" value={role.dates} onCommit={(v) => updateRole(role.id, { dates: v })} placeholder="e.g. 2022 - Present" />
        <EditField label="Location" value={role.location} onCommit={(v) => updateRole(role.id, { location: v })} placeholder="e.g. Remote" />
        <EditField label="Industry" value={role.industry} onCommit={(v) => updateRole(role.id, { industry: v })} placeholder="e.g. Fintech" />
        <EditField label="Team Scope" value={role.team_scope} onCommit={(v) => updateRole(role.id, { team_scope: v })} placeholder="e.g. Led 6 engineers" />
      </div>

      <EditField
        label="Core Mandate / Mission"
        value={role.mission}
        onCommit={(v) => updateRole(role.id, { mission: v })}
        placeholder="What was this role fundamentally responsible for?"
        textarea
        rows={2}
      />

      <EditField
        label="Summary"
        value={role.summary}
        onCommit={(v) => updateRole(role.id, { summary: v })}
        placeholder="A short paragraph describing what you did in this role."
        textarea
        rows={3}
      />

      <SkillTagEditor skills={role.skills || []} onChange={(skills) => updateRole(role.id, { skills })} />

      {/* Achievements */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="mb-0">Measured Achievements</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="bg-white"
            onClick={() =>
              addAchievementToRole(role.id, { id: generateId('ACH'), metric: '', label: '', description: '' })
            }
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-brand-600" /> Add Achievement
          </Button>
        </div>
        <div className="space-y-3">
          {achievements.length === 0 && <p className="text-xs text-slate-400">No achievements added yet.</p>}
          {achievements.map((ach: any, idx: number) => {
            const isObj = typeof ach === 'object' && ach !== null;
            const metric = isObj ? ach.metric : '';
            const label = isObj ? ach.label : '';
            const description = isObj ? ach.description : ach;
            return (
              <Card key={idx} className="p-3.5 border-slate-200 bg-slate-50/50">
                <div className="grid sm:grid-cols-2 gap-3 mb-3">
                  <EditField
                    label="Metric (e.g. +$12M, -140ms)"
                    value={metric}
                    onCommit={(v) => updateAchievementAtIndex(role.id, idx, { ...(isObj ? ach : {}), metric: v, description })}
                  />
                  <EditField
                    label="Label (e.g. Revenue, Latency)"
                    value={label}
                    onCommit={(v) => updateAchievementAtIndex(role.id, idx, { ...(isObj ? ach : {}), label: v, description })}
                  />
                </div>
                <EditField
                  label="Description"
                  value={description}
                  onCommit={(v) => updateAchievementAtIndex(role.id, idx, isObj ? { ...ach, description: v } : v)}
                  textarea
                  rows={2}
                />
                <button
                  onClick={() => deleteAchievementAtIndex(role.id, idx)}
                  className="mt-2 text-xs font-semibold text-red-600 hover:text-red-800 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Deliverables */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Label className="mb-0">Shipped Deliverables</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="bg-white"
            onClick={() => addDeliverableToRole(role.id, '')}
          >
            <Plus className="w-3.5 h-3.5 mr-1 text-brand-600" /> Add Deliverable
          </Button>
        </div>
        <div className="space-y-3">
          {deliverables.length === 0 && <p className="text-xs text-slate-400">No deliverables added yet.</p>}
          {deliverables.map((del: any, idx: number) => {
            const isObj = typeof del === 'object' && del !== null;
            const text = isObj ? del.description : del;
            return (
              <div key={idx} className="flex items-start gap-2">
                <EditField
                  value={text}
                  onCommit={(v) => updateDeliverableAtIndex(role.id, idx, isObj ? { ...del, description: v } : v)}
                  textarea
                  rows={2}
                  className="flex-1"
                />
                <button
                  onClick={() => deleteDeliverableAtIndex(role.id, idx)}
                  className="mt-2 p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                  title="Delete deliverable"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <button
          onClick={onDeleteRole}
          className="text-sm font-semibold text-red-600 hover:text-red-800 flex items-center gap-1.5"
        >
          <Trash2 className="w-4 h-4" /> Delete This Role
        </button>
      </div>
    </div>
  );
};

function SkillsIndexEditor() {
  const { careerJourney, addSkillToIndex, updateSkillAtIndex, deleteSkillAtIndex } = useStore();
  const skills = careerJourney?.skills_index || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Master Skills Index</h3>
          <p className="text-xs text-slate-500 mt-0.5">The full skills list shown on your Dashboard's Skills tab.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="bg-white"
          onClick={() => addSkillToIndex({ name: 'New Skill', category: 'Core Competency', level: 'Intermediate', years: '' })}
        >
          <Plus className="w-3.5 h-3.5 mr-1 text-brand-600" /> Add Skill
        </Button>
      </div>

      {skills.length === 0 && <p className="text-sm text-slate-400">No skills indexed yet.</p>}

      <div className="space-y-3">
        {skills.map((skill: any, idx: number) => (
          <Card key={idx} className="p-3.5 border-slate-200">
            <div className="grid sm:grid-cols-[1fr_1fr_130px_90px_auto] gap-3 items-end">
              <EditField label="Name" value={skill.name} onCommit={(v) => updateSkillAtIndex(idx, { ...skill, name: v })} />
              <EditField label="Category" value={skill.category} onCommit={(v) => updateSkillAtIndex(idx, { ...skill, category: v })} />
              <div>
                <Label>Level</Label>
                <select
                  value={skill.level || skill.proficiency || 'Intermediate'}
                  onChange={(e) => updateSkillAtIndex(idx, { ...skill, level: e.target.value })}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                >
                  {PROFICIENCY_LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>
              <EditField label="Years" value={skill.years} onCommit={(v) => updateSkillAtIndex(idx, { ...skill, years: v })} placeholder="e.g. 5+" />
              <button
                onClick={() => deleteSkillAtIndex(idx)}
                className="h-10 flex items-center justify-center text-slate-400 hover:text-red-600"
                title="Delete skill"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function EditJourney() {
  const { careerJourney, updateCareerJourneyMeta, addRole, deleteRole } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  const meta = careerJourney?.meta || {};
  const roles = useMemo(() => careerJourney?.roles || [], [careerJourney]);

  const [section, setSection] = useState<'roles' | 'skills'>('roles');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>((location.state as any)?.roleId || null);

  const selectedRole = useMemo(() => {
    return roles.find((r: any) => r.id === selectedRoleId) || roles[0] || null;
  }, [roles, selectedRoleId]);

  const handleAddRole = () => {
    const id = generateId('ROLE');
    addRole({
      id,
      title: 'New Role',
      company: 'Company Name',
      organization: 'Company Name',
      dates: '2024 - Present',
      start_date: '2024-01',
      end_date: 'Present',
      location: '',
      mission: '',
      summary: '',
      skills: [],
      achievements: [],
      deliverables: [],
      initiatives: [],
      methodologies: [],
    });
    setSelectedRoleId(id);
  };

  const handleDeleteRole = () => {
    if (!selectedRole) return;
    if (window.confirm(`Delete "${selectedRole.title}"? This can't be undone.`)) {
      deleteRole(selectedRole.id);
      setSelectedRoleId(null);
    }
  };

  if (!careerJourney) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center">
          <p className="text-sm text-slate-600">No career journey loaded yet.</p>
          <Button onClick={() => navigate('/')} className="mt-4 bg-brand-600 text-white">Back to Dashboard</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-24">
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-5">
        <div className="mx-auto max-w-5xl">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 mb-3"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>
          <h1 className="text-2xl font-extrabold text-slate-900">Edit Career Journey</h1>
          <p className="text-sm text-slate-500 mt-1">Changes save automatically as you move between fields.</p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8 space-y-8">

        {/* Profile */}
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900 mb-4">Profile</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <EditField label="Your Name" value={meta.owner} onCommit={(v) => updateCareerJourneyMeta({ owner: v })} />
            <EditField label="Target Role" value={meta.target_role} onCommit={(v) => updateCareerJourneyMeta({ target_role: v })} />
          </div>
          <EditField
            label="Description"
            value={meta.description}
            onCommit={(v) => updateCareerJourneyMeta({ description: v })}
            textarea
            rows={2}
            className="mt-4"
          />
        </Card>

        {/* Section switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setSection('roles')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors ${
              section === 'roles' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" /> Roles
          </button>
          <button
            onClick={() => setSection('skills')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-md transition-colors ${
              section === 'skills' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" /> Skills Index
          </button>
        </div>

        {section === 'roles' && (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
            <div className="space-y-2">
              <Button size="sm" variant="outline" className="w-full bg-white justify-center" onClick={handleAddRole}>
                <Plus className="w-3.5 h-3.5 mr-1 text-brand-600" /> Add Role
              </Button>
              {roles.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    selectedRole?.id === r.id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className={`text-sm font-bold truncate ${selectedRole?.id === r.id ? 'text-brand-800' : 'text-slate-900'}`}>
                    {r.title || 'Untitled Role'}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{r.company || r.organization}</div>
                </button>
              ))}
              {roles.length === 0 && <p className="text-xs text-slate-400 px-1">No roles yet — add your first one.</p>}
            </div>

            <Card className="p-6">
              {selectedRole ? (
                <RoleEditForm key={selectedRole.id} role={selectedRole} onDeleteRole={handleDeleteRole} />
              ) : (
                <p className="text-sm text-slate-400">Select or add a role to start editing.</p>
              )}
            </Card>
          </div>
        )}

        {section === 'skills' && (
          <Card className="p-6">
            <SkillsIndexEditor />
          </Card>
        )}

        <div className="pt-4 pb-8 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" /> Need capabilities, methodologies, or raw JSON?
          </span>
          <Link to="/journey" className="font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1">
            Open Advanced Editor <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

      </div>
    </div>
  );
}
