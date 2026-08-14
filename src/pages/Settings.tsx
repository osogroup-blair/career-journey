import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { dataStore } from '../data';
import { AllowedModelsConfig } from '../types/aiModels';
import { AIProviderId, isByomPlan } from '../types/billing';
import { getStoredByomKey, setStoredByomKey, clearStoredByomKey, maskKey, StoredByomKey } from '../lib/byomKeyStorage';
import { validateByomKey, saveByomSettings } from '../lib/billingClient';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Label, useToast } from '../components/ui';
import { KeyRound, Loader2, CheckCircle2, Trash2, MessageSquare, ChevronRight } from 'lucide-react';

const PROVIDER_LABEL: Record<AIProviderId, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export default function Settings() {
  const { billing } = useStore();
  const toast = useToast();

  const [allowedModels, setAllowedModels] = useState<AllowedModelsConfig | null>(null);
  const [stored, setStored] = useState<StoredByomKey | null>(null);
  const [provider, setProvider] = useState<AIProviderId>('gemini');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dataStore.getAllowedModels().then(setAllowedModels);
    setStored(getStoredByomKey());
  }, []);

  useEffect(() => {
    if (!allowedModels) return;
    const first = allowedModels[provider]?.find((m) => m.enabled);
    if (first) setModel(first.id);
  }, [provider, allowedModels]);

  if (billing === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-sm text-slate-500">
        Settings isn't available in local-only mode.
      </div>
    );
  }

  const onByomPlan = isByomPlan(billing.plan);

  const handleTestAndSave = async () => {
    if (!apiKey.trim()) {
      toast.error('Enter an API key first.');
      return;
    }
    setBusy(true);
    try {
      const result = await validateByomKey(provider, apiKey.trim(), model);
      if (!result.valid) {
        toast.error(result.error || 'That key did not validate — check it and try again.');
        return;
      }
      await saveByomSettings(provider, model);
      const value: StoredByomKey = { provider, apiKey: apiKey.trim(), model };
      setStoredByomKey(value);
      setStored(value);
      setApiKey('');
      toast.success(`${PROVIDER_LABEL[provider]} key verified and saved to this browser.`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not validate key.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveKey = () => {
    clearStoredByomKey();
    setStored(null);
    toast.success('Key removed from this browser.');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      <a
        href="#/feedback"
        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3.5 hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
      >
        <span className="flex items-center gap-2.5 text-sm font-medium text-slate-900">
          <MessageSquare className="w-4 h-4 text-brand-500" />
          My Feedback
        </span>
        <ChevronRight className="w-4 h-4 text-slate-400" />
      </a>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-brand-500" />
            Bring Your Own Model
          </CardTitle>
          <p className="text-xs text-slate-500">
            Your key is stored only in this browser — never sent to our database. It's attached to your AI requests
            directly from here each time.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!onByomPlan ? (
            <p className="text-sm text-slate-500">
              Bring Your Own Model is available on the BYOM Monthly and BYOM Yearly plans. See{' '}
              <a href="#/upgrade" className="text-brand-600 hover:underline">Plans & Billing</a>.
            </p>
          ) : (
            <>
              {stored && (
                <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    {PROVIDER_LABEL[stored.provider]} · {stored.model} · {maskKey(stored.apiKey)}
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleRemoveKey}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="byom-provider">Provider</Label>
                  <select
                    id="byom-provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as AIProviderId)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                  >
                    {(['gemini', 'openai', 'anthropic'] as AIProviderId[]).map((p) => (
                      <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="byom-model">Model</Label>
                  <select
                    id="byom-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
                  >
                    {(allowedModels?.[provider] || []).filter((m) => m.enabled).map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="byom-key">API key</Label>
                <Input
                  id="byom-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Paste your ${PROVIDER_LABEL[provider]} API key`}
                  autoComplete="off"
                />
              </div>

              <Button onClick={handleTestAndSave} disabled={busy} className="w-full">
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Test & Save
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
