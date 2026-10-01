import { AlertTriangle, Trash2 } from 'lucide-react';
import { ResumeBuildOptions, ResumeStrategy } from '../../types';
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea } from '../ui';
import { sectionLimits } from '../../lib/resumeBuild';
import { cn } from '../../lib/utils';

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * The AI's resume plan, shown and editable before any resume text is
 * written. Controlled: the parent holds the draft and saves it to the job
 * when the user moves on.
 */
export default function StrategyReview({ strategy, options, onChange }: {
  strategy: ResumeStrategy;
  options: ResumeBuildOptions;
  onChange: (next: ResumeStrategy) => void;
}) {
  const limits = sectionLimits(options.pageTarget);
  const summaryWords = wordCount(strategy.executiveSummary || '');
  const set = <K extends keyof ResumeStrategy>(key: K, v: ResumeStrategy[K]) => onChange({ ...strategy, [key]: v });

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <div className="xl:col-span-2 space-y-6">
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Positioning</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">The top third of the page, which recruiters scan first.</p>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="strategy-tagline">Header tagline</Label>
              <Input id="strategy-tagline" value={strategy.headerTagline || ''} onChange={(e) => set('headerTagline', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="strategy-summary">Executive summary</Label>
                <span className={cn('text-[11px] tabular-nums', summaryWords > limits.summaryWords ? 'text-amber-600 font-semibold' : 'text-slate-400')}>
                  {summaryWords} / {limits.summaryWords} words
                </span>
              </div>
              <Textarea id="strategy-summary" value={strategy.executiveSummary || ''} onChange={(e) => set('executiveSummary', e.target.value)} className="text-sm min-h-[110px]" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Role plan</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">How each full role will be framed. Only the roles you kept in full appear here.</p>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {(strategy.roleStrategies || []).length === 0 && <p className="text-sm text-slate-500">No full roles in this plan.</p>}
            {(strategy.roleStrategies || []).map((rs, i) => (
              <div key={rs.roleId || i} className="border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{rs.company}</div>
                <div className="space-y-1">
                  <Label htmlFor={`reframe-${i}`} className="text-xs">Title on the resume</Label>
                  <Input
                    id={`reframe-${i}`}
                    value={rs.titleReframe || ''}
                    onChange={(e) => set('roleStrategies', strategy.roleStrategies.map((r, j) => (j === i ? { ...r, titleReframe: e.target.value } : r)))}
                    className="text-sm"
                  />
                </div>
                {rs.note && <p className="text-xs text-slate-600 leading-relaxed">{rs.note}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Skills rows</CardTitle>
              <span className={cn('text-[11px] tabular-nums', (strategy.skillRows || []).length > limits.skillRows ? 'text-amber-600 font-semibold' : 'text-slate-400')}>
                {(strategy.skillRows || []).length} / {limits.skillRows} rows
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-3">
            {(strategy.skillRows || []).map((row, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input
                  value={row.label}
                  onChange={(e) => set('skillRows', strategy.skillRows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                  className="w-44 text-sm font-semibold"
                  aria-label="Skills row label"
                />
                <Textarea
                  value={row.content}
                  onChange={(e) => set('skillRows', strategy.skillRows.map((r, j) => (j === i ? { ...r, content: e.target.value } : r)))}
                  className="flex-1 text-sm min-h-[40px]"
                  aria-label="Skills row terms"
                />
                <button type="button" aria-label="Remove skills row" onClick={() => set('skillRows', strategy.skillRows.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600 p-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {(strategy.selectedOutcomes || []).length > 0 && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base">Proof points to feature</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Remove any you don't want leaned on.</p>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="space-y-2">
                {strategy.selectedOutcomes.map((o, i) => (
                  <li key={i} className="flex gap-2 items-start text-sm text-slate-700">
                    <span className="flex-1">{o}</span>
                    <button type="button" aria-label="Remove proof point" onClick={() => set('selectedOutcomes', strategy.selectedOutcomes.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600 p-0.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {(strategy.cautionClaims || []).length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="pt-5">
              <div className="flex items-center gap-1.5 text-sm font-bold text-amber-800 mb-2">
                <AlertTriangle className="w-4 h-4" /> Claims to be careful with
              </div>
              <ul className="list-disc pl-5 space-y-1 text-xs text-amber-900">
                {strategy.cautionClaims.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}

        {(strategy.keywordPlacement || []).length > 0 && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base">Keyword placement</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {strategy.keywordPlacement.map((kp, i) => (
                <div key={i}>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{kp.category}</div>
                  <div className="flex flex-wrap gap-1">
                    {kp.keywords.map((k) => <Badge key={k} variant="outline" className="text-[11px] font-normal">{k}</Badge>)}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
