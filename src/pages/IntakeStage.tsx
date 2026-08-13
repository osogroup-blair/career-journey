import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, LoadingButton, Card, CardContent, Input, Label, Textarea, useToast } from '../components/ui';
import { fetchJobFromUrl } from '../lib/aiClient';
import { Link2, FileText, Upload } from 'lucide-react';

type IntakeTab = 'paste' | 'upload' | 'url';

export default function IntakeStage() {
  const { id } = useParams();
  const job = useStore((state) => state.jobs[id || '']);
  const updateJob = useStore((state) => state.updateJob);
  const runParseJob = useStore((state) => state.runParseJob);
  const isParsing = useStore((s) => Object.values(s.activeAiTasks).some((t) => t.jobId === id && t.kind === 'parse'));
  const navigate = useNavigate();
  const toast = useToast();

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
    }
  }, [job?.id]);

  // The job auto-advances to Parsed when the background parse task completes
  // (advanceStageIfEligible in the store). If the user is still on this screen
  // when that happens, follow them forward; if they've navigated elsewhere,
  // leave them be — the activity indicator + toast already told them.
  useEffect(() => {
    if (job?.stage === 'Parsed') {
      navigate(`/job/${job.id}/parsed`);
    }
  }, [job?.stage]);

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
