import React, { useEffect, useState } from 'react';
import RequireAdmin from '../components/RequireAdmin';
import { getFeatureFlags, saveFeatureFlags, FeatureFlags } from '../lib/adminClient';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Label, useToast } from '../components/ui';
import { Loader2, Sliders } from 'lucide-react';

function AdminFlagsInner() {
  const toast = useToast();
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFeatureFlags().then(setFlags).catch((e) => toast.error(e.message));
  }, []);

  if (!flags) {
    return <div className="max-w-2xl mx-auto px-4 py-12 text-center text-sm text-slate-500">Loading…</div>;
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await saveFeatureFlags(flags);
      setFlags(updated);
      toast.success('Saved — takes effect within 30s (cache TTL), no redeploy needed.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
        <Sliders className="w-5 h-5 text-brand-500" /> Feature Flags
      </h1>

      <Card>
        <CardHeader><CardTitle>Quota limits</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="free-limit">Free lifetime AI actions</Label>
            <Input id="free-limit" type="number" value={flags.freeLifetimeLimit}
              onChange={(e) => setFlags({ ...flags, freeLifetimeLimit: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="pro-limit">Pro Monthly actions/period</Label>
            <Input id="pro-limit" type="number" value={flags.proMonthlyLimit}
              onChange={(e) => setFlags({ ...flags, proMonthlyLimit: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="byom-burst">BYOM burst/minute</Label>
            <Input id="byom-burst" type="number" value={flags.byomBurstPerMinute}
              onChange={(e) => setFlags({ ...flags, byomBurstPerMinute: Number(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="byom-daily">BYOM daily ceiling</Label>
            <Input id="byom-daily" type="number" value={flags.byomDailyLimit}
              onChange={(e) => setFlags({ ...flags, byomDailyLimit: Number(e.target.value) })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kill switches</CardTitle>
          <p className="text-xs text-slate-500">Emergency stops — block a feature instantly without a redeploy.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={flags.killSwitches.matches}
              onChange={(e) => setFlags({ ...flags, killSwitches: { ...flags.killSwitches, matches: e.target.checked } })} />
            Disable Job Analysis (Matches)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={flags.killSwitches.aiPipeline}
              onChange={(e) => setFlags({ ...flags, killSwitches: { ...flags.killSwitches, aiPipeline: e.target.checked } })} />
            Disable all AI features (emergency global stop)
          </label>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Save
      </Button>
    </div>
  );
}

export default function AdminFlags() {
  return <RequireAdmin><AdminFlagsInner /></RequireAdmin>;
}
