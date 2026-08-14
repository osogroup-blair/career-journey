import React, { useEffect, useState } from 'react';
import RequireAdmin from '../components/RequireAdmin';
import { dataStore } from '../data';
import { saveAllowedModels } from '../lib/adminClient';
import { AllowedModelsConfig, AllowedModel } from '../types/aiModels';
import { AIProviderId } from '../types/billing';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, useToast } from '../components/ui';
import { Loader2, Trash2, Plus, Cpu } from 'lucide-react';

const PROVIDERS: AIProviderId[] = ['gemini', 'openai', 'anthropic'];
const PROVIDER_LABEL: Record<AIProviderId, string> = { gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic' };

function emptyConfig(): AllowedModelsConfig {
  return { gemini: [], openai: [], anthropic: [] };
}

function AdminModelsInner() {
  const toast = useToast();
  const [config, setConfig] = useState<AllowedModelsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<Record<AIProviderId, string>>({ gemini: '', openai: '', anthropic: '' });
  const [draftLabel, setDraftLabel] = useState<Record<AIProviderId, string>>({ gemini: '', openai: '', anthropic: '' });

  useEffect(() => {
    dataStore.getAllowedModels().then((c) => setConfig(c || emptyConfig()));
  }, []);

  if (!config) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-sm text-slate-500">Loading…</div>;
  }

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
            {config[provider].map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
                  <input type="checkbox" checked={m.enabled} onChange={() => toggleModel(provider, m.id)} />
                  <span className="truncate"><span className="font-mono text-xs">{m.id}</span> — {m.label}</span>
                </label>
                <Button variant="ghost" size="sm" onClick={() => removeModel(provider, m.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}

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

export default function AdminModels() {
  return <RequireAdmin><AdminModelsInner /></RequireAdmin>;
}
