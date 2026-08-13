import { useState } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, LoadingButton, Card, CardHeader, CardTitle, CardContent, Input, Label, Textarea, Badge } from '../components/ui';
import { InterviewRound } from '../types';
import { generateId } from '../lib/utils';
import { CalendarPlus, Trash2, Sparkles, Send, ArrowRight } from 'lucide-react';

const FORMATS: NonNullable<InterviewRound['format']>[] = ['Phone', 'Video', 'Onsite', 'Take-home'];
const OUTCOMES: InterviewRound['outcome'][] = ['Scheduled', 'Completed', 'Passed', 'Rejected'];

export default function InterviewStage() {
  const { id } = useParams();
  const job = useStore((s) => s.jobs[id || '']);
  const updateJob = useStore((s) => s.updateJob);
  const navigate = useNavigate();
  const [expandedRoundId, setExpandedRoundId] = useState<string | null>(null);

  if (!job) return null;

  const rounds = job.interviews || [];

  const addRound = () => {
    const round: InterviewRound = { id: generateId('RND'), roundName: `Round ${rounds.length + 1}`, outcome: 'Scheduled' };
    updateJob(job.id, { interviews: [...rounds, round] });
    setExpandedRoundId(round.id);
  };

  const updateRound = (roundId: string, updates: Partial<InterviewRound>) => {
    updateJob(job.id, { interviews: rounds.map((r) => (r.id === roundId ? { ...r, ...updates } : r)) });
  };

  const deleteRound = (roundId: string) => {
    updateJob(job.id, { interviews: rounds.filter((r) => r.id !== roundId) });
  };

  const receivedOffer = () => {
    updateJob(job.id, { stage: 'Offer' });
    navigate(`/job/${job.id}/offer`);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Interview</h2>
          <p className="text-sm text-slate-500">{job.companyName} — {job.roleTitle}. Configure each round and prep with AI beforehand.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addRound}><CalendarPlus className="w-4 h-4 mr-1.5" /> Add Round</Button>
          <Button onClick={receivedOffer}>Received Offer <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
        </div>
      </div>

      {rounds.length === 0 && (
        <Card className="py-12 text-center text-slate-400">
          No rounds configured yet. Add one to start prepping.
        </Card>
      )}

      {rounds.map((round) => (
        <RoundCard
          key={round.id}
          job={job}
          round={round}
          expanded={expandedRoundId === round.id}
          onToggle={() => setExpandedRoundId((cur) => (cur === round.id ? null : round.id))}
          onUpdate={(updates) => updateRound(round.id, updates)}
          onDelete={() => deleteRound(round.id)}
        />
      ))}
    </div>
  );
}

function RoundCard({ job, round, expanded, onToggle, onUpdate, onDelete }: any) {
  const runInterviewPrep = useStore((s) => s.runInterviewPrep);
  const runInterviewPrepChatMessage = useStore((s) => s.runInterviewPrepChatMessage);
  const isPrepping = useStore((s) => Object.values(s.activeAiTasks).some((t: any) => t.jobId === job.id && t.kind === 'interviewPrep'));
  const isChatting = useStore((s) => Object.values(s.activeAiTasks).some((t: any) => t.jobId === job.id && t.kind === 'interviewPrepChat'));
  const [chatMessage, setChatMessage] = useState('');

  return (
    <Card>
      <CardHeader className="bg-slate-50 border-b cursor-pointer" onClick={onToggle}>
        <div className="flex justify-between items-center">
          <div className="flex-1 grid grid-cols-3 gap-3" onClick={(e) => e.stopPropagation()}>
            <Input value={round.roundName} onChange={(e) => onUpdate({ roundName: e.target.value })} className="font-bold text-sm" />
            <Input value={round.interviewerName || ''} onChange={(e) => onUpdate({ interviewerName: e.target.value })} placeholder="Interviewer name" className="text-sm" />
            <Input value={round.interviewerTitle || ''} onChange={(e) => onUpdate({ interviewerTitle: e.target.value })} placeholder="Interviewer title" className="text-sm" />
          </div>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="ml-3 text-slate-400 hover:text-red-600">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Format</Label>
              <select value={round.format || ''} onChange={(e) => onUpdate({ format: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md h-10 px-2 bg-white">
                <option value="">—</option>
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <Label>Scheduled</Label>
              <Input type="date" value={round.scheduledAt || ''} onChange={(e) => onUpdate({ scheduledAt: e.target.value })} />
            </div>
            <div>
              <Label>Outcome</Label>
              <select value={round.outcome} onChange={(e) => onUpdate({ outcome: e.target.value })} className="w-full text-sm border border-slate-200 rounded-md h-10 px-2 bg-white">
                {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={round.notes || ''} onChange={(e) => onUpdate({ notes: e.target.value })} className="text-sm" />
          </div>

          {!round.prep ? (
            <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
              <LoadingButton onClick={() => useStore.getState().runInterviewPrep(job.id, round.id)} isLoading={isPrepping} loadingLabel="Generating prep...">
                <Sparkles className="w-4 h-4 mr-1.5" /> Generate Prep
              </LoadingButton>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-brand-50 border border-brand-100 rounded-lg">
                <Label className="text-brand-700">Main outcome for this meeting</Label>
                <p className="text-sm text-slate-800 mt-1">{round.prep.meetingGoal}</p>
              </div>
              <div>
                <Label>Likely Questions</Label>
                <div className="space-y-2 mt-2">
                  {round.prep.likelyQuestions.map((q: any, i: number) => (
                    <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <p className="font-bold text-sm text-slate-800">{q.question}</p>
                      <p className="text-xs text-slate-500 mt-1">{q.why}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label>Talking Points</Label>
                <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1 mt-1">
                  {round.prep.talkingPoints.map((tp: string, i: number) => <li key={i}>{tp}</li>)}
                </ul>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <Label>Rehearse with the prep coach</Label>
                <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                  {(round.prep.rehearsalTranscript || []).map((m: any, i: number) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs whitespace-pre-wrap ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Textarea
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Draft an answer to rehearse..."
                    className="text-xs min-h-[40px]"
                  />
                  <Button
                    size="sm"
                    disabled={isChatting || !chatMessage.trim()}
                    onClick={() => { runInterviewPrepChatMessage(job.id, round.id, chatMessage.trim()); setChatMessage(''); }}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => runInterviewPrep(job.id, round.id)} disabled={isPrepping}>
                {isPrepping ? 'Regenerating…' : 'Regenerate Prep'}
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
