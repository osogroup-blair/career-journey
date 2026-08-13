import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, LoadingButton, Card, CardHeader, CardTitle, CardContent, Badge,
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell, Label, Textarea, Input, useToast,
} from '../components/ui';
import EvidenceTrace from '../components/EvidenceTrace';
import { KeywordSignal, ExperienceContext } from '../types';
import { generateId } from '../lib/utils';
import { diffCareerJourneyRoles } from '../lib/careerJourneyDiff';
import { Sparkles, ShieldAlert, ArrowRight, Plus, Minus, Pencil, CheckCircle2, Lock } from 'lucide-react';

type Tab = 'fit' | 'keywords' | 'gaps' | 'patch';

export default function RatingStage() {
  const { id } = useParams();
  const job = useStore((s) => s.jobs[id || '']);
  const updateJob = useStore((s) => s.updateJob);
  const careerJourney = useStore((s) => s.careerJourney);
  const setCareerJourney = useStore((s) => s.setCareerJourney);
  const runFitAndGateAudit = useStore((s) => s.runFitAndGateAudit);
  const runKeywordExtraction = useStore((s) => s.runKeywordExtraction);
  const runClarifyQuestions = useStore((s) => s.runClarifyQuestions);
  const runPatchJourney = useStore((s) => s.runPatchJourney);
  const runGenerateTailoredApplication = useStore((s) => s.runGenerateTailoredApplication);
  const activeAiTasks = useStore((s) => s.activeAiTasks);
  const navigate = useNavigate();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('fit');
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ExperienceContext>>({});

  const isBusy = (kind: string) => Object.values(activeAiTasks).some((t) => t.jobId === id && t.kind === kind);

  if (!job || !job.parse) {
    return <div className="max-w-4xl text-sm text-slate-500">This job hasn't been parsed yet.</div>;
  }

  const finalized = !!job.ratingFinalizedAt;
  const keywords = job.keywords || [];
  const contextEntries = job.contextEntries || {};
  const topCritical = keywords.filter((k) => k.isTopCritical);
  const secondary = keywords.filter((k) => !k.isTopCritical);

  const saveContext = (keywordId: string, entry: Partial<ExperienceContext>, status: ExperienceContext['approvalStatus']) => {
    const newEntry: ExperienceContext = {
      keywordId,
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
      ...entry,
      id: entry.id || generateId('CTX'),
      approvalStatus: status,
    };
    const updatedContext = { ...contextEntries, [keywordId]: newEntry };
    const updatedKeywords = keywords.map((kw) =>
      kw.id === keywordId
        ? { ...kw, userContextStatus: status, evidenceStatus: status === 'Approved for patch' ? ('EVIDENCED' as const) : kw.evidenceStatus }
        : kw
    );
    updateJob(job.id, { contextEntries: updatedContext, keywords: updatedKeywords });
    if (status === 'Approved for patch') {
      runFitAndGateAudit(job.id);
    }
  };

  const handleSelectKeyword = (kw: KeywordSignal) => {
    setSelectedKeywordId(kw.id);
    setFormData(contextEntries[kw.id] || { keywordId: kw.id });
  };

  const handleFinalize = () => {
    updateJob(job.id, { ratingFinalizedAt: new Date().toISOString(), stage: 'Tailored Application' });
    runGenerateTailoredApplication(job.id);
    navigate(`/job/${job.id}/tailored`);
  };

  const canFinalize = !!job.fitAnalysis && !!job.hardGateAudit;

  const fitBadge = (rating: string) => {
    if (rating === 'Strong' || rating === 'PASS') return <Badge variant="success">{rating}</Badge>;
    if (rating === 'Moderate' || rating === 'BORDERLINE') return <Badge variant="warning">{rating}</Badge>;
    return <Badge variant="destructive">{rating}</Badge>;
  };
  const gateBadge = (verdict: string) => {
    if (verdict === 'CLEAR' || verdict === 'CLEAR TO APPLY') return <Badge variant="success">{verdict}</Badge>;
    if (verdict === 'UNCERTAIN' || verdict === 'VERIFY FIRST') return <Badge variant="warning">{verdict}</Badge>;
    return <Badge variant="destructive">{verdict}</Badge>;
  };

  const tabDef: { key: Tab; label: string }[] = [
    { key: 'fit', label: 'Fit & ATS Audit' },
    { key: 'keywords', label: 'Keyword Breakdown' },
    { key: 'gaps', label: 'Gap Interview' },
    { key: 'patch', label: 'Career Journey Patch' },
  ];

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Rating</h2>
          <p className="text-sm text-slate-500">Score the role, close the gaps, then finalize before building your Tailored Application.</p>
        </div>
        {finalized ? (
          <Badge variant="success" className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Rating Finalized</Badge>
        ) : (
          <LoadingButton onClick={handleFinalize} disabled={!canFinalize} isLoading={isBusy('generateTailoredApplication')} loadingLabel="Building Tailored Application...">
            Finalize Rating & Continue
          </LoadingButton>
        )}
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

      {tab === 'fit' && (
        <FitAndGateTab
          job={job}
          jdSegments={job.jdSegments}
          careerJourney={careerJourney}
          isScoring={isBusy('fitAudit')}
          onRescore={() => runFitAndGateAudit(job.id)}
          fitBadge={fitBadge}
          gateBadge={gateBadge}
        />
      )}

      {tab === 'keywords' && (
        <KeywordsTab
          job={job}
          keywords={keywords}
          topCritical={topCritical}
          secondary={secondary}
          contextEntries={contextEntries}
          careerJourney={careerJourney}
          isReanalyzing={isBusy('keywords')}
          onReanalyze={() => runKeywordExtraction(job.id)}
          selectedKeywordId={selectedKeywordId}
          onSelect={handleSelectKeyword}
          onClose={() => setSelectedKeywordId(null)}
          formData={formData}
          setFormData={setFormData}
          onSave={saveContext}
        />
      )}

      {tab === 'gaps' && (
        <GapsTab
          job={job}
          careerJourney={careerJourney}
          isGenerating={isBusy('clarifyQuestions')}
          onGenerate={() => runClarifyQuestions(job.id)}
          onAnswer={saveContext}
          toast={toast}
        />
      )}

      {tab === 'patch' && (
        <PatchTab
          job={job}
          careerJourney={careerJourney}
          isGenerating={isBusy('patchJourney')}
          onGenerate={() => runPatchJourney(job.id)}
          setCareerJourney={setCareerJourney}
          updateJob={updateJob}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FitAndGateTab({ job, jdSegments, careerJourney, isScoring, onRescore, fitBadge, gateBadge }: any) {
  const { fitAnalysis, hardGateAudit } = job;

  if (!fitAnalysis || !hardGateAudit) {
    return (
      <Card className="py-16 text-center">
        <p className="text-slate-500 mb-4">{isScoring ? 'Auditing fit & gates…' : 'No audit yet.'}</p>
        <div className="flex justify-center">
          <LoadingButton onClick={onRescore} isLoading={isScoring} loadingLabel="Auditing...">Run Fit & ATS Audit</LoadingButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="bg-slate-50 border-b pb-4">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Why this is (or isn't) a good fit</CardTitle>
            {fitBadge(fitAnalysis.overallVerdict)}
          </div>
          <p className="text-sm text-slate-700 mt-2 font-medium">{fitAnalysis.rationale}</p>
        </CardHeader>
        <CardContent className="pt-6 grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-xs uppercase font-bold text-slate-500 mb-3">Dimensions</h4>
            <div className="space-y-3">
              {[
                ['Role Scope', fitAnalysis.roleScopeFit],
                ['Industry', fitAnalysis.industryDomainFit],
                ['Stage/Seniority', fitAnalysis.seniorityStageFit],
                ['Tech & AI', fitAnalysis.technicalAiFit],
              ].map(([label, dim]: any) => (
                <div key={label} className="flex items-start justify-between text-sm border-b pb-2">
                  <span className="font-semibold w-1/3">{label}</span>
                  <span className="w-2/3 flex flex-col items-end text-right">
                    {fitBadge(dim.rating)}
                    <span className="text-xs text-slate-500 mt-1">{dim.rationale}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <h4 className="text-xs uppercase font-bold text-green-700 mb-2">Lead With</h4>
              <ul className="space-y-1.5">
                {fitAnalysis.leadWith.map((item: any, i: number) => (
                  <li key={i} className="text-sm text-slate-800 flex items-start gap-2">
                    <span className="flex-1">{item.text}</span>
                    <EvidenceTrace evidenceRefs={item.evidenceRefs} jdRefs={item.jdRefs} jdSegments={jdSegments} careerJourney={careerJourney} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs uppercase font-bold text-orange-700 mb-2">Gaps to Handle</h4>
              <ul className="space-y-1.5">
                {fitAnalysis.gaps.map((gap: any, i: number) => (
                  <li key={i} className="text-sm text-slate-800 flex items-start gap-2">
                    <span className="flex-1">{gap.text}</span>
                    <EvidenceTrace evidenceRefs={gap.evidenceRefs} jdRefs={gap.jdRefs} jdSegments={jdSegments} careerJourney={careerJourney} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={`border-2 ${hardGateAudit.overallVerdict === 'LIKELY AUTO-REJECT' ? 'border-red-400' : hardGateAudit.overallVerdict === 'VERIFY FIRST' ? 'border-amber-400' : 'border-slate-200'}`}>
        <CardHeader className="bg-slate-50 border-b pb-4">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">ATS Structured-Field Audit</CardTitle>
            {gateBadge(hardGateAudit.overallVerdict)}
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-3">
          {hardGateAudit.gates.map((gate: any, i: number) => (
            <div key={i} className="p-4 border border-slate-200 rounded-xl bg-white space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-slate-900 text-sm">{gate.category}</h4>
                    {gateBadge(gate.verdict)}
                    <EvidenceTrace evidenceRefs={gate.evidenceRefs} jdRefs={gate.jdRefs} jdSegments={jdSegments} careerJourney={careerJourney} />
                  </div>
                  <p className="text-[11px] font-semibold text-slate-700 bg-slate-100 inline-block px-2 py-0.5 rounded mb-1.5">{gate.requirement}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{gate.reason}</p>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onRescore} disabled={isScoring}>
          {isScoring ? 'Re-scoring…' : 'Re-run Audit'}
        </Button>
      </div>
    </div>
  );
}

function KeywordsTab({
  job, keywords, topCritical, secondary, contextEntries, careerJourney, isReanalyzing, onReanalyze,
  selectedKeywordId, onSelect, onClose, formData, setFormData, onSave,
}: any) {
  const selectedKeyword = keywords.find((k: KeywordSignal) => k.id === selectedKeywordId);

  if (keywords.length === 0) {
    return (
      <Card className="py-16 text-center">
        <p className="text-slate-500 mb-4">{isReanalyzing ? 'Extracting keywords…' : 'No keyword breakdown yet.'}</p>
        <div className="flex justify-center">
          <LoadingButton onClick={onReanalyze} isLoading={isReanalyzing} loadingLabel="Extracting...">Extract Keywords</LoadingButton>
        </div>
      </Card>
    );
  }

  const renderRows = (items: KeywordSignal[]) =>
    items.map((kw, idx) => {
      const ctx = contextEntries[kw.id];
      const isSelected = kw.id === selectedKeywordId;
      const isGap = kw.evidenceStatus === 'MISSING / POSSIBLE' || kw.evidenceStatus === 'PARTIAL';
      return (
        <TableRow key={kw.id} className={isSelected ? 'bg-brand-50/50' : ''} onClick={() => onSelect(kw)}>
          <TableCell className="align-top py-3"><span className="text-slate-400 font-mono text-xs">{idx + 1}</span></TableCell>
          <TableCell className="align-top py-3 max-w-[220px]">
            <div className="font-bold text-slate-800 text-[13px]">{kw.phrase}</div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider">{kw.category}</div>
          </TableCell>
          <TableCell className="align-top py-3">
            <Badge variant={kw.evidenceStatus === 'EVIDENCED' ? 'success' : kw.evidenceStatus === 'NOT SUPPORTED' ? 'destructive' : 'warning'} className="text-[10px]">
              {kw.evidenceStatus}
            </Badge>
          </TableCell>
          <TableCell className="align-top py-3">
            <div className="flex items-start gap-2">
              <span className="text-sm text-slate-600 flex-1">
                {ctx?.experienceText || kw.whatCouldCount}
              </span>
              <EvidenceTrace evidenceRefs={kw.evidenceRefs} jdRefs={kw.jdRefs} jdSegments={job.jdSegments} careerJourney={careerJourney} />
            </div>
          </TableCell>
          <TableCell className="align-top py-3">
            {isGap && (
              <Button size="sm" variant="outline" className="text-[10px] h-6" onClick={(e) => { e.stopPropagation(); onSelect(kw); }}>
                <Plus className="w-3 h-3 mr-1" /> I have this
              </Button>
            )}
          </TableCell>
        </TableRow>
      );
    });

  return (
    <div className="flex gap-6">
      <div className="flex-1 space-y-8">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onReanalyze} disabled={isReanalyzing}>
            {isReanalyzing ? 'Re-analyzing…' : 'Re-analyze Keywords'}
          </Button>
        </div>
        {topCritical.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-slate-900 border-b-2 border-slate-200 pb-2 mb-1">Top Critical Skills</h4>
            <Table>
              <TableHeader><TableRow><TableHead className="w-8">#</TableHead><TableHead>Keyword</TableHead><TableHead className="w-32">Status</TableHead><TableHead>Matched to</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
              <TableBody>{renderRows(topCritical)}</TableBody>
            </Table>
          </div>
        )}
        {secondary.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-slate-900 border-b-2 border-slate-200 pb-2 mb-1">Secondary Keywords</h4>
            <Table>
              <TableHeader><TableRow><TableHead className="w-8">#</TableHead><TableHead>Keyword</TableHead><TableHead className="w-32">Status</TableHead><TableHead>Matched to</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
              <TableBody>{renderRows(secondary)}</TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedKeyword && (
        <aside className="w-[380px] shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm h-fit sticky top-4">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h4 className="font-bold text-slate-800 text-sm">{selectedKeyword.phrase}</h4>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xs">Close</button>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <Label>My Real Experience</Label>
              <Textarea
                value={formData.experienceText || ''}
                onChange={(e) => setFormData((p: any) => ({ ...p, experienceText: e.target.value }))}
                placeholder="Describe a specific situation..."
                className="text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Measurable Outcome</Label>
                <Input value={formData.measurableOutcome || ''} onChange={(e) => setFormData((p: any) => ({ ...p, measurableOutcome: e.target.value }))} className="text-xs" placeholder="e.g. cut cost 45%" />
              </div>
              <div>
                <Label>Proof</Label>
                <Input value={formData.proof || ''} onChange={(e) => setFormData((p: any) => ({ ...p, proof: e.target.value }))} className="text-xs" placeholder="e.g. dashboard link" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => onSave(selectedKeyword.id, formData, 'Approved for patch')}>
                Add to Patch Staging
              </Button>
              <Button variant="outline" onClick={() => onSave(selectedKeyword.id, formData, 'Rejected')}>Reject</Button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

function GapsTab({ job, careerJourney, isGenerating, onGenerate, onAnswer, toast }: any) {
  const [answers, setAnswers] = useState<Record<string, { text: string; outcome: string; proof: string; roleId: string }>>({});
  const contextEntries = job.contextEntries || {};

  if (!job.clarificationQuestions || job.clarificationQuestions.length === 0) {
    return (
      <Card className="py-16 text-center">
        <Sparkles className="w-8 h-8 text-brand-500 mx-auto mb-3" />
        <p className="text-slate-500 mb-4">{isGenerating ? 'Compiling gap questions…' : "Pull out experience you haven't logged yet by answering a few targeted questions."}</p>
        <div className="flex justify-center">
          <LoadingButton onClick={onGenerate} isLoading={isGenerating} loadingLabel="Compiling...">Compile Gap Questions</LoadingButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {job.clarificationQuestions.map((q: any) => {
        const existing = contextEntries[q.keywordId];
        const ans = answers[q.id] || { text: '', outcome: '', proof: '', roleId: q.targetRoleId || '' };
        return (
          <Card key={q.id} className="p-5 border-l-4 border-l-amber-500">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-amber-100 text-amber-800 text-[10px]">Gap: {q.keywordPhrase}</Badge>
              {existing && <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">Added to Patch Staging</Badge>}
            </div>
            <h5 className="font-bold text-slate-800 text-sm mb-3">{q.questionText}</h5>
            <Textarea
              value={ans.text}
              onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: { ...ans, text: e.target.value } }))}
              placeholder="Describe a project, scenario, platform, or metric..."
              className="text-xs mb-2"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => {
                  if (!ans.text.trim()) { toast.error('Enter some experience text first.'); return; }
                  onAnswer(q.keywordId, { experienceText: ans.text, measurableOutcome: ans.outcome, proof: ans.proof, targetRoleId: ans.roleId, proposedAdditionType: q.proposedAdditionType }, 'Approved for patch');
                  toast.success(`Captured evidence for "${q.keywordPhrase}".`);
                }}
              >
                Approve & Add to Patch <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function PatchTab({ job, careerJourney, isGenerating, onGenerate, setCareerJourney, updateJob }: any) {
  const patch = job.careerJourneyPatch;
  const [approvedVersion, setApprovedVersion] = useState<string | null>(null);

  const handleApprove = () => {
    if (!patch) return;
    const updated = { ...patch, approvalStatus: 'Approved' as const };
    updateJob(job.id, { careerJourneyPatch: updated, pendingCareerJourneyUpdate: undefined });

    if (job.pendingCareerJourneyUpdate) {
      setCareerJourney(job.pendingCareerJourneyUpdate);
      // Never a silent overwrite — always hand back a versioned file per JD_pipeline_SKILL.md's capture rules.
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(job.pendingCareerJourneyUpdate, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `blair_boylan_career_journey_v${(patch.targetVersion || job.pendingCareerJourneyUpdate?.meta?.version || '').replace(/\./g, '_')}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    setApprovedVersion(patch.targetVersion || null);
  };

  const hasContext = job.contextEntries && Object.keys(job.contextEntries).length > 0;

  if (!patch) {
    return (
      <Card className="py-16 text-center">
        <p className="text-slate-500 mb-4">
          {isGenerating ? 'Staging Career Journey patch…' : hasContext ? 'Ready to stage a patch from your approved context entries.' : 'Approve some context in Keywords or Gap Interview first.'}
        </p>
        <div className="flex justify-center">
          <LoadingButton onClick={onGenerate} isLoading={isGenerating} loadingLabel="Staging..." disabled={!hasContext}>Stage Patch</LoadingButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {approvedVersion && (
        <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Career Journey updated to v{approvedVersion}.</p>
          </div>
        </div>
      )}
      <Card>
        <CardHeader className="bg-slate-50 border-b pb-4">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Proposed Update: v{patch.targetVersion}</CardTitle>
            <Badge variant={patch.approvalStatus === 'Approved' ? 'success' : 'warning'}>{patch.approvalStatus}</Badge>
          </div>
          <p className="text-sm text-slate-700 mt-2">Reason: {patch.reason}</p>
        </CardHeader>
        <CardContent className="pt-6 space-y-4 text-sm">
          {patch.newSkills?.length > 0 && (
            <div><h4 className="font-bold border-b border-slate-200 mb-1 pb-1">New Skills</h4><ul className="list-disc pl-5">{patch.newSkills.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
          )}
          {(patch.newDeliverables?.length > 0 || patch.updatedDeliverables?.length > 0) && (
            <div>
              <h4 className="font-bold border-b border-slate-200 mb-1 pb-1">Deliverables</h4>
              <ul className="list-disc pl-5">
                {patch.newDeliverables?.map((d: string, i: number) => <li key={i} className="text-brand-700">[NEW] {d}</li>)}
                {patch.updatedDeliverables?.map((d: string, i: number) => <li key={i} className="text-orange-700">[UPDATE] {d}</li>)}
              </ul>
            </div>
          )}
          {(patch.newAchievements?.length > 0 || patch.updatedAchievements?.length > 0) && (
            <div>
              <h4 className="font-bold border-b border-slate-200 mb-1 pb-1">Achievements</h4>
              <ul className="list-disc pl-5">
                {patch.newAchievements?.map((a: string, i: number) => <li key={i} className="text-brand-700">[NEW] {a}</li>)}
                {patch.updatedAchievements?.map((a: string, i: number) => <li key={i} className="text-orange-700">[UPDATE] {a}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onGenerate} disabled={isGenerating}>Regenerate Patch</Button>
        <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleApprove} disabled={patch.approvalStatus === 'Approved'}>
          {patch.approvalStatus === 'Approved' ? 'Approved' : 'Approve & Merge'}
        </Button>
      </div>
    </div>
  );
}
