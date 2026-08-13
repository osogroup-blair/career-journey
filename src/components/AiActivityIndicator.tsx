import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { STAGE_PATHS } from '../lib/jobPipeline';
import { Loader2, AlertCircle, X } from 'lucide-react';

/**
 * Platform-wide "AI is working" surface — a persistent, non-blocking corner
 * panel (not a dialog) so the user can keep navigating while background tasks
 * run. Mirrors the ToastProvider pattern in components/ui.tsx but stays
 * visible for the duration of the task rather than auto-dismissing.
 */
export default function AiActivityIndicator() {
  const activeAiTasks = useStore((s) => s.activeAiTasks);
  const jobs = useStore((s) => s.jobs);
  const dismissTask = useStore((s) => s.dismissAiTask);
  const navigate = useNavigate();

  const tasks = Object.values(activeAiTasks);
  if (tasks.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {tasks.map((task) => {
        const job = jobs[task.jobId];
        const isError = task.status === 'error';
        return (
          <div
            key={task.id}
            onClick={() => job && navigate(`/job/${job.id}/${STAGE_PATHS[job.stage]}`)}
            className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg cursor-pointer ${
              isError ? 'bg-red-50 border-red-200 text-red-800' : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            {isError ? (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            ) : (
              <Loader2 className="h-4 w-4 shrink-0 mt-0.5 animate-spin text-brand-600" />
            )}
            <span className="flex-1 leading-snug">
              <span className="font-bold">{job ? `${job.companyName} — ` : ''}</span>
              {isError ? `${task.label} failed: ${task.error}` : `${task.label}…`}
            </span>
            {isError && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissTask(task.id);
                }}
                className="shrink-0 opacity-60 hover:opacity-100"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
