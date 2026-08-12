import React, { useMemo } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { generateId } from '../lib/utils';
import { Button, Card, CardHeader, CardTitle, Badge, CardContent } from '../components/ui';
import { Briefcase, Plus } from 'lucide-react';

export default function Applications() {
  const { jobs, addJob, deleteJob } = useStore();
  const navigate = useNavigate();

  const jobList = useMemo(() => Object.values(jobs || {}), [jobs]);

  const createNewJob = () => {
    const newJob = {
      id: generateId('JOB'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'Draft' as const,
      companyName: 'Target Company',
      roleTitle: 'Target Role',
      jdText: ''
    };
    addJob(newJob);
    navigate(`/job/${newJob.id}/intake`);
  };

  return (
    <div className="min-h-screen bg-slate-900/5 font-sans text-slate-900 pb-20">
      <section className="bg-gradient-to-br from-brand-950 via-slate-900 to-slate-950 text-white pt-10 pb-16 px-4 sm:px-6 lg:px-8 border-b border-brand-950">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Tailoring Projects</h1>
          <p className="mt-2 text-sm sm:text-base text-slate-300 max-w-2xl">
            Job fit and resume tailoring projects evaluated against your master Career Journey taxonomy.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Job Fit & Resume Tailoring Projects</h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {jobList.length} project{jobList.length === 1 ? '' : 's'} tracked
              </p>
            </div>
            <Button onClick={createNewJob} className="bg-brand-600 hover:bg-brand-500 text-white">
              <Plus className="w-4 h-4 mr-1" /> New Job Analysis
            </Button>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {jobList.map((job) => (
              <Card
                key={job.id}
                className="flex flex-col hover:border-brand-400 transition-all cursor-pointer group shadow-xs hover:shadow-md"
                onClick={() => navigate(`/job/${job.id}/intake`)}
              >
                <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/60">
                  <div className="flex justify-between items-start">
                    <div className="pr-2">
                      <CardTitle className="text-base font-bold truncate group-hover:text-brand-600 transition-colors">{job.roleTitle}</CardTitle>
                      <p className="text-xs font-semibold text-slate-500 truncate">{job.companyName}</p>
                    </div>
                    <Badge variant={job.status === 'Resume Build Ready' ? 'success' : 'default'} className="truncate shrink-0 max-w-[120px] text-[10px]">
                      {job.status}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 flex-1">
                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Fit Verdict:</span>
                      <span className="font-bold text-slate-900">{job.fitAnalysis?.overallVerdict || 'Pending'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Hard Gates:</span>
                      <span className="font-bold text-slate-900">{job.hardGateAudit?.overallVerdict || 'Pending'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Keyword Coverage:</span>
                      <span className="font-bold text-slate-900">{job.keywordCoverage?.score ? `${job.keywordCoverage.score}%` : 'Pending'}</span>
                    </div>
                  </div>
                </CardContent>

                <div className="p-3.5 bg-slate-50 border-t border-slate-100 mt-auto flex justify-between items-center text-xs text-slate-500 rounded-b-xl group-hover:bg-slate-100/50 transition-colors">
                  <span>Updated {new Date(job.updatedAt).toLocaleDateString()}</span>
                  <span className="flex gap-3">
                    <button className="hover:text-brand-600 font-bold uppercase tracking-wider text-[10px]" onClick={(e) => { e.stopPropagation(); navigate(`/job/${job.id}/export`); }}>Export</button>
                    <button className="hover:text-red-600 font-bold uppercase tracking-wider text-[10px]" onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}>Delete</button>
                  </span>
                </div>
              </Card>
            ))}

            {jobList.length === 0 && (
              <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                <Briefcase className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <h4 className="text-base font-bold text-slate-800">No active job tailoring projects</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Analyze target job postings against your Career Journey to generate tailored ATS-ready resumes.
                </p>
                <Button onClick={createNewJob} className="mt-4 bg-brand-600 text-white" size="sm">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Start First Job Analysis
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
