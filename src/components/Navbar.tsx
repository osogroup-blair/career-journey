import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useStore } from '../store';
import { generateId } from '../lib/utils';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import {
  Compass, Briefcase, Award, Plus, Upload, Download, FileDown, Pencil, Radar,
  LogOut, Sparkles, TrendingUp, Menu, X, MoreHorizontal, ChevronDown, CreditCard,
  Settings as SettingsIcon
} from 'lucide-react';
import { Button, useToast } from './ui';
import { parseCareerJourneyImport } from '../lib/careerJourneyImport';
import { buildCareerJourneyTemplate } from '../lib/careerJourneyTemplate';
import { validateCareerJourney } from '../lib/careerJourneyNormalize';

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

// Primary journey, grouped by phase: shape your Career Journey, then find & pursue jobs with it.
const JOURNEY_GROUPS: NavItem[][] = [
  [
    { to: '/build', label: 'Build', icon: Sparkles },
    { to: '/edit', label: 'Edit', icon: Pencil },
    { to: '/strengthen', label: 'Strengthen', icon: TrendingUp },
  ],
  [
    { to: '/matches', label: 'Matches', icon: Radar },
    { to: '/applications', label: 'Job Tracker', icon: Briefcase },
  ],
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { careerJourney, addJob, setCareerJourney, billing, isAdmin } = useStore();
  const toast = useToast();

  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Close mobile menu on route change.
  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
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

  const renderNavItem = (item: NavItem) => (
    <Link key={item.to} to={item.to} className={linkClass(item.to)}>
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  );

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
              <span className="block text-[10px] uppercase font-semibold text-brand-600 tracking-wider">Tailor your resume to any role</span>
            </div>
          </Link>

          {/* Desktop Navigation — grouped by phase of the journey */}
          <nav className="hidden md:flex items-center gap-1 ml-2">
            <Link to="/" className={linkClass('/')}>
              <Compass className="h-4 w-4" />
              Dashboard
            </Link>

            {JOURNEY_GROUPS.map((group, i) => (
              <React.Fragment key={i}>
                <span className="w-px h-5 bg-slate-200 mx-1" aria-hidden="true" />
                {group.map(renderNavItem)}
              </React.Fragment>
            ))}

            {/* More — secondary/power-user tools, out of the primary flow */}
            <div className="relative ml-1" ref={moreRef}>
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  moreOpen || isActive('/journey')
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <MoreHorizontal className="h-4 w-4" />
                More
                <ChevronDown className={`h-3 w-3 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>

              {moreOpen && (
                <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50">
                  <Link
                    to="/journey"
                    className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Award className="h-4 w-4 text-slate-400" />
                    Advanced Editor
                  </Link>

                  {isAdmin && (
                    <>
                      <Link
                        to="/admin/prompts"
                        className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Sparkles className="h-4 w-4 text-slate-400" />
                        Admin — AI Prompts
                      </Link>
                      <Link
                        to="/admin/users"
                        className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Sparkles className="h-4 w-4 text-slate-400" />
                        Admin — Users
                      </Link>
                      <Link
                        to="/admin/flags"
                        className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Sparkles className="h-4 w-4 text-slate-400" />
                        Admin — Feature Flags
                      </Link>
                      <Link
                        to="/admin/models"
                        className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Sparkles className="h-4 w-4 text-slate-400" />
                        Admin — Models
                      </Link>
                    </>
                  )}

                  {billing && (
                    <Link
                      to="/settings"
                      className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <SettingsIcon className="h-4 w-4 text-slate-400" />
                      Settings
                    </Link>
                  )}

                  <div className="my-1.5 border-t border-slate-100" />

                  <label className="flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                    <Upload className="h-4 w-4 text-slate-400" />
                    Import JSON
                  </label>

                  {careerJourney && (
                    <button
                      onClick={handleExportJSON}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left"
                    >
                      <Download className="h-4 w-4 text-slate-400" />
                      Export JSON
                    </button>
                  )}

                  <button
                    onClick={handleDownloadTemplate}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <FileDown className="h-4 w-4 text-slate-400" />
                    Blank Template
                  </button>
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Primary Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Button onClick={createNewJob} size="sm" className="hidden sm:inline-flex bg-brand-600 hover:bg-brand-700 text-white shadow-xs">
            <Plus className="h-4 w-4 mr-1" />
            New Job Analysis
          </Button>
          <Button onClick={createNewJob} size="sm" className="sm:hidden bg-brand-600 hover:bg-brand-700 text-white shadow-xs px-2.5">
            <Plus className="h-4 w-4" />
          </Button>

          {billing && (
            <Link
              to="/upgrade"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              title={billing.plan === 'free' ? 'Upgrade' : 'Manage billing'}
            >
              <CreditCard className="h-3.5 w-3.5" />
              {billing.plan === 'free' ? `${billing.freeAiActionsUsed}/20 free` : 'Billing'}
            </Link>
          )}

          {isFirebaseConfigured && auth && (
            <button
              onClick={() => signOut(auth!)}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          )}

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
          <Link to="/" className={linkClass('/') + ' w-full'}>
            <Compass className="h-4 w-4" />
            Dashboard
          </Link>
          {JOURNEY_GROUPS.flat().map((item) => (
            <Link key={item.to} to={item.to} className={linkClass(item.to) + ' w-full'}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}

          <div className="my-2 border-t border-slate-100" />

          <Link to="/journey" className={linkClass('/journey') + ' w-full'}>
            <Award className="h-4 w-4" />
            Advanced Editor
          </Link>

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

          {billing && (
            <Link to="/upgrade" className={linkClass('/upgrade') + ' w-full'}>
              <CreditCard className="h-4 w-4" />
              {billing.plan === 'free' ? `Upgrade (${billing.freeAiActionsUsed}/20 free)` : 'Billing'}
            </Link>
          )}

          {isFirebaseConfigured && auth && (
            <button onClick={() => signOut(auth!)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 text-left">
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
