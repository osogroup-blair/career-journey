import { useState, useEffect, useMemo, useRef } from 'react';
import { useStore, resumeSectionTaskKind } from '../store';
import { useParams } from 'react-router-dom';
import FeatureGate from '../components/FeatureGate';
import { Button, LoadingButton, Card, CardContent, Input, Label, Textarea, Badge, useToast } from '../components/ui';
import { ClassicTemplate, ModernTemplate, ExecutiveTemplate } from '../components/ResumeTemplates';
import ResumeBuildSettings from '../components/tailored/ResumeBuildSettings';
import StrategyReview from '../components/tailored/StrategyReview';
import { ResumeEditActions } from '../components/tailored/ResumeEditControls';
import { ApplicationFormField, JobAnalysis, ResumeBuildOptions, ResumeStrategy } from '../types';
import { generateId, formatContactLine, nameSlug, cn } from '../lib/utils';
import { downloadExport } from '../lib/exportClient';
import { scoreResumeKeywords, resumeFingerprint } from '../lib/resumeScore';
import { defaultBuildOptions, resolveExperienceRoleId } from '../lib/resumeBuild';
import { condenseRole } from '../lib/resumeEdits';
import { usePageEstimate, PAGE_CONTENT_HEIGHT_PX } from '../hooks/usePageEstimate';
import ResumeScorePanel from '../components/ResumeScorePanel';
import { Download, CheckCircle2, Plus, Trash2, Send, Sparkles, SlidersHorizontal, AlertTriangle, Loader2 } from 'lucide-react';

type Tab = 'resume' | 'cover-letter' | 'assistant' | 'form';
type TemplateType = 'classic' | 'modern' | 'executive';
type BuildView = 'settings' | 'review';

function TailoredApplicationStageInner() {
  const { id } = useParams();
  const job = useStore((s) => s.jobs[id || '']);
  const updateJob = useStore((s) => s.updateJob);
  const runGenerateTailoredApplication = useStore((s) => s.runGenerateTailoredApplication);
  const runResumeStrategy = useStore((s) => s.runResumeStrategy);
  const runGenerateResume = useStore((s) => s.runGenerateResume);
  const runScoreResume = useStore((s) => s.runScoreResume);
  const activeAiTasks = useStore((s) => s.activeAiTasks);

  const [tab, setTab] = useState<Tab>('resume');
  // Set when the user opens Build Settings / Strategy Review on purpose (e.g. "Regenerate…" on an existing resume);
  // otherwise the view follows the job's data.
  const [buildView, setBuildView] = useState<BuildView | null>(null);

  const isBusy = (kind: string) => Object.values(activeAiTasks).some((t) => t.jobId === id && t.kind === kind && t.status === 'running');

  if (!job) return null;

  const isWriting = isBusy('generateTailoredApplication');
  const isPlanning = isBusy('resumeStrategy');
  const view: BuildView | 'writing' | 'editor' =
    buildView ?? (job.resume ? 'editor' : isWriting ? 'writing' : job.resumeStrategy || isPlanning ? 'review' : 'settings');
  const cancel = job.resume ? () => setBuildView(null) : undefined;

  if (view === 'settings') {
    return (
      <BuildSettingsView
        job={job}
        onCancel={cancel}
        onDraftPlan={(options) => {
          updateJob(job.id, { resumeBuildOptions: options });
          runResumeStrategy(job.id);
          setBuildView('review');
        }}
        onBuildDirect={(options) => {
          updateJob(job.id, { resumeBuildOptions: options });
          runGenerateTailoredApplication(job.id);
          setBuildView(null);
        }}
      />
    );
  }

  if (view === 'review') {
    return (
      <StrategyReviewView
        job={job}
        isPlanning={isPlanning}
        onCancel={cancel}
        onBack={(strategy) => {
          if (strategy) updateJob(job.id, { resumeStrategy: strategy });
          setBuildView('settings');
        }}
        onWrite={(strategy) => {
          updateJob(job.id, { resumeStrategy: strategy });
          runGenerateResume(job.id);
          setBuildView(null);
        }}
      />
    );
  }

  if (view === 'writing' || !job.resume) {
    return (
      <div className="space-y-6 w-full">
        <BuildStepper step={3} />
        <Card className="max-w-2xl mx-auto py-16 text-center">
          <Sparkles className="w-8 h-8 text-brand-500 animate-pulse mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Writing your tailored resume…</p>
        </Card>
      </div>
    );
  }

  const tabDef: { key: Tab; label: string }[] = [
    { key: 'resume', label: 'Resume' },
    { key: 'cover-letter', label: 'Cover Letter' },
    { key: 'assistant', label: 'Application Assistant' },
    { key: 'form', label: 'Application Form' },
  ];

  return (
    <div className="space-y-6 w-full">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Tailored Application</h2>
        <p className="text-sm text-slate-500">{job.companyName} — {job.roleTitle}. Fine-tune the resume, draft the cover letter, and prep your application.</p>
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

      {tab === 'resume' && (
        <ResumeTab
          job={job}
          updateJob={updateJob}
          isRegenerating={isWriting}
          onOpenSettings={() => setBuildView('settings')}
          onRebuild={(remediation: string[]) => runGenerateTailoredApplication(job.id, remediation)}
          isScoring={isBusy('scoreResume')}
          onAiScore={() => runScoreResume(job.id)}
          isBusy={isBusy}
        />
      )}
      {tab === 'cover-letter' && <CoverLetterTab job={job} updateJob={updateJob} />}
      {tab === 'assistant' && <AssistantTab job={job} />}
      {tab === 'form' && <FormTab job={job} updateJob={updateJob} />}
    </div>
  );
}

export default function TailoredApplicationStage() {
  return (
    <FeatureGate feature="tailored_resume">
      <TailoredApplicationStageInner />
    </FeatureGate>
  );
}

// ---------------------------------------------------------------------------

function BuildStepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ['Choose roles & length', 'Review the plan', 'Resume'];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold">
      {steps.map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="w-6 h-px bg-slate-300" />}
            <span className={cn('flex items-center gap-1.5', n === step ? 'text-brand-700' : n < step ? 'text-slate-500' : 'text-slate-400')}>
              <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[11px]', n === step ? 'bg-brand-600 text-white' : n < step ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-400')}>{n}</span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The job's saved options with any roles added to the Career Journey since then filled in from the candidate's defaults. */
function initialBuildOptions(job: JobAnalysis, careerJourney: any): ResumeBuildOptions {
  const defaults = defaultBuildOptions(careerJourney);
  if (!job.resumeBuildOptions) return defaults;
  return { ...job.resumeBuildOptions, roles: { ...defaults.roles, ...job.resumeBuildOptions.roles } };
}

function BuildSettingsView({ job, onCancel, onDraftPlan, onBuildDirect }: {
  job: JobAnalysis;
  onCancel?: () => void;
  onDraftPlan: (options: ResumeBuildOptions) => void;
  onBuildDirect: (options: ResumeBuildOptions) => void;
}) {
  const careerJourney = useStore((s) => s.careerJourney);
  const [draft, setDraft] = useState<ResumeBuildOptions>(() => initialBuildOptions(job, careerJourney));
  const noFullRoles = !Object.keys(draft.roles).some((roleId) => draft.roles[roleId].mode === 'full');

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto">
      <BuildStepper step={1} />
      <div>
        <h2 className="text-xl font-bold text-slate-900">Build your tailored resume</h2>
        <p className="text-sm text-slate-500">{job.companyName} — {job.roleTitle}. Pick the length and which roles to include, then review the AI's plan before it writes anything.</p>
      </div>
      <ResumeBuildSettings job={job} value={draft} onChange={setDraft} />
      {noFullRoles && (
        <p className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> No role is set to Full, so the resume will have no experience bullets.</p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button variant="outline" onClick={() => onBuildDirect(draft)}>Build without review</Button>
        <Button onClick={() => onDraftPlan(draft)}>Draft plan for review</Button>
      </div>
    </div>
  );
}

function StrategyReviewView({ job, isPlanning, onCancel, onBack, onWrite }: {
  job: JobAnalysis;
  isPlanning: boolean;
  onCancel?: () => void;
  onBack: (strategy?: ResumeStrategy) => void;
  onWrite: (strategy: ResumeStrategy) => void;
}) {
  const careerJourney = useStore((s) => s.careerJourney);
  const [draft, setDraft] = useState<ResumeStrategy | undefined>(job.resumeStrategy);
  // A freshly drafted plan replaces whatever was being edited.
  useEffect(() => setDraft(job.resumeStrategy), [job.resumeStrategy]);
  const options = job.resumeBuildOptions ?? defaultBuildOptions(careerJourney);

  return (
    <div className="space-y-6 w-full">
      <BuildStepper step={2} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Review the plan</h2>
          <p className="text-sm text-slate-500">Edit anything here before the resume is written. The resume uses this wording for its tagline, summary, titles and skills.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
          <Button variant="outline" onClick={() => onBack(draft)} disabled={isPlanning}>Back to settings</Button>
          <Button onClick={() => draft && onWrite(draft)} disabled={isPlanning || !draft}>Write resume</Button>
        </div>
      </div>
      {isPlanning || !draft ? (
        <Card className="py-16 text-center">
          <Loader2 className="w-7 h-7 text-brand-500 animate-spin mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Drafting the plan…</p>
        </Card>
      ) : (
        <StrategyReview strategy={draft} options={options} onChange={setDraft} />
      )}
    </div>
  );
}

function PageBreakMarkers({ pages }: { pages: number }) {
  const count = Math.floor(pages);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute left-0 right-0 border-t-2 border-dashed border-rose-300 pointer-events-none"
          style={{ top: 48 + (i + 1) * PAGE_CONTENT_HEIGHT_PX }} // 48px = the page's 0.5in top padding
        >
          <span className="absolute right-2 -top-5 text-[10px] font-sans font-semibold text-rose-400 bg-white px-1">Page {i + 2}</span>
        </div>
      ))}
    </>
  );
}

function PageMeter({ pages, target }: { pages: number | null; target: 1 | 2 }) {
  if (pages === null) return null;
  const over = pages - target;
  const tone = over <= 0 ? 'bg-green-50 text-green-700 border-green-200' : over <= 0.25 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200';
  return (
    <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-md border tabular-nums', tone)} title="Estimated from the on-screen preview. The exported PDF can run slightly longer because sections aren't split across pages.">
      ≈{pages.toFixed(1)} pages · target {target}
    </span>
  );
}

function ResumeTab({ job, updateJob, isRegenerating, onOpenSettings, onRebuild, isScoring, onAiScore, isBusy }: {
  job: JobAnalysis;
  updateJob: (id: string, updates: Partial<JobAnalysis>) => void;
  isRegenerating: boolean;
  onOpenSettings: () => void;
  onRebuild: (remediation: string[]) => void;
  isScoring: boolean;
  onAiScore: () => void;
  isBusy: (kind: string) => boolean;
}) {
  const careerJourney = useStore((s) => s.careerJourney);
  const runRegenerateResumeSection = useStore((s) => s.runRegenerateResumeSection);
  const setResumeRoleMode = useStore((s) => s.setResumeRoleMode);
  const [template, setTemplate] = useState<TemplateType>('classic');
  const toast = useToast();
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null);
  const resume = job.resume!;
  const tagline = job.resumeStrategy?.headerTagline || job.roleTitle;
  const coverage = useMemo(() => scoreResumeKeywords(resume, tagline, job.keywords, job.parse), [resume, tagline, job.keywords, job.parse]);
  const fingerprint = useMemo(() => resumeFingerprint(resume), [resume]);
  const pageTarget = job.resumeBuildOptions?.pageTarget ?? defaultBuildOptions(careerJourney).pageTarget;

  // Shrink the 8.5in page to fit its column (the score panel sits beside it at xl+).
  // CSS zoom, not transform, so layout and inline-edit hit-testing stay correct.
  const previewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [pageZoom, setPageZoom] = useState(1);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const PAGE_WIDTH_PX = 816; // 8.5in at 96dpi
    const observer = new ResizeObserver(([entry]) => setPageZoom(Math.min(1, entry.contentRect.width / PAGE_WIDTH_PX)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pages = usePageEstimate(contentRef, pageZoom);
  const overTarget = pages !== null && pages > pageTarget + 0.05;

  const onUpdate = (r: JobAnalysis['resume']) => updateJob(job.id, { resume: r });
  const actions: ResumeEditActions = {
    onRegenerateSection: (section, instruction) => runRegenerateResumeSection(job.id, section, instruction),
    isSectionBusy: (section) => isBusy(resumeSectionTaskKind(section)),
    onRoleModeChange: (roleId, mode) => setResumeRoleMode(job.id, roleId, mode),
  };

  // Over-target shortcuts: condense the oldest full role, or ask the AI to tighten the wordiest one.
  const lastIndex = resume.experience.length - 1;
  const oldest = lastIndex >= 0 ? resume.experience[lastIndex] : null;
  const longest = resume.experience.reduce<{ index: number; bullets: number } | null>(
    (best, e, i) => ((e.bullets?.length || 0) > (best?.bullets ?? -1) ? { index: i, bullets: e.bullets?.length || 0 } : best),
    null
  );
  const longestRoleId = longest ? resolveExperienceRoleId(resume.experience[longest.index], careerJourney) : null;

  const download = async (ext: 'pdf' | 'docx') => {
    setDownloading(ext);
    try {
      await downloadExport(
        `/api/export/resume.${ext}`,
        { resume, strategy: job.resumeStrategy, template, companyName: job.companyName, roleTitle: job.roleTitle },
        `${nameSlug(resume?.name, 'Resume')}_Resume_${job.companyName.replace(/\s+/g, '')}_${job.roleTitle.replace(/\s+/g, '')}.${ext}`
      );
    } catch (e: any) {
      console.error(e);
      toast.error(`Couldn't download the ${ext.toUpperCase()}: ${e.message}`);
    } finally {
      setDownloading(null);
    }
  };

  const Template = template === 'modern' ? ModernTemplate : template === 'executive' ? ExecutiveTemplate : ClassicTemplate;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <div className="flex items-center gap-3">
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
          <PageMeter pages={pages} target={pageTarget} />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onOpenSettings} disabled={isRegenerating}>
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" /> {isRegenerating ? 'Regenerating…' : 'Regenerate…'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => download('docx')} disabled={downloading !== null}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> {downloading === 'docx' ? 'Preparing…' : 'Download .docx'}
          </Button>
          <Button size="sm" onClick={() => download('pdf')} disabled={downloading !== null}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> {downloading === 'pdf' ? 'Preparing…' : 'Download PDF'}
          </Button>
        </div>
      </div>

      {isRegenerating && (
        <div className="mb-4 flex items-center gap-2 text-sm text-brand-700 bg-brand-50 border border-brand-100 rounded-md px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Rewriting the resume. This preview will be replaced when it's done.
        </div>
      )}
      {overTarget && !isRegenerating && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-[200px]">About {pages!.toFixed(1)} pages, over your {pageTarget}-page target.</span>
          {oldest && resume.experience.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const roleId = resolveExperienceRoleId(oldest, careerJourney);
                onUpdate(condenseRole(resume, lastIndex, careerJourney));
                if (roleId) setResumeRoleMode(job.id, roleId, 'condensed');
              }}
            >
              Condense {oldest.company} to one line
            </Button>
          )}
          {longestRoleId && longest && longest.bullets > 2 && (
            <Button
              variant="outline"
              size="sm"
              disabled={isBusy(resumeSectionTaskKind({ kind: 'role', roleId: longestRoleId }))}
              onClick={() => runRegenerateResumeSection(job.id, { kind: 'role', roleId: longestRoleId }, `Cut to ${longest.bullets - 1} or fewer bullets and shorten each one; keep the strongest JD-relevant proof.`)}
            >
              Tighten {resume.experience[longest.index].company}
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div ref={previewRef} className="bg-slate-200 rounded-xl p-6 overflow-auto flex-1 min-w-0 w-full">
          <div className="relative bg-white shadow-xl max-w-[8.5in] w-[8.5in] p-[0.5in] mx-auto text-black font-sans leading-relaxed" style={{ zoom: pageZoom }}>
            <div ref={contentRef}>
              <Template resume={resume} tagline={tagline} onUpdate={onUpdate} careerJourney={careerJourney} actions={actions} />
            </div>
            {pages !== null && <PageBreakMarkers pages={pages} />}
          </div>
        </div>
        <aside className="w-full xl:w-96 shrink-0 xl:sticky xl:top-0">
          <ResumeScorePanel
            job={job}
            coverage={coverage}
            currentFingerprint={fingerprint}
            isRebuilding={isRegenerating}
            isScoring={isScoring}
            onRebuild={onRebuild}
            onAiScore={onAiScore}
          />
        </aside>
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
  const toast = useToast();
  const [content, setContent] = useState(job.coverLetter?.content || '');
  const [downloading, setDownloading] = useState<'pdf' | 'docx' | null>(null);

  // Local draft mirrors the store so AI-generated/regenerated content actually
  // shows up — a bare useState(job.coverLetter?.content) initializer only runs
  // once and goes stale the moment the background task writes a new draft.
  useEffect(() => {
    setContent(job.coverLetter?.content || '');
  }, [job.coverLetter?.content]);

  const handleBlur = () => {
    updateJob(job.id, { coverLetter: { content, wordCount: countWords(content), approvalStatus: job.coverLetter?.approvalStatus || 'Draft' } });
  };

  const download = async (ext: 'pdf' | 'docx') => {
    if (!job.coverLetter) return;
    setDownloading(ext);
    try {
      const candidateName = careerJourney?.person?.name || '';
      await downloadExport(
        `/api/export/coverLetter.${ext}`,
        {
          coverLetter: { ...job.coverLetter, content },
          companyName: job.companyName,
          roleTitle: job.roleTitle,
          candidateName,
          candidateContactInfo: formatContactLine(careerJourney?.person),
        },
        `${nameSlug(candidateName, 'CoverLetter')}_CoverLetter_${job.companyName.replace(/\s+/g, '')}_${job.roleTitle.replace(/\s+/g, '')}.${ext}`
      );
    } catch (e: any) {
      console.error(e);
      toast.error(`Couldn't download the ${ext.toUpperCase()}: ${e.message}`);
    } finally {
      setDownloading(null);
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
    <div className="w-full space-y-4">
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
        <Button variant="outline" onClick={() => download('docx')} disabled={!content || downloading !== null}>
          <Download className="w-4 h-4 mr-2" /> {downloading === 'docx' ? 'Preparing…' : 'Download .docx'}
        </Button>
        <Button variant="outline" onClick={() => download('pdf')} disabled={!content || downloading !== null}>
          <Download className="w-4 h-4 mr-2" /> {downloading === 'pdf' ? 'Preparing…' : 'Download PDF'}
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
    <div className="w-full space-y-4">
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
    <div className="w-full space-y-6">
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
