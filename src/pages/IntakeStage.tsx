import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, LoadingButton, Card, CardContent, CardHeader, CardTitle, Input, Label, Textarea, useToast } from '../components/ui';
import { fetchJobFromUrl } from '../lib/aiClient';
import { MatchSummaryCard } from '../components/MatchSummary';
import { StillOpenAttribution } from '../components/StillOpenAttribution';
import { Link2, FileText, Upload, ExternalLink, Pencil, ArrowRight, Radar, Banknote, MapPin } from 'lucide-react';

type IntakeTab = 'paste' | 'upload' | 'url';

export default function IntakeStage() {
  const { id } = useParams();
  const job = useStore((state) => state.jobs[id || '']);
  const updateJob = useStore((state) => state.updateJob);
  const runParseJob = useStore((state) => state.runParseJob);
  const isParsing = useStore((s) => Object.values(s.activeAiTasks).some((t) => t.jobId === id && t.kind === 'parse'));
  // The match this job was promoted from, if any — promoteMatch stamps promotedJobId on it.
  const sourceMatch = useStore((s) => Object.values(s.matches).find((m) => m.promotedJobId === id));
  const navigate = useNavigate();
  const toast = useToast();

  // A job that's already been parsed opens on a read-only overview of its JD (and the scan it
  // came from); "Edit details" switches to the intake form for changes or a re-parse.
  const [editing, setEditing] = useState(() => !job?.parse);
  const [tab, setTab] = useState<IntakeTab>('paste');
  const [formData, setFormData] = useState({
    companyName: '',
    roleTitle: '',
    jobLink: '',
    compensationRange: '',
    locationNotes: '',
    jdText: '',
    recruiterNotes: ''
  });
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  useEffect(() => {
    if (job) {
      setFormData({
        companyName: job.companyName || '',
        roleTitle: job.roleTitle || '',
        jobLink: job.jobLink || '',
        compensationRange: job.compensationRange || '',
        locationNotes: job.locationNotes || '',
        jdText: job.jdText || '',
        recruiterNotes: job.recruiterNotes || ''
      });
      setEditing(!job.parse);
    }
  }, [job?.id]);

  // The job auto-advances to Parsed when the background parse task completes
  // (advanceStageIfEligible in the store). If the user is still on this screen
  // when that happens, follow them forward; if they've navigated elsewhere,
  // leave them be — the activity indicator + toast already told them. Only on
  // that transition: a job that was already Parsed (e.g. promoted from a
  // match) must be able to come back to Intake without being bounced away.
  const previousStage = useRef(job?.stage);
  useEffect(() => {
    if (job?.stage === 'Parsed' && previousStage.current === 'Intake') {
      navigate(`/job/${job.id}/parsed`);
    }
    previousStage.current = job?.stage;
  }, [job?.stage]);

  // A re-parse started from the edit form: show the overview again once it lands.
  const parsedAt = useRef(job?.parse);
  useEffect(() => {
    if (job?.parse && job.parse !== parsedAt.current) setEditing(false);
    parsedAt.current = job?.parse;
  }, [job?.parse]);

  if (!job) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    updateJob(job.id, { ...formData });
  };

  const handleParse = () => {
    if (formData.jdText.trim().length < 50) {
      toast.error('JD text is too short to parse reliably.');
      return;
    }
    handleSave();
    runParseJob(job.id, formData.jdText);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData((prev) => ({ ...prev, jdText: event.target?.result as string }));
      setTab('paste');
    };
    reader.readAsText(file);
  };

  const handleFetchUrl = async () => {
    if (!urlInput.trim()) return;
    setIsFetchingUrl(true);
    try {
      const result = await fetchJobFromUrl(urlInput.trim());
      if ('error' in result) throw new Error(result.error);
      setFormData((prev) => ({
        ...prev,
        jdText: result.jdText,
        jobLink: prev.jobLink || urlInput.trim(),
        companyName: prev.companyName || result.companyName || '',
        roleTitle: prev.roleTitle || result.roleTitle || '',
      }));
      setTab('paste');
      toast.success('Pulled the job description in — review it below before parsing.');
    } catch (e: any) {
      if (e.message === 'could_not_extract') {
        toast.error("Couldn't pull readable text from that page (likely a JS-rendered board). Paste the job description instead.");
      } else {
        toast.error(e.message || 'Could not fetch that URL.');
      }
      setTab('paste');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  if (!editing) {
    const source = job.source?.kind === 'stillopen' ? job.source : null;
    return (
      <div className="space-y-6 max-w-4xl">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900">{job.roleTitle || 'Untitled role'}</h2>
                <p className="text-sm font-semibold text-slate-500">{job.companyName}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  {job.compensationRange && (
                    <span className="flex items-center gap-1"><Banknote className="w-3.5 h-3.5 text-slate-400" />{job.compensationRange}</span>
                  )}
                  {job.locationNotes && (
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" />{job.locationNotes}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit details
                </Button>
                {job.jobLink && (
                  <a href={job.jobLink} target="_blank" rel="noreferrer">
                    <Button size="sm">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open application
                    </Button>
                  </a>
                )}
              </div>
            </div>
            {source && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <span>
                  Found via StillOpen{' '}
                  {source.listingUrl && (
                    <a href={source.listingUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:text-brand-800 underline">view listing</a>
                  )}
                </span>
                <StillOpenAttribution />
              </div>
            )}
          </CardContent>
        </Card>

        {sourceMatch && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><Radar className="w-4 h-4 text-brand-600" /> Match scan</span>
                <Link to={sourceMatch.source === 'stillopen' ? '/discover' : '/matches'} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                  Back to {sourceMatch.source === 'stillopen' ? 'Discover' : 'Matches'}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MatchSummaryCard match={sourceMatch} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-brand-600" /> Job Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {job.jdText ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{job.jdText}</div>
            ) : (
              <p className="text-sm text-slate-500">No job description saved — use Edit details to add one.</p>
            )}
            {job.recruiterNotes && (
              <div className="pt-4 border-t border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Recruiter notes</p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{job.recruiterNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => navigate(`/job/${job.id}/parsed`)}>
            Continue to Parsed <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  const tabClass = (t: IntakeTab) =>
    `flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
      tab === t ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'
    }`;

  return (
    <div className={`space-y-6 max-w-4xl transition-all ${isParsing ? 'opacity-80 pointer-events-none' : ''}`}>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Automatic if omitted" disabled={isParsing} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleTitle">Role Title</Label>
              <Input name="roleTitle" value={formData.roleTitle} onChange={handleChange} placeholder="Automatic if omitted" disabled={isParsing} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobLink">Job Link (optional)</Label>
            <Input name="jobLink" value={formData.jobLink} onChange={handleChange} placeholder="https://..." disabled={isParsing} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="compensationRange">Compensation Range</Label>
              <Input name="compensationRange" value={formData.compensationRange} onChange={handleChange} placeholder="$200k - $250k" disabled={isParsing} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locationNotes">Location / Remote Notes</Label>
              <Input name="locationNotes" value={formData.locationNotes} onChange={handleChange} placeholder="e.g. Remote US" disabled={isParsing} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-between items-end">
            <Label className="text-lg font-semibold">Job Description</Label>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button onClick={() => setTab('paste')} className={tabClass('paste')}>
                <FileText className="w-3 h-3" /> Paste
              </button>
              <button onClick={() => setTab('upload')} className={tabClass('upload')}>
                <Upload className="w-3 h-3" /> Upload
              </button>
              <button onClick={() => setTab('url')} className={tabClass('url')}>
                <Link2 className="w-3 h-3" /> From URL
              </button>
            </div>
          </div>

          {tab === 'url' && (
            <div className="flex gap-2 items-start p-3 rounded-lg bg-slate-50 border border-slate-200">
              <Input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://boards.greenhouse.io/... or any job posting URL"
                disabled={isFetchingUrl}
                className="flex-1"
              />
              <LoadingButton onClick={handleFetchUrl} isLoading={isFetchingUrl} loadingLabel="Fetching..." disabled={!urlInput.trim()}>
                Fetch & Fill
              </LoadingButton>
            </div>
          )}

          {tab === 'upload' && (
            <div className="p-6 rounded-lg bg-slate-50 border-2 border-dashed border-slate-200 text-center">
              <Label htmlFor="jdUpload" className="cursor-pointer text-brand-700 hover:text-brand-900 underline underline-offset-2 text-sm">
                Choose a .txt or .md file
              </Label>
              <input id="jdUpload" type="file" accept=".txt,.md" className="hidden" onChange={handleFileUpload} disabled={isParsing} />
            </div>
          )}

          <Textarea
            name="jdText"
            value={formData.jdText}
            onChange={handleChange}
            placeholder="Paste the full job description here..."
            className="min-h-[400px] font-mono text-xs"
            disabled={isParsing}
          />
          <div className="space-y-2">
            <Label htmlFor="recruiterNotes">Recruiter Notes (optional)</Label>
            <Textarea name="recruiterNotes" value={formData.recruiterNotes} onChange={handleChange} className="min-h-[100px]" disabled={isParsing} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        {job.parse && (
          <Button variant="ghost" onClick={() => setEditing(false)} disabled={isParsing}>Back to overview</Button>
        )}
        <Button variant="outline" onClick={handleSave} disabled={isParsing}>Save Draft</Button>
        <LoadingButton
          onClick={handleParse}
          disabled={isParsing || formData.jdText.trim().length === 0}
          isLoading={isParsing}
          loadingLabel="Parsing Description..."
          className="min-w-[170px]"
        >
          Parse JD & Continue
        </LoadingButton>
      </div>
    </div>
  );
}
