import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Button, LoadingButton, Card, CardHeader, CardTitle, CardContent } from '../components/ui';
import { compareOffers as compareOffersApi } from '../lib/aiClient';
import { Sparkles } from 'lucide-react';

export default function CompareOffers() {
  const jobs = useStore((s) => s.jobs);
  const careerJourney = useStore((s) => s.careerJourney);
  const offerJobs = useMemo(() => Object.values(jobs).filter((j) => j.stage === 'Offer' && j.offer), [jobs]);

  const [result, setResult] = useState<{ perOffer: { jobId: string; pros: string[]; cons: string[] }[]; recommendation: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runComparison = async () => {
    setIsLoading(true);
    try {
      const offers = offerJobs.map((j) => ({ jobId: j.id, companyName: j.companyName, roleTitle: j.roleTitle, offer: j.offer }));
      const res = await compareOffersApi(offers, careerJourney);
      setResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Compare Offers</h2>
        <p className="text-sm text-slate-500">Every job currently sitting in the Offer stage.</p>
      </div>

      {offerJobs.length < 2 ? (
        <Card className="py-16 text-center text-slate-400">
          Need at least two jobs in the Offer stage to compare.
        </Card>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {offerJobs.map((j) => {
              const perOffer = result?.perOffer.find((p) => p.jobId === j.id);
              return (
                <Card key={j.id}>
                  <CardHeader className="bg-slate-50 border-b">
                    <CardTitle className="text-base">{j.companyName} — {j.roleTitle}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3 text-sm">
                    <div className="text-xs text-slate-500">
                      {j.offer?.baseSalary && <div>Base: {j.offer.baseSalary}</div>}
                      {j.offer?.bonusTarget && <div>Bonus: {j.offer.bonusTarget}</div>}
                      {j.offer?.equity?.amount && <div>Equity: {j.offer.equity.amount} ({j.offer.equity.type})</div>}
                    </div>
                    {perOffer && (
                      <>
                        <div>
                          <h5 className="text-[10px] font-bold uppercase text-emerald-700">Pros</h5>
                          <ul className="list-disc pl-4 text-xs text-slate-700">{perOffer.pros.map((p, i) => <li key={i}>{p}</li>)}</ul>
                        </div>
                        <div>
                          <h5 className="text-[10px] font-bold uppercase text-red-700">Cons</h5>
                          <ul className="list-disc pl-4 text-xs text-slate-700">{perOffer.cons.map((c, i) => <li key={i}>{c}</li>)}</ul>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {!result ? (
            <div className="flex justify-center">
              <LoadingButton onClick={runComparison} isLoading={isLoading} loadingLabel="Comparing...">
                <Sparkles className="w-4 h-4 mr-1.5" /> Compare with AI
              </LoadingButton>
            </div>
          ) : (
            <Card className="border-brand-200 bg-brand-50/30">
              <CardHeader><CardTitle className="text-base">Recommendation</CardTitle></CardHeader>
              <CardContent className="pt-2 text-sm text-slate-800">{result.recommendation}</CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
