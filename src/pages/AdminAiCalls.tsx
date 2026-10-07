import { useCallback, useEffect, useMemo, useState } from 'react';
import { listAdminAiCalls, AdminAiCall } from '../lib/adminClient';
import { Button, Card, CardContent, useToast } from '../components/ui';
import { Loader2, RefreshCw, Activity } from 'lucide-react';

const SOURCE_LABEL: Record<NonNullable<AdminAiCall['source']>, string> = {
  promptOverride: 'Prompt override',
  globalDefault: 'Global default',
  byom: "User's own model",
  adminTestRun: 'Admin test run',
};

const LIMITS = [100, 200, 500, 1000];
const AUTO_REFRESH_MS = 10_000;
const ALL = '__all__';

const selectClass = 'h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500';

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

/**
 * Every outbound AI call the server made (Oso router, Ollama, BYOM), success
 * or failure — server/aiCallLog.ts. The point is answering "which model did
 * that request actually use, and why" without digging through Firestore:
 * the "Resolved via" column says whether a prompt override or the global
 * default picked the model.
 */
export default function AdminAiCalls() {
  const toast = useToast();
  const [calls, setCalls] = useState<AdminAiCall[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [taskFilter, setTaskFilter] = useState(ALL);
  const [modelFilter, setModelFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'error'>('all');

  const load = useCallback(() => {
    setLoading(true);
    listAdminAiCalls(limit)
      .then(setCalls)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [limit]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const tasks = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of calls || []) seen.set(c.promptId, c.promptLabel);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [calls]);
  const models = useMemo(() => [...new Set((calls || []).map((c) => c.model))].sort(), [calls]);

  const filtered = useMemo(
    () =>
      (calls || []).filter(
        (c) =>
          (taskFilter === ALL || c.promptId === taskFilter) &&
          (modelFilter === ALL || c.model === modelFilter) &&
          (statusFilter === 'all' || (statusFilter === 'ok' ? c.ok : !c.ok))
      ),
    [calls, taskFilter, modelFilter, statusFilter]
  );

  const summary = useMemo(() => {
    const errors = filtered.filter((c) => !c.ok).length;
    const avgMs = filtered.length ? Math.round(filtered.reduce((sum, c) => sum + c.durationMs, 0) / filtered.length) : 0;
    const tokens = filtered.reduce((sum, c) => sum + (c.totalTokens || 0), 0);
    const byModel = new Map<string, number>();
    for (const c of filtered) byModel.set(c.model, (byModel.get(c.model) || 0) + 1);
    return { errors, avgMs, tokens, byModel: [...byModel.entries()].sort((a, b) => b[1] - a[1]) };
  }, [filtered]);

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin — AI Calls</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Every AI call the server made, across all users, including failures. "Resolved via" shows whether the model came from that prompt's override on the AI Prompts page or the global AI default. Prompt and response content is never stored.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded border-slate-300" />
            Auto-refresh
          </label>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)} className={selectClass} aria-label="Filter by task">
          <option value={ALL}>All tasks</option>
          {tasks.map(([id, label]) => (
            <option key={id} value={id}>{label} ({id})</option>
          ))}
        </select>
        <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value)} className={selectClass} aria-label="Filter by model">
          <option value={ALL}>All models</option>
          {models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={selectClass} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="ok">Succeeded</option>
          <option value="error">Failed</option>
        </select>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={selectClass} aria-label="Number of calls to load">
          {LIMITS.map((n) => (
            <option key={n} value={n}>Last {n} calls</option>
          ))}
        </select>
      </div>

      {calls && (
        <div className="flex items-center gap-x-6 gap-y-2 flex-wrap text-sm text-slate-600">
          <span><span className="font-semibold text-slate-900">{filtered.length}</span> {filtered.length === 1 ? 'call' : 'calls'}</span>
          <span><span className={`font-semibold ${summary.errors ? 'text-red-700' : 'text-slate-900'}`}>{summary.errors}</span> failed</span>
          <span>avg <span className="font-semibold text-slate-900">{formatDuration(summary.avgMs)}</span></span>
          <span><span className="font-semibold text-slate-900">{summary.tokens.toLocaleString()}</span> tokens</span>
          {summary.byModel.map(([model, count]) => (
            <span key={model} className="font-mono text-xs bg-slate-100 text-slate-700 rounded px-1.5 py-0.5">{model} × {count}</span>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {!calls ? (
            <div className="py-16 text-center text-sm text-slate-500 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              Loading AI calls…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
              <Activity className="w-6 h-6 text-slate-300" />
              {calls.length === 0 ? 'No AI calls logged yet — run something (e.g. a scan on the Matches page) and refresh.' : 'No calls match these filters.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Task</th>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3">Resolved via</th>
                    <th className="py-2.5 px-3 text-right">Duration</th>
                    <th className="py-2.5 px-3 text-right">Tokens</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Request ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50 align-top">
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{formatTime(c.timestamp)}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-800">{c.promptLabel}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{c.promptId}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono text-slate-800">{c.model}</div>
                        {c.actualModel && c.actualModel !== c.model && <div className="font-mono text-[10px] text-slate-500">→ {c.actualModel}</div>}
                        <div className="text-[10px] text-slate-400">{c.provider}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{c.source ? SOURCE_LABEL[c.source] : '—'}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">{formatDuration(c.durationMs)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap" title={`${c.promptTokens.toLocaleString()} in / ${c.completionTokens.toLocaleString()} out`}>
                        {c.ok ? c.totalTokens.toLocaleString() : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {c.ok ? (
                          <span className="text-emerald-700 font-medium">OK</span>
                        ) : (
                          <div className="max-w-xs">
                            <span className="text-red-700 font-medium">Failed{c.errorCode ? ` · ${c.errorCode}` : ''}</span>
                            {c.errorMessage && <div className="text-[10px] text-slate-500 break-words">{c.errorMessage}</div>}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{c.userEmail || (c.uid ? <span className="font-mono">{c.uid.slice(0, 8)}…</span> : '—')}</td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500 select-all">{c.requestId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
