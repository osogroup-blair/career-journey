import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Button, Card, CardHeader, CardTitle, CardContent, Textarea } from '../components/ui';
import { computeJourneyGaps, computeJourneyCompleteness, JourneyGap } from '../lib/careerJourneyGaps';
import { refineFromInterviewAnswer } from '../lib/aiClient';
import { TrendingUp, Loader2, ArrowRight, CheckCircle2, SkipForward, PartyPopper } from 'lucide-react';

type ProposedUpdate = {
  title?: string;
  description?: string;
  last_used?: string;
  proficiency?: string;
  years_experience?: number;
  summary: string;
};

export default function StrengthenJourney() {
  const careerJourney = useStore((state) => state.careerJourney);
  const updateAchievement = useStore((state) => state.updateAchievement);
  const updateRole = useStore((state) => state.updateRole);
  const updateSkillAtIndex = useStore((state) => state.updateSkillAtIndex);

  const gaps = useMemo(() => (careerJourney ? computeJourneyGaps(careerJourney) : []), [careerJourney]);
  const completeness = useMemo(() => (careerJourney ? computeJourneyCompleteness(careerJourney) : null), [careerJourney]);

  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [proposed, setProposed] = useState<ProposedUpdate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolvedCount, setResolvedCount] = useState(0);

  const currentGap: JourneyGap | undefined = gaps[index];

  const advance = () => {
    setAnswer('');
    setProposed(null);
    setError('');
    setIndex((i) => i + 1);
  };

  const handleSubmitAnswer = async () => {
    if (!currentGap || !answer.trim()) return;
    setLoading(true);
    setError('');
    try {
      const entityType = currentGap.type === 'achievement-metric' ? 'achievement' : currentGap.type === 'skill-stale' ? 'skill' : 'role';
      const result = await refineFromInterviewAnswer(entityType, currentGap.current, currentGap.question, answer);
      setProposed(result);
    } catch (e: any) {
      setError(e.message || 'Something went wrong getting a suggestion for that answer.');
    }
    setLoading(false);
  };

  const handleApprove = () => {
    if (!currentGap || !proposed || !careerJourney) return;
    if (currentGap.type === 'achievement-metric') {
      const updates: Record<string, any> = {};
      if (proposed.title) updates.title = proposed.title;
      if (proposed.description) updates.description = proposed.description;
      updateAchievement(currentGap.entityId, updates);
    } else if (currentGap.type === 'role-thin') {
      if (proposed.description) updateRole(currentGap.entityId, { description: proposed.description });
    } else if (currentGap.type === 'skill-stale') {
      const idx = (careerJourney.skills_index || []).findIndex((s: any) => s.id === currentGap.entityId);
      if (idx !== -1) {
        const current = careerJourney.skills_index[idx];
        updateSkillAtIndex(idx, {
          ...current,
          last_used: proposed.last_used ?? current.last_used,
          proficiency: proposed.proficiency ?? current.proficiency,
          years_experience: proposed.years_experience ?? current.years_experience,
        });
      }
    }
    setResolvedCount((c) => c + 1);
    advance();
  };

  const handleSkip = () => advance();

  if (!careerJourney) return null;

  const done = index >= gaps.length;

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-brand-600" /> Strengthen Your Journey
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Pointed questions about the weakest spots in your Career Journey — unquantified achievements, stale skills, thin role descriptions. Every answer is reviewed before it's saved.
        </p>
      </div>

      {completeness && (
        <div className="grid grid-cols-3 gap-3">
          <CompletenessTile label="Achievements with a metric" stat={completeness.achievementsWithMetric} />
          <CompletenessTile label="Skills with recent use" stat={completeness.skillsWithRecentUse} />
          <CompletenessTile label="Roles with full description" stat={completeness.rolesWithFullDescription} />
        </div>
      )}

      {gaps.length === 0 ? (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-6 text-center space-y-2">
            <PartyPopper className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-emerald-800">Nothing obviously thin right now.</p>
            <p className="text-xs text-emerald-700">Every achievement has a number, every skill's recently used, and every role has real detail.</p>
          </CardContent>
        </Card>
      ) : done ? (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-6 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-sm font-bold text-emerald-800">That's the queue — {resolvedCount} of {gaps.length} strengthened this round.</p>
            <p className="text-xs text-emerald-700">Come back any time; this list updates as your Career Journey changes.</p>
          </CardContent>
        </Card>
      ) : currentGap && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Question {index + 1} of {gaps.length}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-800 leading-relaxed">{currentGap.question}</p>

            {!proposed ? (
              <>
                <Textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Your answer..."
                  className="min-h-[100px]"
                  disabled={loading}
                />
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={handleSkip} disabled={loading} className="flex items-center gap-1.5">
                    <SkipForward className="w-3.5 h-3.5" /> Skip
                  </Button>
                  <Button onClick={handleSubmitAnswer} disabled={loading || !answer.trim()} className="bg-brand-600 text-white flex items-center gap-2 min-w-[140px] justify-center">
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Thinking...</> : <>Continue <ArrowRight className="w-4 h-4" /></>}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                  <div className="font-bold text-slate-600 uppercase tracking-wide text-[10px]">Proposed update</div>
                  <p className="text-slate-500 italic">{proposed.summary}</p>
                  {proposed.title && <div><span className="font-semibold text-slate-600">Title:</span> {proposed.title}</div>}
                  {proposed.description && <div><span className="font-semibold text-slate-600">Description:</span> {proposed.description}</div>}
                  {proposed.last_used && <div><span className="font-semibold text-slate-600">Last used:</span> {proposed.last_used}</div>}
                  {proposed.proficiency && <div><span className="font-semibold text-slate-600">Proficiency:</span> {proposed.proficiency}</div>}
                  {proposed.years_experience !== undefined && <div><span className="font-semibold text-slate-600">Years experience:</span> {proposed.years_experience}</div>}
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={handleSkip}>Discard Suggestion</Button>
                  <Button onClick={handleApprove} className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Approve & Save
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CompletenessTile({ label, stat }: { label: string; stat: { count: number; total: number; pct: number } }) {
  return (
    <Card>
      <CardContent className="pt-4 text-center">
        <div className="text-2xl font-black text-brand-600">{stat.pct}%</div>
        <div className="text-[11px] text-slate-500 font-semibold mt-0.5">{label}</div>
        <div className="text-[10px] text-slate-400">{stat.count}/{stat.total}</div>
      </CardContent>
    </Card>
  );
}
