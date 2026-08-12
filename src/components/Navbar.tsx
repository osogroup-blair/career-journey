import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useStore } from '../store';
import { generateId } from '../lib/utils';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import { Compass, Briefcase, Award, Plus, Upload, Download, FileDown, Pencil, Radar, LogOut, Sparkles, TrendingUp } from 'lucide-react';
import { Button } from './ui';
import { parseCareerJourneyImport } from '../lib/careerJourneyImport';
import { buildCareerJourneyTemplate } from '../lib/careerJourneyTemplate';
import { validateCareerJourney } from '../lib/careerJourneyNormalize';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { careerJourney, addJob, setCareerJourney } = useStore();

  const downloadJSON = (data: any, filename: string) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExportJSON = () => {
    if (!careerJourney) return;
    const validation = validateCareerJourney(careerJourney);
    if (!validation.success) {
      console.error('Career Journey failed validation before export:', validation.error.issues);
    }
    downloadJSON(careerJourney, `career_journey_v${careerJourney?.meta?.version || '1.0.0'}.json`);
  };

  const handleDownloadTemplate = () => {
    downloadJSON(buildCareerJourneyTemplate(), 'career-journey-template.json');
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const { data, issues, addedSections, isTemplate } = parseCareerJourneyImport(event.target?.result as string);

        const hasExistingData = careerJourney && (careerJourney.roles?.length || careerJourney.achievements?.length);
        if (hasExistingData && !isTemplate) {
          const proceed = window.confirm(
            'This will replace your current Career Journey data (roles, achievements, skills, everything) with the imported file. This cannot be undone. Continue?'
          );
          if (!proceed) return;
        }

        setCareerJourney(data);

        const notes: string[] = [];
        if (isTemplate) notes.push('Loaded the blank template — fill it in from the Edit or Advanced pages.');
        if (issues.length > 0) notes.push(`${issues.length} field${issues.length === 1 ? '' : 's'} didn't match the expected shape and were left as-is or defaulted:\n${issues.join('\n')}`);
        if (addedSections.length > 0) notes.push(`Added empty defaults for sections missing from the file: ${addedSections.join(', ')}.`);
        alert(notes.length > 0 ? `Career Journey loaded.\n\n${notes.join('\n\n')}` : 'Career Journey loaded successfully!');
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  const createNewJob = () => {
    const newJob = {
      id: generateId('JOB'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'Draft' as const,
      companyName: 'Target Company',
      roleTitle: 'Target Role',
      jdText: ''
    };
    addJob(newJob);
    navigate(`/job/${newJob.id}/intake`);
  };

  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Brand Logo */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-brand-500 text-white shadow-sm transition-transform group-hover:scale-105">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-slate-900">Career Journey</span>
              <span className="block text-[10px] uppercase font-semibold text-brand-600 tracking-wider">Master Taxonomy & Tailor</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 ml-4">
            <Link
              to="/"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/') && !location.pathname.startsWith('/job')
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Compass className="h-4 w-4" />
              Dashboard
            </Link>

            <Link
              to="/matches"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/matches')
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Radar className="h-4 w-4" />
              Matches
            </Link>

            <Link
              to="/edit"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/edit')
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>

            <Link
              to="/build"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/build')
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Sparkles className="h-4 w-4" />
              Build
            </Link>

            <Link
              to="/strengthen"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/strengthen')
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              Strengthen
            </Link>

            <Link
              to="/journey"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/journey')
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Award className="h-4 w-4" />
              Advanced
            </Link>

            <Link
              to="/applications"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/applications')
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Briefcase className="h-4 w-4" />
              Applications
            </Link>
          </nav>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <label className="cursor-pointer">
            <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors">
              <Upload className="h-3.5 w-3.5" />
              Import JSON
            </span>
          </label>

          {careerJourney && (
            <button
              onClick={handleExportJSON}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              title="Export full Career Journey JSON (your data)"
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </button>
          )}

          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            title="Download a blank Career Journey template (no personal data)"
          >
            <FileDown className="h-3.5 w-3.5" />
            Template
          </button>

          <Button onClick={createNewJob} size="sm" className="bg-brand-600 hover:bg-brand-700 text-white shadow-xs">
            <Plus className="h-4 w-4 mr-1" />
            New Job Analysis
          </Button>

          {isFirebaseConfigured && auth && (
            <button
              onClick={() => signOut(auth!)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
