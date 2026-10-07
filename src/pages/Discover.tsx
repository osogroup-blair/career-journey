import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Button, Card, CardContent, Badge, Textarea, Label, SearchInput, Pagination, useToast } from '../components/ui';
import { TagInput } from '../components/TagInput';
import { StillOpenAttribution } from '../components/StillOpenAttribution';
import { PageHeader, ViewTabs, ListToolbar, SortSelect, ProgressBanner } from '../components/ListPage';
import DiscoverRow, { type DiscoverRowActions } from '../components/discover/DiscoverRow';
import { isFirebaseConfigured } from '../lib/firebase';
import { careerJourneyToText } from '../lib/careerJourneyText';
import { rankDiscoveredJobs } from '../lib/discoveryRank';
import { relativeTime } from '../lib/discoveryFormat';
import { buildDiscoverList, DISCOVER_VIEW_LABEL, DISCOVER_SORT_LABEL, type DiscoverView, type DiscoverSort, type RankedListing } from '../lib/discoverList';
import { paginate } from '../lib/pagination';
import { runQueue, scanPostingIntoMatch } from '../lib/matchScan';
import {
  DiscoveryApiError,
  generateSearchProfile,
  getDiscoveredJobDetail,
  getDiscoveryProfile,
  listDiscoveredJobs,
  saveDiscoveryProfile,
  startDiscoveryRun,
  updateDiscoveredJob,
} from '../lib/discoveryClient';
import {
  DISCOVERY_SCHEDULES,
  SCHEDULE_LABEL,
  STILLOPEN_AREAS,
  STILLOPEN_LEVELS,
  STILLOPEN_PAY_STEPS,
  STILLOPEN_REGIONS,
  STILLOPEN_REGION_LABEL,
  StillOpenLocSchema,
  normalizeStillOpenLoc,
  type DiscoveredJob,
  type DiscoveryProfile,
  type DiscoverySchedule,
  type DiscoverySearchProfile,
} from '../types/discovery';
import {
  Telescope, Loader2, Sparkles, RefreshCw, AlertTriangle, Inbox,
  FileText, CalendarClock, Search, XCircle, ChevronDown, ChevronUp, Radar,
} from 'lucide-react';

// Same cap as a Matches refresh: one click can't quietly start dozens of AI scans.
const MAX_SCANS_PER_CLICK = 15;
const RUN_POLL_MS = 4000;
const RUN_POLL_TIMEOUT_MS = 3 * 60 * 1000;

const PAGE_SIZE = 25;
const VIEWS: DiscoverView[] = ['review', 'scanned', 'dismissed', 'all'];

const EMPTY_SEARCH: DiscoverySearchProfile = { queries: [], loc: [], level: [], area: [], payMin: null };

function PillToggle<T extends string>({ options, selected, onChange, label }: { options: readonly T[]; selected: T[]; onChange: (v: T[]) => void; label?: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? selected.filter((s) => s !== o) : [...selected, o])}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              on ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label ? label(o) : o.replace('_', ' ')}
          </button>
        );
      })}
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center space-y-3">
        <Telescope className="w-10 h-10 text-brand-500 mx-auto" />
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{body}</p>
      </div>
    </div>
  );
}

export default function Discover() {
  const { careerJourney, matches, jobs: pipelineJobs, addMatch, updateMatch, promoteMatch, matchPreferences } = useStore();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<{ status: number; message: string } | null>(null);
  const [profile, setProfile] = useState<DiscoveryProfile | null>(null);
  const [draft, setDraft] = useState<DiscoverySearchProfile>(EMPTY_SEARCH);
  const [rationale, setRationale] = useState('');
  const [listings, setListings] = useState<DiscoveredJob[]>([]);
  const [view, setView] = useState<DiscoverView>('review');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DiscoverSort>('relevance');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSetup, setShowSetup] = useState(false);
  const [showCv, setShowCv] = useState(false);
  const [busy, setBusy] = useState<null | 'cv' | 'ai' | 'save' | 'schedule'>(null);
  const [running, setRunning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentCvText = useMemo(() => careerJourneyToText(careerJourney), [careerJourney]);
  const cvStale = Boolean(profile?.cvText) && profile!.cvText !== currentCvText;
  const savedSearch = profile?.searchProfile || null;
  const searchDirty = JSON.stringify(draft) !== JSON.stringify(savedSearch || EMPTY_SEARCH);

  const loadListings = useCallback(async () => {
    try {
      const { jobs } = await listDiscoveredJobs();
      setListings(jobs);
    } catch (e: any) {
      toast.error(e.message);
    }
  }, [toast]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await getDiscoveryProfile();
        setProfile(res.profile);
        setDraft(res.profile.searchProfile || EMPTY_SEARCH);
        setRationale(res.profile.searchProfileRationale || '');
        setShowSetup(!res.profile.searchProfile);
        await loadListings();
      } catch (e: any) {
        setAccess({ status: e instanceof DiscoveryApiError ? e.status : 500, message: e.message });
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (update: Parameters<typeof saveDiscoveryProfile>[0], kind: 'cv' | 'save' | 'schedule' | 'ai') => {
    setBusy(kind);
    try {
      const res = await saveDiscoveryProfile(update);
      setProfile(res.profile);
      return res.profile;
    } catch (e: any) {
      toast.error(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleRefreshCv = async () => {
    if (!currentCvText) {
      toast.error('Your Career Journey is empty — build it first, then come back.');
      return;
    }
    const saved = await save({ cvText: currentCvText, cvGeneratedAt: new Date().toISOString() }, 'cv');
    if (saved) toast.success('CV snapshot updated. Your searches are unchanged — regenerate them if your focus has shifted.');
  };

  const handleSuggest = async () => {
    let cvText = profile?.cvText || '';
    if (!cvText || cvStale) {
      const saved = await save({ cvText: currentCvText, cvGeneratedAt: new Date().toISOString() }, 'cv');
      if (!saved) return;
      cvText = saved.cvText;
    }
    setBusy('ai');
    try {
      const res = await generateSearchProfile(cvText);
      setDraft(res.searchProfile);
      setRationale(res.rationale);
      if (res.dropped.length) toast.info(`Left out values StillOpen doesn't accept: ${res.dropped.join(', ')}`);
      const saved = await save({ searchProfile: res.searchProfile, searchProfileRationale: res.rationale }, 'ai');
      if (saved) toast.success('Searches suggested and saved — edit them below if anything looks off.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const handleSaveSearch = async () => {
    if (draft.queries.length === 0) {
      toast.error('Add at least one search.');
      return;
    }
    const saved = await save({ searchProfile: draft }, 'save');
    if (saved) {
      setDraft(saved.searchProfile || EMPTY_SEARCH);
      toast.success('Searches saved.');
    }
  };

  const handleSchedule = async (schedule: DiscoverySchedule) => {
    if (schedule !== 'off' && !savedSearch) {
      toast.error('Save your searches before turning on a schedule.');
      return;
    }
    await save({ schedule }, 'schedule');
  };

  const pollForRun = (previousRunAt: string | undefined, startedAt: number) => {
    pollRef.current = setTimeout(async () => {
      try {
        const res = await getDiscoveryProfile();
        if (res.profile.lastRun?.at && res.profile.lastRun.at !== previousRunAt) {
          setProfile(res.profile);
          setRunning(false);
          await loadListings();
          const r = res.profile.lastRun;
          if (r.status === 'error') toast.error(r.error || 'The search failed.');
          else toast.success(`Search finished — ${r.newCount} new listing${r.newCount === 1 ? '' : 's'}.`);
          return;
        }
      } catch {
        // transient — keep polling until the timeout
      }
      if (Date.now() - startedAt > RUN_POLL_TIMEOUT_MS) {
        setRunning(false);
        toast.info('The search is taking a while — results will appear here when it finishes.');
        return;
      }
      pollForRun(previousRunAt, startedAt);
    }, RUN_POLL_MS);
  };

  const handleRunNow = async () => {
    if (searchDirty) {
      toast.error('Save your search changes first.');
      return;
    }
    try {
      await startDiscoveryRun();
      setRunning(true);
      pollForRun(profile?.lastRun?.at, Date.now());
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const patchListing = (id: string, fields: Partial<DiscoveredJob>) =>
    setListings((prev) => prev.map((j) => (j.id === id ? { ...j, ...fields } : j)));

  const scanListing = async (job: DiscoveredJob) => {
    setScanningIds((s) => new Set(s).add(job.id));
    setRowErrors(({ [job.id]: _, ...rest }) => rest);
    try {
      const detail = await getDiscoveredJobDetail(job.id);
      const jdText = `${detail.title} — ${detail.company}\n\n${detail.descriptionText}`;
      const { matchId } = await scanPostingIntoMatch(
        { addMatch, updateMatch, careerJourney, jobs: pipelineJobs, excludedKeywords: matchPreferences.excludedKeywords },
        jdText,
        {
          source: 'stillopen',
          sourceUrl: detail.canonicalUrl || job.canonicalUrl || undefined,
          externalId: job.id,
          company: job.company,
          title: job.title,
          applyUrl: detail.applyUrl || undefined,
          compensationRange: detail.salaryText,
          locationNotes: detail.locationNotes,
        }
      );
      await updateDiscoveredJob(job.id, { userState: 'scanned', matchId });
      patchListing(job.id, { userState: 'scanned', matchId });
    } catch (e: any) {
      if (e instanceof DiscoveryApiError && (e.status === 410 || e.status === 404)) {
        setListings((prev) => prev.filter((j) => j.id !== job.id));
        toast.info(`"${job.title}" has closed — removed from your list.`);
      } else {
        setRowErrors((r) => ({ ...r, [job.id]: e.message || 'Scan failed' }));
      }
    } finally {
      setScanningIds((s) => {
        const next = new Set(s);
        next.delete(job.id);
        return next;
      });
    }
  };

  const handleScanSelected = async () => {
    const targets = listings.filter((j) => selected.has(j.id) && !j.matchId);
    if (targets.length === 0) return;
    const batch = targets.slice(0, MAX_SCANS_PER_CLICK);
    if (targets.length > MAX_SCANS_PER_CLICK) {
      toast.info(`Scanning the first ${MAX_SCANS_PER_CLICK} — select the rest again afterwards.`);
    }
    setSelected(new Set());
    await runQueue(batch, scanListing, setScanProgress);
    setScanProgress(null);
  };

  const setUserState = async (job: DiscoveredJob, userState: DiscoveredJob['userState']) => {
    patchListing(job.id, { userState });
    try {
      await updateDiscoveredJob(job.id, { userState });
    } catch (e: any) {
      toast.error(e.message);
      patchListing(job.id, { userState: job.userState });
    }
  };

  const handlePromote = async (job: DiscoveredJob) => {
    if (!job.matchId) return;
    // Scans from before the apply link was carried over: fetch it now so the job gets the employer link.
    const match = matches[job.matchId];
    if (match && !match.applyUrl) {
      try {
        const detail = await getDiscoveredJobDetail(job.id);
        updateMatch(job.matchId, {
          applyUrl: detail.applyUrl || undefined,
          compensationRange: match.compensationRange || detail.salaryText || undefined,
          locationNotes: match.locationNotes || detail.locationNotes || undefined,
        });
      } catch (e: any) {
        if (e instanceof DiscoveryApiError && (e.status === 410 || e.status === 404)) {
          setListings((prev) => prev.filter((j) => j.id !== job.id));
          toast.info(`"${job.title}" has closed — removed from your list.`);
          return;
        }
        // Anything else: promote anyway with the StillOpen link rather than block on it.
      }
    }
    const jobId = promoteMatch(job.matchId);
    if (!jobId) {
      toast.error("Couldn't find this scan's match — try scanning again.");
      return;
    }
    await setUserState(job, 'promoted');
    navigate(`/job/${jobId}/parsed`);
  };

  const rankContext = useMemo(() => {
    const person = careerJourney?.person || {};
    return {
      targetRoles: [...(person.positioning?.target_role_families || []), ...(savedSearch?.queries || [])],
      skills: (careerJourney?.skills_index || []).slice(0, 40).map((s: any) => s?.name || '').filter(Boolean),
    };
  }, [careerJourney, savedSearch]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [view, query, sort]);

  const ranked: RankedListing[] = useMemo(() => rankDiscoveredJobs(listings, rankContext), [listings, rankContext]);
  const { visible, counts } = useMemo(() => buildDiscoverList(ranked, matches, { view, query, sort }), [ranked, matches, view, query, sort]);
  const paged = paginate(visible, page, PAGE_SIZE);
  const selectable = visible.filter(({ job }) => !job.matchId);
  const lastRunAt = profile?.lastRun?.at;

  if (!isFirebaseConfigured || access?.status === 501) {
    return <Notice title="Discover needs a cloud account" body="Scheduled job discovery runs on the server, so it needs Firebase configured and a signed-in account. It isn't available in local-only mode." />;
  }
  if (access?.status === 403) {
    return <Notice title="Discover isn't available on your account" body={access.message} />;
  }
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading Discover…
      </div>
    );
  }
  if (access) {
    return <Notice title="Couldn't load Discover" body={access.message} />;
  }

  const locInvalid = draft.loc.filter((l) => !StillOpenLocSchema.safeParse(l).success);

  const toggleIn = (setter: typeof setSelected, id: string) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const rowActions: DiscoverRowActions = {
    onToggleSelect: (job) => toggleIn(setSelected, job.id),
    onScan: scanListing,
    onPromote: handlePromote,
    onViewAnalysis: (match) => navigate(`/job/${match.promotedJobId}/parsed`),
    onDismiss: (job) => setUserState(job, 'dismissed'),
    onRestore: (job) => setUserState(job, job.matchId ? 'scanned' : 'new'),
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8 space-y-5">
        <PageHeader
          icon={Telescope}
          title="Discover"
          subtitle="Fully-remote roles from StillOpen, searched on a schedule from your Career Journey. Scan the promising ones, then add the best to your pipeline."
          meta={<>
            <span className="flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5" />
              {SCHEDULE_LABEL[profile?.schedule || 'off']}
              {profile?.nextRunAt ? ` · next ${relativeTime(profile.nextRunAt)}` : ''}
            </span>
            {lastRunAt && (
              <span>
                Last search {relativeTime(lastRunAt)}
                {profile?.lastRun?.status === 'error' ? ' — failed' : ` — ${profile?.lastRun?.newCount ?? 0} new`}
              </span>
            )}
          </>}
          actions={<>
            <Button variant="outline" size="sm" onClick={() => setShowSetup((v) => !v)} className="bg-white">
              {showSetup ? <ChevronUp className="w-3.5 h-3.5 mr-1.5" /> : <ChevronDown className="w-3.5 h-3.5 mr-1.5" />}
              Search setup
            </Button>
            <Button size="sm" onClick={handleRunNow} disabled={running || !savedSearch} className="min-w-[130px]">
              {running ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Search className="w-3.5 h-3.5 mr-1.5" />}
              {running ? 'Searching…' : 'Search now'}
            </Button>
          </>}
        />

        {profile?.lastRun?.status === 'error' && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Last search failed: {profile.lastRun.error}</span>
          </div>
        )}

        {showSetup && (
          <Card>
            <CardContent className="space-y-8">
              {/* Step 1: CV snapshot */}
              <section className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-brand-600" /> 1. CV snapshot
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {profile?.cvText
                        ? `Plain-text CV built from your Career Journey ${relativeTime(profile.cvGeneratedAt)}. Contact details are left out.`
                        : 'A plain-text CV built from your Career Journey. Searches are suggested from it; contact details are left out.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {cvStale && <Badge variant="warning">Career Journey changed since</Badge>}
                    {profile?.cvText && (
                      <Button variant="ghost" size="sm" onClick={() => setShowCv((v) => !v)}>
                        {showCv ? 'Hide' : 'View'}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleRefreshCv} disabled={busy !== null || (!cvStale && Boolean(profile?.cvText))}>
                      {busy === 'cv' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                      {profile?.cvText ? 'Refresh CV' : 'Create CV'}
                    </Button>
                  </div>
                </div>
                {showCv && profile?.cvText && <Textarea readOnly value={profile.cvText} className="min-h-[220px] font-mono text-xs" />}
              </section>

              {/* Step 2: searches */}
              <section className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Search className="w-4 h-4 text-brand-600" /> 2. Searches
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      StillOpen searches by keyword, not by CV — these are the searches each run makes.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={handleSuggest} disabled={busy !== null || !currentCvText}>
                      {busy === 'ai' ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                      {savedSearch ? 'Regenerate with AI' : 'Suggest with AI'}
                    </Button>
                    <Button size="sm" onClick={handleSaveSearch} disabled={busy !== null || !searchDirty || locInvalid.length > 0}>
                      {busy === 'save' && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                      Save searches
                    </Button>
                  </div>
                </div>
                {rationale && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5">{rationale}</p>}
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <Label>Keyword searches (up to 6)</Label>
                    <TagInput
                      tags={draft.queries}
                      onChange={(queries) => setDraft({ ...draft, queries: queries.slice(0, 6) })}
                      placeholder="e.g. senior product manager, press Enter"
                    />
                  </div>
                  <div>
                    <Label>Where you can work from (up to 3)</Label>
                    <p className="text-xs text-slate-500 mb-2 -mt-1">
                      2-letter country codes ("uk", "us", "de") or a region: {STILLOPEN_REGIONS.map((r) => `${r} (${STILLOPEN_REGION_LABEL[r]})`).join(', ')}.
                    </p>
                    <TagInput
                      tags={draft.loc}
                      onChange={(locs) => setDraft({ ...draft, loc: Array.from(new Set(locs.map(normalizeStillOpenLoc))).slice(0, 3) })}
                      placeholder="e.g. uk, worldwide — press Enter"
                    />
                    {locInvalid.length > 0 && <p className="text-xs text-red-600 mt-1">Not a location StillOpen takes: {locInvalid.join(', ')}</p>}
                  </div>
                  <div>
                    <Label>Seniority (optional)</Label>
                    <p className="text-xs text-amber-700 mb-2 -mt-1 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                      Most listings don't state a level, and any level filter hides all of those.
                    </p>
                    <PillToggle options={STILLOPEN_LEVELS} selected={draft.level} onChange={(level) => setDraft({ ...draft, level: level.slice(0, 3) })} />
                  </div>
                  <div>
                    <Label>Functional area (optional, up to 2)</Label>
                    <PillToggle options={STILLOPEN_AREAS} selected={draft.area} onChange={(area) => setDraft({ ...draft, area: area.slice(0, 2) })} />
                  </div>
                  <div>
                    <Label htmlFor="payMin">Minimum annual pay (optional)</Label>
                    <p className="text-xs text-slate-500 mb-2 -mt-1">Compared against the top of the published range in its own currency — nothing is converted, and unpublished pay is excluded.</p>
                    <select
                      id="payMin"
                      value={draft.payMin ?? ''}
                      onChange={(e) => setDraft({ ...draft, payMin: e.target.value ? Number(e.target.value) : null })}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                    >
                      <option value="">Any (include unpublished pay)</option>
                      {STILLOPEN_PAY_STEPS.map((p) => (
                        <option key={p} value={p}>{p.toLocaleString()}+</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              {/* Step 3: schedule */}
              <section className="space-y-2">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-brand-600" /> 3. Schedule
                </h2>
                <p className="text-xs text-slate-500">
                  Scheduled searches only fetch listings — no AI runs and nothing counts against your quota until you scan.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <PillToggle
                    options={DISCOVERY_SCHEDULES}
                    selected={[profile?.schedule || 'off']}
                    onChange={(v) => {
                      const next = v.find((s) => s !== (profile?.schedule || 'off'));
                      if (next) handleSchedule(next);
                    }}
                    label={(s) => SCHEDULE_LABEL[s]}
                  />
                  {busy === 'schedule' && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                </div>
              </section>
            </CardContent>
          </Card>
        )}

        {scanProgress && <ProgressBanner label="Scanning listings…" progress={scanProgress} />}

        <Card className="overflow-hidden">
          <ViewTabs views={VIEWS} labels={DISCOVER_VIEW_LABEL} counts={counts} value={view} onChange={setView} label="Listing views" />

          <ListToolbar>
            <SearchInput value={query} onValueChange={setQuery} placeholder="Search title, company, location…" className="lg:w-72" />
            {selectable.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() =>
                    setSelected(selected.size > 0 ? new Set() : new Set(selectable.slice(0, 10).map(({ job }) => job.id)))
                  }
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  {selected.size > 0 ? 'Clear selection' : 'Select top 10'}
                </button>
                <Button size="sm" onClick={handleScanSelected} disabled={selected.size === 0 || scanProgress !== null}>
                  {scanProgress ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Radar className="w-3.5 h-3.5 mr-1.5" />}
                  Scan selected ({selected.size})
                </Button>
              </div>
            )}
            <SortSelect value={sort} onChange={setSort} labels={DISCOVER_SORT_LABEL} />
          </ListToolbar>

          {paged.pageItems.length === 0 ? (
            <div className="py-14 px-4 text-center">
              <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h4 className="text-base font-bold text-slate-800">
                {listings.length === 0 ? 'No listings yet' : query.trim() ? 'Nothing matches that search' : `Nothing in ${DISCOVER_VIEW_LABEL[view]}`}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                {!savedSearch
                  ? 'Set up your searches above, then run a search.'
                  : listings.length === 0
                    ? 'Run a search to pull in listings.'
                    : query.trim()
                      ? 'Try a different search.'
                      : view === 'review'
                        ? "You're all caught up. New listings land here after each search."
                        : 'Switch views to see the rest of your listings.'}
              </p>
              {query.trim() && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {paged.pageItems.map(({ job, score }) => {
                const match = job.matchId ? matches[job.matchId] : undefined;
                return (
                  <DiscoverRow
                    key={job.id}
                    job={job}
                    score={score}
                    match={match}
                    scanning={scanningIds.has(job.id) || Boolean(match && !match.verdict && !match.scanError && !match.dismissReason)}
                    error={rowErrors[job.id]}
                    isNew={Boolean(lastRunAt && job.firstSeenAt >= lastRunAt && job.userState === 'new')}
                    selected={selected.has(job.id)}
                    expanded={expanded.has(job.id)}
                    onToggleExpand={() => toggleIn(setExpanded, job.id)}
                    actions={rowActions}
                  />
                );
              })}
            </ul>
          )}

          {paged.totalPages > 1 && (
            <Pagination
              page={paged.page}
              totalPages={paged.totalPages}
              start={paged.start}
              end={paged.end}
              total={paged.total}
              noun="listings"
              onPageChange={setPage}
              className="px-4 sm:px-5 py-3 border-t border-slate-100 bg-slate-50/60"
            />
          )}
        </Card>

        <div className="flex justify-end">
          <StillOpenAttribution />
        </div>
      </div>
    </div>
  );
}
