import { useEffect, useMemo, useState } from 'react';
import { dataStore } from '../data';
import { getAdminAiDefaults, saveAdminAiDefaults, AiDefaults } from '../lib/aiClient';
import { AllowedModelsConfig } from '../types/aiModels';
import { AIProviderId } from '../types/billing';
import { Button, Card, CardHeader, CardTitle, CardContent, useToast } from '../components/ui';
import { Loader2, Cpu, Save } from 'lucide-react';

const PROVIDERS: AIProviderId[] = ['ollama', 'gemini', 'openai', 'anthropic'];
const PROVIDER_LABEL: Record<AIProviderId, string> = { ollama: 'Local (Ollama)', gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic' };

function emptyModelsConfig(): AllowedModelsConfig {
  return { gemini: [], openai: [], anthropic: [], ollama: [] };
}

export default function AdminAiDefaults() {
  const toast = useToast();
  const [defaults, setDefaults] = useState<AiDefaults | null>(null);
  const [initial, setInitial] = useState<AiDefaults | null>(null);
  const [models, setModels] = useState<AllowedModelsConfig>(emptyModelsConfig());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getAdminAiDefaults(), dataStore.getAllowedModels()])
      .then(([d, m]) => {
        setDefaults(d);
        setInitial(JSON.parse(JSON.stringify(d)));
        setModels({ ...emptyModelsConfig(), ...m });
      })
      .catch((e) => toast.error(e.message));
  }, []);

  const isDirty = useMemo(() => JSON.stringify(defaults) !== JSON.stringify(initial), [defaults, initial]);

  if (!defaults) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        <span>Loading AI defaults…</span>
      </div>
    );
  }

  const modelsForProvider = models[defaults.provider] || [];

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await saveAdminAiDefaults(defaults);
      setDefaults(updated);
      setInitial(JSON.parse(JSON.stringify(updated)));
      toast.success('AI defaults saved — every prompt without its own override switches to this immediately.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Admin — AI Defaults</h1>
        <p className="text-sm text-slate-500 mt-1">
          The provider/model every AI endpoint uses unless a prompt on the AI Prompts page has its own override. Takes effect immediately, no redeploy needed.
        </p>
      </div>

      <Card>
        <CardHeader className="bg-slate-50 border-b">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-600" />
            <CardTitle className="text-base">Global default</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Provider</label>
              <select
                value={defaults.provider}
                onChange={(e) => setDefaults({ ...defaults, provider: e.target.value as AIProviderId, model: '' })}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Model</label>
              {modelsForProvider.length > 0 ? (
                <select
                  value={defaults.model}
                  onChange={(e) => setDefaults({ ...defaults, model: e.target.value })}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {!modelsForProvider.some((m) => m.id === defaults.model) && defaults.model && (
                    <option value={defaults.model}>{defaults.model} (not in Models list)</option>
                  )}
                  {modelsForProvider.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={defaults.model}
                  onChange={(e) => setDefaults({ ...defaults, model: e.target.value })}
                  placeholder={defaults.provider === 'ollama' ? 'e.g. qwen3:14b' : 'model id'}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              )}
              {modelsForProvider.length === 0 && (
                <p className="text-[11px] text-slate-400 mt-1">
                  No models curated for {PROVIDER_LABEL[defaults.provider]} on the Models page yet — type a model id directly, or add one there first.
                </p>
              )}
            </div>
          </div>

          {defaults.provider !== 'ollama' && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              This spends the platform's own {PROVIDER_LABEL[defaults.provider]} API key (from server env vars), not any user's BYOM key — every request that falls back to the global default will use it.
            </p>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={!isDirty || saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
