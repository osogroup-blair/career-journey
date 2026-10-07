import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Textarea, SearchInput, Pagination, useToast } from '../components/ui';
import { fetchCompanyJobs } from '../lib/aiClient';
import { buildArchiveLearningsSummary } from '../lib/archiveLearnings';
import { runQueue as runQueueWith, runMatchScan, scanPostingIntoMatch, type MatchScanDeps, type PostingMeta } from '../lib/matchScan';
import {
  buildMatchList, VIEW_LABEL, SORT_LABEL, VERDICT_LABEL,
  type MatchView, type MatchSort, type VerdictFilter, type MatchListResult
} from '../lib/matchList';
import { paginate } from '../lib/pagination';
import { StillOpenAttribution } from '../components/StillOpenAttribution';
import MatchRow, { type MatchRowActions } from '../components/matches/MatchRow';
import MatchPreferencesPanel from '../components/matches/MatchPreferencesPanel';
import { PageHeader, ViewTabs, ListToolbar, SortSelect, FilterChips, ProgressBanner } from '../components/ListPage';
import { JobMatch, MatchSource } from '../types';
import { Radar, Loader2, Sparkles, Inbox, SlidersHorizontal, Filter, RefreshCw, Plus, X, AlertTriangle } from 'lucide-react';

// A single company can have 100+ open reqs; cap what one Refresh will scan so it can't
// silently trigger hours of AI calls. Re-running Refresh picks up the rest next time.
const MAX_POSTINGS_PER_REFRESH = 15;

const PAGE_SIZE = 25;
const VIEWS: MatchView[] = ['review', 'promoted', 'dismissed', 'all'];
const VERDICT_FILTERS: VerdictFilter[] = ['any', 'PASS', 'BORDERLINE', 'SKIP'];

// Postings are separated by a line containing only ---; blocks under 40 chars are dropped as noise.
function splitPostings(raw: string): string[] {
  return raw
    .split(/\n[ \t]*-{3,}[ \t]*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 40);
}

export default function Matches() {
  const {
    matches, addMatch, updateMatch, deleteMatch, promoteMatch,
    matchPreferences, careerJourney, jobs, billing, isAdmin,
  } = useStore();
  const navigate = useNavigate();
  const toast = useToast();

  const [bulkText, setBulkText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [view, setView] = useState<MatchView>('review');
  const [verdict, setVerdict] = useState<VerdictFilter>('any');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MatchSort>('score');
  const [showBelowFloor, setShowBelowFloor] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [isRefreshingCompanies, setIsRefreshingCompanies] = useState(false);
  const [refreshWarnings, setRefreshWarnings] = useState<string[]>([]);

  useEffect(() => setPage(1), [view, verdict, query, sort, showBelowFloor]);

  const learningsCount: number = useMemo(() => {
    const learnings = buildArchiveLearningsSummary(jobs);
    return learnings ? learnings.split('\n').length : 0;
  }, [jobs]);

  const list: MatchListResult = useMemo(
    () => buildMatchList(matches, { view, verdict, query, sort, minScore: matchPreferences.minMatchScore, showBelowFloor }),
    [matches, view, verdict, query, sort, matchPreferences.minMatchScore, showBelowFloor]
  );
  const paged = paginate(list.visible, page, PAGE_SIZE);
  const totalMatches = Object.keys(matches || {}).length;
  const addPanelOpen = showAdd || totalMatches === 0;
  const filtersActive = verdict !== 'any' || query.trim() !== '';

  const scanDeps = (): MatchScanDeps => ({
    addMatch,
    updateMatch,
    careerJourney,
    jobs,
    excludedKeywords: matchPreferences.excludedKeywords,
  });

  const runScan = (matchId: string, jdText: string, known?: { company?: string; title?: string }) =>
    runMatchScan(scanDeps(), matchId, jdText, known);

  const scanOne = async (jdText: string, opts?: PostingMeta) => {
    await scanPostingIntoMatch(scanDeps(), jdText, opts);
  };

  const runQueue = async <T,>(items: T[], worker: (item: T) => Promise<void>) => {
    await runQueueWith(items, worker, setProgress);
    setProgress(null);
  };

  // New scans land in "To review"; make sure that's what's on screen while they come in.
  const showIncoming = () => {
    setView('review');
    setVerdict('any');
    setQuery('');
    setSort('score');
  };

  const handleScanAll = async () => {
    const postings = splitPostings(bulkText);
    if (postings.length === 0) {
      toast.error('Paste at least one job description. Separate multiple postings with a line containing only ---');
      return;
    }
    setIsScanning(true);
    setShowAdd(false);
    showIncoming();
    setBulkText('');
    await runQueue(postings, (jdText) => scanOne(jdText));
    setIsScanning(false);
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
      toast.info(warnings.length > 0 ? 'No new postings found, and some companies failed to look up — see the warning above the list.' : 'No new postings found — everything from your tracked companies is already in the list.');
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
      showIncoming();
      await runQueue(batch, (p) => scanOne(p.jdText, { source: p.source, sourceUrl: p.sourceUrl, externalId: p.externalId, company: p.company, title: p.title }));
      setIsScanning(false);
    }
    setIsRefreshingCompanies(false);
  };

  const rowActions: MatchRowActions = {
    onPromote: (m) => {
      const jobId = promoteMatch(m.id);
      if (jobId) navigate(`/job/${jobId}/parsed`);
    },
    onViewAnalysis: (m) => navigate(`/job/${m.promotedJobId}/parsed`),
    onDismiss: (m) => updateMatch(m.id, { status: 'Dismissed' }),
    onRestore: (m) => updateMatch(m.id, { status: 'New' }),
    onRetry: (m: JobMatch) => {
      const known = m.source !== 'manual-paste' ? { company: m.companyName, title: m.roleTitle } : undefined;
      updateMatch(m.id, { companyName: known?.company || 'Scanning…', roleTitle: known?.title || 'Scanning…', scanError: undefined });
      runScan(m.id, m.jdText, known);
    },
    onScanAnyway: (m: JobMatch) => {
      const known = m.source !== 'manual-paste' ? { company: m.companyName, title: m.roleTitle } : undefined;
      updateMatch(m.id, { status: 'New', dismissReason: undefined, companyName: known?.company || 'Scanning…', roleTitle: known?.title || 'Scanning…' });
      runScan(m.id, m.jdText, known);
    },
    onRemove: (m) => {
      if (confirm(`Remove "${m.roleTitle}" at ${m.companyName}? This deletes the match and its scan.`)) deleteMatch(m.id);
    },
  };

  const toggleExpanded = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Hard gate: Job Analysis (Matches) requires a paid plan — billing is null
  // in local-only mode (no Firebase, no billing concept), which stays fully
  // open, same as today. See payment-system-plan.md Phase 2.
  if (!isAdmin && billing && billing.plan === 'free') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center space-y-4">
          <Radar className="w-10 h-10 text-brand-500 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">Job Analysis is a paid feature</h1>
          <p className="text-sm text-slate-500">
            Matches automatically triages job postings against your Career Journey — scoring fit, flagging gaps, and
            surfacing which ones are worth a full application. Upgrade to unlock it.
          </p>
          <Button onClick={() => navigate('/upgrade')}>See plans</Button>
        </div>
      </div>
    );
  }

  const trackedCount = matchPreferences.trackedCompanies.length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8 space-y-5">

        <PageHeader
          icon={Radar}
          title="Job Matches"
          subtitle="Postings scored against your Career Journey. Add the good ones to your pipeline; dismiss the rest."
          meta={learningsCount > 0 && (
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Scoring is informed by {learningsCount} past application outcome{learningsCount === 1 ? '' : 's'}
            </span>
          )}
          actions={<>
            <Button variant="outline" size="sm" onClick={() => setShowPreferences((v) => !v)} className="bg-white">
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
              Preferences
            </Button>
            {trackedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshCompanies}
                disabled={isRefreshingCompanies || isScanning}
                className="bg-white"
                title={`Pull new postings from ${matchPreferences.trackedCompanies.join(', ')}`}
              >
                {isRefreshingCompanies ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                {isRefreshingCompanies ? 'Checking…' : `Check ${trackedCount} compan${trackedCount === 1 ? 'y' : 'ies'}`}
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAdd((v) => !v)} disabled={isScanning}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add postings
            </Button>
          </>}
        />

        {showPreferences && <MatchPreferencesPanel onClose={() => setShowPreferences(false)} />}

        {addPanelOpen && (
          <Card className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900">Add postings to score</h2>
              {totalMatches > 0 && (
                <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'Paste one or more full job descriptions.\nSeparate multiple postings with a line containing only ---'}
              className="min-h-[160px] font-mono text-xs"
              disabled={isScanning}
              autoFocus={showAdd}
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Each posting gets a fit score, verdict, strengths to lead with, and top gaps.</p>
              <Button
                onClick={handleScanAll}
                disabled={isScanning || bulkText.trim().length === 0}
                className="min-w-[160px] flex items-center justify-center gap-2 shrink-0"
              >
                {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
                {isScanning ? 'Scanning…' : 'Scan postings'}
              </Button>
            </div>
          </Card>
        )}

        {progress && <ProgressBanner label="Scanning postings…" progress={progress} />}

        {refreshWarnings.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            <span>Couldn't look up: {refreshWarnings.join('; ')}</span>
          </div>
        )}

        <Card className="overflow-hidden">
          <ViewTabs views={VIEWS} labels={VIEW_LABEL} counts={list.viewCounts} value={view} onChange={setView} label="Match views" />

          <ListToolbar>
            <SearchInput value={query} onValueChange={setQuery} placeholder="Search title, company, location…" className="lg:w-72" />
            <FilterChips
              options={VERDICT_FILTERS}
              value={verdict}
              onChange={setVerdict}
              label={(f) => (f === 'any' ? 'All fits' : VERDICT_LABEL[f])}
              counts={list.verdictCounts}
            />
            <SortSelect value={sort} onChange={setSort} labels={SORT_LABEL} />
          </ListToolbar>

          {(list.hiddenByFloor > 0 || showBelowFloor) && matchPreferences.minMatchScore > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-2 text-xs text-slate-500 border-b border-slate-100">
              <Filter className="w-3.5 h-3.5" />
              {showBelowFloor
                ? `Showing matches below your minimum score of ${matchPreferences.minMatchScore}.`
                : `${list.hiddenByFloor} hidden below your minimum score of ${matchPreferences.minMatchScore}.`}
              <button onClick={() => setShowBelowFloor((v) => !v)} className="font-semibold text-brand-600 hover:text-brand-800">
                {showBelowFloor ? 'Hide them' : 'Show them'}
              </button>
            </div>
          )}

          {paged.pageItems.length === 0 ? (
            <div className="py-14 px-4 text-center">
              <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h4 className="text-base font-bold text-slate-800">
                {totalMatches === 0 ? 'No matches yet' : filtersActive ? 'Nothing matches those filters' : `Nothing in ${VIEW_LABEL[view]}`}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {totalMatches === 0
                  ? 'Paste a few job descriptions above to see how you stack up.'
                  : filtersActive
                    ? 'Try a different search or fit filter.'
                    : view === 'review'
                      ? "You're all caught up. Add more postings to keep the pipeline full."
                      : 'Switch views to see the rest of your matches.'}
              </p>
              {filtersActive && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => { setVerdict('any'); setQuery(''); }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {paged.pageItems.map((m) => (
                <MatchRow key={m.id} match={m} expanded={expanded.has(m.id)} onToggle={() => toggleExpanded(m.id)} actions={rowActions} />
              ))}
            </ul>
          )}

          {paged.totalPages > 1 && (
            <Pagination
              page={paged.page}
              totalPages={paged.totalPages}
              start={paged.start}
              end={paged.end}
              total={paged.total}
              noun="matches"
              onPageChange={setPage}
              className="px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50/60"
            />
          )}
        </Card>

        {list.visible.some((m) => m.source === 'stillopen') && (
          <div className="flex justify-end">
            <StillOpenAttribution />
          </div>
        )}
      </div>
    </div>
  );
}
