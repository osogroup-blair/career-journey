import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Label, Textarea, Badge } from '../components/ui';
import { ArchiveReason } from '../types';
import { CheckCircle2, ArrowRight, XCircle, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react';
import { getListingStatus } from '../lib/discoveryClient';
import { StillOpenAttribution } from '../components/StillOpenAttribution';

const REJECT_REASONS: ArchiveReason[] = ['Rejected', 'No Response', 'Withdrawn'];

// A StillOpen listing's status is re-checked on visit, but not more often than this.
const STATUS_CACHE_MS = 6 * 60 * 60 * 1000;

const CLOSURE_WORDING: Record<string, string> = {
  observed: 'the employer took the posting down',
  inferred: 'it aged out without confirmation, so it has most likely closed',
  employer: 'the employer marked it closed',
  merged: 'it was merged into another listing',
};

export default function ApplyStage() {
  const { id } = useParams();
  const job = useStore((s) => s.jobs[id || '']);
  const updateJob = useStore((s) => s.updateJob);
  const archiveJob = useStore((s) => s.archiveJob);
  const navigate = useNavigate();

  const [method, setMethod] = useState(job?.applicationMethod || '');
  const [showFeedback, setShowFeedback] = useState<ArchiveReason | null>(null);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [statusCheck, setStatusCheck] = useState<'idle' | 'checking' | 'failed'>('idle');

  useEffect(() => {
    if (job) setMethod(job.applicationMethod || '');
  }, [job?.id]);

  // Jobs promoted from Discover: ask StillOpen whether the listing is still open before you apply.
  const listingId = job?.source?.kind === 'stillopen' ? job.source.listingId : null;
  useEffect(() => {
    if (!job || !listingId || job.archivedAt) return;
    const checkedAt = job.source?.statusCheckedAt ? new Date(job.source.statusCheckedAt).getTime() : 0;
    if (Date.now() - checkedAt < STATUS_CACHE_MS) return;
    let cancelled = false;
    setStatusCheck('checking');
    getListingStatus(listingId)
      .then((r) => {
        if (cancelled) return;
        const latest = useStore.getState().jobs[job.id];
        if (latest?.source) {
          updateJob(job.id, { source: { ...latest.source, status: r.status, statusCheckedAt: r.checkedAt, closedAt: r.closedAt, closure: r.closure } });
        }
        setStatusCheck('idle');
      })
      .catch(() => {
        if (!cancelled) setStatusCheck('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [job?.id, listingId]);

  if (!job) return null;

  const isApplied = !!job.appliedAt;

  const markApplied = () => {
    updateJob(job.id, { appliedAt: new Date().toISOString(), applicationMethod: method });
  };

  const moveToInterview = () => {
    updateJob(job.id, { stage: 'Interview' });
    navigate(`/job/${job.id}/interview`);
  };

  const archiveAsFilled = () => {
    const when = job.source?.closedAt ? ` on ${new Date(job.source.closedAt).toLocaleDateString()}` : '';
    archiveJob(job.id, 'Position Filled', `StillOpen reported the listing closed${when}.`);
  };

  const source = job.source?.kind === 'stillopen' ? job.source : null;
  const listingClosed = source?.status === 'closed' || source?.status === 'unknown';

  const confirmOutcome = () => {
    if (!showFeedback) return;
    archiveJob(job.id, showFeedback, feedbackNotes);
    setShowFeedback(null);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Apply</h2>
        <p className="text-sm text-slate-500">{job.companyName} — {job.roleTitle}</p>
      </div>

      {source && listingClosed && !job.archivedAt && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2 text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {source.status === 'closed'
                ? `StillOpen reports this posting closed${source.closedAt ? ` on ${new Date(source.closedAt).toLocaleDateString()}` : ''} — ${CLOSURE_WORDING[source.closure || ''] || 'it is no longer listed'}.`
                : "StillOpen no longer has this listing, so it has most likely closed."}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={archiveAsFilled} className="shrink-0 bg-white">
            Archive as Position Filled
          </Button>
        </div>
      )}
      {source?.status === 'unconfirmed' && (
        <div className="flex items-start gap-2 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          StillOpen couldn't confirm this posting is still open on its latest check — it may have closed.
        </div>
      )}

      {(job.jobLink || source) && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {job.jobLink && (
              <a href={job.jobLink} target="_blank" rel="noreferrer" className="inline-block">
                <Button>
                  <ExternalLink className="w-4 h-4 mr-2" /> Open application
                </Button>
              </a>
            )}
            {source && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  Found via StillOpen
                  {source.listingUrl && (
                    <a href={source.listingUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:text-brand-800 underline">
                      view listing
                    </a>
                  )}
                  {statusCheck === 'checking' && (
                    <span className="flex items-center gap-1 text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> checking it's still open…</span>
                  )}
                  {statusCheck === 'idle' && source.status === 'open' && source.statusCheckedAt && (
                    <span className="text-emerald-700">· still open as of {new Date(source.statusCheckedAt).toLocaleString()}</span>
                  )}
                  {statusCheck === 'failed' && <span className="text-slate-400">· couldn't check whether it's still open</span>}
                </span>
                <StillOpenAttribution />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="bg-slate-50 border-b">
          <CardTitle className="text-base">Application Status</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {!isApplied ? (
            <>
              <div>
                <Label>How are you applying?</Label>
                <Input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Company site, referral, LinkedIn Easy Apply..." />
              </div>
              <Button onClick={markApplied}>
                <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Applied
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Applied {new Date(job.appliedAt!).toLocaleDateString()}
                {job.applicationMethod && <Badge variant="outline">{job.applicationMethod}</Badge>}
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={moveToInterview}>
                  Move to Interview <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
                <Button variant="outline" onClick={() => setShowFeedback('Rejected')}>
                  <XCircle className="w-4 h-4 mr-2" /> Rejected
                </Button>
                <Button variant="outline" onClick={() => setShowFeedback('Withdrawn')}>Withdraw</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {showFeedback && (
        <Card className="border-amber-200">
          <CardHeader className="bg-amber-50 border-b border-amber-100">
            <CardTitle className="text-base">What happened?</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label>Reason</Label>
              <select
                value={showFeedback}
                onChange={(e) => setShowFeedback(e.target.value as ArchiveReason)}
                className="w-full text-sm border border-slate-200 rounded-md h-10 px-3 bg-white"
              >
                {REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <Label>Feedback (optional — anything they said, or what you learned)</Label>
              <Textarea value={feedbackNotes} onChange={(e) => setFeedbackNotes(e.target.value)} placeholder="e.g. 'Went with an internal candidate' or 'No response after 3 weeks'" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowFeedback(null)}>Cancel</Button>
              <Button onClick={confirmOutcome}>Confirm & Archive</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
