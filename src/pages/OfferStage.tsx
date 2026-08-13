import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams } from 'react-router-dom';
import { Button, LoadingButton, Card, CardHeader, CardTitle, CardContent, Input, Label, Textarea, useToast } from '../components/ui';
import { OfferDetails, ArchiveReason } from '../types';
import { AlertTriangle, HelpCircle, TrendingUp, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function OfferStage() {
  const { id } = useParams();
  const job = useStore((s) => s.jobs[id || '']);
  const updateJob = useStore((s) => s.updateJob);
  const archiveJob = useStore((s) => s.archiveJob);
  const runOfferGuidance = useStore((s) => s.runOfferGuidance);
  const isBusy = useStore((s) => Object.values(s.activeAiTasks).some((t) => t.jobId === id && t.kind === 'offerGuidance'));
  const toast = useToast();

  const [offer, setOffer] = useState<OfferDetails>(job?.offer || { receivedAt: new Date().toISOString().slice(0, 10) });

  // job is undefined on the very first render (hydrate() from storage is
  // async) — without this, the useState initializer above permanently seeds
  // empty/default offer data, and clicking Save would silently wipe out
  // anything already persisted from a prior session.
  useEffect(() => {
    if (job?.offer) setOffer(job.offer);
  }, [job?.id]);

  if (!job) return null;

  const field = (key: keyof OfferDetails, label: string, placeholder?: string) => (
    <div>
      <Label>{label}</Label>
      <Input
        value={(offer[key] as string) || ''}
        onChange={(e) => setOffer((o) => ({ ...o, [key]: e.target.value }))}
        placeholder={placeholder}
      />
    </div>
  );

  const saveOffer = () => {
    updateJob(job.id, { offer });
    toast.success('Offer saved.');
  };

  const acceptOffer = () => {
    updateJob(job.id, { offer });
    archiveJob(job.id, 'Accepted Offer' as ArchiveReason, 'Offer accepted.');
    toast.success('Congrats — marked as accepted and archived.');
  };

  const declineOffer = () => {
    updateJob(job.id, { offer });
    archiveJob(job.id, 'Rejected' as ArchiveReason, 'Declined this offer.');
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Offer</h2>
        <p className="text-sm text-slate-500">{job.companyName} — {job.roleTitle}</p>
      </div>

      <Card>
        <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-base">Offer Details</CardTitle></CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field('baseSalary', 'Base Salary', 'e.g. $185,000')}
            {field('bonusTarget', 'Bonus Target', 'e.g. 15% annual')}
          </div>
          <div>{field('variableComp', 'Variable Comp / Commission', 'e.g. OTE structure, quota details')}</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Equity Type</Label>
              <Input value={offer.equity?.type || ''} onChange={(e) => setOffer((o) => ({ ...o, equity: { ...o.equity, type: e.target.value } as any }))} placeholder="ISO, RSU, options..." />
            </div>
            <div>
              <Label>Equity Amount</Label>
              <Input value={offer.equity?.amount || ''} onChange={(e) => setOffer((o) => ({ ...o, equity: { ...o.equity, amount: e.target.value } as any }))} placeholder="e.g. 10,000 shares" />
            </div>
          </div>
          <div>
            <Label>Vesting Schedule</Label>
            <Input value={offer.equity?.vestingSchedule || ''} onChange={(e) => setOffer((o) => ({ ...o, equity: { ...o.equity, vestingSchedule: e.target.value } as any }))} placeholder="e.g. 4yr / 1yr cliff" />
          </div>
          <div><Label>Benefits Notes</Label><Textarea value={offer.benefitsNotes || ''} onChange={(e) => setOffer((o) => ({ ...o, benefitsNotes: e.target.value }))} /></div>
          <div><Label>Other Terms</Label><Textarea value={offer.otherTerms || ''} onChange={(e) => setOffer((o) => ({ ...o, otherTerms: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            {field('startDate', 'Proposed Start Date')}
            {field('decisionDeadline', 'Decision Deadline')}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={saveOffer}>Save Offer</Button>
          </div>
        </CardContent>
      </Card>

      {!job.offer?.guidance ? (
        <Card className="py-10 text-center">
          <LoadingButton onClick={() => { saveOffer(); runOfferGuidance(job.id); }} isLoading={isBusy} loadingLabel="Analyzing offer...">
            Get Negotiation Guidance
          </LoadingButton>
        </Card>
      ) : (
        <Card>
          <CardHeader className="bg-slate-50 border-b"><CardTitle className="text-base">Negotiation Copilot</CardTitle></CardHeader>
          <CardContent className="pt-6 space-y-5">
            <div>
              <h4 className="text-xs font-bold uppercase text-brand-700 flex items-center gap-1.5 mb-2"><HelpCircle className="w-3.5 h-3.5" /> Ask About</h4>
              <ul className="list-disc pl-5 text-sm space-y-1 text-slate-700">{job.offer.guidance.askAbout.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5" /> Don't Ask Yet</h4>
              <ul className="list-disc pl-5 text-sm space-y-1 text-slate-700">{job.offer.guidance.avoidAsking.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase text-emerald-700 flex items-center gap-1.5 mb-2"><TrendingUp className="w-3.5 h-3.5" /> Negotiation Angles</h4>
              <ul className="list-disc pl-5 text-sm space-y-1 text-slate-700">{job.offer.guidance.negotiationAngles.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
            {job.offer.guidance.redFlags.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase text-red-700 flex items-center gap-1.5 mb-2"><ShieldAlert className="w-3.5 h-3.5" /> Red Flags</h4>
                <ul className="list-disc pl-5 text-sm space-y-1 text-slate-700">{job.offer.guidance.redFlags.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => runOfferGuidance(job.id)} disabled={isBusy}>
              {isBusy ? 'Re-analyzing…' : 'Re-analyze'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={declineOffer}>Decline</Button>
        <Button onClick={acceptOffer}><CheckCircle2 className="w-4 h-4 mr-2" /> Accept Offer</Button>
      </div>
    </div>
  );
}
