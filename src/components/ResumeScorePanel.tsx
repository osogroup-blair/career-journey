import { useState } from 'react';
import { JobAnalysis, ResumeAiScore } from '../types';
import { ResumeKeywordScore } from '../lib/resumeScore';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, LoadingButton } from './ui';
import { cn } from '../lib/utils';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, Sparkles, XCircle } from 'lucide-react';

interface Props {
  job: JobAnalysis;
  coverage: ResumeKeywordScore;
  currentFingerprint: string;
  isRebuilding: boolean;
  isScoring: boolean;
  onRebuild: (keywords: string[]) => void;
  onAiScore: () => void;
}

function scoreTone(score: number, passed: boolean) {
  if (passed) return 'text-green-600';
  return score >= 65 ? 'text-amber-600' : 'text-red-600';
}

export default function ResumeScorePanel({ job, coverage, currentFingerprint, isRebuilding, isScoring, onRebuild, onAiScore }: Props) {
  return (
    <div className="space-y-4">
      <KeywordCard coverage={coverage} isRebuilding={isRebuilding} onRebuild={onRebuild} />
      <AiCard score={job.resumeAiScore} isStale={!!job.resumeAiScore && job.resumeAiScore.resumeFingerprint !== currentFingerprint} isScoring={isScoring} onAiScore={onAiScore} />
    </div>
  );
}

function KeywordCard({ coverage, isRebuilding, onRebuild }: { coverage: ResumeKeywordScore; isRebuilding: boolean; onRebuild: (k: string[]) => void }) {
  const [showAll, setShowAll] = useState(false);
  const missingCritical = coverage.criticalSkillCoverage.filter((c) => !c.present);
  const nothingToScore = coverage.criticalSkillCoverage.length + coverage.secondaryKeywordCoverage.length === 0;

  return (
    <Card>
      <CardHeader className="bg-slate-50 border-b pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Keyword Match</CardTitle>
            <p className="text-xs text-slate-500 mt-1">Live — updates as you edit. Gate: {coverage.threshold}%+ with every top critical skill present.</p>
          </div>
          {!nothingToScore && (
            <div className="text-right">
              <div className={cn('text-3xl font-bold leading-none', scoreTone(coverage.score, coverage.passed))}>{coverage.score}%</div>
              <Badge variant={coverage.passed ? 'success' : 'warning'} className="mt-1.5">{coverage.passed ? 'Gate passed' : 'Below gate'}</Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4 text-sm">
        {nothingToScore ? (
          <p className="text-slate-500">No JD keywords to score against yet — run the keyword breakdown on the Rating stage.</p>
        ) : (
          <>
            {coverage.usedFallback && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                No Rating-stage keyword breakdown — scoring against the parsed top critical skills only.
              </p>
            )}

            <div className="flex items-center gap-2 font-medium">
              {missingCritical.length === 0 ? (
                <><CheckCircle2 className="w-4 h-4 text-green-600" /> All top critical skills present</>
              ) : (
                <><XCircle className="w-4 h-4 text-red-600" /> Missing critical: {missingCritical.map((c) => c.phrase).join(', ')}</>
              )}
            </div>

            {coverage.missingKeywords.length > 0 && (
              <div>
                <h4 className="text-xs uppercase font-bold text-brand-700 mb-1.5">
                  {coverage.usedFallback ? 'Missing' : 'Missing — evidence in your Career Journey'}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {coverage.missingKeywords.map((k) => <Badge key={k} variant="outline">{k}</Badge>)}
                </div>
                <LoadingButton
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => onRebuild(coverage.missingKeywords)}
                  isLoading={isRebuilding}
                  loadingLabel="Rebuilding…"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Rebuild with {coverage.missingKeywords.length} missing keyword{coverage.missingKeywords.length === 1 ? '' : 's'}
                </LoadingButton>
              </div>
            )}

            {coverage.unsupportedKeywords.length > 0 && (
              <div>
                <h4 className="text-xs uppercase font-bold text-slate-500 mb-1.5">Honest gaps — no evidence, won't be added</h4>
                <div className="flex flex-wrap gap-1.5">
                  {coverage.unsupportedKeywords.map((k) => <Badge key={k} variant="outline" className="text-slate-400">{k}</Badge>)}
                </div>
              </div>
            )}

            <div>
              <button onClick={() => setShowAll(!showAll)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-700">
                {showAll ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showAll ? 'Hide' : 'Show'} keyword checklist
              </button>
              {showAll && (
                <div className="mt-2 space-y-3">
                  <Checklist title="Top critical" items={coverage.criticalSkillCoverage} />
                  <Checklist title="Secondary" items={coverage.secondaryKeywordCoverage} />
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Checklist({ title, items }: { title: string; items: { phrase: string; present: boolean }[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h5 className="text-[11px] uppercase font-bold text-slate-400 mb-1">{title}</h5>
      <ul className="space-y-0.5">
        {items.map((i) => (
          <li key={i.phrase} className="flex items-center gap-1.5 text-xs">
            {i.present ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
            <span className={i.present ? 'text-slate-700' : 'text-slate-400'}>{i.phrase}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const AREA_ORDER: ResumeAiScore['suggestions'][number]['area'][] = ['Tagline', 'Summary', 'Skills', 'Experience', 'Formatting'];
// Not every provider enforces the schema enum ("Skills section", "Executive Summary") — unknown areas sort last.
const areaRank = (area: string) => {
  const i = AREA_ORDER.indexOf(area as any);
  return i === -1 ? AREA_ORDER.length : i;
};

function AiCard({ score, isStale, isScoring, onAiScore }: { score?: ResumeAiScore; isStale: boolean; isScoring: boolean; onAiScore: () => void }) {
  return (
    <Card>
      <CardHeader className="bg-slate-50 border-b pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-brand-500" /> AI Review</CardTitle>
            <p className="text-xs text-slate-500 mt-1">ATS rubric, role-identity read and specific fixes. Uses AI quota.</p>
          </div>
          {score && (
            <div className="text-right">
              <div className={cn('text-3xl font-bold leading-none', scoreTone(score.overallScore, score.overallScore >= 85))}>{score.overallScore}</div>
              <div className="text-[11px] text-slate-400 mt-1">/ 100</div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4 text-sm">
        {isStale && (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Resume changed since last AI score.
          </p>
        )}

        {score && (
          <>
            <p className="text-xs text-slate-600">{score.band}</p>

            <div className="space-y-2">
              {score.criteria.map((c) => (
                <div key={c.criterion} title={c.note}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700">{c.criterion}</span>
                    <span className="font-semibold text-slate-900">{c.score}/{c.weight}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', c.score / (c.weight || 1) >= 0.8 ? 'bg-green-500' : c.score / (c.weight || 1) >= 0.5 ? 'bg-amber-500' : 'bg-red-500')}
                      style={{ width: `${Math.min(100, Math.max(0, (c.score / (c.weight || 1)) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className={cn('rounded border px-3 py-2', score.roleIdentity.aligned ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50')}>
              <div className="text-xs font-bold text-slate-700">Reads as: {score.roleIdentity.readsAs}</div>
              <div className="text-xs text-slate-600 mt-0.5">{score.roleIdentity.note}</div>
            </div>

            {score.missingCriticalSkills.length > 0 && (
              <div>
                <h4 className="text-xs uppercase font-bold text-red-700 mb-1.5">Missing critical skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {score.missingCriticalSkills.map((k) => <Badge key={k} variant="destructive">{k}</Badge>)}
                </div>
              </div>
            )}

            {score.suggestions.length > 0 && (
              <div>
                <h4 className="text-xs uppercase font-bold text-brand-700 mb-1.5">Suggestions</h4>
                <ul className="space-y-2">
                  {[...score.suggestions]
                    .sort((a, b) => areaRank(a.area) - areaRank(b.area))
                    .map((s, i) => (
                      <li key={i} className="text-xs text-slate-700">
                        <span className="font-bold text-slate-900">{s.area}{s.keyword ? ` · ${s.keyword}` : ''}:</span> {s.suggestion}
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {score.honestGaps.length > 0 && (
              <div>
                <h4 className="text-xs uppercase font-bold text-slate-500 mb-1.5">Honest gaps</h4>
                <p className="text-xs text-slate-500">{score.honestGaps.join(', ')}</p>
              </div>
            )}

            <p className="text-[11px] text-slate-400">Scored {new Date(score.scoredAt).toLocaleString()} · an estimate, not any ATS vendor's real weights.</p>
          </>
        )}

        {score ? (
          <Button variant="outline" size="sm" className="w-full" onClick={onAiScore} disabled={isScoring}>
            {isScoring ? 'Scoring…' : 'Re-score'}
          </Button>
        ) : (
          <LoadingButton size="sm" className="w-full" onClick={onAiScore} isLoading={isScoring} loadingLabel="Scoring…">
            Run AI Score
          </LoadingButton>
        )}
      </CardContent>
    </Card>
  );
}
