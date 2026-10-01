import { useMemo } from 'react';
import { AlertTriangle, Minus, Plus, RotateCcw } from 'lucide-react';
import { useStore } from '../../store';
import { JobAnalysis, ResumeBuildOptions, ResumeRoleMode } from '../../types';
import { Badge, Card, CardContent, CardHeader, CardTitle, Label, Textarea } from '../ui';
import { cn } from '../../lib/utils';
import { computeBulletBudget, keywordsAtRisk, MAX_BULLETS_PER_ROLE, resumePreferences, roleCompany, roleMode, rolesRecentFirst } from '../../lib/resumeBuild';

const MODE_LABELS: Record<ResumeRoleMode, string> = { full: 'Full', condensed: 'One line', excluded: 'Leave off' };
const MODE_HELP: Record<ResumeRoleMode, string> = {
  full: 'Written out with bullets',
  condensed: 'Title, company and years under Earlier Experience',
  excluded: 'Not on this resume at all',
};

function Segmented<T extends string | number>({ value, options, onChange, size = 'md' }: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex bg-slate-100 p-0.5 rounded-md border border-slate-200">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-sm font-medium transition-colors whitespace-nowrap',
            size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
            value === o.value ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function roleDates(role: any): string {
  return role.dates || [role.start_date, role.end_date].filter(Boolean).join(' – ');
}

/**
 * Controlled form for a job's ResumeBuildOptions: page target, which roles
 * go on the page and how, per-role bullet limits, and free-text guidance.
 * Saving a role's or the page target's default writes to the Career Journey
 * (role.resume_default / person.resume_preferences) so future jobs start there.
 */
export default function ResumeBuildSettings({ job, value, onChange }: {
  job: JobAnalysis;
  value: ResumeBuildOptions;
  onChange: (next: ResumeBuildOptions) => void;
}) {
  const careerJourney = useStore((s) => s.careerJourney);
  const updateRole = useStore((s) => s.updateRole);
  const updateCareerJourneyPerson = useStore((s) => s.updateCareerJourneyPerson);

  const roles = useMemo(() => rolesRecentFirst(careerJourney).filter((r) => r?.id), [careerJourney]);
  const budget = useMemo(() => computeBulletBudget(value, careerJourney), [value, careerJourney]);
  const savedPageTarget = resumePreferences(careerJourney).pageTarget;

  const counts = roles.reduce(
    (acc, r) => ({ ...acc, [roleMode(value, r.id)]: acc[roleMode(value, r.id)] + 1 }),
    { full: 0, condensed: 0, excluded: 0 } as Record<ResumeRoleMode, number>
  );
  const totalBullets = Object.keys(budget).reduce((sum, roleId) => sum + budget[roleId], 0);

  const setRole = (roleId: string, patch: Partial<ResumeBuildOptions['roles'][string]>) => {
    const current = value.roles[roleId] ?? { mode: 'full' as const };
    const next = { ...current, ...patch };
    if (next.maxBullets === undefined) delete next.maxBullets;
    onChange({ ...value, roles: { ...value.roles, [roleId]: next } });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Length</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Sets the bullet budget for each role, the summary length, and the number of skill rows.</p>
            </div>
            <div className="flex items-center gap-3">
              <Segmented
                value={value.pageTarget}
                options={[{ value: 1 as const, label: '1 page' }, { value: 2 as const, label: '2 pages' }]}
                onChange={(pageTarget) => onChange({ ...value, pageTarget })}
              />
              {value.pageTarget === savedPageTarget ? (
                <span className="text-[11px] text-slate-400">Your default</span>
              ) : (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-brand-600 hover:text-brand-800"
                  onClick={() => updateCareerJourneyPerson({ resume_preferences: { ...(careerJourney?.person?.resume_preferences || {}), page_target: value.pageTarget } })}
                >
                  Make default
                </button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-base">Roles on this resume</CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            {counts.full} full ({totalBullets} bullets max) · {counts.condensed} one-line · {counts.excluded} left off
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {roles.length === 0 && <p className="text-sm text-slate-500 p-6">Your Career Journey has no roles yet.</p>}
          <ul className="divide-y divide-slate-100">
            {roles.map((role) => {
              const mode = roleMode(value, role.id);
              const override = value.roles[role.id]?.maxBullets;
              const bullets = budget[role.id];
              const atRisk = mode !== 'full' ? keywordsAtRisk(job.keywords, careerJourney, value, role.id) : [];
              const isDefault = (role.resume_default || 'full') === mode;
              return (
                <li key={role.id} className={cn('px-6 py-4', mode === 'excluded' && 'bg-slate-50/60')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className={cn('font-semibold text-sm text-slate-900', mode === 'excluded' && 'text-slate-400 line-through decoration-slate-300')}>{role.title || 'Untitled role'}</div>
                      <div className="text-xs text-slate-500">{roleCompany(role)}{roleDates(role) ? ` · ${roleDates(role)}` : ''}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {mode === 'full' && (
                        <div className="flex items-center gap-1 text-xs text-slate-600" title="Max bullets for this role">
                          <button type="button" aria-label="Fewer bullets" className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" disabled={bullets <= 0} onClick={() => setRole(role.id, { maxBullets: Math.max(0, bullets - 1) })}>
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-16 text-center tabular-nums">{bullets} bullet{bullets === 1 ? '' : 's'}</span>
                          <button type="button" aria-label="More bullets" className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" disabled={bullets >= MAX_BULLETS_PER_ROLE} onClick={() => setRole(role.id, { maxBullets: Math.min(MAX_BULLETS_PER_ROLE, bullets + 1) })}>
                            <Plus className="w-3 h-3" />
                          </button>
                          {override !== undefined && (
                            <button type="button" title="Back to the automatic budget" aria-label="Reset bullet count" className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100" onClick={() => setRole(role.id, { maxBullets: undefined })}>
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                      <Segmented
                        size="sm"
                        value={mode}
                        options={(Object.keys(MODE_LABELS) as ResumeRoleMode[]).map((m) => ({ value: m, label: MODE_LABELS[m], title: MODE_HELP[m] }))}
                        onChange={(m) => setRole(role.id, { mode: m })}
                      />
                      <div className="w-20 text-right">
                        {isDefault ? (
                          role.resume_default ? <Badge variant="outline" className="text-[10px]">Default</Badge> : null
                        ) : (
                          <button type="button" className="text-[11px] font-semibold text-brand-600 hover:text-brand-800" title={`Start this role as "${MODE_LABELS[mode]}" on future resumes`} onClick={() => updateRole(role.id, { resume_default: mode })}>
                            Make default
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {atRisk.length > 0 && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        Only this role has evidence for{' '}
                        {atRisk.map((k, i) => (
                          <span key={k.phrase}>
                            {i > 0 && ', '}
                            <span className={cn(k.critical && 'font-semibold')}>{k.phrase}</span>
                          </span>
                        ))}
                        {atRisk.some((k) => k.critical) && ' (bold = top critical)'}. Those keywords can still go in skills, but no bullet will back them up.
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-2">
          <Label htmlFor="resume-guidance">Guidance for this resume <span className="font-normal text-slate-400">(optional)</span></Label>
          <Textarea
            id="resume-guidance"
            value={value.guidance || ''}
            onChange={(e) => onChange({ ...value, guidance: e.target.value })}
            placeholder="e.g. Lead with the platform migration work; keep the consulting role about client outcomes, not tooling."
            className="text-sm min-h-[72px]"
            maxLength={1000}
          />
        </CardContent>
      </Card>
    </div>
  );
}
