import { useEffect, useMemo, useState } from 'react';
import { Button, LoadingButton, Card, CardHeader, CardTitle, CardContent, Textarea, Badge, useToast } from '../components/ui';
import { getAdminPrompts, saveAdminPrompt, restoreAdminPromptDefault, testRunAdminPrompt, AdminPromptConfig } from '../lib/aiClient';
import RequireAdmin from '../components/RequireAdmin';
import { PlayCircle, RotateCcw, Save, Sparkles } from 'lucide-react';

function AdminPromptsInner() {
  const [prompts, setPrompts] = useState<Record<string, AdminPromptConfig>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testRunId, setTestRunId] = useState<string | null>(null);
  const [testRunOutput, setTestRunOutput] = useState<any>(null);
  const toast = useToast();

  useEffect(() => {
    getAdminPrompts()
      .then((p) => {
        setPrompts(p);
        setDrafts(Object.fromEntries(Object.entries(p).map(([id, cfg]) => [id, cfg.template])));
      })
      .catch((e) => toast.error('Failed to load prompts: ' + e.message))
      .finally(() => setLoading(false));
  }, []);

  const byStage = useMemo<Record<string, AdminPromptConfig[]>>(() => {
    const groups: Record<string, AdminPromptConfig[]> = {};
    (Object.values(prompts) as AdminPromptConfig[]).forEach((p: AdminPromptConfig) => {
      groups[p.stage] = groups[p.stage] || [];
      groups[p.stage].push(p);
    });
    return groups;
  }, [prompts]);

  const save = async (id: string) => {
    setSavingId(id);
    try {
      const saved = await saveAdminPrompt(id, drafts[id]);
      setPrompts((prev) => ({ ...prev, [id]: { ...prev[id], template: saved.template, updatedAt: saved.updatedAt, version: saved.version } }));
      toast.success(`Saved "${prompts[id]?.label}" (v${saved.version}).`);
    } catch (e: any) {
      toast.error('Failed to save: ' + e.message);
    } finally {
      setSavingId(null);
    }
  };

  const restore = async (id: string) => {
    try {
      const restored = await restoreAdminPromptDefault(id);
      setPrompts((prev) => ({ ...prev, [id]: { ...prev[id], template: restored.template, updatedAt: null, version: 0 } }));
      setDrafts((prev) => ({ ...prev, [id]: restored.template }));
      toast.success('Restored to default.');
    } catch (e: any) {
      toast.error('Failed to restore: ' + e.message);
    }
  };

  const testRun = async (id: string) => {
    setTestRunId(id);
    setTestRunOutput(null);
    try {
      const { output } = await testRunAdminPrompt(id, drafts[id]);
      setTestRunOutput(output);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTestRunId(null);
    }
  };

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading prompts…</div>;

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin — AI Prompts</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every prompt driving the job pipeline, editable directly — nothing here is a black box. Edits apply immediately to live requests.
        </p>
      </div>

      {Object.entries(byStage).map(([stage, stagePrompts]: [string, AdminPromptConfig[]]) => (
        <div key={stage} className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-2">{stage}</h2>
          {stagePrompts.map((p) => {
            const isDirty = drafts[p.id] !== p.template;
            return (
              <Card key={p.id}>
                <CardHeader className="bg-slate-50 border-b">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base">{p.label}</CardTitle>
                      <p className="text-xs text-slate-500 mt-1">{p.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.version > 0 && <Badge variant="outline">v{p.version}</Badge>}
                      {isDirty && <Badge variant="warning">Unsaved</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  <Textarea
                    value={drafts[p.id] ?? ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    className="font-mono text-xs min-h-[220px]"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {p.updatedAt ? `Last edited ${new Date(p.updatedAt).toLocaleString()}` : 'Using built-in default'}
                    </span>
                    <div className="flex gap-2">
                      {p.id === 'parse' && (
                        <LoadingButton
                          variant="outline"
                          size="sm"
                          onClick={() => testRun(p.id)}
                          isLoading={testRunId === p.id}
                          loadingLabel="Running..."
                        >
                          <PlayCircle className="w-3.5 h-3.5 mr-1.5" /> Test Run
                        </LoadingButton>
                      )}
                      <Button variant="outline" size="sm" onClick={() => restore(p.id)} disabled={p.version === 0}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore Default
                      </Button>
                      <LoadingButton size="sm" onClick={() => save(p.id)} isLoading={savingId === p.id} loadingLabel="Saving..." disabled={!isDirty}>
                        <Save className="w-3.5 h-3.5 mr-1.5" /> Save
                      </LoadingButton>
                    </div>
                  </div>
                  {testRunId === null && testRunOutput && p.id === 'parse' && (
                    <div className="mt-2 p-3 bg-slate-900 rounded-lg text-slate-300 text-[11px] font-mono overflow-x-auto">
                      <div className="flex items-center gap-1.5 text-emerald-400 mb-1"><Sparkles className="w-3 h-3" /> Test run output</div>
                      <pre className="whitespace-pre-wrap">{JSON.stringify(testRunOutput, null, 2)}</pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function AdminPrompts() {
  return <RequireAdmin><AdminPromptsInner /></RequireAdmin>;
}
