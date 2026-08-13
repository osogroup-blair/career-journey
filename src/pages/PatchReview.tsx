import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, useToast } from '../components/ui';
import { mockStageCareerJourneyPatch } from '../lib/mock-ai';
import { CareerJourneyPatch } from '../types';
import { diffCareerJourneyRoles } from '../lib/careerJourneyDiff';
import { Loader2, RefreshCw, CheckCircle2, Plus, Minus, Pencil } from 'lucide-react';

export default function PatchReview() {
  const { id } = useParams();
  const job = useStore((state) => state.jobs[id || '']);
  const updateJob = useStore((state) => state.updateJob);
  const careerJourney = useStore((state) => state.careerJourney);
  const setCareerJourney = useStore((state) => state.setCareerJourney);
  const navigate = useNavigate();
  const toast = useToast();

  const [patch, setPatch] = useState<CareerJourneyPatch | null>(job?.careerJourneyPatch || null);
  const [updatedCJ, setUpdatedCJ] = useState<any>(null); // Temp state to hold the AI's modified version of the journey before approval
  const [isGenerating, setIsGenerating] = useState(false);
  const [approvedVersion, setApprovedVersion] = useState<string | null>(null);

  const roleDiffs = useMemo(
    () => (updatedCJ ? diffCareerJourneyRoles(careerJourney, updatedCJ) : []),
    [careerJourney, updatedCJ]
  );

  useEffect(() => {
    if (!patch && job?.contextEntries && Object.keys(job.contextEntries).length > 0) {
      generatePatch();
    }
  }, []);

  const generatePatch = async () => {
    if (!job?.contextEntries || !careerJourney) return;
    setIsGenerating(true);
    try {
      const result = await mockStageCareerJourneyPatch(careerJourney, job.contextEntries);
      setPatch(result.summary);
      setUpdatedCJ(result.updatedCareerJourney);
      updateJob(job.id, { careerJourneyPatch: result.summary });
    } catch (e: any) {
      toast.error("Error generating patch: " + e.message);
    }
    setIsGenerating(false);
  };

  const handleApprove = () => {
    if (patch) {
      const updated = { ...patch, approvalStatus: 'Approved' as const };
      setPatch(updated);
      updateJob(job.id, { careerJourneyPatch: updated, status: 'Career Journey Patch Staged' });

      if (updatedCJ) {
         setCareerJourney(updatedCJ); // Apply AI changes to main state!

         // Give Blair the actual versioned file per JD_pipeline_SKILL.md's Career Journey
         // capture rules - never a silent overwrite, always a downloadable new version.
         const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(updatedCJ, null, 2));
         const downloadAnchor = document.createElement('a');
         downloadAnchor.setAttribute("href", dataStr);
         downloadAnchor.setAttribute("download", `blair_boylan_career_journey_v${(patch.targetVersion || updatedCJ?.meta?.version || '').replace(/\./g, '_')}.json`);
         document.body.appendChild(downloadAnchor);
         downloadAnchor.click();
         downloadAnchor.remove();
      }

      setApprovedVersion(patch.targetVersion || updatedCJ?.meta?.version || null);
    }
  };

  if (!job) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-zinc-900">Career Journey Patch</h2>
          <p className="text-zinc-500">Review structural updates based on approved context.</p>
        </div>
        <div className="space-x-3">
          <Button variant="outline" onClick={generatePatch} disabled={isGenerating} className="flex items-center gap-2 min-w-[150px] justify-center">
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                <span>Patching...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 text-slate-500" />
                <span>Regenerate Patch</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {!patch ? (
        <Card className={`${isGenerating ? 'border-brand-200 bg-brand-50/10 animate-pulse' : ''}`}>
          <CardContent className="py-16 text-center text-zinc-500">
             {isGenerating ? (
               <div className="flex flex-col items-center justify-center gap-4">
                 <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
                 <div className="space-y-1">
                   <p className="font-bold text-zinc-800">Updating your Career Journey…</p>
                   <p className="text-xs text-zinc-400">Gemini is matching raw experience contexts back into structured JSON formats...</p>
                 </div>
               </div>
             ) : (
               "No approved context entries found. Go back and approve some context first."
             )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {approvedVersion && (
            <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Career Journey updated to v{approvedVersion}.</p>
                <p className="text-emerald-700 mt-0.5">The new versioned file downloaded automatically — keep it as your canonical record.</p>
              </div>
            </div>
          )}
          <Card>
            <CardHeader className="bg-zinc-50 border-b pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Proposed Update: v{patch.targetVersion}</CardTitle>
                <Badge variant={patch.approvalStatus === 'Approved' ? 'success' : 'warning'}>{patch.approvalStatus}</Badge>
              </div>
              <p className="text-sm font-medium text-zinc-700 mt-2">Reason: {patch.reason}</p>
            </CardHeader>
            <CardContent className="pt-6 space-y-6 font-mono text-sm leading-relaxed text-zinc-800">
              
              {patch.newSkills?.length > 0 && (
                <div>
                  <h4 className="font-bold border-b border-zinc-200 mb-2 pb-1">New Skills:</h4>
                  <ul className="list-disc pl-5">
                    {patch.newSkills.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}

              {(patch.newDeliverables?.length > 0 || patch.updatedDeliverables?.length > 0) && (
                <div>
                  <h4 className="font-bold border-b border-zinc-200 mb-2 pb-1">Deliverables Affected:</h4>
                  <ul className="list-disc pl-5">
                    {patch.newDeliverables?.map((d, i) => <li key={i} className="text-brand-700">[NEW] {d}</li>)}
                    {patch.updatedDeliverables?.map((d, i) => <li key={i} className="text-orange-700">[UPDATE] {d}</li>)}
                  </ul>
                </div>
              )}

              {(patch.newAchievements?.length > 0 || patch.updatedAchievements?.length > 0) && (
                <div>
                  <h4 className="font-bold border-b border-zinc-200 mb-2 pb-1">Achievements Affected:</h4>
                  <ul className="list-disc pl-5">
                    {patch.newAchievements?.map((a, i) => <li key={i} className="text-brand-700">[NEW] {a}</li>)}
                    {patch.updatedAchievements?.map((a, i) => <li key={i} className="text-orange-700">[UPDATE] {a}</li>)}
                  </ul>
                </div>
              )}

              {patch.metaUpdate && Object.keys(patch.metaUpdate).length > 0 && (
                <div>
                   <h4 className="font-bold border-b border-zinc-200 mb-2 pb-1">Meta Update:</h4>
                   <dl className="divide-y divide-zinc-100 bg-zinc-50 rounded-lg px-3">
                      {Object.entries(patch.metaUpdate).map(([key, value]) => (
                        <div key={key} className="flex items-baseline justify-between gap-4 py-1.5 text-xs">
                          <dt className="text-zinc-500 font-semibold shrink-0">{key}</dt>
                          <dd className="text-zinc-800 text-right break-words">
                            {Array.isArray(value) ? value.join(', ') : String(value)}
                          </dd>
                        </div>
                      ))}
                   </dl>
                </div>
              )}

            </CardContent>
          </Card>

          {roleDiffs.length > 0 && (
            <Card>
              <CardHeader className="bg-zinc-50 border-b pb-4">
                <CardTitle className="text-lg">What's Changing, Role by Role</CardTitle>
                <p className="text-sm text-zinc-500 mt-1 font-sans">
                  A field-level diff of exactly what "Approve & Merge JSON" will write to your Career Journey — not just the summary above.
                </p>
              </CardHeader>
              <CardContent className="pt-6 space-y-6 font-mono text-sm leading-relaxed text-zinc-800">
                {roleDiffs.map((rd) => (
                  <div key={rd.roleId} className="space-y-2">
                    <h4 className="font-bold font-sans text-zinc-900 border-b border-zinc-200 pb-1">{rd.roleTitle}</h4>

                    {rd.addedSkills.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-sans font-semibold text-zinc-500 mr-1">Skills:</span>
                        {rd.addedSkills.map((s, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5">
                            <Plus className="w-3 h-3" />{s}
                          </span>
                        ))}
                      </div>
                    )}
                    {rd.removedSkills.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-sans font-semibold text-zinc-500 mr-1">Skills removed:</span>
                        {rd.removedSkills.map((s, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded px-1.5 py-0.5 line-through">
                            <Minus className="w-3 h-3" />{s}
                          </span>
                        ))}
                      </div>
                    )}

                    {rd.addedDeliverables.map((d, i) => (
                      <div key={`dd-add-${i}`} className="flex items-start gap-2 text-xs">
                        <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="text-emerald-800">{d}</span>
                      </div>
                    ))}
                    {rd.removedDeliverables.map((d, i) => (
                      <div key={`dd-rem-${i}`} className="flex items-start gap-2 text-xs">
                        <Minus className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                        <span className="text-red-800 line-through">{d}</span>
                      </div>
                    ))}
                    {rd.changedDeliverables.map((c, i) => (
                      <div key={`dd-chg-${i}`} className="flex items-start gap-2 text-xs">
                        <Pencil className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-red-700 line-through">{c.before}</div>
                          <div className="text-emerald-800">{c.after}</div>
                        </div>
                      </div>
                    ))}

                    {rd.addedAchievements.map((a, i) => (
                      <div key={`ach-add-${i}`} className="flex items-start gap-2 text-xs">
                        <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="text-emerald-800">{a}</span>
                      </div>
                    ))}
                    {rd.removedAchievements.map((a, i) => (
                      <div key={`ach-rem-${i}`} className="flex items-start gap-2 text-xs">
                        <Minus className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                        <span className="text-red-800 line-through">{a}</span>
                      </div>
                    ))}
                    {rd.changedAchievements.map((c, i) => (
                      <div key={`ach-chg-${i}`} className="flex items-start gap-2 text-xs">
                        <Pencil className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-red-700 line-through">{c.before}</div>
                          <div className="text-emerald-800">{c.after}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-4">
             <Button variant="outline" onClick={() => navigate(`/job/${job.id}/keywords`)}>Back to Context</Button>
             <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleApprove} disabled={patch.approvalStatus === 'Approved'}>
               {patch.approvalStatus === 'Approved' ? 'Approved' : 'Approve & Merge JSON'}
             </Button>
             {patch.approvalStatus === 'Approved' && (
               <Button onClick={() => navigate(`/job/${job.id}/fit`)}>Continue to Fit Analysis</Button>
             )}
          </div>
        </div>
      )}
    </div>
  );
}
