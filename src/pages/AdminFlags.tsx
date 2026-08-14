import React, { useEffect, useState, useMemo } from 'react';
import { getFeatureFlags, saveFeatureFlags, FeatureFlags } from '../lib/adminClient';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Label, Badge, useToast } from '../components/ui';
import {
  Loader2,
  Sliders,
  Shield,
  Search,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Flame,
  Check,
  Zap,
  HelpCircle,
  FileText,
  Briefcase,
  Bot,
  Wrench,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { FeatureKey, FeatureCategory, FEATURE_METADATA, getDefaultFeatureMatrix } from '../types/featureFlags';
import { PlanId } from '../types/billing';

const PLAN_COLUMNS: { id: PlanId; label: string; badgeColor: string; description: string }[] = [
  { id: 'free', label: 'Free', badgeColor: 'bg-slate-100 text-slate-700', description: 'Starter trial account' },
  { id: 'pro_monthly', label: 'Pro Monthly', badgeColor: 'bg-brand-100 text-brand-700', description: 'Full hosted subscription' },
  { id: 'byom_monthly', label: 'BYOM Monthly', badgeColor: 'bg-indigo-100 text-indigo-700', description: 'Monthly custom API key' },
  { id: 'byom_yearly', label: 'BYOM Yearly', badgeColor: 'bg-purple-100 text-purple-700', description: 'Annual custom API key' },
];

const CATEGORY_ICONS: Record<FeatureCategory, React.ReactNode> = {
  discovery: <Briefcase className="w-4 h-4 text-emerald-600" />,
  pipeline: <FileText className="w-4 h-4 text-brand-600" />,
  intelligence: <Sparkles className="w-4 h-4 text-amber-600" />,
  tools: <Wrench className="w-4 h-4 text-blue-600" />,
  models: <Bot className="w-4 h-4 text-purple-600" />,
};

const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  discovery: 'Job Discovery & Feeds',
  pipeline: 'Resume & Pipeline',
  intelligence: 'Career Intelligence',
  tools: 'Export & Comparison Tools',
  models: 'AI Providers & BYOM',
};

export default function AdminFlags() {
  const toast = useToast();
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [initialFlags, setInitialFlags] = useState<FeatureFlags | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FeatureCategory | 'all'>('all');

  useEffect(() => {
    getFeatureFlags()
      .then((data) => {
        // Ensure features object is initialized
        const merged: FeatureFlags = {
          ...data,
          features: {
            ...getDefaultFeatureMatrix(),
            ...(data.features || {}),
          },
        };
        setFlags(merged);
        setInitialFlags(JSON.parse(JSON.stringify(merged)));
      })
      .catch((e) => toast.error(e.message));
  }, []);

  const isDirty = useMemo(() => {
    if (!flags || !initialFlags) return false;
    return JSON.stringify(flags) !== JSON.stringify(initialFlags);
  }, [flags, initialFlags]);

  if (!flags) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        <span>Loading feature flag matrix…</span>
      </div>
    );
  }

  const handleToggleFeature = (feature: FeatureKey, plan: PlanId) => {
    const current = flags.features?.[feature]?.[plan] ?? FEATURE_METADATA[feature]?.defaultPlans[plan] ?? false;
    setFlags({
      ...flags,
      features: {
        ...(flags.features || {}),
        [feature]: {
          ...(flags.features?.[feature] || {}),
          [plan]: !current,
        },
      },
    });
  };

  const handleSetColumnAll = (plan: PlanId, enabled: boolean) => {
    const updatedFeatures = { ...(flags.features || {}) };
    for (const key of Object.keys(FEATURE_METADATA) as FeatureKey[]) {
      updatedFeatures[key] = {
        ...(updatedFeatures[key] || {}),
        [plan]: enabled,
      };
    }
    setFlags({ ...flags, features: updatedFeatures });
  };

  const handleResetDefaults = () => {
    setFlags({
      ...flags,
      features: getDefaultFeatureMatrix(),
    });
    toast.success('Feature matrix reset to factory defaults (click Save to apply).');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await saveFeatureFlags(flags);
      const merged: FeatureFlags = {
        ...updated,
        features: {
          ...getDefaultFeatureMatrix(),
          ...(updated.features || {}),
        },
      };
      setFlags(merged);
      setInitialFlags(JSON.parse(JSON.stringify(merged)));
      toast.success('Feature flags saved — changes take effect immediately across server and clients.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredFeatures = Object.values(FEATURE_METADATA).filter((meta) => {
    if (selectedCategory !== 'all' && meta.category !== selectedCategory) return false;
    if (
      searchQuery &&
      !meta.label.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !meta.description.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand-500/10 text-brand-600 flex items-center justify-center font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Feature Flags & Subscription Matrix</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Toggle platform capabilities per subscription tier. Admins and comped accounts automatically bypass all plan gates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="text-slate-600 hover:text-slate-900 border-slate-300"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Reset Defaults
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`transition-all shadow-sm ${
              isDirty ? 'bg-brand-600 hover:bg-brand-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
            {isDirty ? 'Save Changes' : 'Saved'}
          </Button>
        </div>
      </div>

      {/* Admin Privilege Callout */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-emerald-900 text-sm shadow-sm">
        <Shield className="w-5 h-5 text-emerald-600 shrink-0" />
        <div className="flex-1">
          <span className="font-semibold">Superadmin & Comped Bypass Active:</span> All users with the{' '}
          <code className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-xs font-mono">admin: true</code> claim or{' '}
          <code className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-xs font-mono">comped: true</code> status
          automatically inherit unrestricted access to all features regardless of tier settings.
        </div>
      </div>

      {/* Feature Matrix Section */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b border-slate-200 py-4 px-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-lg text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-500" />
                Subscription Feature Matrix
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Control which subscription tiers can access each feature.</p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Filter features…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as any)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Categories</option>
                <option value="discovery">Job Discovery</option>
                <option value="pipeline">Resume & Pipeline</option>
                <option value="intelligence">Career Intelligence</option>
                <option value="tools">Export & Tools</option>
                <option value="models">AI Providers</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/60 text-xs font-semibold text-slate-700">
                  <th className="py-3.5 px-6 min-w-[280px]">Feature & Capability</th>
                  {PLAN_COLUMNS.map((col) => (
                    <th key={col.id} className="py-3.5 px-4 text-center min-w-[130px]">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${col.badgeColor}`}>
                          {col.label}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-normal">
                          <button
                            type="button"
                            onClick={() => handleSetColumnAll(col.id, true)}
                            className="hover:text-brand-600 transition-colors"
                          >
                            All On
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => handleSetColumnAll(col.id, false)}
                            className="hover:text-rose-600 transition-colors"
                          >
                            All Off
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                  <th className="py-3.5 px-4 text-center min-w-[120px]">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 flex items-center justify-center gap-1">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredFeatures.map((feat) => {
                  return (
                    <tr key={feat.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 p-1.5 rounded-md bg-slate-100 border border-slate-200/60">
                            {CATEGORY_ICONS[feat.category]}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-2">
                              {feat.label}
                              <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/50">
                                {CATEGORY_LABELS[feat.category]}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{feat.description}</p>
                          </div>
                        </div>
                      </td>

                      {PLAN_COLUMNS.map((col) => {
                        const isEnabled =
                          flags.features?.[feat.id]?.[col.id] ?? feat.defaultPlans[col.id] ?? false;
                        return (
                          <td key={col.id} className="py-4 px-4 text-center">
                            <label className="inline-flex items-center justify-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => handleToggleFeature(feat.id, col.id)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600 relative"></div>
                            </label>
                          </td>
                        );
                      })}

                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex items-center justify-center text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Always</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Quotas and Emergency Kill Switches Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Quotas */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" /> AI Quota Ceilings
            </CardTitle>
            <p className="text-xs text-slate-500">Fine-tune usage thresholds across plans without redeploying.</p>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="free-limit" className="text-xs font-semibold text-slate-700">
                  Free Lifetime Actions
                </Label>
                <Input
                  id="free-limit"
                  type="number"
                  value={flags.freeLifetimeLimit}
                  onChange={(e) => setFlags({ ...flags, freeLifetimeLimit: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="pro-limit" className="text-xs font-semibold text-slate-700">
                  Pro Monthly Actions / Cycle
                </Label>
                <Input
                  id="pro-limit"
                  type="number"
                  value={flags.proMonthlyLimit}
                  onChange={(e) => setFlags({ ...flags, proMonthlyLimit: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <Label htmlFor="byom-burst" className="text-xs font-semibold text-slate-700">
                  BYOM Burst / Minute
                </Label>
                <Input
                  id="byom-burst"
                  type="number"
                  value={flags.byomBurstPerMinute}
                  onChange={(e) => setFlags({ ...flags, byomBurstPerMinute: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="byom-daily" className="text-xs font-semibold text-slate-700">
                  BYOM Daily Safety Ceiling
                </Label>
                <Input
                  id="byom-daily"
                  type="number"
                  value={flags.byomDailyLimit}
                  onChange={(e) => setFlags({ ...flags, byomDailyLimit: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Kill Switches */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-500" /> Emergency Kill Switches
            </CardTitle>
            <p className="text-xs text-slate-500">
              Immediate system-level circuit breakers. Active kill switches block endpoints for all users.
            </p>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div
              className={`p-3.5 rounded-lg border transition-colors ${
                flags.killSwitches.matches ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                    {flags.killSwitches.matches && <AlertTriangle className="w-4 h-4 text-rose-600" />}
                    Disable Job Analysis & Matches
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Instantly 503s all live scanning and source feeds.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={flags.killSwitches.matches}
                  onChange={(e) =>
                    setFlags({
                      ...flags,
                      killSwitches: { ...flags.killSwitches, matches: e.target.checked },
                    })
                  }
                  className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                />
              </label>
            </div>

            <div
              className={`p-3.5 rounded-lg border transition-colors ${
                flags.killSwitches.aiPipeline ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                    {flags.killSwitches.aiPipeline && <AlertTriangle className="w-4 h-4 text-rose-600" />}
                    Disable All AI Pipelines (Global Stop)
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Emergency shutdown for all generative AI actions across the app.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={flags.killSwitches.aiPipeline}
                  onChange={(e) =>
                    setFlags({
                      ...flags,
                      killSwitches: { ...flags.killSwitches, aiPipeline: e.target.checked },
                    })
                  }
                  className="w-5 h-5 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                />
              </label>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
