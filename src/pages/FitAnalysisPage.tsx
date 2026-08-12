import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge } from '../components/ui';
import { mockScoreFit, mockAuditHardGates } from '../lib/mock-ai';
import { RefreshCw, Sparkles, CheckCircle, ShieldAlert, FileCheck, HelpCircle, Loader2 } from 'lucide-react';

export default function FitAnalysisPage() {
  const { id } = useParams();
  const job = useStore((state) => state.jobs[id || '']);
  const updateJob = useStore((state) => state.updateJob);
  const careerJourney = useStore((state) => state.careerJourney);
  const navigate = useNavigate();

  const [isScoring, setIsScoring] = useState(false);
  const [showClaraFormFor, setShowClaraFormFor] = useState<number | null>(null);
  const [claraInputs, setClaraInputs] = useState<Record<string, { explanation: string; proof: string }>>({});

  useEffect(() => {
    if (job?.parse && (!job.fitAnalysis || !job.hardGateAudit)) {
      analyze();
    }
  }, []);

  const analyze = async (customClarifications?: any) => {
    if (!job?.parse) return;
    setIsScoring(true);
    
    const contextEntries = job.contextEntries || {};
    // Ensure customClarifications is a plain payload and not a React event object
    const isEvent = customClarifications && (
      customClarifications.nativeEvent || 
      customClarifications.target || 
      typeof customClarifications.preventDefault === 'function'
    );
    const clarifications = (customClarifications && !isEvent) ? customClarifications : (job.gateClarifications || {});
    try {
      const [fit, gates] = await Promise.all([
        mockScoreFit(job.parse, careerJourney, contextEntries, clarifications),
        mockAuditHardGates(job.parse, careerJourney, clarifications)
      ]);

      updateJob(job.id, { 
        fitAnalysis: fit, 
        hardGateAudit: gates, 
        gateClarifications: clarifications,
        status: 'Fit Scored' 
      });
    } catch (error) {
       console.error(error);
       alert("Failed to analyze credentials with Gemini.");
    } finally {
      setIsScoring(false);
    }
  };

  const submitGateClarification = async (key: string) => {
    const inputVal = claraInputs[key];
    if (!inputVal || (!inputVal.explanation.trim() && !inputVal.proof.trim())) {
      alert("Please enter both validation explanation and objective proof!");
      return;
    }

    const updatedClarifications = {
      ...(job.gateClarifications || {}),
      [key]: {
        explanation: inputVal.explanation.trim(),
        proof: inputVal.proof.trim()
      }
    };

    setShowClaraFormFor(null);
    await analyze(updatedClarifications);
    alert(`Success! Saved verification explanation and objective proof. Gemini has re-evaluated your fit!`);
  };

  if (!job || !job.parse) return <div>Parse data required first.</div>;

  const { fitAnalysis, hardGateAudit } = job;

  const getFitBadge = (rating: string) => {
    if (rating === 'Strong' || rating === 'PASS') return <Badge variant="success">{rating}</Badge>;
    if (rating === 'Moderate' || rating === 'BORDERLINE') return <Badge variant="warning">{rating}</Badge>;
    return <Badge variant="destructive">{rating}</Badge>;
  };

  const getGateBadge = (verdict: string) => {
    if (verdict === 'CLEAR' || verdict === 'CLEAR TO APPLY') return <Badge variant="success">{verdict}</Badge>;
    if (verdict === 'UNCERTAIN' || verdict === 'VERIFY FIRST') return <Badge variant="warning">{verdict}</Badge>;
    return <Badge variant="destructive">{verdict}</Badge>;
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Fit Analysis & ATS Gate Audit</h2>
          <p className="text-zinc-500">Objective scoring of role match and hard disqualifiers.</p>
        </div>
        <Button variant="outline" onClick={() => analyze()} disabled={isScoring} className="flex items-center gap-2 min-w-[170px] justify-center">
          {isScoring ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 text-slate-500" />
              <span>Analyze Credentials</span>
            </>
          )}
        </Button>
      </div>

      {!fitAnalysis || !hardGateAudit ? (
        <Card className="py-20 text-center"><p className="text-zinc-500">Scoring analysis...</p></Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          
          {/* HARD GATES SECTION */}
          <Card className={`border-2 ${hardGateAudit.overallVerdict === 'LIKELY AUTO-REJECT' ? 'border-red-500' : hardGateAudit.overallVerdict === 'VERIFY FIRST' ? 'border-yellow-500' : 'border-zinc-200'}`}>
            <CardHeader className="bg-zinc-50 border-b pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">ATS Structured-Field Audit</CardTitle>
                {getGateBadge(hardGateAudit.overallVerdict)}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {hardGateAudit.gates.map((gate, i) => {
                  const clarificationKey = gate.category || gate.requirement;
                  const activeClara = (job.gateClarifications || {})[clarificationKey] || { explanation: '', proof: '' };
                  return (
                    <div key={i} className="p-4 border border-zinc-200 hover:border-zinc-300 rounded-xl bg-white space-y-4 shadow-sm transition-all">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-24 shrink-0 mt-1">{getGateBadge(gate.verdict)}</div>
                          <div className="flex-1">
                             <h4 className="font-bold text-zinc-900 text-sm mb-1">{gate.category}</h4>
                             <p className="text-[11px] font-semibold text-zinc-700 bg-zinc-100 inline-block px-2 py-0.5 rounded mb-2">{gate.requirement}</p>
                             <p className="text-xs text-zinc-600 mb-1 leading-relaxed">{gate.reason}</p>
                             <p className="text-[11px] italic text-zinc-500 font-medium">Auto-Action Recommendation: {gate.suggestedAction}</p>
                          </div>
                        </div>

                        {/* Interactive trigger action */}
                        {showClaraFormFor !== i && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowClaraFormFor(i);
                              setClaraInputs({
                                ...claraInputs,
                                [clarificationKey]: {
                                  explanation: activeClara.explanation,
                                  proof: activeClara.proof
                                }
                              });
                            }}
                            className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1 bg-brand-50/70 hover:bg-brand-50 px-3 py-1.5 border border-brand-100/60 rounded-lg transition-all self-end md:self-start shrink-0"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>{activeClara.explanation ? 'Edit Verification & Proof' : 'Clarify with Proof'}</span>
                          </button>
                        )}
                      </div>

                      {/* Expanded interactive form card */}
                      {showClaraFormFor === i ? (
                        <div className="space-y-3 bg-zinc-50 border border-zinc-200/60 p-4 rounded-lg">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                              Provide Experience Proof for {gate.category}
                            </span>
                            <button 
                              type="button" 
                              onClick={() => setShowClaraFormFor(null)} 
                              className="text-xs text-zinc-400 hover:text-zinc-600 font-medium"
                            >
                              Close
                            </button>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-zinc-600 uppercase">My Explanation / Justification</label>
                            <textarea
                              rows={2}
                              className="w-full text-xs p-2.5 border border-zinc-200 rounded-md bg-white text-zinc-800 font-medium focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 outline-none"
                              placeholder="Describe how your past projects, skills, or certifications satisfy this Gate requirement..."
                              value={claraInputs[clarificationKey]?.explanation || ''}
                              onChange={(e) => setClaraInputs({
                                ...claraInputs,
                                [clarificationKey]: {
                                  ...(claraInputs[clarificationKey] || { explanation: '', proof: '' }),
                                  explanation: e.target.value
                                }
                              })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] font-bold text-zinc-600 uppercase">Verify Objective Proof / Metrics / Location Proof</label>
                            <input
                              type="text"
                              className="w-full text-xs p-2.5 border border-zinc-200 rounded-md bg-white text-zinc-800 font-mono focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 outline-none"
                              placeholder="e.g. Lead Architect role §4, AWS Certified Solution Architect, located in Denver, CO"
                              value={claraInputs[clarificationKey]?.proof || ''}
                              onChange={(e) => setClaraInputs({
                                ...claraInputs,
                                [clarificationKey]: {
                                  ...(claraInputs[clarificationKey] || { explanation: '', proof: '' }),
                                  proof: e.target.value
                                }
                              })}
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setShowClaraFormFor(null)}
                              className="text-xs font-bold border border-zinc-200 bg-white text-zinc-600 px-3 py-1.5 rounded-lg hover:bg-zinc-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => submitGateClarification(clarificationKey)}
                              disabled={isScoring}
                              className="text-xs font-bold bg-slate-900 hover:bg-black text-white px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {isScoring ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Re-scoring...</span>
                                </>
                              ) : (
                                <>
                                  <FileCheck className="w-3.5 h-3.5" />
                                  <span>Submit Proof &amp; Recalculate</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : activeClara.explanation ? (
                        <div className="bg-emerald-50/60 border border-emerald-100 p-3.5 rounded-lg flex flex-col gap-1 text-xs">
                          <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>My Proven Verification:</span>
                          </div>
                          <p className="text-slate-700 font-medium leading-relaxed mt-0.5">{activeClara.explanation}</p>
                          {activeClara.proof && (
                            <p className="text-[10px] text-emerald-700 font-mono mt-1 pt-1.5 border-t border-emerald-100/40">
                              <span className="font-bold uppercase tracking-wider">Audit Trail Evidence:</span> {activeClara.proof}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                
                {hardGateAudit.overallVerdict !== 'CLEAR TO APPLY' && (
                  <div className="p-4 bg-yellow-50/40 border border-yellow-200/70 rounded-lg text-xs leading-relaxed text-zinc-700 font-medium flex items-start gap-2.5">
                    <ShieldAlert className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-zinc-800 block mb-0.5">Staged Disqualification Audit Risk Pending:</span>
                      Providing target justifications and objective proof helps clear these structural gates. Gemini will read your verification and adjust the fit scorecard correctly before you lock in the resume. Let's make sure degree requirements, years of experience, or security clearances match.
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* FIT SECTION */}
          <Card>
            <CardHeader className="bg-zinc-50 border-b pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Career Journey Fit Analysis</CardTitle>
                {getFitBadge(fitAnalysis.overallVerdict)}
              </div>
              <p className="text-sm text-zinc-700 mt-2 font-medium">{fitAnalysis.rationale}</p>
            </CardHeader>
            <CardContent className="pt-6 grid md:grid-cols-2 gap-6">
              <div className="space-y-6">
                 <div>
                    <h4 className="text-xs uppercase font-bold text-zinc-500 mb-3">Dimensions</h4>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between text-sm border-b pb-2">
                         <span className="font-semibold w-1/3">Role Scope</span>
                         <span className="w-2/3 flex flex-col items-end text-right">
                           {getFitBadge(fitAnalysis.roleScopeFit.rating)}
                           <span className="text-xs text-zinc-500 mt-1">{fitAnalysis.roleScopeFit.rationale}</span>
                         </span>
                      </div>
                      <div className="flex items-start justify-between text-sm border-b pb-2">
                         <span className="font-semibold w-1/3">Industry</span>
                         <span className="w-2/3 flex flex-col items-end text-right">
                           {getFitBadge(fitAnalysis.industryDomainFit.rating)}
                           <span className="text-xs text-zinc-500 mt-1">{fitAnalysis.industryDomainFit.rationale}</span>
                         </span>
                      </div>
                      <div className="flex items-start justify-between text-sm border-b pb-2">
                         <span className="font-semibold w-1/3">Stage/Seniority</span>
                         <span className="w-2/3 flex flex-col items-end text-right">
                           {getFitBadge(fitAnalysis.seniorityStageFit.rating)}
                           <span className="text-xs text-zinc-500 mt-1">{fitAnalysis.seniorityStageFit.rationale}</span>
                         </span>
                      </div>
                      <div className="flex items-start justify-between text-sm">
                         <span className="font-semibold w-1/3">Tech & AI</span>
                         <span className="w-2/3 flex flex-col items-end text-right">
                           {getFitBadge(fitAnalysis.technicalAiFit.rating)}
                           <span className="text-xs text-zinc-500 mt-1">{fitAnalysis.technicalAiFit.rationale}</span>
                         </span>
                      </div>
                    </div>
                 </div>
              </div>
              
              <div className="space-y-6">
                 <div>
                    <h4 className="text-xs uppercase font-bold text-green-700 mb-2">Lead With</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1 text-zinc-800">
                      {fitAnalysis.leadWith.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                 </div>
                 <div>
                    <h4 className="text-xs uppercase font-bold text-orange-700 mb-2">Gaps to Handle</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1 text-zinc-800">
                      {fitAnalysis.gaps.map((gap, i) => <li key={i}>{gap}</li>)}
                    </ul>
                 </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-4">
             <Button onClick={() => navigate(`/job/${job.id}/strategy`)}>Proceed to Resume Strategy</Button>
          </div>

        </div>
      )}
    </div>
  );
}
