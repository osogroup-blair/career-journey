import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge } from '../components/ui';
import { mockScoreKeywordCoverage } from '../lib/mock-ai';
import { CheckCircle2, XCircle, AlertCircle, Download, FileJson, FileText, Loader2 } from 'lucide-react';

export default function ExportReady() {
  const { id } = useParams();
  const navigate = useNavigate();
  const job = useStore((state) => state.jobs[id || '']);
  const updateJob = useStore((state) => state.updateJob);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (job?.resumeStrategy && job?.keywords) {
      runGateCheck();
    }
  }, []);

  const runGateCheck = async () => {
    setLoading(true);
    const coverage = await mockScoreKeywordCoverage(job.resumeStrategy!, job.keywords!);
    
    // Set to Build Ready if passes
    if (coverage.passed) {
       updateJob(job.id, { keywordCoverage: coverage, status: 'Resume Build Ready' });
    } else {
       updateJob(job.id, { keywordCoverage: coverage });
    }
    setLoading(false);
  };

  const exportJSON = () => {
    const dataStr = JSON.stringify(job, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job_${job.companyName.replace(/\s+/g,'_')}.json`;
    a.click();
  };

  const navigateToPreview = () => {
     navigate(`/job/${job.id}/preview`);
  };

  if (!job || !job.resumeStrategy) return <div>Missing strategy data.</div>;

  const coverage = job.keywordCoverage;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
         <div>
           <h2 className="text-xl font-bold text-zinc-900">Keyword Gate & Export</h2>
           <p className="text-zinc-500">Validation against ATS thresholds before generating files.</p>
         </div>
      </div>

      {loading || !coverage ? (
         <Card className="py-20 text-center border-emerald-200 bg-emerald-50/10 animate-pulse">
           <CardContent className="flex flex-col items-center justify-center gap-4">
             <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
             <div className="space-y-1">
               <p className="font-bold text-zinc-800">Scoring resume keyword coverage...</p>
               <p className="text-xs text-zinc-400">Gemini is checking strategic claim alignment with critical JD requirements...</p>
             </div>
           </CardContent>
         </Card>
      ) : (
         <div className="space-y-6">
            
            <Card className={`border-2 ${coverage.passed ? 'border-green-500' : 'border-red-500'}`}>
              <CardHeader className={`${coverage.passed ? 'bg-green-50' : 'bg-red-50'} border-b pb-4`}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    {coverage.passed ? <CheckCircle2 className="text-green-600" /> : <XCircle className="text-red-600" />}
                    <CardTitle className={`text-lg ${coverage.passed ? 'text-green-900' : 'text-red-900'}`}>
                       Gate Status: {coverage.passed ? 'PASSED' : 'FAILED'}
                    </CardTitle>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${coverage.passed ? 'text-green-700' : 'text-red-700'}`}>
                      {coverage.score}%
                    </div>
                    <div className="text-xs text-zinc-500">Threshold: {coverage.threshold}%</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 grid md:grid-cols-2 gap-8">
                
                <div>
                   <h4 className="text-xs uppercase font-bold text-zinc-500 mb-3 border-b pb-1">Top Critical Skills</h4>
                   <ul className="space-y-2">
                     {coverage.criticalSkillCoverage.map((c, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm justify-between">
                           <span className={c.present ? 'text-zinc-900' : 'text-red-600 font-medium'}>{c.phrase}</span>
                           {c.present ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                        </li>
                     ))}
                   </ul>
                </div>
                
                <div>
                   <h4 className="text-xs uppercase font-bold text-zinc-500 mb-3 border-b pb-1">Gaps / Unsupported</h4>
                   {coverage.missingKeywords.length === 0 ? (
                      <p className="text-sm text-zinc-500 italic">No significant gaps.</p>
                   ) : (
                      <ul className="space-y-2">
                        {coverage.missingKeywords.map((gap, i) => (
                           <li key={i} className="flex items-center gap-2 text-sm text-amber-700">
                             <AlertCircle className="w-4 h-4" />
                             <span>{gap} (Unsupported)</span>
                           </li>
                        ))}
                      </ul>
                   )}
                </div>

              </CardContent>
            </Card>

            <Card>
               <CardHeader className="bg-zinc-50 border-b pb-4">
                 <CardTitle className="text-lg">Export Artifacts</CardTitle>
               </CardHeader>
               <CardContent className="pt-6">
                 <div className="grid grid-cols-2 gap-4">
                   <Button variant="outline" className="h-24 flex flex-col items-center justify-center gap-2" onClick={exportJSON}>
                      <FileJson className="w-6 h-6 text-zinc-500" />
                      <div>
                        <div className="font-bold">Job Analysis JSON</div>
                        <div className="text-xs font-normal text-zinc-500">Full structured pipeline state</div>
                      </div>
                   </Button>
                   <Button variant="outline" className="h-24 flex flex-col items-center justify-center gap-2" onClick={navigateToPreview} disabled={!coverage.passed}>
                      <FileText className="w-6 h-6 text-brand-500" />
                      <div>
                        {job.resume ? (
                          <>
                            <div className="font-bold text-brand-700">View Generated Resume</div>
                            <div className="text-xs font-normal text-zinc-500">Edit and export PDF</div>
                          </>
                        ) : (
                          <>
                            <div className="font-bold text-brand-700">Generate & Preview PDF</div>
                            <div className="text-xs font-normal text-zinc-500">2-page strict constraint</div>
                          </>
                        )}
                      </div>
                   </Button>
                 </div>
               </CardContent>
            </Card>

         </div>
      )}
    </div>
  );
}
