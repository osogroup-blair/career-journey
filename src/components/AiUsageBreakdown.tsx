import React, { useState, useEffect } from 'react';
import { fetchUserAiUsage, fetchAdminUserAiUsage } from '../lib/usageClient';
import type { UserAiUsageSummary, AiUsageLog } from '../types/usage';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from './ui';
import { Sparkles, Activity, Clock, Cpu, RefreshCw, Layers, ArrowUpRight } from 'lucide-react';

interface AiUsageBreakdownProps {
  adminTargetUid?: string;
}

export const AiUsageBreakdown: React.FC<AiUsageBreakdownProps> = ({ adminTargetUid }) => {
  const [summary, setSummary] = useState<UserAiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = adminTargetUid
        ? await fetchAdminUserAiUsage(adminTargetUid)
        : await fetchUserAiUsage();
      setSummary(data);
    } catch (err: any) {
      console.error('Failed to load AI token usage', err);
      setError(err?.message || 'Failed to load usage history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsage();
  }, [adminTargetUid]);

  const formatNumber = (num: number) => num.toLocaleString();

  const getModelBadge = (model: string) => {
    if (model.includes('pro')) {
      return <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-200">Gemini 3.1 Pro (Deep Reasoning)</Badge>;
    }
    if (model.includes('flash-lite')) {
      return <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">Gemini 3.5 Flash-Lite (Fast Scan)</Badge>;
    }
    if (model.includes('flash')) {
      return <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">Gemini 3.7 Flash (High Quality)</Badge>;
    }
    return <Badge variant="outline">{model}</Badge>;
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-600" />
            AI Token Usage & Activity Breakdown
          </CardTitle>
          <p className="text-xs text-slate-500 mt-1">
            Detailed measurement of input and output tokens consumed by your AI operations.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadUsage}
          disabled={loading}
          className="text-xs gap-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Lifetime Tokens Used
              </span>
              <Cpu className="w-4 h-4 text-brand-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">
              {summary ? formatNumber(summary.lifetimeTokensUsed) : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Across all historical prompts & generations</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Current Period Tokens
              </span>
              <Layers className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-2">
              {summary ? formatNumber(summary.currentPeriodTokensUsed) : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Active billing period or lifetime allowance</p>
          </div>
        </div>

        {/* Detailed Action History Table */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-slate-400" />
            Recent AI Executions & Token Cost
          </h4>

          {loading && !summary ? (
            <div className="py-8 text-center text-sm text-slate-400">Loading AI usage data...</div>
          ) : error ? (
            <div className="py-4 text-center text-xs text-red-500">{error}</div>
          ) : !summary?.recentLogs?.length ? (
            <div className="py-8 text-center border rounded-lg bg-slate-50/50 border-dashed text-slate-400 text-sm">
              No AI operations recorded yet. Start parsing a job or generating a resume to see live token telemetry!
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Task / Operation</th>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3 text-right">Prompt In</th>
                    <th className="py-2.5 px-3 text-right">Completion Out</th>
                    <th className="py-2.5 px-3 text-right font-bold text-slate-900">Total Tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.recentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        <span className="text-slate-400">
                          {new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {log.featureName || log.endpoint}
                      </td>
                      <td className="py-2.5 px-3">{getModelBadge(log.model)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                        {formatNumber(log.promptTokens)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 font-mono">
                        {formatNumber(log.completionTokens)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatNumber(log.totalTokens)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
