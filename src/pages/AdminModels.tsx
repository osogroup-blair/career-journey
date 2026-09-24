import React, { useEffect, useMemo, useState } from 'react';
import { dataStore } from '../data';
import {
  saveAllowedModels,
  resolveContextWindows,
  saveContextWindowOverride,
  clearContextWindowOverride,
  ResolvedContextWindow,
} from '../lib/adminClient';
import { AllowedModelsConfig, AllowedModel } from '../types/aiModels';
import { AIProviderId } from '../types/billing';
import { Button, LoadingButton, Card, CardHeader, CardTitle, CardContent, Input, useToast } from '../components/ui';
import { Loader2, Trash2, Plus, Cpu, RotateCcw } from 'lucide-react';

const PROVIDERS: AIProviderId[] = ['gemini', 'openai', 'anthropic', 'ollama'];
const PROVIDER_LABEL: Record<AIProviderId, string> = { gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic', ollama: 'Local (Ollama)' };

function emptyConfig(): AllowedModelsConfig {
  return { gemini: [], openai: [], anthropic: [], ollama: [] };
}

function windowKey(provider: AIProviderId, model: string): string {
  return `${provider}:${model}`;
}

export default function AdminModels() {
  const toast = useToast();
  const [config, setConfig] = useState<AllowedModelsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<Record<AIProviderId, string>>({ gemini: '', openai: '', anthropic: '', ollama: '' });
  const [draftLabel, setDraftLabel] = useState<Record<AIProviderId, string>>({ gemini: '', openai: '', anthropic: '', ollama: '' });
  const [windows, setWindows] = useState<Record<string, ResolvedContextWindow>>({});
  const [windowDrafts, setWindowDrafts] = useState<Record<string, { contextWindow: string; maxOutputTokens: string }>>({});
  const [savingWindowKey, setSavingWindowKey] = useState<string | null>(null);

  useEffect(() => {
    // Merge over emptyConfig() rather than trusting the stored doc's shape —
    // a doc saved before a provider (e.g. "ollama") existed won't have that
    // key, and config[provider].map(...) below would throw on undefined.
    dataStore.getAllowedModels().then((c) => setConfig({ ...emptyConfig(), ...c }));
  }, []);

  const modelList = useMemo(
    () => (config ? PROVIDERS.flatMap((provider) => config[provider].map((m) => ({ provider, model: m.id }))) : []),
    [config]
  );

  useEffect(() => {
    if (modelList.length === 0) return;
    resolveContextWindows(modelList)
      .then((results) => {
        const byKey = Object.fromEntries(results.map((r) => [windowKey(r.provider, r.model), r]));
        setWindows(byKey);
        setWindowDrafts(
          Object.fromEntries(
            results.map((r) => [
              windowKey(r.provider, r.model),
              {
                contextWindow: r.override?.contextWindow != null ? String(r.override.contextWindow) : '',
                maxOutputTokens: r.override?.maxOutputTokens != null ? String(r.override.maxOutputTokens) : '',
              },
            ])
          )
        );
      })
      .catch((e) => toast.error('Failed to load context windows: ' + e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelList]);

  if (!config) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-sm text-slate-500">Loading…</div>;
  }

  const saveWindow = async (provider: AIProviderId, model: string) => {
    const key = windowKey(provider, model);
    const draft = windowDrafts[key];
    const contextWindow = Number(draft?.contextWindow);
    if (!draft?.contextWindow || !Number.isFinite(contextWindow) || contextWindow <= 0) {
      toast.error('Enter a positive context-window size.');
      return;
    }
    const maxOutputTokens = draft.maxOutputTokens ? Number(draft.maxOutputTokens) : null;
    if (draft.maxOutputTokens && (!Number.isFinite(maxOutputTokens) || (maxOutputTokens as number) <= 0)) {
      toast.error('Max output tokens must be a positive number.');
      return;
    }
    setSavingWindowKey(key);
    try {
      const saved = await saveContextWindowOverride(provider, model, { contextWindow, maxOutputTokens });
      setWindows((prev) => ({ ...prev, [key]: { ...prev[key], override: saved, effective: saved.contextWindow } }));
      toast.success(`Context window saved for ${model}.`);
    } catch (e: any) {
      toast.error('Failed to save: ' + e.message);
    } finally {
      setSavingWindowKey(null);
    }
  };

  const clearWindow = async (provider: AIProviderId, model: string) => {
    const key = windowKey(provider, model);
    setSavingWindowKey(key);
    try {
      await clearContextWindowOverride(provider, model);
      setWindows((prev) => ({ ...prev, [key]: { ...prev[key], override: null, effective: prev[key]?.builtin ?? null } }));
      setWindowDrafts((prev) => ({ ...prev, [key]: { contextWindow: '', maxOutputTokens: '' } }));
      toast.success('Reverted to built-in value.');
    } catch (e: any) {
      toast.error('Failed to clear override: ' + e.message);
    } finally {
      setSavingWindowKey(null);
    }
  };

  const toggleModel = (provider: AIProviderId, id: string) => {
    setConfig({
      ...config,
      [provider]: config[provider].map((m) => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
    });
  };

  const removeModel = (provider: AIProviderId, id: string) => {
    setConfig({ ...config, [provider]: config[provider].filter((m) => m.id !== id) });
  };

  const addModel = (provider: AIProviderId) => {
    const id = draftId[provider].trim();
    const label = draftLabel[provider].trim();
    if (!id || !label) {
      toast.error('Enter both a model ID and a display label.');
      return;
    }
    if (config[provider].some((m) => m.id === id)) {
      toast.error('That model ID is already in the list.');
      return;
    }
    const newModel: AllowedModel = { id, label, enabled: true };
    setConfig({ ...config, [provider]: [...config[provider], newModel] });
    setDraftId({ ...draftId, [provider]: '' });
    setDraftLabel({ ...draftLabel, [provider]: '' });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAllowedModels(config);
      toast.success('Saved — BYOM pickers will see this immediately.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <Cpu className="w-5 h-5 text-brand-500" /> BYOM Allowed Models
      </h1>
      <p className="text-sm text-slate-500">Controls what shows up in every BYOM user's model picker (Settings page).</p>

      {PROVIDERS.map((provider) => (
        <Card key={provider}>
          <CardHeader><CardTitle>{PROVIDER_LABEL[provider]}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {config[provider].map((m) => {
              const key = windowKey(provider, m.id);
              const win = windows[key];
              const draft = windowDrafts[key] ?? { contextWindow: '', maxOutputTokens: '' };
              const isOverridden = !!win?.override;
              return (
                <div key={m.id} className="rounded-lg border border-slate-200 px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
                      <input type="checkbox" checked={m.enabled} onChange={() => toggleModel(provider, m.id)} />
                      <span className="truncate"><span className="font-mono text-xs">{m.id}</span> — {m.label}</span>
                    </label>
                    <Button variant="ghost" size="sm" onClick={() => removeModel(provider, m.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-end gap-2 pl-6">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 uppercase tracking-wide">
                        Context window {isOverridden ? <span className="text-brand-600">(overridden)</span> : win?.builtin ? <span className="text-slate-400">(built-in: {win.builtin.toLocaleString()})</span> : null}
                      </label>
                      <Input
                        type="number"
                        placeholder={win?.builtin ? String(win.builtin) : 'tokens'}
                        value={draft.contextWindow}
                        onChange={(e) => setWindowDrafts((prev) => ({ ...prev, [key]: { ...draft, contextWindow: e.target.value } }))}
                        className="h-8 w-32 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 uppercase tracking-wide">Max output tokens</label>
                      <Input
                        type="number"
                        placeholder="optional"
                        value={draft.maxOutputTokens}
                        onChange={(e) => setWindowDrafts((prev) => ({ ...prev, [key]: { ...draft, maxOutputTokens: e.target.value } }))}
                        className="h-8 w-28 text-xs"
                      />
                    </div>
                    <LoadingButton
                      variant="outline"
                      size="sm"
                      onClick={() => saveWindow(provider, m.id)}
                      isLoading={savingWindowKey === key}
                      loadingLabel="Saving..."
                    >
                      Save
                    </LoadingButton>
                    {isOverridden && (
                      <Button variant="ghost" size="sm" onClick={() => clearWindow(provider, m.id)} disabled={savingWindowKey === key}>
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Revert
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-2 items-end pt-1">
              <div className="flex-1">
                <Input placeholder="Model ID (e.g. gpt-5.6-terra)" value={draftId[provider]}
                  onChange={(e) => setDraftId({ ...draftId, [provider]: e.target.value })} />
              </div>
              <div className="flex-1">
                <Input placeholder="Display label" value={draftLabel[provider]}
                  onChange={(e) => setDraftLabel({ ...draftLabel, [provider]: e.target.value })} />
              </div>
              <Button variant="outline" size="sm" onClick={() => addModel(provider)}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Save
      </Button>
    </div>
  );
}
