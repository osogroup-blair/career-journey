import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams } from 'react-router-dom';
import { Button, LoadingButton, Card, CardContent, Input, Label, Textarea, Badge, useToast } from '../components/ui';
import { ClassicTemplate, ModernTemplate, ExecutiveTemplate } from '../components/ResumeTemplates';
import { ApplicationFormField } from '../types';
import { generateId, formatContactLine, nameSlug } from '../lib/utils';
import { Download, CheckCircle2, Plus, Trash2, Send, Sparkles } from 'lucide-react';

type Tab = 'resume' | 'cover-letter' | 'assistant' | 'form';
type TemplateType = 'classic' | 'modern' | 'executive';

export default function TailoredApplicationStage() {
  const { id } = useParams();
  const job = useStore((s) => s.jobs[id || '']);
  const updateJob = useStore((s) => s.updateJob);
  const runGenerateTailoredApplication = useStore((s) => s.runGenerateTailoredApplication);
  const activeAiTasks = useStore((s) => s.activeAiTasks);

  const [tab, setTab] = useState<Tab>('resume');

  const isBusy = (kind: string) => Object.values(activeAiTasks).some((t) => t.jobId === id && t.kind === kind);

  if (!job) return null;

  if (!job.resume && !isBusy('generateTailoredApplication')) {
    return (
      <Card className="max-w-2xl mx-auto py-16 text-center">
        <p className="text-slate-500 mb-4">No tailored resume yet.</p>
        <LoadingButton onClick={() => runGenerateTailoredApplication(job.id)} isLoading={isBusy('generateTailoredApplication')} loadingLabel="Building...">
          Build Tailored Application
        </LoadingButton>
      </Card>
    );
  }

  if (!job.resume) {
    return (
      <Card className="max-w-2xl mx-auto py-16 text-center">
        <Sparkles className="w-8 h-8 text-brand-500 animate-pulse mx-auto mb-3" />
        <p className="text-slate-600 font-medium">Building your tailored resume…</p>
      </Card>
    );
  }

  const tabDef: { key: Tab; label: string }[] = [
    { key: 'resume', label: 'Resume' },
    { key: 'cover-letter', label: 'Cover Letter' },
    { key: 'assistant', label: 'Application Assistant' },
    { key: 'form', label: 'Application Form' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Tailored Application</h2>
        <p className="text-sm text-slate-500">{job.companyName} — {job.roleTitle}. Make minor adjustments, draft the cover letter, and prep your application.</p>
      </div>

      <div className="flex border-b border-slate-200">
        {tabDef.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2.5 px-4 text-sm font-bold border-b-2 transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resume' && <ResumeTab job={job} updateJob={updateJob} isRegenerating={isBusy('generateTailoredApplication')} onRegenerate={() => runGenerateTailoredApplication(job.id)} />}
      {tab === 'cover-letter' && <CoverLetterTab job={job} updateJob={updateJob} />}
      {tab === 'assistant' && <AssistantTab job={job} />}
      {tab === 'form' && <FormTab job={job} updateJob={updateJob} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ResumeTab({ job, updateJob, isRegenerating, onRegenerate }: any) {
  const careerJourney = useStore((s) => s.careerJourney);
  const [template, setTemplate] = useState<TemplateType>('classic');
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadDocx = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch('/api/export/resume.docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: job.resume, strategy: job.resumeStrategy, companyName: job.companyName, roleTitle: job.roleTitle }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nameSlug(job.resume?.name, 'Resume')}_Resume_${job.companyName.replace(/\s+/g, '')}_${job.roleTitle.replace(/\s+/g, '')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
          {(['classic', 'modern', 'executive'] as TemplateType[]).map((t) => (
            <button
              key={t}
              className={`px-3 py-1 text-xs font-medium rounded-sm capitalize transition-colors ${template === t ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setTemplate(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRegenerate} disabled={isRegenerating}>
            {isRegenerating ? 'Regenerating…' : 'Regenerate'}
          </Button>
          <Button variant="outline" size="sm" onClick={downloadDocx} disabled={isDownloading}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> {isDownloading ? 'Preparing…' : 'Download .docx'}
          </Button>
        </div>
      </div>
      <div className="bg-slate-200 rounded-xl p-8 overflow-auto">
        <div className="bg-white shadow-xl max-w-[8.5in] w-[8.5in] p-[0.5in] mx-auto text-black font-sans leading-relaxed">
          {template === 'classic' && <ClassicTemplate resume={job.resume} tagline={job.resumeStrategy?.headerTagline || job.roleTitle} onUpdate={(r: any) => updateJob(job.id, { resume: r })} careerJourney={careerJourney} />}
          {template === 'modern' && <ModernTemplate resume={job.resume} tagline={job.resumeStrategy?.headerTagline || job.roleTitle} onUpdate={(r: any) => updateJob(job.id, { resume: r })} careerJourney={careerJourney} />}
          {template === 'executive' && <ExecutiveTemplate resume={job.resume} tagline={job.resumeStrategy?.headerTagline || job.roleTitle} onUpdate={(r: any) => updateJob(job.id, { resume: r })} careerJourney={careerJourney} />}
        </div>
      </div>
    </div>
  );
}

function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

function CoverLetterTab({ job, updateJob }: any) {
  const careerJourney = useStore((s) => s.careerJourney);
  const runGenerateCoverLetter = useStore((s) => s.runGenerateCoverLetter);
  const isBusy = useStore((s) => Object.values(s.activeAiTasks).some((t) => t.jobId === job.id && t.kind === 'coverLetter'));
  const [content, setContent] = useState(job.coverLetter?.content || '');
  const [isDownloading, setIsDownloading] = useState(false);

  // Local draft mirrors the store so AI-generated/regenerated content actually
  // shows up — a bare useState(job.coverLetter?.content) initializer only runs
  // once and goes stale the moment the background task writes a new draft.
  useEffect(() => {
    setContent(job.coverLetter?.content || '');
  }, [job.coverLetter?.content]);

  const handleBlur = () => {
    updateJob(job.id, { coverLetter: { content, wordCount: countWords(content), approvalStatus: job.coverLetter?.approvalStatus || 'Draft' } });
  };

  const downloadDocx = async () => {
    if (!job.coverLetter) return;
    setIsDownloading(true);
    try {
      const candidateName = careerJourney?.person?.name || '';
      const res = await fetch('/api/export/coverLetter.docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coverLetter: { ...job.coverLetter, content },
          companyName: job.companyName,
          roleTitle: job.roleTitle,
          candidateName,
          candidateContactInfo: formatContactLine(careerJourney?.person),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nameSlug(candidateName, 'CoverLetter')}_CoverLetter_${job.companyName.replace(/\s+/g, '')}_${job.roleTitle.replace(/\s+/g, '')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!job.coverLetter && !isBusy) {
    return (
      <Card className="py-16 text-center">
        <p className="text-slate-500 mb-4">No cover letter drafted yet.</p>
        <LoadingButton onClick={() => runGenerateCoverLetter(job.id)} isLoading={isBusy} loadingLabel="Drafting...">Draft Cover Letter</LoadingButton>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex justify-between items-center">
        {job.coverLetter?.approvalStatus === 'Approved' && (
          <Badge variant="success" className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>
        )}
        <Button variant="outline" size="sm" onClick={() => runGenerateCoverLetter(job.id)} disabled={isBusy} className="ml-auto">
          {isBusy ? 'Drafting…' : 'Regenerate'}
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleBlur}
            className="min-h-[420px] font-serif text-[15px] leading-relaxed"
            placeholder="Cover letter will appear here..."
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>{countWords(content)} words</span>
            <span>Target: 325-400 words, one page</span>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={downloadDocx} disabled={!content || isDownloading}>
          <Download className="w-4 h-4 mr-2" /> Download .docx
        </Button>
        <Button onClick={() => updateJob(job.id, { coverLetter: { content, wordCount: countWords(content), approvalStatus: 'Approved' } })} disabled={!content}>
          {job.coverLetter?.approvalStatus === 'Approved' ? 'Approved' : 'Mark as Approved'}
        </Button>
      </div>
    </div>
  );
}

function AssistantTab({ job }: any) {
  const runApplicationAssistantMessage = useStore((s) => s.runApplicationAssistantMessage);
  const isBusy = useStore((s) => Object.values(s.activeAiTasks).some((t) => t.jobId === job.id && t.kind === 'applicationAssistant'));
  const [message, setMessage] = useState('');
  const transcript = job.applicationAssistantTranscript || [];

  const send = () => {
    if (!message.trim()) return;
    runApplicationAssistantMessage(job.id, message.trim());
    setMessage('');
  };

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-slate-500">Ask anything about applying — screening questions, recruiter messages, how to phrase an answer — grounded in your Career Journey and this job.</p>
      <Card className="min-h-[400px] flex flex-col">
        <CardContent className="flex-1 pt-6 space-y-4 overflow-y-auto max-h-[500px]">
          {transcript.length === 0 && <p className="text-sm text-slate-400 text-center py-12">No messages yet — ask a question below.</p>}
          {transcript.map((m: any, i: number) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {isBusy && <div className="text-xs text-slate-400 animate-pulse">Assistant is thinking…</div>}
        </CardContent>
        <div className="p-4 border-t border-slate-100 flex gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="e.g. Draft an answer for 'Why are you interested in this role?'"
            className="min-h-[44px] text-sm"
          />
          <Button onClick={send} disabled={isBusy || !message.trim()}><Send className="w-4 h-4" /></Button>
        </div>
      </Card>
    </div>
  );
}

function FormTab({ job, updateJob }: any) {
  const runGenerateFormAnswers = useStore((s) => s.runGenerateFormAnswers);
  const isBusy = useStore((s) => Object.values(s.activeAiTasks).some((t) => t.jobId === job.id && t.kind === 'generateFormAnswers'));
  const toast = useToast();
  const fields: ApplicationFormField[] = job.applicationFormFields || [];
  const answers: Record<string, string> = job.applicationFormAnswers || {};

  const addField = () => {
    const field: ApplicationFormField = { id: generateId('FLD'), label: '', fieldType: 'text' };
    updateJob(job.id, { applicationFormFields: [...fields, field] });
  };

  const updateField = (fieldId: string, updates: Partial<ApplicationFormField>) => {
    updateJob(job.id, { applicationFormFields: fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)) });
  };

  const removeField = (fieldId: string) => {
    updateJob(job.id, { applicationFormFields: fields.filter((f) => f.id !== fieldId) });
  };

  const updateAnswer = (fieldId: string, value: string) => {
    updateJob(job.id, { applicationFormAnswers: { ...answers, [fieldId]: value } });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-slate-500">
        Recreate the real application form's fields here, then let AI draft grounded answers you can copy over — nothing here submits anywhere automatically.
      </p>

      <Card>
        <CardContent className="pt-6 space-y-3">
          {fields.map((field) => (
            <div key={field.id} className="flex gap-2 items-start">
              <Input
                value={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
                placeholder="Field label (e.g. Why do you want to work here?)"
                className="flex-1 text-sm"
              />
              <select
                value={field.fieldType}
                onChange={(e) => updateField(field.id, { fieldType: e.target.value as ApplicationFormField['fieldType'] })}
                className="text-xs border border-slate-200 rounded-md px-2 h-10 bg-white"
              >
                <option value="text">Text</option>
                <option value="textarea">Long text</option>
                <option value="select">Select</option>
                <option value="checkbox">Yes/No</option>
              </select>
              <button onClick={() => removeField(field.id)} className="text-slate-400 hover:text-red-600 p-2">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addField}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Field
          </Button>
        </CardContent>
      </Card>

      {fields.length > 0 && (
        <div className="flex justify-end">
          <LoadingButton
            onClick={() => runGenerateFormAnswers(job.id)}
            isLoading={isBusy}
            loadingLabel="Drafting answers..."
            disabled={fields.some((f) => !f.label.trim())}
          >
            Generate Answers
          </LoadingButton>
        </div>
      )}

      {fields.length > 0 && Object.keys(answers).length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {fields.map((field) => (
              <div key={field.id}>
                <Label>{field.label || '(untitled field)'}</Label>
                {field.fieldType === 'textarea' ? (
                  <Textarea
                    value={answers[field.id] || ''}
                    onChange={(e) => updateAnswer(field.id, e.target.value)}
                    className="text-sm"
                  />
                ) : (
                  <Input value={answers[field.id] || ''} onChange={(e) => updateAnswer(field.id, e.target.value)} className="text-sm" />
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(answers[field.id] || ''); toast.success('Copied.'); }}
                  className="text-[10px] text-brand-600 hover:text-brand-800 font-bold mt-1"
                >
                  Copy
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
