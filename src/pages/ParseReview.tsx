import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Label, Badge } from '../components/ui';

export default function ParseReview() {
  const { id } = useParams();
  const job = useStore((state) => state.jobs[id || '']);
  const updateJob = useStore((state) => state.updateJob);
  const navigate = useNavigate();

  if (!job || !job.parse) {
    return <div>Parse data not found. Please complete the Intake step first.</div>;
  }

  const parse = job.parse;

  const handleContinue = () => {
    updateJob(job.id, { status: 'JD Parsed' });
    navigate(`/job/${job.id}/keywords`);
  };

  const renderList = (title: string, items: string[]) => (
    <div className="space-y-2">
      <Label className="text-zinc-500 uppercase tracking-wider text-xs">{title}</Label>
      <ul className="list-disc pl-5 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm font-medium text-zinc-900">{item}</li>
        ))}
      </ul>
      {items.length === 0 && <span className="text-sm text-zinc-400">None found</span>}
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
         <p className="text-zinc-600">Review the structured data extracted from the job description.</p>
         <div className="flex gap-2">
           <Button variant="outline" onClick={() => navigate(`/job/${job.id}/intake`)}>Edit JD</Button>
           <Button onClick={handleContinue}>Continue to Keywords</Button>
         </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Role Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div>
               <Label>Reporting Line</Label>
               <Input value={parse.reportingLine || ''} readOnly className="bg-zinc-50 text-sm mt-1" />
             </div>
             <div>
               <Label>Team Scope</Label>
               <Input value={parse.teamScope || ''} readOnly className="bg-zinc-50 text-sm mt-1" />
             </div>
             <div className="pt-2">
               {renderList('Strategic Signals', parse.strategicSignals)}
             </div>
             <div className="pt-2 flex gap-4">
               <div>
                  <Label className="text-zinc-500 uppercase tracking-wider text-xs block mb-2">Industry / Domain</Label>
                  <div className="flex gap-2 flex-wrap">
                    {parse.industryDomain.map(d => <Badge key={d} variant="outline" className="bg-zinc-100">{d}</Badge>)}
                  </div>
               </div>
             </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
             <CardTitle>Requirements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
             {renderList('Top Critical Skills', parse.topCriticalSkills)}
             {renderList('Must Haves', parse.mustHaves)}
             {renderList('Nice To Haves', parse.niceToHaves)}
          </CardContent>
        </Card>

        <Card className="col-span-2 border-red-200">
          <CardHeader className="bg-red-50/50 border-b border-red-100">
            <CardTitle className="text-red-900">Hard Gates / Structured Risks</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
             {parse.hardGates.length === 0 ? (
               <p className="text-sm text-zinc-500">No strict hard gates (work auth, specific degree, clearance, metrics) detected.</p>
             ) : (
               <div className="grid gap-3">
                 {parse.hardGates.map((gate, i) => (
                   <div key={i} className="flex gap-4 items-start p-3 border rounded-md bg-white">
                      <Badge variant="destructive" className="shrink-0">{gate.category}</Badge>
                      <span className="text-sm flex-1">{gate.requirement}</span>
                   </div>
                 ))}
               </div>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
