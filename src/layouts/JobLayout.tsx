import { Outlet, NavLink, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { Button } from '../components/ui';
import { cn } from '../lib/utils';

export default function JobLayout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const job = useStore((state) => state.jobs[id || '']);

  if (!job) {
    return <div className="p-8 font-sans text-slate-900">Job not found.</div>;
  }

  const steps = [
    { name: 'Job Intake', path: `/job/${id}/intake` },
    { name: 'JD Parse Review', path: `/job/${id}/parse` },
    { name: 'Keyword Breakdown', path: `/job/${id}/keywords` },
    { name: 'Context Capture', path: `/job/${id}/context` },
    { name: 'CJ Patch Staging', path: `/job/${id}/patch` },
    { name: 'Fit & ATS Audit', path: `/job/${id}/fit` },
    { name: 'Resume Strategy', path: `/job/${id}/strategy` },
    { name: 'Export & Build', path: `/job/${id}/export` },
  ];

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 flex-shrink-0 print:hidden">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-white font-bold text-xl tracking-tight cursor-pointer" onClick={() => navigate('/')}>
            TailorFlow <span className="text-brand-500 underline decoration-2 underline-offset-4">MVP</span>
          </h1>
          <p className="text-xs mt-1 text-slate-500 uppercase tracking-widest font-semibold">Workflow Engine v1.2</p>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {steps.map((step, index) => {
            const stepNum = index + 1;
            return (
              <NavLink
                key={step.path}
                to={step.path}
                className={({ isActive }) =>
                  `flex items-center space-x-3 p-3 transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white rounded-lg'
                      : 'text-slate-400 opacity-60 hover:opacity-100 hover:text-slate-300'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                        isActive ? 'bg-brand-600 font-bold' : 'border border-slate-700'
                      }`}
                    >
                      {stepNum}
                    </span>
                    <span className="text-sm font-medium">{step.name}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => navigate(`/job/${id}/export`)}
            className="w-full flex items-center justify-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded transition-colors"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            <span className="text-xs font-semibold">Export Full Analysis</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden print:block print:h-auto print:overflow-visible">
        {/* Header Context */}
        <header className="h-20 flex-shrink-0 bg-white border-b border-slate-200 px-8 flex items-center justify-between shadow-sm z-10 print:hidden">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Project: {job.id.substring(4, 8)}</span>
              <span className="text-slate-300">/</span>
              <h2 className="text-lg font-bold text-slate-800 truncate max-w-sm">{job.roleTitle}</h2>
            </div>
            <p className="text-sm text-slate-500 truncate max-w-md">
              {job.companyName} &bull; {job.compensationRange || 'Salary tracking pending'} &bull; {job.locationNotes || 'Location tracking pending'}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex -space-x-2">
              {job.fitAnalysis && (
                <div className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold ${
                  job.fitAnalysis.overallVerdict === 'PASS' ? 'bg-green-500' : job.fitAnalysis.overallVerdict === 'BORDERLINE' ? 'bg-amber-500' : 'bg-red-500'
                }`} title={`Fit: ${job.fitAnalysis.overallVerdict}`}>
                  FIT
                </div>
              )}
              {job.hardGateAudit && (
                <div className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold ${
                  job.hardGateAudit.overallVerdict === 'CLEAR TO APPLY' ? 'bg-brand-500' : job.hardGateAudit.overallVerdict === 'VERIFY FIRST' ? 'bg-amber-500' : 'bg-red-500'
                }`} title={`Gates: ${job.hardGateAudit.overallVerdict}`}>
                  ATS
                </div>
              )}
            </div>
            {(job.status === 'Fit Scored' || job.status === 'Resume Strategy Ready' || job.status === 'Resume Build Ready') && (
              <Button onClick={() => navigate(`/job/${id}/strategy`)}>Generate Resume Strategy</Button>
            )}
          </div>
        </header>

        {/* Dynamic Content Area */}
        {(() => {
          const location = useLocation();
          const isPreview = location.pathname.endsWith('/preview');
          return (
            <div className={cn(
              "flex-1 relative print:p-0 print:block print:overflow-visible",
              isPreview ? "p-0 overflow-hidden" : "p-8 overflow-y-auto"
            )}>
              <Outlet />
            </div>
          );
        })()}
        
        {/* Workflow Progress Bar */}
        <footer className="h-1 bg-slate-200 w-full flex-shrink-0 print:hidden">
          <div 
            className="bg-brand-500 h-full transition-all duration-500" 
            style={{ width: `${(steps.findIndex(s => location.pathname.includes(s.path.split('/').pop()!)) + 1) / steps.length * 100}%` }}
          ></div>
        </footer>
      </main>
    </div>
  );
}
