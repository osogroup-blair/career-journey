import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, LoadingButton, Card, CardHeader, CardTitle, CardContent, Input, Label, Textarea, Badge } from '../components/ui';

export default function ParsedStage() {
  const { id } = useParams();
  const job = useStore((state) => state.jobs[id || '']);
  const updateJob = useStore((state) => state.updateJob);
  const runKeywordExtraction = useStore((s) => s.runKeywordExtraction);
  const runFitAndGateAudit = useStore((s) => s.runFitAndGateAudit);
  const isBusy = useStore((s) => Object.values(s.activeAiTasks).some((t) => t.jobId === id));
  const navigate = useNavigate();

  if (!job || !job.parse) {
    return <div className="max-w-4xl text-sm text-slate-500">Parse data not found. Please complete Intake first.</div>;
  }

  const parse = job.parse;

  const updateParseField = (field: string, value: any) => {
    updateJob(job.id, { parse: { ...job.parse!, [field]: value } });
  };

  const updateListItem = (field: 'mustHaves' | 'niceToHaves' | 'strategicSignals' | 'topCriticalSkills', index: number, value: string) => {
    const list = [...(parse[field] || [])];
    list[index] = value;
    updateParseField(field, list);
  };

  const handleContinue = () => {
    updateJob(job.id, { stage: 'Rating' });
    // Kick off Rating's data in the background so it isn't blank when the user gets there.
    runKeywordExtraction(job.id);
    runFitAndGateAudit(job.id);
    navigate(`/job/${job.id}/rating`);
  };

  const renderEditableList = (title: string, field: 'mustHaves' | 'niceToHaves' | 'strategicSignals' | 'topCriticalSkills') => (
    <div className="space-y-2">
      <Label className="text-slate-500 uppercase tracking-wider text-xs">{title}</Label>
      <div className="space-y-1.5">
        {(parse[field] || []).map((item, i) => (
          <Input key={i} value={item} onChange={(e) => updateListItem(field, i, e.target.value)} className="text-sm" />
        ))}
      </div>
      {(parse[field] || []).length === 0 && <span className="text-sm text-slate-400">None found</span>}
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <p className="text-slate-600">Job is parsed and ready for review — fix anything the extraction got wrong before it flows downstream.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/job/${job.id}/intake`)}>Edit JD</Button>
          <LoadingButton onClick={handleContinue} isLoading={isBusy} loadingLabel="Starting Rating...">
            Confirm Parse & Continue
          </LoadingButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Role Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Company</Label>
              <Input value={parse.company || ''} onChange={(e) => updateParseField('company', e.target.value)} className="text-sm mt-1" />
            </div>
            <div>
              <Label>Role Title</Label>
              <Input value={parse.roleTitle || ''} onChange={(e) => updateParseField('roleTitle', e.target.value)} className="text-sm mt-1" />
            </div>
            <div>
              <Label>Reporting Line</Label>
              <Input value={parse.reportingLine || ''} onChange={(e) => updateParseField('reportingLine', e.target.value)} className="text-sm mt-1" />
            </div>
            <div>
              <Label>Team Scope</Label>
              <Textarea value={parse.teamScope || ''} onChange={(e) => updateParseField('teamScope', e.target.value)} className="text-sm mt-1" />
            </div>
            <div className="pt-2">{renderEditableList('Strategic Signals', 'strategicSignals')}</div>
            <div className="pt-2">
              <Label className="text-slate-500 uppercase tracking-wider text-xs block mb-2">Industry / Domain</Label>
              <div className="flex gap-2 flex-wrap">
                {parse.industryDomain.map((d) => <Badge key={d} variant="outline" className="bg-slate-100">{d}</Badge>)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requirements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {renderEditableList('Top Critical Skills', 'topCriticalSkills')}
            {renderEditableList('Must Haves', 'mustHaves')}
            {renderEditableList('Nice To Haves', 'niceToHaves')}
          </CardContent>
        </Card>

        <Card className="col-span-2 border-red-200">
          <CardHeader className="bg-red-50/50 border-b border-red-100">
            <CardTitle className="text-red-900">Hard Gates & Risks</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {parse.hardGates.length === 0 ? (
              <p className="text-sm text-slate-500">No strict hard gates (work auth, specific degree, clearance, metrics) detected.</p>
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
