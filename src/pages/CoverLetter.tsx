import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, Textarea, Badge } from '../components/ui';
import { mockGenerateCoverLetter } from '../lib/mock-ai';
import { RefreshCw, Sparkles, Loader2, Download, ArrowLeft, CheckCircle2 } from 'lucide-react';

function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

export default function CoverLetter() {
  const { id } = useParams();
  const navigate = useNavigate();
  const job = useStore((state) => state.jobs[id || '']);
  const careerJourney = useStore((state) => state.careerJourney);
  const updateJob = useStore((state) => state.updateJob);

  const [content, setContent] = useState(job?.coverLetter?.content || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job?.coverLetter && job?.parse) {
      generate();
    }
  }, []);

  const generate = async () => {
    if (!job?.parse) return;
    setIsGenerating(true);
    setError(null);
    try {
      const letter = await mockGenerateCoverLetter(job.parse, careerJourney, job.fitAnalysis, job.resumeStrategy);
      setContent(letter.content);
      updateJob(job.id, { coverLetter: letter, status: 'Cover Letter Ready' });
    } catch (e: any) {
      console.error(e);
      setError('Failed to generate cover letter.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleContentBlur = () => {
    if (!job) return;
    updateJob(job.id, {
      coverLetter: { content, wordCount: countWords(content), approvalStatus: job.coverLetter?.approvalStatus || 'Draft' }
    });
  };

  const markApproved = () => {
    if (!job) return;
    updateJob(job.id, { coverLetter: { content, wordCount: countWords(content), approvalStatus: 'Approved' } });
  };

  const downloadDocx = async () => {
    if (!job?.coverLetter) return;
    setIsDownloading(true);
    try {
      const res = await fetch('/api/export/coverLetter.docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverLetter: { ...job.coverLetter, content }, companyName: job.companyName, roleTitle: job.roleTitle })
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Blair_Boylan_CoverLetter_${job.companyName.replace(/\s+/g, '')}_${job.roleTitle.replace(/\s+/g, '')}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError('Failed to generate .docx.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!job) return null;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate(`/job/${job.id}/preview`)} className="mb-2 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Resume
          </Button>
          <h2 className="text-xl font-bold text-zinc-900">Cover Letter</h2>
          <p className="text-zinc-500 text-sm">{job.companyName} — {job.roleTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {job.coverLetter?.approvalStatus === 'Approved' && (
            <Badge variant="success" className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>
          )}
          <Button variant="outline" onClick={generate} disabled={isGenerating} className="flex items-center gap-2 min-w-[150px] justify-center">
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin text-slate-500" /><span>Drafting...</span></>
            ) : (
              <><RefreshCw className="w-4 h-4 text-slate-500" /><span>Regenerate</span></>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">{error}</div>
      )}

      <Card className={isGenerating ? 'border-brand-200 bg-brand-50/10 animate-pulse' : ''}>
        <CardContent className="pt-6 space-y-4">
          {!content && isGenerating ? (
            <div className="py-24 text-center">
              <Sparkles className="w-8 h-8 text-brand-500 animate-pulse mx-auto mb-4" />
              <p className="text-sm font-medium text-slate-600">Gemini is drafting the opening thesis and proof story...</p>
            </div>
          ) : (
            <>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onBlur={handleContentBlur}
                className="min-h-[480px] font-serif text-[15px] leading-relaxed"
                placeholder="Cover letter will appear here..."
              />
              <div className="flex justify-between items-center text-xs text-zinc-500">
                <span>{countWords(content)} words</span>
                <span>Target: 325-400 words, one page</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={downloadDocx} disabled={!content || isDownloading} className="flex items-center gap-2">
          {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download .docx
        </Button>
        <Button onClick={markApproved} disabled={!content}>
          {job.coverLetter?.approvalStatus === 'Approved' ? 'Approved' : 'Mark as Approved'}
        </Button>
      </div>
    </div>
  );
}
