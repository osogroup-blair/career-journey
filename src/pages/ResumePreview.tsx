import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Badge, Card, Label } from '../components/ui';
import { mockGenerateFullResume } from '../lib/mock-ai';
import { Download, ArrowLeft, Printer, Sparkles, Loader2 } from 'lucide-react';
import { ClassicTemplate, ModernTemplate, ExecutiveTemplate } from '../components/ResumeTemplates';

type TemplateType = 'classic' | 'modern' | 'executive';

export default function ResumePreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const job = useStore((state) => state.jobs[id || '']);
  const careerJourney = useStore((state) => state.careerJourney);
  const updateJob = useStore((state) => state.updateJob);

  const [isGenerating, setIsGenerating] = useState(false);
  const [template, setTemplate] = useState<TemplateType>('classic');

  const [showPrintWarning, setShowPrintWarning] = useState(false);

  useEffect(() => {
    if (job && job.resumeStrategy && job.parse && careerJourney && !job.resume) {
      generateResume();
    }
  }, []);

  const generateResume = async () => {
    if (!job?.parse || !job?.resumeStrategy) return;
    setIsGenerating(true);
    try {
      const generated = await mockGenerateFullResume(careerJourney, job.resumeStrategy, job.parse);
      updateJob(job.id, { resume: generated });
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!job) return null;

  const handlePrint = () => {
    if (window.self !== window.top) {
      setShowPrintWarning(true);
      setTimeout(() => setShowPrintWarning(false), 5000);
    } else {
      window.print();
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-slate-200 print:relative print:bg-white print:block shadow-inner overflow-hidden">
      {/* Header (hidden in print) */}
      <div className="flex-none p-4 border-b bg-white flex justify-between items-center print:hidden z-10 shadow-sm">
        <div className="flex items-center gap-4">
           <Button variant="ghost" onClick={() => navigate(`/job/${job.id}/export`)}>
             <ArrowLeft className="w-4 h-4 mr-2" /> Back
           </Button>
           <div>
             <h2 className="text-xl font-bold text-zinc-900">Tailored Resume</h2>
             <p className="text-xs text-zinc-500">Targeting {job.companyName} - {job.roleTitle}</p>
           </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200">
            <button 
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${template === 'classic' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setTemplate('classic')}
            >
              Classic ATS
            </button>
            <button 
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${template === 'modern' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setTemplate('modern')}
            >
              Modern
            </button>
            <button 
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${template === 'executive' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              onClick={() => setTemplate('executive')}
            >
              Executive
            </button>
          </div>
          <div className="w-px h-6 bg-slate-200"></div>
          <div className="flex gap-2 items-center">
            {isGenerating && <span className="text-sm text-zinc-500 animate-pulse">Generating tailored PDF structure...</span>}
            <Button variant="outline" onClick={generateResume} disabled={isGenerating} className="flex items-center gap-1.5 min-w-[135px] justify-center text-xs font-bold">
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                  <span>Regenerating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Regenerate</span>
                </>
              )}
            </Button>
            <div className="relative">
              <Button onClick={handlePrint} disabled={!job.resume || isGenerating}>
                <Printer className="w-4 h-4 mr-2" /> Print to PDF
              </Button>
              {showPrintWarning && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 text-white text-xs p-3 rounded shadow-lg z-50">
                  <span className="font-bold block mb-1">Cannot print in preview</span>
                  Please open the app in a new tab using the icon in the top right to use the Print functionality.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Resume Document Canvas Scroll Basin */}
      <div className="flex-1 overflow-y-auto py-12 px-4 print:p-0 print:block print:overflow-visible bg-slate-200">
        {(!job.resume || isGenerating) ? (
           <div className="bg-white shadow-xl max-w-[8.5in] w-[8.5in] p-[0.5in] mx-auto print:hidden">
              <div className="animate-pulse flex flex-col items-center">
                <div className="h-8 bg-slate-200 rounded w-1/2 mb-4"></div>
                <div className="h-4 bg-slate-200 rounded w-1/3 mb-10"></div>
                
                <div className="w-full flex-col gap-4">
                  <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-10"></div>
                  
                  <div className="h-6 bg-slate-200 rounded w-1/4 mb-4"></div>
                  <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-5/6 mb-8"></div>
                  
                  <div className="h-6 bg-slate-200 rounded w-1/4 mb-4"></div>
                  <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-4/5 mb-2"></div>
                </div>
              </div>
           </div>
        ) : (
           <div 
             className="bg-white shadow-xl max-w-[8.5in] w-[8.5in] p-[0.5in] mx-auto text-black font-sans leading-relaxed print:shadow-none print:w-full print:max-w-full print-sheet"
             style={{ boxSizing: 'border-box' }}
           >
             <style>{`
                @media print {
                  /* Hide all screen-only UI elements */
                  .print\\:hidden, aside, header, footer, button, .sticky {
                    display: none !important;
                  }
                  /* Break flex-locking page structures */
                  html, body, #root, #root > div, main, .flex-1, .absolute, .inset-0, .overflow-y-auto, .overflow-hidden {
                    height: auto !important;
                    min-height: 0 !important;
                    overflow: visible !important;
                    position: static !important;
                    display: block !important;
                    background: transparent !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                  }
                  @page { margin: 0.5in !important; size: letter !important; }
                  body { -webkit-print-color-adjust: exact !important; background: white !important; }
                  
                  /* Exact clean bounds for page print sheet */
                  .print-sheet {
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    background: white !important;
                    display: block !important;
                  }
                }
             `}</style>
             
             {template === 'classic' && <ClassicTemplate resume={job.resume} tagline={job.resumeStrategy?.headerTagline || job.roleTitle} onUpdate={r => updateJob(job.id, {resume: r})} />}
             {template === 'modern' && <ModernTemplate resume={job.resume} tagline={job.resumeStrategy?.headerTagline || job.roleTitle} onUpdate={r => updateJob(job.id, {resume: r})} />}
             {template === 'executive' && <ExecutiveTemplate resume={job.resume} tagline={job.resumeStrategy?.headerTagline || job.roleTitle} onUpdate={r => updateJob(job.id, {resume: r})} />}

           </div>
        )}

        {job.resume && (
          <div className="max-w-[8.5in] w-[8.5in] mx-auto mt-8 mb-24 bg-white rounded-xl shadow-lg border border-slate-200 p-6 overflow-hidden print:hidden">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="p-2 bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg shrink-0">
                <Sparkles className="w-5 h-5 text-emerald-600 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Ontology Re-Sync Engine: Push Refinements Back</h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Have you edited experience bullets on this resume? Reverse-synchronize those refined bullet points right back into your master Career Journey database for future applications.
                </p>
              </div>
            </div>

            {/* List each experience section from the resume so the user can see bullets */}
            <div className="space-y-6">
              {job.resume.experience.map((exp: any, expIndex: number) => {
                const matchingRole = careerJourney?.roles?.find((r: any) => 
                  r.organization?.toLowerCase() === exp.company?.toLowerCase() ||
                  r.company?.toLowerCase() === exp.company?.toLowerCase()
                );

                if (!matchingRole) return null;

                return (
                  <div key={expIndex} className="bg-slate-50 border border-slate-200/60 rounded-lg p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400">Match Node</span>
                        <h4 className="font-bold text-slate-800 text-sm leading-tight">
                          {matchingRole.title} @ {matchingRole.organization}
                        </h4>
                      </div>
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[9px] uppercase w-fit inline-flex self-start sm:self-auto">
                        Mapped to {matchingRole.id}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Tailored Resume Bullets:</Label>
                      <ul className="space-y-2 text-xs text-slate-700">
                        {exp.bullets.map((bullet: string, bulletIndex: number) => {
                          const isExistingDeliverable = matchingRole.deliverables?.some((d: any) => d.description === bullet);
                          const isExistingAchievement = matchingRole.achievements?.some((a: any) => a.description === bullet);
                          const isAlreadySynced = isExistingDeliverable || isExistingAchievement;

                          return (
                            <li key={bulletIndex} className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3 border border-slate-200/50 rounded-lg shadow-sm transition-all hover:border-slate-300">
                              <span className="flex-1 font-medium text-slate-700 leading-normal">{bullet}</span>
                              <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                                {isAlreadySynced ? (
                                  <span className="text-[10px] flex items-center text-emerald-600 font-bold gap-1 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    In Master Journey
                                  </span>
                                ) : (
                                  <div className="flex gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedJourney = { ...careerJourney };
                                        const role = updatedJourney.roles.find((r: any) => r.id === matchingRole.id);
                                        if (role) {
                                          role.deliverables = role.deliverables || [];
                                          role.deliverables.push({
                                            id: `del-res-${Date.now().toString().slice(-4)}`,
                                            description: bullet,
                                            skills: []
                                          });
                                          useStore.getState().setCareerJourney(updatedJourney);
                                          alert(`Successfully pushed bullet as a Deliverable to ${matchingRole.organization}!`);
                                        }
                                      }}
                                      className="text-[10px] font-bold bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded hover:bg-slate-200 transition-colors"
                                    >
                                      + Deliverable
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedJourney = { ...careerJourney };
                                        const role = updatedJourney.roles.find((r: any) => r.id === matchingRole.id);
                                        if (role) {
                                          role.achievements = role.achievements || [];
                                          role.achievements.push({
                                            id: `ach-res-${Date.now().toString().slice(-4)}`,
                                            description: bullet,
                                            skills: []
                                          });
                                          useStore.getState().setCareerJourney(updatedJourney);
                                          alert(`Successfully pushed bullet as an Achievement to ${matchingRole.organization}!`);
                                        }
                                      }}
                                      className="text-[10px] font-bold bg-brand-600 border border-brand-500 text-white px-2.5 py-1.5 rounded hover:bg-brand-700 transition-colors"
                                    >
                                      + Achievement
                                    </button>
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
