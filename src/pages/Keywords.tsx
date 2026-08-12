import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Label, Textarea, Input } from '../components/ui';
import { KeywordSignal, ExperienceContext, EvidenceStatus, ClarificationQuestion } from '../types';
import { generateId } from '../lib/utils';
import { mockGenerateKeywordBreakdown, mockGenerateClarifyingQuestions, mockScoreFit, mockAuditHardGates } from '../lib/mock-ai';
import { FileDown, X, RefreshCw, Compass, ArrowRight, HelpCircle, CheckSquare, Sparkles, BookOpen, ShieldAlert, CheckCircle, ShieldCheck, FileCheck, Loader2 } from 'lucide-react';

export default function Keywords() {
  const { id } = useParams();
  const job = useStore((state) => state.jobs[id || '']);
  const updateJob = useStore((state) => state.updateJob);
  const careerJourney = useStore((state) => state.careerJourney);
  const navigate = useNavigate();

  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [activeView, setActiveView] = useState<'table' | 'interviewer' | 'diagnostics'>('table');
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [answers, setAnswers] = useState<Record<string, { text: string; roleId: string; addType: any }>>({});
  const [showClaraFormForGate, setShowClaraFormForGate] = useState<number | null>(null);
  const [claraInputs, setClaraInputs] = useState<Record<string, { explanation: string; proof: string }>>({});


  if (!job) {
    return <div className="p-8 font-sans text-slate-600">Job analysis not found. Please navigate from the Dashboard.</div>;
  }

  const recalculateFitAndGates = async (customContext?: Record<string, ExperienceContext>, customClarifications?: any) => {
    if (!job?.parse) return;
    setIsRecalculating(true);
    
    const activeContext = customContext || job.contextEntries || {};
    const activeClarifications = customClarifications || job.gateClarifications || {};
    
    try {
      const [fit, gates] = await Promise.all([
        mockScoreFit(job.parse, careerJourney, activeContext, activeClarifications),
        mockAuditHardGates(job.parse, careerJourney, activeClarifications)
      ]);

      updateJob(job.id, { 
        fitAnalysis: fit, 
        hardGateAudit: gates, 
        gateClarifications: activeClarifications,
        contextEntries: activeContext
      });
    } catch (error) {
       console.error("Background recalculation error:", error);
    } finally {
      setIsRecalculating(false);
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

    setShowClaraFormForGate(null);
    await recalculateFitAndGates(job.contextEntries, updatedClarifications);
  };

  const handleReanalyze = async () => {
    if (!job.parse) return;
    setIsReanalyzing(true);
    try {
      const newKeywords = await mockGenerateKeywordBreakdown(job.parse, careerJourney);
      updateJob(job.id, { keywords: newKeywords });
      setSelectedKeywordId(null);
    } catch (error) {
      console.error(error);
      alert("Failed to re-analyze keywords");
    } finally {
      setIsReanalyzing(false);
    }
  };

  const keywords = job?.keywords || [];
  const contextEntries = job?.contextEntries || {};

  const loadQuestions = async () => {
    if (!job.parse || !keywords) return;
    setIsGeneratingQuestions(true);
    try {
      const qns = await mockGenerateClarifyingQuestions(job.parse, careerJourney, keywords);
      updateJob(job.id, { clarificationQuestions: qns });
    } catch (e) {
      console.error(e);
      alert("Failed to load clarifying questions from AI.");
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  useEffect(() => {
    if (activeView === 'interviewer' && job && !job.clarificationQuestions && !isGeneratingQuestions) {
      loadQuestions();
    }
  }, [activeView, job?.clarificationQuestions]);

  useEffect(() => {
    if (job?.clarificationQuestions && job.clarificationQuestions.length > 0) {
      const initialAnswers: Record<string, { text: string; roleId: string; addType: any; outcome: string; proof: string }> = {};
      job.clarificationQuestions.forEach((q: any) => {
        const existingEntry = contextEntries[q.keywordId];
        initialAnswers[q.id] = {
          text: existingEntry?.experienceText || '',
          roleId: existingEntry?.targetRoleId || q.targetRoleId || '',
          addType: existingEntry?.proposedAdditionType || q.proposedAdditionType || 'Add new deliverable',
          outcome: existingEntry?.measurableOutcome || '',
          proof: existingEntry?.proof || ''
        };
      });
      setAnswers(initialAnswers);
    }
  }, [job?.clarificationQuestions]);

  useEffect(() => {
    if (job?.parse && (!job.fitAnalysis || !job.hardGateAudit) && !isRecalculating) {
      recalculateFitAndGates();
    }
  }, [id]);

  const handleAnswerQuestion = async (q: any, answerText: string, roleId: string, addType: any, outcome?: string, proof?: string) => {
    if (!answerText.trim()) {
      alert("Please enter some experience text first.");
      return;
    }

    const newId = generateId('CTX');
    const newEntry: ExperienceContext = {
      id: newId,
      keywordId: q.keywordId,
      experienceText: answerText,
      whereItHappened: '',
      whenItHappened: '',
      peopleTeams: '',
      toolsPlatforms: '',
      measurableOutcome: outcome || '',
      proof: proof || '',
      confidenceLevel: 'High',
      canAddToCareerJourney: 'Yes',
      proposedAdditionType: addType,
      targetRoleId: roleId,
      targetDeliverableId: '',
      notes: 'Captured via AI Clarifier Interviewer',
      approvalStatus: 'Approved for patch'
    };

    const updatedContext = {
      ...contextEntries,
      [q.keywordId]: newEntry
    };

    updateJob(job.id, {
      contextEntries: updatedContext
    });

    const updatedKeywords = keywords.map(kw => 
      kw.id === q.keywordId 
        ? { ...kw, userContextStatus: 'Approved for patch' as const, evidenceStatus: 'EVIDENCED' as const }
        : kw
    );
    updateJob(job.id, { keywords: updatedKeywords });
    
    // Background live recalculation
    recalculateFitAndGates(updatedContext);
    
    alert(`Evidence for "${q.keywordPhrase}" has been captured and added to your Patch Staging! Live Fit scorecard is updating.`);
  };

  const selectedKeyword = keywords.find(k => k.id === selectedKeywordId);
  const selectedContext = selectedKeyword ? contextEntries[selectedKeyword.id] : null;

  // Local state for the context form when a row is clicked
  const [formData, setFormData] = useState<Partial<ExperienceContext>>({});

  const handleSelect = (kw: KeywordSignal) => {
    setSelectedKeywordId(kw.id);
    if (contextEntries[kw.id]) {
      setFormData(contextEntries[kw.id]);
    } else {
      setFormData({
        keywordId: kw.id,
        experienceText: '',
        whereItHappened: '',
        whenItHappened: '',
        peopleTeams: '',
        toolsPlatforms: '',
        measurableOutcome: '',
        proof: '',
        confidenceLevel: 'Medium',
        canAddToCareerJourney: 'Yes',
        proposedAdditionType: 'Add new deliverable',
        targetRoleId: '',
        targetDeliverableId: '',
        notes: '',
        approvalStatus: 'Not reviewed'
      });
    }
  };

  const handleContextChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const saveContext = (status?: ExperienceContext['approvalStatus']) => {
    if (!selectedKeywordId) return;
    const activeStatus = status || formData.approvalStatus || 'Not reviewed';
    
    // Sync back to form state to prevent any asynchronous stale overrides
    if (status && status !== formData.approvalStatus) {
      setFormData(prev => ({ ...prev, approvalStatus: status }));
    }

    const newEntry: ExperienceContext = {
      ...(formData as ExperienceContext),
      approvalStatus: activeStatus,
      id: formData.id || generateId('CTX')
    };
    
    const updatedContext = {
      ...contextEntries,
      [selectedKeywordId]: newEntry
    };

    updateJob(job.id, {
      contextEntries: updatedContext
    });

    const updatedKeywords = keywords.map(kw => 
      kw.id === selectedKeywordId 
        ? { ...kw, userContextStatus: activeStatus, evidenceStatus: activeStatus === 'Approved for patch' ? ('EVIDENCED' as const) : kw.evidenceStatus }
        : kw
    );
    updateJob(job.id, { keywords: updatedKeywords });

    // Background live recalculation
    recalculateFitAndGates(updatedContext);
  };

  const setApproval = (status: ExperienceContext['approvalStatus']) => {
    setFormData(prev => ({ ...prev, approvalStatus: status }));
  };

  const getStatusDisplay = (kw: KeywordSignal, ctx?: ExperienceContext) => {
    if (kw.evidenceStatus === 'EVIDENCED' || ctx?.approvalStatus === 'Approved for patch') {
      return (
        <div className="flex items-center text-green-600 font-medium text-xs">
          <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
      );
    }
    if (ctx?.approvalStatus === 'Rejected' || kw.evidenceStatus === 'NOT SUPPORTED') {
      return (
        <div className="flex items-center text-rose-500 space-x-1 font-medium text-xs">
          <X className="w-4 h-4" />
          <span>gap</span>
        </div>
      );
    }
    return (
      <div className="flex items-center text-amber-500 space-x-1 font-medium text-xs">
        <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
           <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span>add</span>
      </div>
    );
  };

  const getPlanDisplay = (kw: KeywordSignal, ctx?: ExperienceContext) => {
    if (ctx?.approvalStatus === 'Approved for patch' && ctx.experienceText) {
      return (
        <div className="space-y-1.5 py-1">
          <p className="text-slate-800 text-sm leading-relaxed font-medium">"{ctx.experienceText}"</p>
          {(ctx.measurableOutcome || ctx.proof) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ctx.measurableOutcome && (
                <span className="text-[10px] bg-brand-50 border border-brand-100 font-medium px-2 py-0.5 rounded text-brand-700 block">
                  <strong className="font-bold">Metric:</strong> {ctx.measurableOutcome}
                </span>
              )}
              {ctx.proof && (
                <span className="text-[10px] bg-emerald-50 border border-emerald-100 font-semibold px-2 py-0.5 rounded text-emerald-800 block">
                  <strong className="font-bold">✓ Proof:</strong> {ctx.proof}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }
    if (kw.currentAnchor) {
      return <span className="text-slate-800 text-sm leading-relaxed">{kw.currentAnchor}</span>;
    }
    return <span className="text-slate-500 text-sm leading-relaxed italic">{kw.whatCouldCount}</span>;
  };

  const topCritical = keywords.filter(k => k.isTopCritical);
  const secondary = keywords.filter(k => !k.isTopCritical);

  const exportCSV = () => {
    const headers = ["Keyword", "Category", "Status", "My Experience", "Context Approved"];
    const rows = keywords.map(kw => {
      const ctx = contextEntries[kw.id];
      return [
        `"${kw.phrase}"`,
        kw.category,
        kw.evidenceStatus,
        `"${ctx?.experienceText || ''}"`,
        ctx?.approvalStatus || 'None'
      ].join(",");
    });
    const csvContext = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContext], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keywords_${job.companyName}.csv`;
    a.click();
  };

  const renderTableRows = (items: KeywordSignal[]) => {
    return items.map((kw, idx) => {
      const ctx = contextEntries[kw.id];
      const isSelected = kw.id === selectedKeywordId;
      
      let highlightClass = 'border-t border-slate-200';
      
      return (
        <TableRow 
          key={kw.id} 
          className={`${highlightClass} ${isSelected ? 'bg-brand-50/50 outline outline-1 outline-brand-200 z-10 relative cursor-pointer' : 'cursor-pointer hover:bg-slate-50/50 transition-colors'}`}
          onClick={() => handleSelect(kw)}
        >
          <TableCell className="align-top py-4">
            <span className="text-slate-400 font-mono text-xs">{idx + 1}</span>
          </TableCell>
          <TableCell className="align-top py-4 max-w-[250px]">
            <div className="font-bold text-slate-800 text-[13px] leading-snug">{kw.phrase}</div>
            <div className="text-[11px] text-slate-500 font-medium mt-1 uppercase tracking-wider">{kw.category}</div>
          </TableCell>
          <TableCell className="align-top py-4">
            {getStatusDisplay(kw, ctx)}
          </TableCell>
          <TableCell className="align-top py-4">
            {getPlanDisplay(kw, ctx)}
          </TableCell>
        </TableRow>
      );
    });
  };

  if (!keywords || keywords.length === 0) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto p-8 font-sans">
        <Card className="border-slate-200 shadow-xl overflow-hidden mt-8">
          <CardHeader className="bg-slate-50/70 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center shadow-inner">
                <Compass className="w-6 h-6 text-brand-600 animate-spin" style={{ animationDuration: '6s' }} />
              </div>
              <div>
                <CardTitle className="text-2xl font-extrabold text-slate-900">Keywords & Experience Signal Mapping</CardTitle>
                <p className="text-sm text-slate-500 font-medium">Extract ATS keywords from the Job Description and map matching score evidence.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-10 text-center space-y-8 px-8 pb-10">
            <div className="max-w-md mx-auto space-y-3">
              <div className="w-20 h-20 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-brand-100">
                <Sparkles className="w-10 h-10 text-brand-500 animate-bounce" style={{ animationDuration: '3s' }} />
              </div>
              <h3 className="text-xl font-extrabold text-slate-800">No Keyword Signals Matched Yet</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                To evaluate your match score and calculate tenure overlap, Gemini must parse the Job Description and compare it directly to your Career Journey.
              </p>
            </div>

            <div className="max-w-lg mx-auto bg-slate-50 border border-slate-100 rounded-xl p-6 text-left space-y-4 shadow-sm">
              <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Onboarding Checklist:</h4>
              <div className="flex items-center justify-between text-xs pb-3 border-b border-slate-200">
                <span className="flex items-center gap-2 text-slate-600">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  Job Description parsed successfully
                </span>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold">Ready</Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-600 font-medium">
                  {careerJourney ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Candidate Career Journey profile: <strong className="font-bold text-slate-800">Ready</strong>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-4 h-4 text-amber-500 animate-pulse" />
                      Candidate Career Journey profile: <span className="text-amber-600 font-bold">Empty Profile</span>
                    </>
                  )}
                </span>
                {careerJourney ? (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold">Ready</Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 font-bold">Missing</Badge>
                )}
              </div>

              {!careerJourney && (
                <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-lg text-xs space-y-3">
                  <p className="text-amber-800 leading-relaxed font-serif italic">
                    "You will get much better ATS results if you load your Career Journey or use our complete demo profile before proceeding with matching."
                  </p>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-sm"
                      onClick={() => navigate('/journey')}
                    >
                      Go to Journey Cockpit
                    </Button>
                    <Button 
                      size="sm" 
                      className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md shadow-amber-600/20"
                      onClick={() => {
                        const sample = {
                          meta: { owner: "Sample Engineer", version: "1.0.0", last_updated: new Date().toISOString().split('T')[0] },
                          roles: [
                            { id: "ROLE-001", company: "Stripe", organization: "Stripe", title: "Lead Software Engineer", dates: "2023 - Present", skills: ["TypeScript", "API Design", "Performance Tuning"], deliverables: [] }
                          ]
                        };
                        useStore.getState().setCareerJourney(sample);
                        alert("Demo Profile Loaded! Click 'Extract Keywords' below to proceed with matching.");
                      }}
                    >
                      Load Demo Profile
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 max-w-sm mx-auto">
              <Button 
                onClick={handleReanalyze} 
                disabled={isReanalyzing} 
                className="w-full py-4 bg-brand-600 hover:bg-brand-700 text-white font-extrabold rounded-lg shadow-lg shadow-brand-500/20 text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
              >
                {isReanalyzing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Extricating Keywords via Gemini...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Extract Keywords & Auto-Match Experience
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-full absolute inset-0 text-slate-900 bg-white">
      {/* Left Table Area */}
      <div className="flex-1 flex flex-col pt-8 pl-8 pr-12 pb-8 overflow-hidden z-0">
        <div className="flex justify-between items-end mb-8 px-4">
          <div className="space-y-1">
            <h3 className="text-[28px] font-extrabold text-slate-900 tracking-tight">Keyword recognition & Evidence Mapping</h3>
            <p className="text-sm text-slate-500 font-medium font-serif">Extracting semantic signals from JD and matching against CJ v3.3</p>
          </div>
          <div className="flex space-x-2 items-center">
             <Button variant="outline" size="sm" onClick={handleReanalyze} disabled={isReanalyzing} className="border-slate-200 text-slate-600 bg-white font-bold text-xs tracking-wide">
               <RefreshCw className={`w-4 h-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} /> 
               {isReanalyzing ? 'RE-ANALYZING...' : 'RE-ANALYZE JD'}
             </Button>
             <Button variant="outline" size="sm" onClick={exportCSV} className="border-slate-200 text-slate-600 bg-white font-bold text-xs tracking-wide">
               <FileDown className="w-4 h-4 mr-2" /> EXPORT CSV
             </Button>
             <button className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs px-4 py-2 rounded-md shadow-sm transition-all flex items-center" onClick={() => {
              updateJob(job.id, { status: 'Context Captured' });
              navigate(`/job/${job.id}/patch`);
             }}>
               STAGE PATCH &rarr;
             </button>
          </div>
        </div>

        {/* Live Target Match Scoreboard (Hybrid View Integration) */}
        <div className="mb-6 px-4">
          <Card className={`${isRecalculating ? 'border-amber-200 bg-amber-50/10 animate-pulse' : 'border-slate-100 bg-slate-50/40'} p-4 shadow-sm transition-all`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-sans">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Live Fit Status:</span>
                  {job.fitAnalysis ? (
                    <Badge variant={job.fitAnalysis.overallVerdict === 'PASS' ? 'success' : job.fitAnalysis.overallVerdict === 'BORDERLINE' ? 'warning' : 'destructive'} className="font-bold">
                      {job.fitAnalysis.overallVerdict}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">NOT CALCULATED</Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">ATS Hard Gates:</span>
                  {job.hardGateAudit ? (
                    <Badge variant={job.hardGateAudit.overallVerdict === 'CLEAR TO APPLY' ? 'success' : job.hardGateAudit.overallVerdict === 'VERIFY FIRST' ? 'warning' : 'destructive'} className="font-bold">
                      {job.hardGateAudit.overallVerdict}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">NOT COMPLIANT</Badge>
                  )}
                </div>

                {job.fitAnalysis && job.hardGateAudit && (
                  <div className="text-xs text-slate-600 line-clamp-1 max-w-[400px]">
                    {job.hardGateAudit.overallVerdict === 'CLEAR TO APPLY' 
                      ? "✓ Structural fields clear. Match is healthy!" 
                      : "⚠️ Unresolved ATS gates! Resolve in the Scorecard tab below."}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  type="button"
                  variant="outline" 
                  size="sm" 
                  onClick={() => recalculateFitAndGates()} 
                  disabled={isRecalculating} 
                  className="h-8 border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-bold font-sans"
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRecalculating ? 'animate-spin text-brand-500' : 'text-slate-500'}`} />
                  {isRecalculating ? 'CALCULATING...' : 'LIVE RE-SCORE'}
                </Button>
              </div>
            </div>
            
            {/* Auto-sync hint */}
            <div className="mt-2 text-[10px] text-slate-400 font-medium">
              ⚡ As you type context or answer interviewer questions, your match metrics automatically recalculate.
            </div>
          </Card>
        </div>

        {/* Tab Switching Menu */}
        <div className="flex border-b border-slate-200 mb-6 px-4">
          <button 
            type="button"
            onClick={() => setActiveView('table')}
            className={`py-3 px-6 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 ${activeView === 'table' ? 'border-brand-600 text-brand-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Keyword Evidence Table</span>
          </button>
          <button 
            type="button"
            onClick={() => setActiveView('interviewer')}
            className={`relative py-3 px-6 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 ${activeView === 'interviewer' ? 'border-brand-600 text-brand-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>AI Deep-Capture Interviewer</span>
            {keywords.some(k => k.evidenceStatus === 'PARTIAL' || k.evidenceStatus === 'MISSING / POSSIBLE') && (
              <Badge className="bg-amber-100 text-amber-700 border-none text-[10px] px-1.5 py-px font-bold">Recommended</Badge>
            )}
          </button>
          <button 
            type="button"
            onClick={() => {
              setActiveView('diagnostics');
              if (job.parse && (!job.fitAnalysis || !job.hardGateAudit)) {
                recalculateFitAndGates();
              }
            }}
            className={`relative py-3 px-6 font-semibold text-sm border-b-2 transition-all flex items-center gap-2 ${activeView === 'diagnostics' ? 'border-brand-600 text-brand-600 font-bold' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <span>Live Fit &amp; ATS Scorecard</span>
            {job.hardGateAudit?.overallVerdict !== 'CLEAR TO APPLY' && (
              <Badge className="bg-rose-100 text-rose-700 border-none text-[10px] px-1.5 py-px font-bold">Gaps</Badge>
            )}
          </button>
        </div>

        {activeView === 'table' ? (
          <div className="flex-1 overflow-y-auto px-4 pb-12 space-y-12">
            {topCritical.length > 0 && (
              <div>
                <h4 className="text-base font-bold text-slate-900 border-b-2 border-slate-200 pb-3 mb-2 font-serif tracking-tight">Top critical skills <span className="font-normal text-slate-500">(all must be present to pass the gate)</span></h4>
                <Table className="border-b border-slate-200">
                  <TableHeader className="bg-transparent hover:bg-transparent">
                    <TableRow className="border-none hover:bg-transparent">
                      <TableHead className="w-10 text-slate-900 font-bold">#</TableHead>
                      <TableHead className="text-slate-900 font-bold">Keyword / phrase</TableHead>
                      <TableHead className="w-32 text-slate-900 font-bold">Status</TableHead>
                      <TableHead className="text-slate-900 font-bold">Where it lands</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renderTableRows(topCritical)}
                  </TableBody>
                </Table>
              </div>
            )}

            {secondary.length > 0 && (
              <div>
                <h4 className="text-base font-bold text-slate-900 border-b-2 border-slate-200 pb-3 mb-2 font-serif tracking-tight">Secondary keywords <span className="font-normal text-slate-500">(weighted, contribute to the 85% gate)</span></h4>
                <Table className="border-b border-slate-200">
                  <TableHeader className="bg-transparent hover:bg-transparent">
                    <TableRow className="border-none hover:bg-transparent">
                      <TableHead className="w-10 text-slate-900 font-bold">#</TableHead>
                      <TableHead className="text-slate-900 font-bold">Keyword / phrase</TableHead>
                      <TableHead className="w-32 text-slate-900 font-bold">Status</TableHead>
                      <TableHead className="text-slate-900 font-bold">Plan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renderTableRows(secondary)}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : activeView === 'interviewer' ? (
          <div className="flex-1 overflow-y-auto px-4 pb-12 space-y-6 animate-fade-in">
            <Card className="p-6 bg-gradient-to-r from-slate-50 to-brand-50/35 border-brand-100 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-brand-100 border border-brand-200 text-brand-700 rounded-xl shadow-inner shrink-0">
                  <Sparkles className="w-6 h-6 text-brand-600 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-base">Unlocking Hidden Evidence with AI</h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Based on the Job Description for <strong className="text-slate-700 font-semibold">{job.companyName}</strong>, some required skills are missing or weak in your master Career Journey. 
                    Answer these specialized context-seeking questions to automatically generate structured resume achievements/deliverables which will update your profile.
                  </p>
                </div>
              </div>
            </Card>

            {isGeneratingQuestions ? (
              <div className="py-24 text-center">
                <RefreshCw className="w-8 h-8 text-brand-600 animate-spin mx-auto mb-4" />
                <p className="text-sm font-medium text-slate-600 animate-pulse">Gemini is analyzing requirements gaps and compiling targeted interview questions...</p>
              </div>
            ) : (!job.clarificationQuestions || job.clarificationQuestions.length === 0) ? (
              <div className="py-24 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <HelpCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h5 className="font-bold text-slate-700">No Questions Generated</h5>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">We couldn't detect any immediate missing critical requirements, or they need to be compiled.</p>
                <Button onClick={loadQuestions} className="mt-4 bg-brand-600 text-white font-bold">
                  Compile Gaps &amp; Interview Me
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {job.clarificationQuestions.map((q) => {
                  const keyword = keywords.find(k => k.id === q.keywordId);
                  const existingContext = contextEntries[q.keywordId];
                  const ans = answers[q.id] || { text: '', roleId: q.targetRoleId || '', addType: q.proposedAdditionType || 'Add new deliverable' };
                  
                  return (
                    <Card key={q.id} className="p-6 border-l-4 border-l-amber-500 hover:border-l-brand-600 transition-all shadow-sm">
                      <div className="flex flex-col md:flex-row gap-6">
                        {/* Question Column */}
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] uppercase font-bold">
                              Gap: {q.keywordPhrase}
                            </Badge>
                            {existingContext && (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] font-bold">
                                Added to Patch Staging
                              </Badge>
                            )}
                          </div>
                          
                          <h5 className="font-extrabold text-slate-800 text-[15px] tracking-tight leading-snug">
                            {q.questionText}
                          </h5>
                          
                          <p className="text-xs text-slate-500 bg-slate-100 p-2.5 rounded-lg font-mono">
                            <span className="font-bold text-slate-600">Tip:</span> {q.suggestedAction}
                          </p>
                        </div>

                        {/* Answers Input Column */}
                        <div className="flex-1 space-y-4">
                          <div className="space-y-1">
                            <Label className="text-xs font-bold text-slate-600 uppercase">Your Answer / Experience Context</Label>
                            <Textarea
                              value={ans.text}
                              onChange={(e) => setAnswers(prev => ({
                                ...prev,
                                [q.id]: { ...ans, text: e.target.value }
                              }))}
                              placeholder="Describe a project, scenario, platform, or metrics..."
                              className="text-xs min-h-[80px]"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-slate-500 uppercase">Measurable Outcome / Metric Impact</Label>
                              <Input
                                value={ans.outcome || ''}
                                onChange={(e) => setAnswers(prev => ({
                                  ...prev,
                                  [q.id]: { ...ans, outcome: e.target.value }
                                }))}
                                placeholder="e.g. Spanner CPU usage down 45%"
                                className="text-xs bg-white"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-slate-500 uppercase">Objective Proof / Verification Trail</Label>
                              <Input
                                value={ans.proof || ''}
                                onChange={(e) => setAnswers(prev => ({
                                  ...prev,
                                  [q.id]: { ...ans, proof: e.target.value }
                                }))}
                                placeholder="e.g. Datadog Dashboard, Oso §2.1"
                                className="text-xs font-mono bg-white"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-[10px] font-bold text-slate-500 uppercase">Target Role back-map</Label>
                              <select 
                                value={ans.roleId} 
                                onChange={(e) => setAnswers(prev => ({
                                  ...prev,
                                  [q.id]: { ...ans, roleId: e.target.value }
                                }))}
                                className="w-full text-xs border border-slate-200 rounded p-1.5 font-medium bg-white text-slate-700"
                              >
                                <option value="">-- Choose Role --</option>
                                {(Array.isArray(careerJourney?.roles) ? careerJourney.roles : []).map((r: any) => (
                                  <option key={r.id} value={r.id}>{r.title} at {r.organization}</option>
                                ))}
                              </select>
                            </div>
                            
                            <div>
                              <Label className="text-[10px] font-bold text-slate-500 uppercase">Integration Type</Label>
                              <select 
                                value={ans.addType} 
                                onChange={(e) => setAnswers(prev => ({
                                  ...prev,
                                  [q.id]: { ...ans, addType: e.target.value }
                                }))}
                                className="w-full text-xs border border-slate-200 rounded p-1.5 font-medium bg-white text-slate-700 font-sans"
                              >
                                <option value="Add new deliverable">Add new deliverable</option>
                                <option value="Add new achievement">Add new achievement</option>
                                <option value="Add new skill">Add new skill</option>
                                <option value="Update existing deliverable">Update existing deliverable</option>
                              </select>
                            </div>
                          </div>

                          <div className="pt-2 flex justify-end">
                            <Button
                              onClick={() => handleAnswerQuestion(q, ans.text, ans.roleId, ans.addType, ans.outcome, ans.proof)}
                              disabled={isRecalculating}
                              className="bg-slate-900 hover:bg-black text-white text-xs font-bold font-sans flex items-center gap-1.5 min-w-[200px] justify-center"
                            >
                              {isRecalculating ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Recalculating Fit...</span>
                                </>
                              ) : (
                                <>
                                  <span>Approve &amp; Add to Patch</span>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pb-12 space-y-6 animate-fade-in font-sans">
            {!job.fitAnalysis || !job.hardGateAudit ? (
              <div className="py-24 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <RefreshCw className="w-8 h-8 text-brand-600 animate-spin mx-auto mb-4" />
                <h5 className="font-bold text-slate-700">Analyzing Credentials Gaps &amp; Match Level</h5>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto font-sans">Gemini is evaluating your profile against the strict parameters of this job description...</p>
              </div>
            ) : (
              <div className="space-y-6 text-slate-900">
                {/* HARD STRUCTURED FIELD GATES SECTION */}
                <Card className={`border-2 ${job.hardGateAudit.overallVerdict === 'LIKELY AUTO-REJECT' ? 'border-red-500 bg-red-50/5' : job.hardGateAudit.overallVerdict === 'VERIFY FIRST' ? 'border-amber-400 bg-amber-50/5' : 'border-slate-100'}`}>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5 font-sans">
                          <CheckCircle className="w-5 h-5 text-brand-600" />
                          ATS Structured-Field Audit
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5 py-0.5 font-sans">Objective evaluation of hard disqualifiers (degree, location, work authorization, clearance).</p>
                      </div>
                      <Badge variant={job.hardGateAudit.overallVerdict === 'CLEAR TO APPLY' ? 'success' : job.hardGateAudit.overallVerdict === 'VERIFY FIRST' ? 'warning' : 'destructive'} className="font-bold text-xs uppercase px-2.5 py-1">
                        {job.hardGateAudit.overallVerdict}
                      </Badge>
                    </div>

                    <div className="space-y-4">
                      {job.hardGateAudit.gates.map((gate, i) => {
                        const clarificationKey = gate.category || gate.requirement;
                        const activeClara = (job.gateClarifications || {})[clarificationKey] || { explanation: '', proof: '' };
                        return (
                          <div key={i} className="p-4 border border-slate-100 hover:border-slate-200 rounded-xl bg-white space-y-3 shadow-sm transition-all font-sans">
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                              <div className="flex items-start gap-3 flex-1">
                                <div className="shrink-0 mt-0.5">
                                  <Badge variant={gate.verdict === 'CLEAR' ? 'success' : gate.verdict === 'UNCERTAIN' ? 'warning' : 'destructive'} className="text-[10px] py-0.5 px-2 font-bold uppercase">
                                    {gate.verdict}
                                  </Badge>
                                </div>
                                <div className="flex-1">
                                  <h5 className="font-bold text-slate-800 text-sm mb-0.5">{gate.category}</h5>
                                  <p className="text-[10px] font-semibold text-slate-500 bg-slate-100 inline-block px-1.5 py-0.5 rounded mb-2 font-mono">{gate.requirement}</p>
                                  <p className="text-xs text-slate-600 leading-relaxed font-serif">{gate.reason}</p>
                                  <p className="text-[10px] font-medium text-slate-400 mt-1">Recommended Action: {gate.suggestedAction}</p>
                                </div>
                              </div>

                              {showClaraFormForGate !== i && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowClaraFormForGate(i);
                                    setClaraInputs({
                                      ...claraInputs,
                                      [clarificationKey]: {
                                        explanation: activeClara.explanation,
                                        proof: activeClara.proof
                                      }
                                    });
                                  }}
                                  className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1 bg-brand-50/70 hover:bg-brand-50 px-2.5 py-1 border border-brand-100/60 rounded-md transition-all self-end md:self-start shrink-0"
                                >
                                  <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                                  <span>{activeClara.explanation ? 'Edit Clarification' : 'Bypass with Proof'}</span>
                                </button>
                              )}
                            </div>

                            {showClaraFormForGate === i ? (
                              <div className="space-y-3 bg-slate-50 border border-slate-200/50 p-4 rounded-lg">
                                <div className="flex justify-between items-center pb-1 border-b border-slate-100">
                                  <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-widest flex items-center gap-1">
                                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                    Provide Verification Proof
                                  </span>
                                  <button 
                                    type="button" 
                                    onClick={() => setShowClaraFormForGate(null)} 
                                    className="text-xs text-slate-400 hover:text-slate-600 font-medium"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                <div className="space-y-1">
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase">My Explanation / Bypassing Statement</label>
                                  <textarea
                                    rows={2}
                                    className="w-full text-xs p-2.5 border border-slate-200 rounded bg-white text-slate-800 font-medium focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 outline-none"
                                    placeholder="e.g. Yes, I worked extensively with Spanner for 4 years, or yes I hold a BA degree..."
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
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Audit Trail Verification / Proof Location</label>
                                  <input
                                    type="text"
                                    className="w-full text-xs p-2 border border-slate-200 rounded bg-white text-slate-800 font-mono focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 outline-none"
                                    placeholder="e.g. Lead Architect role §4, AWS Solution Architect Certificate, located in Denver, CO"
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
                                    onClick={() => setShowClaraFormForGate(null)}
                                    className="text-xs font-bold border border-slate-200 bg-white text-slate-600 px-3 py-1 rounded hover:bg-slate-50 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => submitGateClarification(clarificationKey)}
                                    disabled={isRecalculating}
                                    className="text-xs font-bold bg-slate-900 hover:bg-black text-white px-3 py-1 rounded flex items-center gap-1 transition-colors disabled:opacity-50 font-sans"
                                  >
                                    {isRecalculating ? (
                                      <>
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        <span>Syncing...</span>
                                      </>
                                    ) : (
                                      <>
                                        <FileCheck className="w-3.5 h-3.5" />
                                        <span>Submit Verification Proof</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            ) : activeClara.explanation ? (
                              <div className="bg-emerald-50/70 border border-emerald-100 p-3 rounded-lg text-xs font-sans">
                                <div className="flex items-center gap-1.5 text-emerald-800 font-bold mb-1">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>My Verified Verification Statement:</span>
                                </div>
                                <p className="text-slate-700 leading-relaxed font-serif">{activeClara.explanation}</p>
                                {activeClara.proof && (
                                  <p className="text-[10px] text-emerald-700 font-mono mt-1 pt-1 border-t border-emerald-100/40">
                                    <span className="font-semibold uppercase tracking-wider">Proof Location:</span> {activeClara.proof}
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* CAREER JOURNEY FIT CARD */}
                <Card className="border border-slate-100 bg-white shadow-sm font-sans">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-base flex items-center gap-1.5">
                          <Compass className="w-5 h-5 text-brand-500" />
                          Career Journey Match Dynamics
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">Deep match score of experience depth, scope, seniority tier, and technology fit.</p>
                      </div>
                      <Badge variant={job.fitAnalysis.overallVerdict === 'PASS' ? 'success' : job.fitAnalysis.overallVerdict === 'BORDERLINE' ? 'warning' : 'destructive'} className="font-bold text-xs uppercase px-2.5 py-1">
                        Fit Level: {job.fitAnalysis.overallVerdict}
                      </Badge>
                    </div>

                    <p className="text-sm text-slate-700 leading-relaxed font-serif border-l-2 border-brand-200 pl-4 py-1 italic mb-6">
                      "{job.fitAnalysis.rationale}"
                    </p>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h5 className="text-[11px] uppercase font-bold tracking-widest text-slate-400">Match Dimensions</h5>
                        <div className="space-y-3">
                          <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">Role Scope Match:</span>
                            <div className="text-right">
                              <Badge variant={job.fitAnalysis.roleScopeFit.rating === 'Strong' ? 'success' : job.fitAnalysis.roleScopeFit.rating === 'Moderate' ? 'warning' : 'destructive'} className="font-bold text-[10px]">
                                {job.fitAnalysis.roleScopeFit.rating}
                              </Badge>
                              <p className="text-[10px] text-slate-500 mt-1 max-w-[180px] break-words">{job.fitAnalysis.roleScopeFit.rationale}</p>
                            </div>
                          </div>
                          <div className="flex justify-between items-start border-b border-slate-100 pb-2 border-t-0 border-x-0">
                            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">Industry Match:</span>
                            <div className="text-right">
                              <Badge variant={job.fitAnalysis.industryDomainFit.rating === 'Strong' ? 'success' : job.fitAnalysis.industryDomainFit.rating === 'Moderate' ? 'warning' : 'destructive'} className="font-bold text-[10px]">
                                {job.fitAnalysis.industryDomainFit.rating}
                              </Badge>
                              <p className="text-[10px] text-slate-500 mt-1 max-w-[180px] break-words">{job.fitAnalysis.industryDomainFit.rationale}</p>
                            </div>
                          </div>
                          <div className="flex justify-between items-start border-b border-slate-100 pb-2 border-t-0 border-x-0">
                            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">Seniority Match:</span>
                            <div className="text-right">
                              <Badge variant={job.fitAnalysis.seniorityStageFit.rating === 'Strong' ? 'success' : job.fitAnalysis.seniorityStageFit.rating === 'Moderate' ? 'warning' : 'destructive'} className="font-bold text-[10px]">
                                {job.fitAnalysis.seniorityStageFit.rating}
                              </Badge>
                              <p className="text-[10px] text-slate-500 mt-1 max-w-[180px] break-words">{job.fitAnalysis.seniorityStageFit.rationale}</p>
                            </div>
                          </div>
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">Tech &amp; AI Match:</span>
                            <div className="text-right">
                              <Badge variant={job.fitAnalysis.technicalAiFit.rating === 'Strong' ? 'success' : job.fitAnalysis.technicalAiFit.rating === 'Moderate' ? 'warning' : 'destructive'} className="font-bold text-[10px]">
                                {job.fitAnalysis.technicalAiFit.rating}
                              </Badge>
                              <p className="text-[10px] text-slate-500 mt-1 max-w-[180px] break-words">{job.fitAnalysis.technicalAiFit.rationale}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h5 className="text-[11px] uppercase font-bold tracking-widest text-emerald-600 mb-2">Lead With (Strengths)</h5>
                          <ul className="list-disc pl-4 text-xs space-y-1.5 text-slate-700 font-serif">
                            {job.fitAnalysis.leadWith.map((item, index) => <li key={index}>{item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <h5 className="text-[11px] uppercase font-bold tracking-widest text-amber-600 mb-2">Gaps to Handle</h5>
                          <ul className="list-disc pl-4 text-xs space-y-1.5 text-slate-700 font-serif">
                            {job.fitAnalysis.gaps.map((item, index) => <li key={index}>{item}</li>)}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side Detail Panel */}
      {selectedKeyword && (
        <aside className="w-[450px] bg-white border-l border-slate-200 flex flex-col shadow-2xl relative z-10 shrink-0">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between mb-4">
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Active Review</span>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setSelectedKeywordId(null)}><X className="w-5 h-5"/></button>
            </div>
            <h4 className="text-xl font-bold text-slate-800">{selectedKeyword.phrase}</h4>
            <div className="text-xs text-slate-500 mt-2 space-y-2">
              <p><span className="font-semibold text-slate-700">What could count:</span> {selectedKeyword.whatCouldCount}</p>
              {selectedKeyword.evidenceStatus !== 'EVIDENCED' && (
                <p className="p-2 bg-brand-50 text-brand-800 rounded-md border border-brand-100 italic">"{selectedKeyword.recognitionPrompt}"</p>
              )}
            </div>
          </div>
          
          <div className="flex-1 p-6 space-y-6 overflow-y-auto">
             {selectedKeyword.evidenceStatus === 'HARD GATE' ? (
                <div className="text-sm text-red-600 bg-red-50 p-4 border rounded-md">
                  This is a structured HR gate. It belongs in the ATS risk audit, not here.
                </div>
             ) : (
               <>
                 <section>
                   <Label>My Real Experience / Evidence</Label>
                   <Textarea 
                     name="experienceText" 
                     value={formData.experienceText || ''} 
                     onChange={handleContextChange} 
                     className="bg-amber-50/20" 
                     placeholder="Describe a specific situation..." 
                   />
                 </section>
                 
                 <div className="grid grid-cols-2 gap-4">
                   <section>
                      <Label>Target Career Role</Label>
                      <select name="targetRoleId" value={formData.targetRoleId || ''} onChange={handleContextChange} className="w-full border border-slate-200 rounded p-2 text-xs bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                        <option value="">-- Select Role --</option>
                        {(Array.isArray(careerJourney?.roles) ? careerJourney.roles : []).map((r: any) => (
                           <option key={r.id || r.title || r.company} value={r.id || r.title || r.company}>{r.title || r.id} {r.company ? `at ${r.company}` : ''}</option>
                        ))}
                        <option value="other">Other / Not Listed</option>
                      </select>
                   </section>
                  <section>
                    <Label>Measurable Outcome / Metric Impact</Label>
                    <Input name="measurableOutcome" value={formData.measurableOutcome || ''} onChange={handleContextChange} className="bg-white" placeholder="e.g. latency cut by 45%, $50K saved" />
                  </section>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <section>
                    <Label>Tools / Platforms used</Label>
                    <Input name="toolsPlatforms" value={formData.toolsPlatforms || ''} onChange={handleContextChange} className="bg-white" placeholder="e.g. AWS, Spanner" />
                  </section>
                  <section>
                    <Label>Objective Verification / Proof Trail</Label>
                    <Input name="proof" value={formData.proof || ''} onChange={handleContextChange} className="bg-white font-mono text-xs" placeholder="e.g. Oso Portfolio §2.1" />
                  </section>
                </div>

                 <div className="grid grid-cols-2 gap-4">
                    <section>
                      <Label>Target Action</Label>
                      <select name="proposedAdditionType" value={formData.proposedAdditionType || ''} onChange={handleContextChange} className="w-full border border-slate-200 rounded p-2 text-xs bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                        <option value="Add new deliverable">Add new deliverable</option>
                        <option value="Update existing deliverable">Update existing deliverable</option>
                        <option value="Add new achievement">Add new achievement</option>
                        <option value="Add new skill">Add new skill</option>
                        <option value="Add new capability/function">Add new capability/function</option>
                        <option value="Do not add, resume-only context">Resume-only context (Don't patch)</option>
                      </select>
                    </section>
                    {(formData.proposedAdditionType === 'Update existing deliverable' || formData.proposedAdditionType === 'Update existing achievement') && formData.targetRoleId && (
                      <section>
                        <Label>Target Item to Update</Label>
                        <select name="targetDeliverableId" value={formData.targetDeliverableId || ''} onChange={handleContextChange} className="w-full border border-slate-200 rounded p-2 text-xs bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                          <option value="">-- Select Item --</option>
                          {(() => {
                            const roles = (Array.isArray(careerJourney?.roles) ? careerJourney.roles : []);
                            const selectedRole = roles.find((r: any) => (r.id || r.title || r.company) === formData.targetRoleId);
                            if (!selectedRole) return null;
                            const items = formData.proposedAdditionType === 'Update existing achievement' ? selectedRole.achievements : selectedRole.deliverables;
                            if (!Array.isArray(items)) return null;
                            return items.map((item: any, i: number) => (
                              <option key={item.id || i} value={item.id || i}>{item.id ? `${item.id}: ` : ''}{item.description || item.title || item.phrase || `Item #${i}`}</option>
                            ));
                          })()}
                        </select>
                      </section>
                    )}
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <section>
                      <Label>Where / When (Optional)</Label>
                      <Input name="whereItHappened" value={formData.whereItHappened || ''} onChange={handleContextChange} className="bg-white" />
                    </section>
                    <section>
                      <Label>Confidence Level</Label>
                      <select name="confidenceLevel" value={formData.confidenceLevel || 'Medium'} onChange={handleContextChange} className="w-full border border-slate-200 rounded p-2 text-xs bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                        <option>High</option>
                        <option>Medium</option>
                        <option>Low</option>
                      </select>
                    </section>
                 </div>

                 {formData.experienceText && (
                   <section className="p-4 bg-slate-900 rounded-lg text-slate-300">
                     <div className="flex items-center justify-between mb-3">
                       <label className="text-[10px] uppercase font-bold text-brand-400 tracking-wider">Staged CJ Patch Preview</label>
                     </div>
                     <div className="text-xs font-mono space-y-1 opacity-90 break-words whitespace-pre-wrap">
                       <p>TYPE: {formData.proposedAdditionType}</p>
                       <p>"{formData.experienceText}"</p>
                       {formData.measurableOutcome && <p>Outcome: {formData.measurableOutcome}</p>}
                     </div>
                   </section>
                 )}

                 <div className="space-y-3 pt-4 border-t border-slate-100">
                   <button 
                     onClick={() => {
                       saveContext('Approved for patch');
                       setTimeout(saveContext, 0);
                     }}
                     disabled={isRecalculating} className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-md font-bold text-sm shadow-lg shadow-brand-500/20 transition-all font-sans flex items-center justify-center gap-2"
                   >
                     {isRecalculating ? <><Loader2 className="w-4 h-4 animate-spin text-white" /> Calculating Fit...</> : "Approve for Patch Staging"}
                   </button>
                   <div className="flex gap-2">
                     <button 
                       onClick={() => {
                         saveContext('Needs clarification');
                         setTimeout(saveContext, 0);
                       }}
                       disabled={isRecalculating} className="flex-1 py-1.5 border border-slate-200 disabled:opacity-50 text-slate-600 rounded-md font-bold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-1.5"
                     >
                       {isRecalculating ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" /> : null}
                        <span>Save Draft</span>
                     </button>
                     <button 
                       onClick={() => {
                         saveContext('Rejected');
                         setTimeout(saveContext, 0);
                       }}
                       disabled={isRecalculating} className="flex-1 py-1.5 border border-red-200 disabled:opacity-50 text-red-600 rounded-md font-bold text-sm hover:bg-red-50 transition-all flex items-center justify-center gap-1.5"
                     >
                       {isRecalculating ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" /> : null}
                        <span>Reject Signal</span>
                     </button>
                   </div>
                 </div>
               </>
             )}
          </div>
        </aside>
      )}
    </div>
  );
}
