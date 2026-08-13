import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Label, Textarea, Badge } from '../components/ui';
import { ArchiveReason } from '../types';
import { CheckCircle2, ArrowRight, XCircle } from 'lucide-react';

const REJECT_REASONS: ArchiveReason[] = ['Rejected', 'No Response', 'Withdrawn'];

export default function ApplyStage() {
  const { id } = useParams();
  const job = useStore((s) => s.jobs[id || '']);
  const updateJob = useStore((s) => s.updateJob);
  const archiveJob = useStore((s) => s.archiveJob);
  const navigate = useNavigate();

  const [method, setMethod] = useState(job?.applicationMethod || '');
  const [showFeedback, setShowFeedback] = useState<ArchiveReason | null>(null);
  const [feedbackNotes, setFeedbackNotes] = useState('');

  useEffect(() => {
    if (job) setMethod(job.applicationMethod || '');
  }, [job?.id]);

  if (!job) return null;

  const isApplied = !!job.appliedAt;

  const markApplied = () => {
    updateJob(job.id, { appliedAt: new Date().toISOString(), applicationMethod: method });
  };

  const moveToInterview = () => {
    updateJob(job.id, { stage: 'Interview' });
    navigate(`/job/${job.id}/interview`);
  };

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
