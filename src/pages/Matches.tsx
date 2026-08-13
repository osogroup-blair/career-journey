import React, { useState } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, Textarea, Input, Label, useToast } from '../components/ui';
import { scanJobMatch, fetchCompanyJobs } from '../lib/mock-ai';
import { generateId } from '../lib/utils';
import { JobMatch, MatchStatus, MatchSource } from '../types';
import {
  Radar, Loader2, Sparkles, Trash2, ArrowUpRight, XCircle, AlertTriangle, Inbox,
  SlidersHorizontal, X, Filter, RotateCcw, RefreshCw, ExternalLink, Building2
} from 'lucide-react';

const SOURCE_LABEL: Record<MatchSource, string> = {
  'manual-paste': 'Pasted',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
};

// A single company can have 100+ open reqs; cap what one Refresh will scan so it can't
// silently trigger hours of AI calls. Re-running Refresh picks up the rest next time.
const MAX_POSTINGS_PER_REFRESH = 15;

const VERDICT_BADGE: Record<string, 'success' | 'warning' | 'destructive'> = {
  PASS: 'success',
  BORDERLINE: 'warning',
  SKIP: 'destructive',
};

const GATE_BADGE: Record<string, 'success' | 'warning' | 'destructive'> = {
  'CLEAR TO APPLY': 'success',
  'VERIFY FIRST': 'warning',
  'LIKELY AUTO-REJECT': 'destructive',
};

const STATUS_FILTERS: (MatchStatus | 'All')[] = ['All', 'New', 'Promoted', 'Dismissed'];

// Postings are separated by a line containing only ---; blocks under 40 chars are dropped as noise.
function splitPostings(raw: string): string[] {
  return raw
    .split(/\n[ \t]*-{3,}[ \t]*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 40);
}

function guessTitleFromText(text: string): string {
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || 'Untitled posting';
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

function findExcludedKeyword(jdText: string, excludedKeywords: string[]): string | null {
  const haystack = jdText.toLowerCase();
  const hit = excludedKeywords.find((k) => k.trim() && haystack.includes(k.trim().toLowerCase()));
  return hit ? hit.trim() : null;
}

function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (tags: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const value = draft.trim();
    if (value && !tags.includes(value)) onChange([...tags, value]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {tag}
            <button onClick={() => onChange(tags.filter((t) => t !== tag))} className="text-slate-400 hover:text-slate-700">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="h-9 text-xs"
      />
    </div>
  );
}

export default function Matches() {
  const {
    matches, addMatch, updateMatch, deleteMatch, promoteMatch,
    matchPreferences, updateMatchPreferences,
    careerJourney, updateCareerJourneyPerson,
  } = useStore();
  const navigate = useNavigate();
  const toast = useToast();

  const [bulkText, setBulkText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [statusFilter, setStatusFilter] = useState<MatchStatus | 'All'>('All');
  const [showPreferences, setShowPreferences] = useState(false);

  const positioning = careerJourney?.person?.positioning || {};
  const targetRoleFamilies: string[] = positioning.target_role_families || [];

  const updatePositioning = (updates: Record<string, any>) => {
    updateCareerJourneyPerson({ positioning: { ...positioning, ...updates } });
  };

  const updateWorkPreference = (value: string) => {
    updateCareerJourneyPerson({ work_preference: value });
  };

  const [isRefreshingCompanies, setIsRefreshingCompanies] = useState(false);
  const [refreshWarnings, setRefreshWarnings] = useState<string[]>([]);

  const runScan = async (matchId: string, jdText: string, known?: { company?: string; title?: string }) => {
    try {
      const result = await scanJobMatch(jdText, careerJourney);
      updateMatch(matchId, {
        companyName: known?.company || result.parse?.company || 'Unknown Company',
        roleTitle: known?.title || result.parse?.roleTitle || 'Unknown Role',
        parse: result.parse,
        matchScore: result.matchScore,
        verdict: result.verdict,
        hardGateRisk: result.hardGateRisk,
        topGaps: result.topGaps,
        leadWith: result.leadWith,
        scanError: undefined,
        dismissReason: undefined,
      });
    } catch (err: any) {
      updateMatch(matchId, {
        companyName: known?.company || 'Scan failed',
        roleTitle: known?.title || 'Scan failed',
        scanError: err?.message || 'Unknown error',
      });
    }
  };

  const scanOne = async (
    jdText: string,
    opts?: { source?: MatchSource; sourceUrl?: string; externalId?: string; company?: string; title?: string }
  ) => {
    const id = generateId('MATCH');
    const now = new Date().toISOString();
    const source = opts?.source || 'manual-paste';

    const excludedHit = findExcludedKeyword(jdText, matchPreferences.excludedKeywords);
    if (excludedHit) {
      addMatch({
        id,
        createdAt: now,
        updatedAt: now,
        source,
        sourceUrl: opts?.sourceUrl,
        externalId: opts?.externalId,
        companyName: opts?.company || 'Not scanned',
        roleTitle: opts?.title || guessTitleFromText(jdText),
        jdText,
        status: 'Dismissed',
        dismissReason: `Skipped before scanning — JD contains excluded keyword "${excludedHit}"`,
      });
      return;
    }

    addMatch({
      id,
      createdAt: now,
      updatedAt: now,
      source,
      sourceUrl: opts?.sourceUrl,
      externalId: opts?.externalId,
      companyName: opts?.company || 'Scanning…',
      roleTitle: opts?.title || 'Scanning…',
      jdText,
      status: 'New',
    });
    await runScan(id, jdText, { company: opts?.company, title: opts?.title });
  };

  const runQueue = async <T,>(items: T[], worker: (item: T) => Promise<void>, concurrency = 3) => {
    let cursor = 0;
    let done = 0;
    setProgress({ done: 0, total: items.length });
    const runners = async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        await worker(items[idx]);
        done++;
        setProgress({ done, total: items.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runners));
    setProgress(null);
  };

  const handleScanAll = async () => {
    const postings = splitPostings(bulkText);
    if (postings.length === 0) {
      toast.error('Paste at least one job description. Separate multiple postings with a line containing only ---');
      return;
    }
    setIsScanning(true);
    await runQueue(postings, (jdText) => scanOne(jdText));
    setIsScanning(false);
    setBulkText('');
  };

  const handleRefreshCompanies = async () => {
    if (matchPreferences.trackedCompanies.length === 0) {
      toast.error('Add at least one company board token in Match Preferences first.');
      return;
    }
    setIsRefreshingCompanies(true);
    setRefreshWarnings([]);

    const seen = new Set(
      Object.values(matches || {})
        .filter((m) => m.source !== 'manual-paste' && m.externalId)
        .map((m) => `${m.source}:${m.externalId}`)
    );

    const newPostings: { jdText: string; source: MatchSource; sourceUrl: string; externalId: string; company: string; title: string }[] = [];
    const warnings: string[] = [];

    for (const token of matchPreferences.trackedCompanies) {
      try {
        const { jobs } = await fetchCompanyJobs(token);
        for (const job of jobs) {
          const key = `${job.source}:${job.externalId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          newPostings.push({
            jdText: job.jdText,
            source: job.source,
            sourceUrl: job.absoluteUrl,
            externalId: job.externalId,
            company: job.companyName,
            title: job.title,
          });
        }
      } catch (err: any) {
        warnings.push(`${token}: ${err?.message || 'lookup failed'}`);
      }
    }
    setRefreshWarnings(warnings);

    if (newPostings.length === 0) {
      setIsRefreshingCompanies(false);
      toast.info(warnings.length > 0 ? 'No new postings found, and some companies failed to look up — see the warning below Refresh.' : 'No new postings found — everything from your tracked companies is already in the list.');
      return;
    }

    const batch = newPostings.slice(0, MAX_POSTINGS_PER_REFRESH);
    const capped = newPostings.length > MAX_POSTINGS_PER_REFRESH;
    const message = capped
      ? `Found ${newPostings.length} new postings across your tracked companies. Scanning is capped at ${MAX_POSTINGS_PER_REFRESH} per refresh — scan the first ${MAX_POSTINGS_PER_REFRESH} now? Run Refresh again afterward to pick up the rest.`
      : `Found ${newPostings.length} new posting${newPostings.length === 1 ? '' : 's'} across your tracked companies. Scan them against your Career Journey now?`;

    const proceed = confirm(message);
    if (proceed) {
      setIsScanning(true);
      await runQueue(batch, (p) => scanOne(p.jdText, { source: p.source, sourceUrl: p.sourceUrl, externalId: p.externalId, company: p.company, title: p.title }));
      setIsScanning(false);
    }
    setIsRefreshingCompanies(false);
  };

  const handleRetry = (m: JobMatch) => {
    const known = m.source !== 'manual-paste' ? { company: m.companyName, title: m.roleTitle } : undefined;
    updateMatch(m.id, { companyName: known?.company || 'Scanning…', roleTitle: known?.title || 'Scanning…', scanError: undefined });
    runScan(m.id, m.jdText, known);
  };

  const handleScanAnyway = (m: JobMatch) => {
    const known = m.source !== 'manual-paste' ? { company: m.companyName, title: m.roleTitle } : undefined;
    updateMatch(m.id, { status: 'New', dismissReason: undefined, companyName: known?.company || 'Scanning…', roleTitle: known?.title || 'Scanning…' });
    runScan(m.id, m.jdText, known);
  };

  const handlePromote = (matchId: string) => {
    const jobId = promoteMatch(matchId);
    if (jobId) navigate(`/job/${jobId}/parse`);
  };

  const matchList = Object.values(matches || {}).sort((a, b) => {
    if (a.matchScore == null && b.matchScore == null) return 0;
    if (a.matchScore == null) return 1;
    if (b.matchScore == null) return -1;
    return b.matchScore - a.matchScore;
  });

  const statusFiltered = statusFilter === 'All' ? matchList : matchList.filter((m) => m.status === statusFilter);

  const visibleMatches = statusFiltered.filter(
    (m) => m.status === 'Promoted' || m.matchScore == null || m.matchScore >= matchPreferences.minMatchScore
  );
  const hiddenByScoreFloor = statusFiltered.length - visibleMatches.length;

  const statusCounts = matchList.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-900/5 font-sans text-slate-900 pb-20">
      <section className="bg-gradient-to-br from-brand-950 via-slate-900 to-slate-950 text-white pt-10 pb-16 px-4 sm:px-6 lg:px-8 border-b border-brand-950">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Radar className="w-5 h-5 text-brand-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-300">Discovery</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Job Matches</h1>
            <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-2xl">
              Paste in postings you've found and get a fast fit score against your Career Journey before committing to the full tailoring pipeline.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreferences((v) => !v)}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
            Match Preferences
          </Button>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-8 relative z-20 space-y-6">

        {showPreferences && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-brand-600" />
                Match Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div>
                <Label>Target Role Families</Label>
                <p className="text-xs text-slate-500 mb-2 -mt-1">Feeds every match scan — stored on your Career Journey.</p>
                <TagInput
                  tags={targetRoleFamilies}
                  onChange={(tags) => updatePositioning({ target_role_families: tags })}
                  placeholder="Add a role family, press Enter"
                />
              </div>
              <div>
                <Label htmlFor="workPreference">Work Preference</Label>
                <p className="text-xs text-slate-500 mb-2 -mt-1">Location, remote, and travel constraints.</p>
                <Input
                  id="workPreference"
                  defaultValue={careerJourney?.person?.work_preference || ''}
                  onBlur={(e) => updateWorkPreference(e.target.value)}
                  placeholder="e.g. Remote-first, willing to travel 10-20%"
                  className="text-sm"
                />
              </div>
              <div>
                <Label>Excluded Keywords</Label>
                <p className="text-xs text-slate-500 mb-2 -mt-1">A posting containing any of these skips the AI scan entirely and is auto-dismissed.</p>
                <TagInput
                  tags={matchPreferences.excludedKeywords}
                  onChange={(tags) => updateMatchPreferences({ excludedKeywords: tags })}
                  placeholder="e.g. Top Secret clearance, press Enter"
                />
              </div>
              <div>
                <Label htmlFor="minScore">Minimum Match Score to Show</Label>
                <p className="text-xs text-slate-500 mb-2 -mt-1">Hides lower-scoring postings from the list below (0 = show everything).</p>
                <Input
                  id="minScore"
                  type="number"
                  min={0}
                  max={100}
                  value={matchPreferences.minMatchScore}
                  onChange={(e) => updateMatchPreferences({ minMatchScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                  className="text-sm w-28"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Tracked Companies</Label>
                <p className="text-xs text-slate-500 mb-2 -mt-1">
                  Board tokens from Greenhouse or Lever career pages — e.g. "airbnb" from boards.greenhouse.io/airbnb, or the slug from jobs.lever.co/&lt;token&gt;. Refresh Matches pulls their open postings automatically.
                </p>
                <TagInput
                  tags={matchPreferences.trackedCompanies}
                  onChange={(tags) => updateMatchPreferences({ trackedCompanies: tags })}
                  placeholder="e.g. airbnb, press Enter"
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand-600" />
              Scan New Postings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'Paste one or more full job descriptions.\nSeparate multiple postings with a line containing only ---'}
              className="min-h-[180px] font-mono text-xs"
              disabled={isScanning}
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {isScanning && progress
                  ? `Scanning ${progress.done} of ${progress.total}…`
                  : 'Each posting gets one fast fit score, verdict, and top gaps — no keyword deep-dive yet.'}
              </p>
              <Button
                onClick={handleScanAll}
                disabled={isScanning || bulkText.trim().length === 0}
                className="min-w-[160px] flex items-center justify-center gap-2 shrink-0"
              >
                {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
                {isScanning ? 'Scanning…' : 'Scan Postings'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {matchPreferences.trackedCompanies.length > 0 && (
          <Card>
            <CardContent className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-xs text-slate-500">
                <Building2 className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                <span>
                  Tracking {matchPreferences.trackedCompanies.length} compan{matchPreferences.trackedCompanies.length === 1 ? 'y' : 'ies'} for new postings.
                  {refreshWarnings.length > 0 && (
                    <span className="block text-amber-600 mt-1">Couldn't look up: {refreshWarnings.join('; ')}</span>
                  )}
                </span>
              </div>
              <Button
                variant="outline"
                onClick={handleRefreshCompanies}
                disabled={isRefreshingCompanies || isScanning}
                className="min-w-[160px] flex items-center justify-center gap-2 shrink-0 bg-white"
              >
                {isRefreshingCompanies ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {isRefreshingCompanies ? 'Checking…' : 'Refresh Matches'}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  statusFilter === s ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {s} ({s === 'All' ? matchList.length : statusCounts[s] || 0})
              </button>
            ))}
          </div>
          {hiddenByScoreFloor > 0 && (
            <button
              onClick={() => setShowPreferences(true)}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <Filter className="w-3.5 h-3.5" />
              {hiddenByScoreFloor} hidden below minimum match score — adjust in Preferences
            </button>
          )}
        </div>

        {visibleMatches.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white">
            <Inbox className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <h4 className="text-base font-bold text-slate-800">No matches here yet</h4>
            <p className="text-xs text-slate-500 mt-1">Paste job postings above to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleMatches.map((m) => (
              <Card key={m.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{m.roleTitle}</CardTitle>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs font-semibold text-slate-500 truncate">{m.companyName}</p>
                        {m.source !== 'manual-paste' && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0">· {SOURCE_LABEL[m.source]}</span>
                        )}
                        {m.sourceUrl && (
                          <a href={m.sourceUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-brand-600 shrink-0">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    {m.matchScore != null && (
                      <div className="text-right shrink-0">
                        <div className="text-xl font-extrabold text-brand-700">{m.matchScore}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">Match</div>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  {m.dismissReason ? (
                    <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <Filter className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{m.dismissReason}</span>
                    </div>
                  ) : m.scanError ? (
                    <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{m.scanError}</span>
                    </div>
                  ) : m.verdict ? (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={VERDICT_BADGE[m.verdict] || 'default'}>{m.verdict}</Badge>
                        {m.hardGateRisk && <Badge variant={GATE_BADGE[m.hardGateRisk] || 'default'}>{m.hardGateRisk}</Badge>}
                      </div>
                      {m.topGaps && m.topGaps.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Top Gaps</p>
                          <ul className="space-y-1">
                            {m.topGaps.slice(0, 3).map((g, i) => (
                              <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                                <span>{g}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning…
                    </div>
                  )}
                </CardContent>
                <div className="p-3.5 bg-slate-50 border-t border-slate-100 mt-auto flex justify-between items-center gap-2 rounded-b-xl">
                  <button
                    onClick={() => deleteMatch(m.id)}
                    className="text-xs font-bold text-slate-400 hover:text-red-600 flex items-center gap-1 uppercase tracking-wider"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                  <div className="flex gap-3">
                    {m.scanError && (
                      <button
                        onClick={() => handleRetry(m)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 uppercase tracking-wider"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Retry
                      </button>
                    )}
                    {m.dismissReason && (
                      <button
                        onClick={() => handleScanAnyway(m)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 uppercase tracking-wider"
                      >
                        Scan Anyway
                      </button>
                    )}
                    {m.status === 'New' && !m.scanError && (
                      <button
                        onClick={() => updateMatch(m.id, { status: 'Dismissed' })}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 uppercase tracking-wider"
                      >
                        Dismiss
                      </button>
                    )}
                    {m.status === 'Promoted' ? (
                      <button
                        onClick={() => navigate(`/job/${m.promotedJobId}/parse`)}
                        className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1 uppercase tracking-wider"
                      >
                        View Analysis <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    ) : m.parse ? (
                      <button
                        onClick={() => handlePromote(m.id)}
                        className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1 uppercase tracking-wider"
                      >
                        Promote <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
