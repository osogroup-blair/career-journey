import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useStore } from '../store';
import { generateId } from '../lib/utils';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import {
  Compass, Briefcase, Award, Plus, Upload, Download, FileDown, Pencil, Radar,
  LogOut, Sparkles, TrendingUp, Menu, X, ChevronDown, CreditCard,
  Settings as SettingsIcon, User, FileText
} from 'lucide-react';
import { Button, useToast } from './ui';
import { parseCareerJourneyImport } from '../lib/careerJourneyImport';
import { buildCareerJourneyTemplate } from '../lib/careerJourneyTemplate';
import { validateCareerJourney } from '../lib/careerJourneyNormalize';
import { listAdminTickets } from '../lib/adminClient';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { careerJourney, addJob, setCareerJourney, billing, isAdmin } = useStore();
  const toast = useToast();

  const [resumeOpen, setResumeOpen] = useState(false);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  
  const resumeRef = useRef<HTMLDivElement>(null);
  const jobsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const [newTicketCount, setNewTicketCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    const check = () => listAdminTickets({ status: 'new' }).then((t) => setNewTicketCount(t.length)).catch(() => {});
    check();
    const interval = setInterval(check, 120_000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (resumeRef.current && !resumeRef.current.contains(e.target as Node)) setResumeOpen(false);
      if (jobsRef.current && !jobsRef.current.contains(e.target as Node)) setJobsOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setResumeOpen(false);
    setJobsOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

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
        toast.success(notes.length > 0 ? `Career Journey loaded.\n\n${notes.join('\n\n')}` : 'Career Journey loaded successfully!');
      } catch (err) {
        toast.error('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  const createNewJob = () => {
    const newJob = {
      id: generateId('JOB'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stage: 'Intake' as const,
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

  const linkClass = (path: string) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
      isActive(path)
        ? 'bg-brand-50 text-brand-700'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
    }`;
    
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-xs">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">

        {/* Brand Logo */}
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-brand-500 text-white shadow-sm transition-transform group-hover:scale-105">
              <Compass className="h-5 w-5" />
            </div>
            <div className="hidden sm:block">
              <span className="text-lg font-bold tracking-tight text-slate-900">Career Journey</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-2 ml-4">
            
            {/* Resume Dropdown */}
            <div className="relative" ref={resumeRef}>
              <button
                onClick={() => {
                  setResumeOpen((v) => !v);
                  setJobsOpen(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  resumeOpen || isActive('/build') || isActive('/edit') || isActive('/strengthen') || isActive('/journey')
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <FileText className="h-4 w-4" />
                Resume
                <ChevronDown className={`h-3 w-3 transition-transform ${resumeOpen ? 'rotate-180' : ''}`} />
              </button>

              {resumeOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50">
                  <Link to="/build" className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Sparkles className="h-4 w-4 text-slate-400" />
                    Build
                  </Link>
                  <Link to="/edit" className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Pencil className="h-4 w-4 text-slate-400" />
                    Edit
                  </Link>
                  <Link to="/strengthen" className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <TrendingUp className="h-4 w-4 text-slate-400" />
                    Strengthen
                  </Link>
                  <div className="my-1.5 border-t border-slate-100" />
                  <Link to="/journey" className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Award className="h-4 w-4 text-slate-400" />
                    Advanced Editor
                  </Link>
                </div>
              )}
            </div>

            {/* Jobs Dropdown */}
            <div className="relative" ref={jobsRef}>
              <button
                onClick={() => {
                  setJobsOpen((v) => !v);
                  setResumeOpen(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  jobsOpen || isActive('/matches') || isActive('/applications')
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Briefcase className="h-4 w-4" />
                Jobs
                <ChevronDown className={`h-3 w-3 transition-transform ${jobsOpen ? 'rotate-180' : ''}`} />
              </button>

              {jobsOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50">
                  <Link to="/matches" className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Radar className="h-4 w-4 text-slate-400" />
                    Matches
                  </Link>
                  <Link to="/applications" className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Briefcase className="h-4 w-4 text-slate-400" />
                    Job Tracker
                  </Link>
                </div>
              )}
            </div>
            
          </nav>
        </div>

        {/* Primary Actions & Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Button onClick={createNewJob} size="sm" className="hidden sm:inline-flex bg-brand-600 hover:bg-brand-700 text-white shadow-xs">
            <Plus className="h-4 w-4 mr-1" />
            New Job Analysis
          </Button>
          <Button onClick={createNewJob} size="sm" className="sm:hidden bg-brand-600 hover:bg-brand-700 text-white shadow-xs px-2.5">
            <Plus className="h-4 w-4" />
          </Button>

          {/* Profile Dropdown */}
          <div className="relative hidden md:block" ref={profileRef}>
            <button
              onClick={() => {
                setProfileOpen((v) => !v);
              }}
              className="flex items-center justify-center h-9 w-9 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              <User className="h-4 w-4" />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50">
                {isAdmin && (
                  <Link to="/admin" className="flex items-center justify-between gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <span className="flex items-center gap-2.5">
                      <Sparkles className="h-4 w-4 text-slate-400" />
                      Admin
                    </span>
                    {newTicketCount > 0 && (
                      <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-brand-600 text-[10px] font-bold text-white">
                        {newTicketCount}
                      </span>
                    )}
                  </Link>
                )}

                {billing && (
                  <Link to="/settings" className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <SettingsIcon className="h-4 w-4 text-slate-400" />
                    Settings & Billing
                  </Link>
                )}

                {(isAdmin || billing) && <div className="my-1.5 border-t border-slate-100" />}

                <label className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                  <Upload className="h-4 w-4 text-slate-400" />
                  Import JSON
                </label>

                {careerJourney && (
                  <button onClick={handleExportJSON} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left">
                    <Download className="h-4 w-4 text-slate-400" />
                    Export JSON
                  </button>
                )}

                <button onClick={handleDownloadTemplate} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left">
                  <FileDown className="h-4 w-4 text-slate-400" />
                  Blank Template
                </button>

                {isFirebaseConfigured && auth && (
                  <>
                    <div className="my-1.5 border-t border-slate-100" />
                    <button onClick={() => signOut(auth!)} className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 text-left">
                      <LogOut className="h-4 w-4 text-red-400" />
                      Sign Out
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg text-slate-600 hover:bg-slate-100"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

      </div>

      {/* Mobile Navigation Panel */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Resume</div>
          <Link to="/build" className={linkClass('/build') + ' w-full'}>
            <Sparkles className="h-4 w-4" /> Build
          </Link>
          <Link to="/edit" className={linkClass('/edit') + ' w-full'}>
            <Pencil className="h-4 w-4" /> Edit
          </Link>
          <Link to="/strengthen" className={linkClass('/strengthen') + ' w-full'}>
            <TrendingUp className="h-4 w-4" /> Strengthen
          </Link>
          <Link to="/journey" className={linkClass('/journey') + ' w-full'}>
            <Award className="h-4 w-4" /> Advanced Editor
          </Link>

          <div className="my-2 border-t border-slate-100" />

          <div className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Jobs</div>
          <Link to="/matches" className={linkClass('/matches') + ' w-full'}>
            <Radar className="h-4 w-4" /> Matches
          </Link>
          <Link to="/applications" className={linkClass('/applications') + ' w-full'}>
            <Briefcase className="h-4 w-4" /> Job Tracker
          </Link>

          <div className="my-2 border-t border-slate-100" />

          <div className="px-3 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Profile & Settings</div>
          
          {isAdmin && (
            <Link to="/admin" className={linkClass('/admin') + ' w-full justify-between'}>
              <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Admin</span>
              {newTicketCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-brand-600 text-[10px] font-bold text-white">{newTicketCount}</span>}
            </Link>
          )}

          {billing && (
            <Link to="/settings" className={linkClass('/settings') + ' w-full'}>
              <SettingsIcon className="h-4 w-4" /> Settings & Billing
            </Link>
          )}

          <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">
            <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
            <Upload className="h-4 w-4" />
            Import JSON
          </label>

          {careerJourney && (
            <button onClick={handleExportJSON} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 text-left">
              <Download className="h-4 w-4" />
              Export JSON
            </button>
          )}

          <button onClick={handleDownloadTemplate} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 text-left">
            <FileDown className="h-4 w-4" />
            Blank Template
          </button>

          {isFirebaseConfigured && auth && (
            <button onClick={() => signOut(auth!)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 text-left mt-2">
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
