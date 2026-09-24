import { useEffect, useMemo, useState, useRef } from 'react';
import { Button, LoadingButton, Card, CardHeader, CardTitle, CardContent, Textarea, Badge, useToast } from '../components/ui';
import {
  getAdminPrompts,
  saveAdminPrompt,
  restoreAdminPromptDefault,
  saveAdminPromptAiConfig,
  getAdminPromptContextSize,
  getAdminKnowledgeFiles,
  testRunAdminPrompt,
  AdminPromptConfig,
  PromptContextSize,
} from '../lib/aiClient';
import { dataStore } from '../data';
import { AllowedModelsConfig } from '../types/aiModels';
import { AIProviderId } from '../types/billing';
import { PlayCircle, RotateCcw, Save, Sparkles, AlertTriangle } from 'lucide-react';

const PROVIDERS: AIProviderId[] = ['ollama', 'gemini', 'openai', 'anthropic'];
const PROVIDER_LABEL: Record<AIProviderId, string> = { ollama: 'Local (Ollama)', gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic' };
const DEFAULT_OPTION = '__default__';

function emptyModelsConfig(): AllowedModelsConfig {
  return { gemini: [], openai: [], anthropic: [], ollama: [] };
}

type ModelDraft = { provider: AIProviderId; model: string } | null;

export default function AdminPrompts() {
  const [prompts, setPrompts] = useState<Record<string, AdminPromptConfig>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [modelDrafts, setModelDrafts] = useState<Record<string, ModelDraft>>({});
  const [knowledgeDrafts, setKnowledgeDrafts] = useState<Record<string, string[] | null>>({});
  const [models, setModels] = useState<AllowedModelsConfig>(emptyModelsConfig());
  const [knowledgeFiles, setKnowledgeFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testRunId, setTestRunId] = useState<string | null>(null);
  const [testRunOutput, setTestRunOutput] = useState<Record<string, { output: any; usage?: any; provider?: string; model?: string }>>({});
  const [contextSizes, setContextSizes] = useState<Record<string, PromptContextSize | 'loading' | null>>({});
  const toast = useToast();
  const contextSizeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    Promise.all([getAdminPrompts(), dataStore.getAllowedModels(), getAdminKnowledgeFiles()])
      .then(([p, m, files]) => {
        setPrompts(p);
        setDrafts(Object.fromEntries(Object.entries(p).map(([id, cfg]) => [id, cfg.template])));
        setModelDrafts(Object.fromEntries(Object.entries(p).map(([id, cfg]) => [id, cfg.modelOverride])));
        setKnowledgeDrafts(Object.fromEntries(Object.entries(p).map(([id, cfg]) => [id, cfg.includedKnowledge])));
        setModels({ ...emptyModelsConfig(), ...m });
        setKnowledgeFiles(files);
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

  const scheduleContextSize = (id: string) => {
    clearTimeout(contextSizeTimers.current[id]);
    setContextSizes((prev) => ({ ...prev, [id]: 'loading' }));
    contextSizeTimers.current[id] = setTimeout(async () => {
      try {
        const draft = modelDrafts[id];
        const size = await getAdminPromptContextSize(id, {
          provider: draft?.provider,
          model: draft?.model,
          knowledge: knowledgeDrafts[id] ?? undefined,
        });
        setContextSizes((prev) => ({ ...prev, [id]: size }));
      } catch (e: any) {
        setContextSizes((prev) => ({ ...prev, [id]: null }));
      }
    }, 500);
  };

  // Recompute context size whenever a prompt's model/knowledge draft changes,
  // or once prompts first load.
  useEffect(() => {
    for (const id of Object.keys(prompts)) scheduleContextSize(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts]);

  const setModelDraft = (id: string, value: ModelDraft) => {
    setModelDrafts((prev) => ({ ...prev, [id]: value }));
    scheduleContextSize(id);
  };

  const toggleKnowledgeFile = (id: string, file: string) => {
    setKnowledgeDrafts((prev) => {
      const current = prev[id] ?? knowledgeFiles;
      const next = current.includes(file) ? current.filter((f) => f !== file) : [...current, file];
      return { ...prev, [id]: next };
    });
    scheduleContextSize(id);
  };

  const isModelDirty = (id: string) => JSON.stringify(modelDrafts[id] ?? null) !== JSON.stringify(prompts[id]?.modelOverride ?? null);
  const isKnowledgeDirty = (id: string) => JSON.stringify(knowledgeDrafts[id] ?? null) !== JSON.stringify(prompts[id]?.includedKnowledge ?? null);

  const save = async (id: string) => {
    setSavingId(id);
    try {
      const saved = await saveAdminPrompt(id, drafts[id]);
      const aiConfigChanged = isModelDirty(id) || isKnowledgeDirty(id);
      const aiConfig = aiConfigChanged
        ? await saveAdminPromptAiConfig(id, { modelOverride: modelDrafts[id] ?? null, includedKnowledge: knowledgeDrafts[id] ?? null })
        : { modelOverride: prompts[id].modelOverride, includedKnowledge: prompts[id].includedKnowledge };
      setPrompts((prev) => ({
        ...prev,
        [id]: { ...prev[id], template: saved.template, updatedAt: saved.updatedAt, version: saved.version, ...aiConfig },
      }));
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
    try {
      const draft = modelDrafts[id];
      const result = await testRunAdminPrompt(id, drafts[id], {
        provider: draft?.provider,
        model: draft?.model,
        knowledge: knowledgeDrafts[id] ?? undefined,
      });
      setTestRunOutput((prev) => ({ ...prev, [id]: result }));
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
          Every prompt driving the job pipeline, editable directly — nothing here is a black box. Template edits apply immediately to live requests; model and knowledge-file choices need Save.
        </p>
      </div>

      {Object.entries(byStage).map(([stage, stagePrompts]: [string, AdminPromptConfig[]]) => (
        <div key={stage} className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200 pb-2">{stage}</h2>
          {stagePrompts.map((p) => {
            const isTemplateDirty = drafts[p.id] !== p.template;
            const isDirty = isTemplateDirty || isModelDirty(p.id) || isKnowledgeDirty(p.id);
            const modelDraft = modelDrafts[p.id] ?? null;
            const knowledgeDraft = knowledgeDrafts[p.id] ?? knowledgeFiles;
            const size = contextSizes[p.id];
            const runResult = testRunOutput[p.id];
            const modelsForProvider = modelDraft ? models[modelDraft.provider] || [] : [];

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

                  <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Model</label>
                      <select
                        value={modelDraft ? modelDraft.provider : DEFAULT_OPTION}
                        onChange={(e) => {
                          const value = e.target.value;
                          setModelDraft(p.id, value === DEFAULT_OPTION ? null : { provider: value as AIProviderId, model: '' });
                        }}
                        className="w-full h-8 px-2 rounded-md border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value={DEFAULT_OPTION}>Default (inherit global AI default)</option>
                        {PROVIDERS.map((pr) => (
                          <option key={pr} value={pr}>{PROVIDER_LABEL[pr]}</option>
                        ))}
                      </select>
                      {modelDraft && (
                        modelsForProvider.length > 0 ? (
                          <select
                            value={modelDraft.model}
                            onChange={(e) => setModelDraft(p.id, { provider: modelDraft.provider, model: e.target.value })}
                            className="w-full h-8 px-2 mt-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          >
                            <option value="">Choose a model…</option>
                            {modelsForProvider.map((m) => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={modelDraft.model}
                            onChange={(e) => setModelDraft(p.id, { provider: modelDraft.provider, model: e.target.value })}
                            placeholder={modelDraft.provider === 'ollama' ? 'e.g. qwen3:14b' : 'model id'}
                            className="w-full h-8 px-2 mt-1.5 rounded-md border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        )
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase tracking-wide">Context size</label>
                      {size === 'loading' && <span className="text-xs text-slate-400">Estimating…</span>}
                      {size && size !== 'loading' && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className={size.warningLevel === 'over' ? 'text-red-600 font-semibold' : size.warningLevel === 'near' ? 'text-amber-600 font-semibold' : 'text-slate-600'}>
                            ~{size.estimatedTokens.toLocaleString()} tokens
                          </span>
                          {size.contextWindow && <span className="text-slate-400">/ {size.contextWindow.toLocaleString()} window</span>}
                          {(size.warningLevel === 'over' || size.warningLevel === 'near') && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                        </div>
                      )}
                      {!size && <span className="text-xs text-slate-400">Unavailable</span>}
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
                        {knowledgeFiles.map((file) => (
                          <label key={file} className="flex items-center gap-1 text-[10px] text-slate-500">
                            <input
                              type="checkbox"
                              checked={knowledgeDraft.includes(file)}
                              onChange={() => toggleKnowledgeFile(p.id, file)}
                              className="w-3 h-3"
                            />
                            {file.replace(/\.md$/, '')}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {p.updatedAt ? `Last edited ${new Date(p.updatedAt).toLocaleString()}` : 'Using built-in default'}
                    </span>
                    <div className="flex gap-2">
                      <LoadingButton
                        variant="outline"
                        size="sm"
                        onClick={() => testRun(p.id)}
                        isLoading={testRunId === p.id}
                        loadingLabel="Running..."
                      >
                        <PlayCircle className="w-3.5 h-3.5 mr-1.5" /> Test Run
                      </LoadingButton>
                      <Button variant="outline" size="sm" onClick={() => restore(p.id)} disabled={p.version === 0}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore Default
                      </Button>
                      <LoadingButton size="sm" onClick={() => save(p.id)} isLoading={savingId === p.id} loadingLabel="Saving..." disabled={!isDirty}>
                        <Save className="w-3.5 h-3.5 mr-1.5" /> Save
                      </LoadingButton>
                    </div>
                  </div>
                  {testRunId === null && runResult && (
                    <div className="mt-2 p-3 bg-slate-900 rounded-lg text-slate-300 text-[11px] font-mono overflow-x-auto">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 text-emerald-400"><Sparkles className="w-3 h-3" /> Test run output</div>
                        {runResult.provider && runResult.model && (
                          <span className="text-slate-400">{PROVIDER_LABEL[runResult.provider as AIProviderId] || runResult.provider} · {runResult.model}</span>
                        )}
                      </div>
                      <pre className="whitespace-pre-wrap">{JSON.stringify(runResult.output, null, 2)}</pre>
                      {runResult.usage && (
                        <div className="mt-2 pt-2 border-t border-slate-700 text-slate-400">
                          {runResult.usage.promptTokenCount ?? runResult.usage.promptTokens ?? 0} prompt / {runResult.usage.candidatesTokenCount ?? runResult.usage.completionTokens ?? 0} completion / {runResult.usage.totalTokenCount ?? runResult.usage.totalTokens ?? 0} total tokens
                        </div>
                      )}
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
