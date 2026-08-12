import React, { useState } from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent } from '../components/ui';
import { dataStore } from '../data';
import { isFirebaseConfigured } from '../lib/firebase';
import { JobAnalysis, JobMatch, MatchPreferences } from '../types';
import { CloudUpload, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

const CAREER_JOURNEY_KEY = 'career-journey:careerJourney';
const JOBS_KEY = 'career-journey:jobs';
const MATCHES_KEY = 'career-journey:matches';
const MATCH_PREFERENCES_KEY = 'career-journey:matchPreferences';

interface MigrationResult {
  careerJourney: boolean;
  jobsCount: number;
  matchesCount: number;
  preferences: boolean;
}

/**
 * One-time helper for moving data written by LocalStorageDataStore into whatever
 * DataStore is currently active (FirestoreDataStore, once signed in). Safe to run
 * more than once — every write here is an overwrite-by-id, not an append.
 */
export default function Migrate() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState('');

  const localCareerJourney = (() => {
    try {
      const raw = localStorage.getItem(CAREER_JOURNEY_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const localJobs: Record<string, JobAnalysis> = (() => {
    try {
      const raw = localStorage.getItem(JOBS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();
  const localMatches: Record<string, JobMatch> = (() => {
    try {
      const raw = localStorage.getItem(MATCHES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();
  const localPreferences: MatchPreferences | null = (() => {
    try {
      const raw = localStorage.getItem(MATCH_PREFERENCES_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const handleMigrate = async () => {
    setIsRunning(true);
    setError('');
    try {
      if (localCareerJourney) await dataStore.saveCareerJourney(localCareerJourney);
      for (const job of Object.values(localJobs)) await dataStore.saveJob(job);
      for (const match of Object.values(localMatches)) await dataStore.saveMatch(match);
      if (localPreferences) await dataStore.saveMatchPreferences(localPreferences);

      setResult({
        careerJourney: Boolean(localCareerJourney),
        jobsCount: Object.keys(localJobs).length,
        matchesCount: Object.keys(localMatches).length,
        preferences: Boolean(localPreferences),
      });
    } catch (err: any) {
      setError(err?.message || 'Migration failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Migrate to Firestore</h1>
        <p className="text-sm text-slate-500 mt-1">
          Copies everything currently stored in this browser's local storage into your active data store. Safe to run more than once.
        </p>
      </div>

      {!isFirebaseConfigured ? (
        <Card>
          <CardContent className="pt-6 flex items-start gap-3 text-sm text-slate-600">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <span>
              Firebase isn't configured yet, so this app is already running entirely on local storage — there's nothing to migrate to.
              Set the <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">VITE_FIREBASE_*</code> environment variables once your
              Firebase project is ready, then come back here after signing in.
            </span>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CloudUpload className="w-4 h-4 text-brand-600" />
              What will be migrated
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-sm text-slate-700 space-y-1.5">
              <li>Career Journey: <strong>{localCareerJourney ? `v${localCareerJourney.meta?.version || '?'}` : 'nothing found locally'}</strong></li>
              <li>Job analyses: <strong>{Object.keys(localJobs).length}</strong></li>
              <li>Job matches: <strong>{Object.keys(localMatches).length}</strong></li>
              <li>Match preferences: <strong>{localPreferences ? 'found' : 'nothing found locally'}</strong></li>
            </ul>

            {error && (
              <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Migrated {result.careerJourney ? 'your Career Journey, ' : ''}{result.jobsCount} job analys{result.jobsCount === 1 ? 'is' : 'es'},{' '}
                  {result.matchesCount} match{result.matchesCount === 1 ? '' : 'es'}{result.preferences ? ', and your match preferences' : ''}.
                </span>
              </div>
            )}

            <Button onClick={handleMigrate} disabled={isRunning} className="flex items-center gap-2">
              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              {isRunning ? 'Migrating…' : 'Migrate Now'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
