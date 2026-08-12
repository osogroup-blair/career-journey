import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useStore } from '../store';
import { generateId } from '../lib/utils';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import { Compass, Briefcase, Award, Plus, Upload, Download, Pencil, Radar, LogOut } from 'lucide-react';
import { Button } from './ui';

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { careerJourney, addJob, setCareerJourney } = useStore();

  const handleExportJSON = () => {
    if (!careerJourney) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(careerJourney, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `career_journey_v${careerJourney?.meta?.version || '1.0.0'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        setCareerJourney(json);
        alert('Career Journey loaded successfully!');
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
              title="Export full Career Journey JSON"
            >
              <Download className="h-3.5 w-3.5" />
              Export JSON
            </button>
          )}

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
