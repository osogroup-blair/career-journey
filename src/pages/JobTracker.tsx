import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { generateId } from '../lib/utils';
import { KANBAN_STAGES, STAGE_LABELS, STAGE_PATHS, getAvailableTransitions } from '../lib/jobPipeline';
import { stalledDays } from '../lib/dashboardSummary';
import {
  TRACKER_VIEW_LABEL, TRACKER_SORT_LABEL, jobMatchesQuery, matchScoresByJob, sortJobs,
  type TrackerView, type TrackerSort, type StageFilter
} from '../lib/trackerList';
import { Button, Card, SearchInput } from '../components/ui';
import { PageHeader, ViewTabs, ListToolbar, SortSelect, FilterChips } from '../components/ListPage';
import { JobBoardCard, TrackerRow, ArchivedRow, type JobItemActions } from '../components/tracker/TrackerItems';
import { JobAnalysis, JobStage } from '../types';
import { Briefcase, Plus, Inbox, Scale } from 'lucide-react';

const VIEWS: TrackerView[] = ['board', 'list', 'archived'];
const STAGE_FILTERS: StageFilter[] = ['any', ...KANBAN_STAGES];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function JobTracker() {
  const { jobs, matches, addJob, updateJob, deleteJob, archiveJob } = useStore();
  const navigate = useNavigate();
  const [dragOverStage, setDragOverStage] = useState<JobStage | null>(null);
  const [view, setView] = useState<TrackerView>('board');
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('any');
  const [sort, setSort] = useState<TrackerSort>('updated');

  const jobList: JobAnalysis[] = useMemo(() => Object.values(jobs || {}), [jobs]);
  const scores: Record<string, number> = useMemo(() => matchScoresByJob(matches), [matches]);

  const active = jobList.filter((j) => j.stage !== 'Archive');
  const archived = jobList.filter((j) => j.stage === 'Archive');
  const searchedActive = active.filter((j) => jobMatchesQuery(j, query));

  const columns = Object.fromEntries(KANBAN_STAGES.map((s) => [s, [] as JobAnalysis[]])) as Record<JobStage, JobAnalysis[]>;
  for (const job of sortJobs(searchedActive, 'updated')) columns[job.stage]?.push(job);

  const stageCounts = Object.fromEntries(STAGE_FILTERS.map((s) => [s, s === 'any' ? searchedActive.length : columns[s as JobStage]?.length || 0])) as Record<StageFilter, number>;
  const listJobs = sortJobs(stageFilter === 'any' ? searchedActive : searchedActive.filter((j) => j.stage === stageFilter), sort, scores);
  const archivedJobs = archived
    .filter((j) => jobMatchesQuery(j, query))
    .sort((a, b) => (b.archivedAt || b.updatedAt).localeCompare(a.archivedAt || a.updatedAt));

  const now = Date.now();
  const interviewing = active.filter((j) => j.stage === 'Interview').length;
  const stalledCount = active.filter((j) => stalledDays(j, now) != null).length;
  const offerCount = active.filter((j) => j.stage === 'Offer').length;

  const createNewJob = () => {
    const newJob: JobAnalysis = {
      id: generateId('JOB'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stage: 'Intake',
      companyName: 'Target Company',
      roleTitle: 'Target Role',
      jdText: ''
    };
    addJob(newJob);
    navigate(`/job/${newJob.id}/intake`);
  };

  const moveJob = (jobId: string, stage: JobStage) => {
    const job = jobs[jobId];
    if (!job) return;
    if (!getAvailableTransitions(job).includes(stage)) return;
    if (stage === 'Archive') {
      archiveJob(jobId, job.archiveReason || 'Rejected', job.archiveNotes);
      return;
    }
    const updates: Partial<JobAnalysis> = { stage };
    if (stage === 'Apply' && !job.appliedAt) updates.appliedAt = todayISO();
    updateJob(jobId, updates);
  };

  const actions: JobItemActions = {
    onOpen: (job) => navigate(`/job/${job.id}/${STAGE_PATHS[job.stage]}`),
    onMove: (job, stage) => moveJob(job.id, stage),
    onUpdate: (job, updates) => updateJob(job.id, updates),
    onDelete: (job) => deleteJob(job.id),
    // Restoring isn't a forward pipeline transition, so it bypasses getAvailableTransitions on purpose.
    onRestore: (job) => updateJob(job.id, { stage: job.archivedFromStage || 'Intake', archivedAt: undefined }),
  };

  const emptyState = (title: string, body: string, cta?: boolean) => (
    <div className="py-14 px-4 text-center">
      <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <h4 className="text-base font-bold text-slate-800">{title}</h4>
      <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">{body}</p>
      {cta && (
        <Button onClick={createNewJob} className="mt-4" size="sm">
          <Plus className="w-3.5 h-3.5 mr-1" /> Start your first job
        </Button>
      )}
      {query.trim() && (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setQuery('')}>
          Clear search
        </Button>
      )}
    </div>
  );

  const noActive = active.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      <div className={`mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-5 ${view === 'board' ? 'max-w-[1600px]' : 'max-w-5xl'}`}>
        <PageHeader
          icon={Briefcase}
          title="Job Tracker"
          subtitle="Every job you're pursuing, from first save through interview and offer."
          meta={active.length > 0 && (
            <>
              <span>{active.length} active</span>
              {interviewing > 0 && <span>{interviewing} interviewing</span>}
              {stalledCount > 0 && <span className="text-amber-700">{stalledCount} stalled</span>}
            </>
          )}
          actions={<>
            {offerCount >= 2 && (
              <Button variant="outline" size="sm" onClick={() => navigate('/compare-offers')} className="bg-white">
                <Scale className="w-3.5 h-3.5 mr-1.5" /> Compare {offerCount} offers
              </Button>
            )}
            <Button size="sm" onClick={createNewJob}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> New job
            </Button>
          </>}
        />

        <Card className="overflow-hidden">
          <ViewTabs
            views={VIEWS}
            labels={TRACKER_VIEW_LABEL}
            counts={{ archived: archived.length }}
            value={view}
            onChange={setView}
            label="Tracker views"
          />
          <ListToolbar>
            <SearchInput value={query} onValueChange={setQuery} placeholder="Search title, company, location…" className="lg:w-72" />
            {view === 'list' && (
              <>
                <FilterChips
                  options={STAGE_FILTERS}
                  value={stageFilter}
                  onChange={setStageFilter}
                  label={(s) => (s === 'any' ? 'All stages' : STAGE_LABELS[s])}
                  counts={stageCounts}
                />
                <SortSelect value={sort} onChange={setSort} labels={TRACKER_SORT_LABEL} />
              </>
            )}
          </ListToolbar>

          {view === 'archived' ? (
            archivedJobs.length === 0 ? (
              emptyState(archived.length === 0 ? 'Nothing archived yet' : 'Nothing matches that search', archived.length === 0 ? 'Jobs you archive land here with where they fell off and why.' : 'Try a different search.')
            ) : (
              <ul className="divide-y divide-slate-100">
                {archivedJobs.map((job) => (
                  <ArchivedRow key={job.id} job={job} actions={actions} />
                ))}
              </ul>
            )
          ) : noActive ? (
            emptyState('No jobs in progress', 'Add a job from Matches or Discover, or start one from a job description, to tailor a resume and track it here.', true)
          ) : view === 'list' ? (
            listJobs.length === 0 ? (
              emptyState('Nothing matches those filters', 'Try a different search or stage.')
            ) : (
              <ul className="divide-y divide-slate-100">
                {listJobs.map((job) => (
                  <TrackerRow key={job.id} job={job} score={scores[job.id]} actions={actions} />
                ))}
              </ul>
            )
          ) : (
            <div className="flex gap-3 overflow-x-auto p-4 bg-slate-50/40">
              {KANBAN_STAGES.map((stage) => (
                <div
                  key={stage}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverStage(stage);
                  }}
                  onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const jobId = e.dataTransfer.getData('text/plain');
                    if (jobId) moveJob(jobId, stage);
                    setDragOverStage(null);
                  }}
                  className={`w-72 shrink-0 rounded-xl border flex flex-col max-h-[calc(100vh-17rem)] min-h-[200px] transition-colors ${
                    dragOverStage === stage ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 bg-slate-100/60'
                  }`}
                >
                  <div className="px-3.5 py-3 flex items-center justify-between shrink-0">
                    <h3 className="text-sm font-bold text-slate-700">{STAGE_LABELS[stage]}</h3>
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-white text-slate-500 ring-1 ring-inset ring-slate-200">
                      {columns[stage].length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto px-2.5 pb-2.5 space-y-2.5">
                    {columns[stage].map((job) => (
                      <JobBoardCard key={job.id} job={job} score={scores[job.id]} actions={actions} />
                    ))}
                    {columns[stage].length === 0 && (
                      <div className="py-6 text-center text-[11px] text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                        {query.trim() ? 'No matches' : 'Drop a job here'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
