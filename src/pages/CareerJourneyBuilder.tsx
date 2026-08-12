import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Button, Card, CardHeader, CardTitle, CardContent, Textarea, Input, Badge } from '../components/ui';
import { buildJourneyFromResume, buildJourneyChat } from '../lib/mock-ai';
import { normalizeCareerJourney } from '../lib/careerJourneyNormalize';
import { buildCareerJourneyTemplate } from '../lib/careerJourneyTemplate';
import { FileText, MessageCircle, Sparkles, Loader2, ChevronLeft, CheckCircle2, AlertTriangle, Send, Download } from 'lucide-react';

type Mode = 'choose' | 'resume' | 'chat';
type ChatMessage = { role: 'user' | 'assistant'; content: string };

const FIRST_QUESTION = "Let's build your Career Journey. Start with your most recent role — what was your title, employer, and roughly what dates did you work there?";

export default function CareerJourneyBuilder() {
  const navigate = useNavigate();
  const careerJourney = useStore((state) => state.careerJourney);
  const setCareerJourney = useStore((state) => state.setCareerJourney);

  const [mode, setMode] = useState<Mode>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Resume mode state
  const [resumeText, setResumeText] = useState('');

  // Chat mode state
  const [transcript, setTranscript] = useState<ChatMessage[]>([{ role: 'assistant', content: FIRST_QUESTION }]);
  const [chatInput, setChatInput] = useState('');
  const [readyForReview, setReadyForReview] = useState(false);

  // Shared draft/review state. `draft` accumulates across chat turns even before the
  // user is shown the review screen — `showReview` is the actual gate on that screen,
  // so a mid-conversation draft never preempts the chat UI.
  const [draft, setDraft] = useState<any>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setResumeText(event.target?.result as string);
    reader.readAsText(file);
  };

  const handleExtractFromResume = async () => {
    if (resumeText.trim().length < 50) {
      setError('Paste more of the resume text — that looks too short to extract reliably.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await buildJourneyFromResume(resumeText);
      setDraft(result.draftCareerJourney);
      setNotes(result.notes || []);
      setShowReview(true);
    } catch (e: any) {
      setError(e.message || 'Failed to extract a draft from that resume text.');
    }
    setLoading(false);
  };

  const handleSendChat = async () => {
    const message = chatInput.trim();
    if (!message) return;
    const nextTranscript = [...transcript, { role: 'user' as const, content: message }];
    setTranscript(nextTranscript);
    setChatInput('');
    setLoading(true);
    setError('');
    try {
      const result = await buildJourneyChat(nextTranscript, draft);
      setDraft(result.updatedDraft);
      setTranscript([...nextTranscript, { role: 'assistant', content: result.assistantMessage }]);
      setReadyForReview(result.readyForReview);
    } catch (e: any) {
      setError(e.message || 'Something went wrong continuing the conversation.');
    }
    setLoading(false);
  };

  const handleApproveDraft = () => {
    if (!draft) return;
    const hasExistingData = careerJourney && (careerJourney.roles?.length || careerJourney.achievements?.length);
    if (hasExistingData) {
      const proceed = window.confirm(
        'This will replace your current Career Journey data with this draft. This cannot be undone. Continue?'
      );
      if (!proceed) return;
    }
    setCareerJourney(normalizeCareerJourney(draft));
    setLoaded(true);
  };

  const handleDiscardDraft = () => {
    setDraft(null);
    setNotes([]);
    setShowReview(false);
    setReadyForReview(false);
    setTranscript([{ role: 'assistant', content: FIRST_QUESTION }]);
  };

  const handleDownloadTemplate = () => {
    const template = buildCareerJourneyTemplate();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(template, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', 'career-journey-template.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (loaded) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Career Journey loaded</h1>
          <p className="text-sm text-slate-500 mt-2">Review and fill in the gaps — most drafts need some polish before they're resume-ready.</p>
        </div>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => navigate('/edit')}>Open Simple Editor</Button>
          <Button onClick={() => navigate('/journey')} className="bg-brand-600 text-white">Open Advanced Editor</Button>
        </div>
      </div>
    );
  }

  // Draft review screen — shown once the user (or the resume path automatically) says it's time, not just because a draft exists.
  if (draft && showReview) {
    const roles = Array.isArray(draft.roles) ? draft.roles : [];
    const achievements = Array.isArray(draft.achievements) ? draft.achievements : [];
    const skills = Array.isArray(draft.skills_index) ? draft.skills_index : [];
    const education = Array.isArray(draft.education) ? draft.education : [];

    return (
      <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Review Your Draft</h1>
          <p className="text-sm text-slate-500 mt-1">Nothing is saved yet — approve to load this into your Career Journey, or discard and try again.</p>
        </div>

        {notes.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/40">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-sm">
                <AlertTriangle className="w-4 h-4" /> Worth double-checking
              </div>
              <ul className="text-xs text-amber-800 list-disc pl-5 space-y-1">
                {notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Roles ({roles.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {roles.length === 0 && <p className="text-sm text-slate-400">No roles extracted.</p>}
            {roles.map((r: any) => (
              <div key={r.id} className="border border-slate-200 rounded-lg p-3">
                <div className="font-bold text-sm text-slate-800">{r.title} — {r.organization}</div>
                <div className="text-xs text-slate-500">{r.start_date || '?'} to {r.end_date || '?'} {r.location ? `• ${r.location}` : ''}</div>
                {r.description && <p className="text-xs text-slate-600 mt-1.5">{r.description}</p>}
                {Array.isArray(r.initiatives) && r.initiatives.length > 0 && (
                  <ul className="text-xs text-slate-500 list-disc pl-5 mt-2 space-y-0.5">
                    {r.initiatives.flatMap((init: any) => (init.deliverables || []).map((d: any, i: number) => (
                      <li key={`${init.id}-${i}`}>{d.description}</li>
                    )))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-black text-brand-600">{achievements.length}</div><div className="text-xs text-slate-500 font-semibold">Achievements</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-black text-brand-600">{skills.length}</div><div className="text-xs text-slate-500 font-semibold">Skills</div></CardContent></Card>
          <Card><CardContent className="pt-4 text-center"><div className="text-2xl font-black text-brand-600">{education.length}</div><div className="text-xs text-slate-500 font-semibold">Education</div></CardContent></Card>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleDiscardDraft}>Discard & Start Over</Button>
          <Button onClick={handleApproveDraft} className="bg-emerald-600 hover:bg-emerald-700 text-white">Load Into My Career Journey</Button>
        </div>
      </div>
    );
  }

  if (mode === 'resume') {
    return (
      <div className="max-w-3xl mx-auto py-10 px-4 space-y-6">
        <button onClick={() => setMode('choose')} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800">
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Build From a Resume</h1>
          <p className="text-sm text-slate-500 mt-1">Paste your resume text, or upload a .txt file. (PDF/Word text extraction isn't wired up yet — copy-paste the text for now.)</p>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex justify-end">
              <label className="cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-800 underline underline-offset-2">
                Upload .txt file
                <input type="file" accept=".txt,.md" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            <Textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your resume text here..."
              className="min-h-[380px] font-mono text-xs"
              disabled={loading}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end">
              <Button onClick={handleExtractFromResume} disabled={loading || resumeText.trim().length === 0} className="min-w-[180px] flex items-center justify-center gap-2 bg-brand-600 text-white">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Extracting...</> : <><Sparkles className="w-4 h-4" /> Extract Draft</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === 'chat') {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
        <button onClick={() => setMode('choose')} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800">
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Build By Talking It Through</h1>
          <p className="text-sm text-slate-500 mt-1">Answer a few questions about your work history — a draft builds up as you go.</p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4 max-h-[420px] overflow-y-auto">
            {transcript.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg px-3 py-2 bg-slate-100 text-slate-400 text-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {readyForReview && draft ? (
          <div className="flex justify-center">
            <Button onClick={() => setShowReview(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> View Draft
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
              placeholder="Type your answer..."
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={handleSendChat} disabled={loading || !chatInput.trim()} className="bg-brand-600 text-white">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-16 px-4 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-extrabold text-slate-900">Build Your Career Journey</h1>
        <p className="text-sm text-slate-500 max-w-lg mx-auto">
          Start from a resume, talk it through conversationally, or begin with a blank template. Nothing is saved until you review and approve it.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <button onClick={() => setMode('resume')} className="text-left">
          <Card className="h-full hover:border-brand-300 hover:shadow-md transition-all cursor-pointer">
            <CardContent className="pt-6 space-y-2">
              <FileText className="w-6 h-6 text-brand-600" />
              <div className="font-bold text-slate-900">From a Resume</div>
              <p className="text-xs text-slate-500">Paste or upload resume text — extracts roles, achievements, and skills automatically.</p>
            </CardContent>
          </Card>
        </button>

        <button onClick={() => { setMode('chat'); }} className="text-left">
          <Card className="h-full hover:border-brand-300 hover:shadow-md transition-all cursor-pointer">
            <CardContent className="pt-6 space-y-2">
              <MessageCircle className="w-6 h-6 text-brand-600" />
              <div className="font-bold text-slate-900">Talk It Through</div>
              <p className="text-xs text-slate-500">No resume handy? Answer a few guided questions about your work history instead.</p>
            </CardContent>
          </Card>
        </button>

        <button onClick={handleDownloadTemplate} className="text-left">
          <Card className="h-full hover:border-brand-300 hover:shadow-md transition-all cursor-pointer">
            <CardContent className="pt-6 space-y-2">
              <Download className="w-6 h-6 text-brand-600" />
              <div className="font-bold text-slate-900">Start Blank</div>
              <p className="text-xs text-slate-500">Download an empty template and fill it in yourself in the Edit or Advanced pages.</p>
            </CardContent>
          </Card>
        </button>
      </div>

      <div className="text-center">
        <Badge variant="outline" className="text-[10px]">Everything here is a draft — you review and approve before anything is saved</Badge>
      </div>
    </div>
  );
}
