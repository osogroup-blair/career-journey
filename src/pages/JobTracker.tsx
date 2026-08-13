import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { generateId } from '../lib/utils';
import { STAGE_ORDER, STAGE_LABELS, deriveStageFloor } from '../lib/jobPipeline';
import { Button, Card, CardHeader, CardTitle, Badge, CardContent, Input, Textarea } from '../components/ui';
import { JobAnalysis, PipelineStage, ArchiveReason, InterviewRound } from '../types';
import { Briefcase, Plus, MoreVertical, RotateCcw, X, CalendarPlus } from 'lucide-react';

const ARCHIVE_REASONS: ArchiveReason[] = ['Rejected', 'No Response', 'Withdrawn', 'Position Filled', 'Other'];
const ROUND_OUTCOMES: InterviewRound['outcome'][] = ['Scheduled', 'Completed', 'Passed', 'Rejected'];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

interface JobCardProps {
  // This project has no @types/react installed, so JSX doesn't auto-strip `key` from
  // locally-typed component props the way it normally would — list it explicitly.
  key?: string;
  job: JobAnalysis;
  onNavigate: () => void;
  onMove: (stage: PipelineStage) => void;
  onUpdate: (updates: Partial<JobAnalysis>) => void;
  onDelete: () => void;
}

function JobCard({ job, onNavigate, onMove, onUpdate, onDelete }: JobCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const stage = job.pipelineStage || 'Saved';

  const addRound = () => {
    const round: InterviewRound = { id: generateId('RND'), roundName: 'New Round', outcome: 'Scheduled' };
    onUpdate({ interviews: [...(job.interviews || []), round] });
  };

  const updateRound = (id: string, updates: Partial<InterviewRound>) => {
    onUpdate({ interviews: (job.interviews || []).map((r) => (r.id === id ? { ...r, ...updates } : r)) });
  };

  const deleteRound = (id: string) => {
    onUpdate({ interviews: (job.interviews || []).filter((r) => r.id !== id) });
  };

  return (
    <Card
      className={`flex flex-col shadow-xs hover:shadow-md transition-shadow ${stage === 'Archive' ? 'opacity-60 grayscale' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', job.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <CardHeader className="pb-2 border-b border-slate-100 bg-slate-50/60">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 cursor-pointer" onClick={onNavigate}>
            <CardTitle className="text-sm font-bold truncate hover:text-brand-600 transition-colors">{job.roleTitle}</CardTitle>
            <p className="text-xs font-semibold text-slate-500 truncate">{job.companyName}</p>
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded hover:bg-slate-200 text-slate-500"
              aria-label="Move card"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-30">
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Move to</div>
                {STAGE_ORDER.filter((s) => s !== stage).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      onMove(s);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {STAGE_LABELS[s]}
                  </button>
                ))}
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-3 pb-3 space-y-2.5 text-xs text-slate-600">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{job.status}</Badge>
          {job.fitAnalysis && (
            <Badge
              variant={job.fitAnalysis.overallVerdict === 'PASS' ? 'success' : job.fitAnalysis.overallVerdict === 'BORDERLINE' ? 'warning' : 'destructive'}
              className="text-[10px] px-1.5 py-0"
            >
              {job.fitAnalysis.overallVerdict}
            </Badge>
          )}
        </div>

        {stage === 'Applied' && (
          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Applied On</span>
              <Input
                type="date"
                value={job.appliedAt || ''}
                onChange={(e) => onUpdate({ appliedAt: e.target.value })}
                className="h-7 text-xs mt-0.5"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Method</span>
              <Input
                placeholder="Company site, referral..."
                value={job.applicationMethod || ''}
                onChange={(e) => onUpdate({ applicationMethod: e.target.value })}
                className="h-7 text-xs mt-0.5"
              />
            </label>
          </div>
        )}

        {stage === 'Interview' && (
          <div className="space-y-2 pt-1 border-t border-slate-100">
            {(job.interviews || []).map((round) => (
              <div key={round.id} className="p-2 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1">
                <div className="flex items-center gap-1">
                  <Input
                    value={round.roundName}
                    onChange={(e) => updateRound(round.id, { roundName: e.target.value })}
                    className="h-6 text-[11px] font-semibold flex-1"
                  />
                  <button onClick={() => deleteRound(round.id)} className="text-slate-400 hover:text-red-600 shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="date"
                    value={round.scheduledAt || ''}
                    onChange={(e) => updateRound(round.id, { scheduledAt: e.target.value })}
                    className="h-6 text-[10px] flex-1"
                  />
                  <select
                    value={round.outcome}
                    onChange={(e) => updateRound(round.id, { outcome: e.target.value as InterviewRound['outcome'] })}
                    className="h-6 text-[10px] rounded-md border border-slate-200 bg-white px-1"
                  >
                    {ROUND_OUTCOMES.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <Textarea
                  placeholder="Notes..."
                  value={round.notes || ''}
                  onChange={(e) => updateRound(round.id, { notes: e.target.value })}
                  className="text-[10px] min-h-[40px]"
                />
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addRound} className="w-full h-7 text-[10px] bg-white">
              <CalendarPlus className="w-3 h-3 mr-1" /> Add Round
            </Button>
          </div>
        )}

        {stage === 'Archive' && (
          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <select
              value={job.archiveReason || 'Rejected'}
              onChange={(e) => onUpdate({ archiveReason: e.target.value as ArchiveReason })}
              className="h-7 text-xs w-full rounded-md border border-slate-200 bg-white px-2"
            >
              {ARCHIVE_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <Textarea
              placeholder="Notes..."
              value={job.archiveNotes || ''}
              onChange={(e) => onUpdate({ archiveNotes: e.target.value })}
              className="text-[10px] min-h-[40px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMove(deriveStageFloor(job))}
              className="w-full h-7 text-[10px] bg-white"
            >
              <RotateCcw className="w-3 h-3 mr-1" /> Restore
            </Button>
          </div>
        )}
      </CardContent>

      <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 mt-auto flex justify-between items-center text-[10px] text-slate-400 rounded-b-xl">
        <span>Updated {new Date(job.updatedAt).toLocaleDateString()}</span>
      </div>
    </Card>
  );
}

export default function JobTracker() {
  const { jobs, addJob, updateJob, deleteJob } = useStore();
  const navigate = useNavigate();
  const [dragOverStage, setDragOverStage] = useState<PipelineStage | null>(null);

  const jobList = useMemo(() => Object.values(jobs || {}), [jobs]);

  const columns = useMemo(() => {
    const grouped: Record<PipelineStage, JobAnalysis[]> = {
      Saved: [], Rated: [], 'Resume Created': [], Applied: [], Interview: [], Archive: [],
    };
    jobList.forEach((job) => {
      const stage = job.pipelineStage || 'Saved';
      grouped[stage].push(job);
    });
    return grouped;
  }, [jobList]);

  const createNewJob = () => {
    const newJob = {
      id: generateId('JOB'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'Draft' as const,
      pipelineStage: 'Saved' as const,
      companyName: 'Target Company',
      roleTitle: 'Target Role',
      jdText: ''
    };
    addJob(newJob);
    navigate(`/job/${newJob.id}/intake`);
  };

  const moveJob = (jobId: string, stage: PipelineStage) => {
    const job = jobs[jobId];
    if (!job) return;
    const updates: Partial<JobAnalysis> = { pipelineStage: stage };
    if (stage === 'Applied' && !job.appliedAt) updates.appliedAt = todayISO();
    if (stage === 'Archive' && !job.archivedAt) {
      updates.archivedAt = todayISO();
      if (!job.archiveReason) updates.archiveReason = 'Rejected';
    }
    updateJob(jobId, updates);
  };

  return (
    <div className="min-h-screen bg-slate-900/5 font-sans text-slate-900 pb-20">
      <section className="bg-gradient-to-br from-brand-950 via-slate-900 to-slate-950 text-white pt-10 pb-16 px-4 sm:px-6 lg:px-8 border-b border-brand-950">
        <div className="mx-auto max-w-[1600px] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Job Tracker</h1>
            <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-2xl">
              Track every job from first save through interview or archive.
            </p>
          </div>
          <Button onClick={createNewJob} className="bg-brand-600 hover:bg-brand-500 text-white shrink-0">
            <Plus className="w-4 h-4 mr-1" /> New Job Analysis
          </Button>
        </div>
      </section>

      <main className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        {jobList.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200 text-center">
            <Briefcase className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <h4 className="text-base font-bold text-slate-800">No active job tailoring projects</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Analyze target job postings against your Career Journey to generate tailored ATS-ready resumes.
            </p>
            <Button onClick={createNewJob} className="mt-4 bg-brand-600 text-white" size="sm">
              <Plus className="w-3.5 h-3.5 mr-1" /> Start First Job Analysis
            </Button>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGE_ORDER.map((stage) => (
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
                className={`w-72 shrink-0 rounded-2xl border bg-white flex flex-col max-h-[calc(100vh-11rem)] transition-colors ${
                  dragOverStage === stage ? 'border-brand-400 bg-brand-50/40' : 'border-slate-200'
                }`}
              >
                <div className="px-3.5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">{STAGE_LABELS[stage]}</h3>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {columns[stage].length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                  {columns[stage].map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onNavigate={() => navigate(`/job/${job.id}/intake`)}
                      onMove={(s) => moveJob(job.id, s)}
                      onUpdate={(updates) => updateJob(job.id, updates)}
                      onDelete={() => deleteJob(job.id)}
                    />
                  ))}
                  {columns[stage].length === 0 && (
                    <div className="py-6 text-center text-[11px] text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                      Drop a card here
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
