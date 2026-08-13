import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, Input, Label, Textarea, useToast } from '../components/ui';
import { mockParseJobDescription, mockGenerateKeywordBreakdown } from '../lib/mock-ai';
import { Loader2 } from 'lucide-react';

export default function Intake() {
  const { id } = useParams();
  const job = useStore((state) => state.jobs[id || '']);
  const updateJob = useStore((state) => state.updateJob);
  const careerJourney = useStore((state) => state.careerJourney);
  const navigate = useNavigate();
  const toast = useToast();

  const [formData, setFormData] = useState({
    companyName: '',
    roleTitle: '',
    jobLink: '',
    compensationRange: '',
    locationNotes: '',
    jdText: '',
    recruiterNotes: ''
  });
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    if (job) {
      setFormData({
        companyName: job.companyName || '',
        roleTitle: job.roleTitle || '',
        jobLink: job.jobLink || '',
        compensationRange: job.compensationRange || '',
        locationNotes: job.locationNotes || '',
        jdText: job.jdText || '',
        recruiterNotes: job.recruiterNotes || ''
      });
    }
  }, [job]);

  if (!job) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    updateJob(job.id, { ...formData });
  };

  const handleParse = async () => {
    if (formData.jdText.length < 50) {
      toast.error("JD text is too short to parse reliably.");
      return;
    }
    
    setIsParsing(true);
    handleSave();
    
    try {
      // Stage 1: Parse
      const parsedData = await mockParseJobDescription(formData.jdText, formData.companyName, formData.roleTitle);
      
      // Update basic fields if they were empty
      const updates: any = { 
        parse: parsedData, 
        status: 'JD Parsed',
        companyName: formData.companyName || parsedData.company,
        roleTitle: formData.roleTitle || parsedData.roleTitle
      };
      
      // Stage 2: Pre-compute initial keywords immediately (as per pipeline steps 1 & 2 grouping)
      if (careerJourney) {
         updates.keywords = await mockGenerateKeywordBreakdown(parsedData, careerJourney);
      }

      updateJob(job.id, updates);
      navigate(`/job/${job.id}/parse`);

    } catch (e) {
      console.error(e);
      toast.error("Error parsing JD.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setFormData((prev) => ({ ...prev, jdText: event.target?.result as string }));
    };
    reader.readAsText(file);
  };

  return (
    <div className={`space-y-6 max-w-4xl transition-all ${isParsing ? 'opacity-80 pointer-events-none' : ''}`}>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Automatic if omitted" disabled={isParsing} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleTitle">Role Title</Label>
              <Input name="roleTitle" value={formData.roleTitle} onChange={handleChange} placeholder="Automatic if omitted" disabled={isParsing} />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="jobLink">Job Link (optional)</Label>
            <Input name="jobLink" value={formData.jobLink} onChange={handleChange} placeholder="https://..." disabled={isParsing} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="compensationRange">Compensation Range</Label>
              <Input name="compensationRange" value={formData.compensationRange} onChange={handleChange} placeholder="$200k - $250k" disabled={isParsing} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locationNotes">Location / Remote Notes</Label>
              <Input name="locationNotes" value={formData.locationNotes} onChange={handleChange} placeholder="e.g. Remote US" disabled={isParsing} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-between items-end">
             <Label htmlFor="jdText" className="text-lg font-semibold">Job Description</Label>
             <div className="text-sm">
                <Label htmlFor="jdUpload" className={`cursor-pointer text-zinc-600 hover:text-zinc-900 underline underline-offset-2 ${isParsing ? 'opacity-50 cursor-not-allowed' : ''}`}>Upload Text File</Label>
                <input id="jdUpload" type="file" accept=".txt,.md" className="hidden" onChange={handleFileUpload} disabled={isParsing} />
             </div>
          </div>
          <Textarea 
            name="jdText" 
            value={formData.jdText} 
            onChange={handleChange} 
            placeholder="Paste the full job description here..."
            className="min-h-[400px] font-mono text-xs"
            disabled={isParsing}
          />
          <div className="space-y-2">
            <Label htmlFor="recruiterNotes">Recruiter Notes (optional)</Label>
            <Textarea name="recruiterNotes" value={formData.recruiterNotes} onChange={handleChange} className="min-h-[100px]" disabled={isParsing} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleSave} disabled={isParsing}>Save Draft</Button>
        <Button onClick={handleParse} disabled={isParsing || formData.jdText.trim().length === 0} className="min-w-[170px] flex items-center justify-center gap-2">
          {isParsing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Parsing Description...</span>
            </>
          ) : (
            "Parse JD & Continue"
          )}
        </Button>
      </div>
    </div>
  );
}
