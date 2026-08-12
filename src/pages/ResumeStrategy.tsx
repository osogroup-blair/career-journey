import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Label, Textarea } from '../components/ui';
import { mockGenerateResumeStrategy } from '../lib/mock-ai';
import { ResumeStrategy as ResumeStrategyType } from '../types';
import { Loader2, RefreshCw } from 'lucide-react';

export default function ResumeStrategy() {
  const { id } = useParams();
  const job = useStore((state) => state.jobs[id || '']);
  const updateJob = useStore((state) => state.updateJob);
  const careerJourney = useStore((state) => state.careerJourney);
  const navigate = useNavigate();

  const [strategy, setStrategy] = useState<ResumeStrategyType | null>(job?.resumeStrategy || null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!strategy && job?.parse) {
      generateStrategy();
    }
  }, []);

  const generateStrategy = async () => {
    if (!job?.parse) return;
    setIsGenerating(true);
    const sg = await mockGenerateResumeStrategy(job.parse, careerJourney, job.contextEntries || {});
    setStrategy(sg);
    updateJob(job.id, { resumeStrategy: sg });
    setIsGenerating(false);
  };

  const handleSave = () => {
    if (strategy) {
      updateJob(job.id, { resumeStrategy: strategy, status: 'Resume Strategy Ready' });
      navigate(`/job/${job.id}/export`);
    }
  };

  if (!job) return null;

  return (
    <div className="space-y-6 max-w-5xl">
       <div className="flex justify-between items-center">
         <div>
           <h2 className="text-xl font-bold text-zinc-900">Resume Tailoring Strategy</h2>
           <p className="text-zinc-500">Draft and edit the exact claims that will go into the builder.</p>
         </div>
         <Button variant="outline" onClick={generateStrategy} disabled={isGenerating} className="flex items-center gap-2 min-w-[150px] justify-center">
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                <span>Strategizing...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 text-slate-500" />
                <span>Regenerate Strategy</span>
              </>
            )}
         </Button>
       </div>

       {!strategy ? (
          <Card className={`py-20 text-center ${isGenerating ? 'border-brand-200 bg-brand-50/10 animate-pulse' : ''}`}>
             <CardContent>
               {isGenerating ? (
                  <div className="flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
                    <div className="space-y-1">
                      <p className="font-bold text-zinc-800">Synthesizing Core ATS Strategy & Taglines</p>
                      <p className="text-xs text-zinc-400">Gemini is modeling seniority reframing vectors and strategic claims layout...</p>
                    </div>
                  </div>
               ) : (
                  'Loading...'
               )}
             </CardContent>
          </Card>
       ) : (
          <div className="space-y-6">
             <Card>
               <CardHeader className="bg-zinc-50 border-b pb-4">
                 <CardTitle className="text-lg">Top Third (The Human Screen & Parser Setup)</CardTitle>
               </CardHeader>
               <CardContent className="pt-6 space-y-6">
                 <div className="space-y-2">
                   <Label>File Basename (ATS Tracking)</Label>
                   <Input 
                     value={strategy.outputBasename} 
                     onChange={(e) => setStrategy({...strategy, outputBasename: e.target.value})} 
                   />
                 </div>
                 <div className="space-y-2">
                   <Label>Header Tagline (Under Name)</Label>
                   <Input 
                     value={strategy.headerTagline} 
                     onChange={(e) => setStrategy({...strategy, headerTagline: e.target.value})} 
                     className="font-semibold text-brand-900"
                   />
                 </div>
                 <div className="space-y-2">
                   <Label>Executive Summary</Label>
                   <Textarea 
                     value={strategy.executiveSummary} 
                     onChange={(e) => setStrategy({...strategy, executiveSummary: e.target.value})} 
                     className="min-h-[120px]"
                   />
                 </div>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="bg-zinc-50 border-b pb-4">
                 <CardTitle className="text-lg">Selected Executive Outcomes</CardTitle>
               </CardHeader>
               <CardContent className="pt-6 space-y-3">
                 {strategy.selectedOutcomes.map((outcome, i) => (
                   <Input 
                     key={i} 
                     value={outcome} 
                     onChange={(e) => {
                       const newOutcomes = [...strategy.selectedOutcomes];
                       newOutcomes[i] = e.target.value;
                       setStrategy({...strategy, selectedOutcomes: newOutcomes});
                     }} 
                   />
                 ))}
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="bg-zinc-50 border-b pb-4">
                 <CardTitle className="text-lg">Role Reframing (Seniority Parsing)</CardTitle>
               </CardHeader>
               <CardContent className="pt-6 space-y-6">
                 {strategy.roleStrategies.map((role, i) => (
                   <div key={i} className="flex gap-4 items-center bg-zinc-50 p-4 rounded-md border">
                     <div className="w-1/4 font-semibold text-sm">{role.company} title:</div>
                     <div className="flex-1 space-y-2">
                        <Input 
                          value={role.titleReframe} 
                          onChange={(e) => {
                            const newRoles = [...strategy.roleStrategies];
                            newRoles[i].titleReframe = e.target.value;
                            setStrategy({...strategy, roleStrategies: newRoles});
                          }} 
                        />
                        <p className="text-xs text-zinc-500">Note: {role.note}</p>
                     </div>
                   </div>
                 ))}
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="bg-zinc-50 border-b pb-4">
                 <CardTitle className="text-lg">Core Skills (The Keyword Vault)</CardTitle>
               </CardHeader>
               <CardContent className="pt-6 space-y-4">
                 {strategy.skillRows.map((row, i) => (
                   <div key={i} className="flex gap-4">
                      <Input 
                        className="w-1/4 font-bold bg-zinc-50" 
                        value={row.label} 
                        onChange={(e) => {
                          const newRows = [...strategy.skillRows];
                          newRows[i].label = e.target.value;
                          setStrategy({...strategy, skillRows: newRows});
                        }}
                      />
                      <Input 
                        className="flex-1" 
                        value={row.content} 
                        onChange={(e) => {
                          const newRows = [...strategy.skillRows];
                          newRows[i].content = e.target.value;
                          setStrategy({...strategy, skillRows: newRows});
                        }}
                      />
                   </div>
                 ))}
               </CardContent>
             </Card>

             <div className="flex justify-end gap-3 mt-8">
               <Button onClick={handleSave}>Save & Check Coverage</Button>
             </div>
          </div>
       )}
    </div>
  );
}
