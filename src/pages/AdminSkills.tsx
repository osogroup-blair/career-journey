import { useEffect, useMemo, useState } from 'react';
import { Button, LoadingButton, Card, CardHeader, CardTitle, CardContent, Textarea, Input, Badge, useToast } from '../components/ui';
import { getAdminSkills, saveAdminSkill, restoreAdminSkillDefault, createAdminSkill, deleteAdminSkill, AdminSkillConfig } from '../lib/aiClient';
import { RotateCcw, Save, Plus, Trash2 } from 'lucide-react';

const FAMILY_LABEL: Record<AdminSkillConfig['family'], string> = {
  pipeline: 'Job Pipeline',
  builder: 'Career Journey Builder',
  custom: 'Custom',
};

export default function AdminSkills() {
  const [skills, setSkills] = useState<Record<string, AdminSkillConfig>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newContent, setNewContent] = useState('');
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    getAdminSkills()
      .then((s) => {
        setSkills(s);
        setDrafts(Object.fromEntries(Object.entries(s).map(([name, cfg]) => [name, cfg.content])));
      })
      .catch((e) => toast.error('Failed to load skills: ' + e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const byFamily = useMemo<Record<string, AdminSkillConfig[]>>(() => {
    const groups: Record<string, AdminSkillConfig[]> = {};
    (Object.values(skills) as AdminSkillConfig[]).forEach((s) => {
      groups[s.family] = groups[s.family] || [];
      groups[s.family].push(s);
    });
    return groups;
  }, [skills]);

  const save = async (filename: string) => {
    setSavingId(filename);
    try {
      const saved = await saveAdminSkill(filename, drafts[filename]);
      setSkills((prev) => ({ ...prev, [filename]: saved }));
      toast.success(`Saved "${saved.label}" (v${saved.version}).`);
    } catch (e: any) {
      toast.error('Failed to save: ' + e.message);
    } finally {
      setSavingId(null);
    }
  };

  const restore = async (filename: string) => {
    try {
      const restored = await restoreAdminSkillDefault(filename);
      setSkills((prev) => ({ ...prev, [filename]: restored }));
      setDrafts((prev) => ({ ...prev, [filename]: restored.content }));
      toast.success('Restored to default.');
    } catch (e: any) {
      toast.error('Failed to restore: ' + e.message);
    }
  };

  const remove = async (filename: string) => {
    if (!confirm(`Delete the custom skill "${skills[filename]?.label}"? This can't be undone.`)) return;
    setDeletingId(filename);
    try {
      await deleteAdminSkill(filename);
      setSkills((prev) => {
        const next = { ...prev };
        delete next[filename];
        return next;
      });
      toast.success('Skill deleted.');
    } catch (e: any) {
      toast.error('Failed to delete: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const create = async () => {
    const filename = newFilename.trim().endsWith('.md') ? newFilename.trim() : `${newFilename.trim()}.md`;
    setCreating(true);
    try {
      const created = await createAdminSkill(filename, newLabel.trim(), newContent);
      setSkills((prev) => ({ ...prev, [created.filename]: created }));
      setDrafts((prev) => ({ ...prev, [created.filename]: created.content }));
      setShowCreate(false);
      setNewFilename('');
      setNewLabel('');
      setNewContent('');
      toast.success(`Created "${created.label}".`);
    } catch (e: any) {
      toast.error('Failed to create skill: ' + e.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading skills…</div>;

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin — AI Skills</h1>
          <p className="text-sm text-slate-500 mt-1">
            The reference material (server/knowledge/*.md) woven into every AI prompt's preamble — editable directly. Which skills a given prompt uses is controlled on the{' '}
            <a href="#/admin/prompts" className="text-brand-600 underline">AI Prompts</a> page.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> New Skill
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Custom Skill</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Filename</label>
                <Input value={newFilename} onChange={(e) => setNewFilename(e.target.value)} placeholder="e.g. linkedin_outreach_skill" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Label</label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. LinkedIn Outreach Skill" />
              </div>
            </div>
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Skill content (Markdown)…"
              className="font-mono text-xs min-h-[160px]"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
              <LoadingButton size="sm" onClick={create} isLoading={creating} loadingLabel="Creating..." disabled={!newFilename.trim() || !newLabel.trim() || !newContent.trim()}>
                Create
              </LoadingButton>
            </div>
          </CardContent>
        </Card>
      )}

      {Object.entries(byFamily).map(([family, familySkills]: [string, AdminSkillConfig[]]) => (
        <div key={family} className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-2">
            {FAMILY_LABEL[family as AdminSkillConfig['family']] ?? family}
          </h2>
          {familySkills.map((s) => {
            const isDirty = drafts[s.filename] !== s.content;
            return (
              <Card key={s.filename}>
                <CardHeader className="bg-slate-50 border-b">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{s.label}</CardTitle>
                      <p className="text-xs text-slate-500 mt-1 font-mono">{s.filename}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.version > 0 && <Badge variant="outline">v{s.version}</Badge>}
                      {isDirty && <Badge variant="warning">Unsaved</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <Textarea
                    value={drafts[s.filename] ?? ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [s.filename]: e.target.value }))}
                    className="font-mono text-xs min-h-[220px]"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {s.updatedAt ? `Last edited ${new Date(s.updatedAt).toLocaleString()}` : 'Using built-in default'}
                    </span>
                    <div className="flex gap-2">
                      {s.isCustom ? (
                        <LoadingButton variant="destructive" size="sm" onClick={() => remove(s.filename)} isLoading={deletingId === s.filename} loadingLabel="Deleting...">
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                        </LoadingButton>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => restore(s.filename)} disabled={s.version === 0}>
                          <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore Default
                        </Button>
                      )}
                      <LoadingButton size="sm" onClick={() => save(s.filename)} isLoading={savingId === s.filename} loadingLabel="Saving..." disabled={!isDirty}>
                        <Save className="w-3.5 h-3.5 mr-1.5" /> Save
                      </LoadingButton>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}
