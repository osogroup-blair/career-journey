import { JobAnalysis, JobMatch, MatchPreferences } from '../types';
import { DataStore } from './DataStore';

const OLD_COMBINED_KEY = 'job-fit-storage';
const CAREER_JOURNEY_KEY = 'career-journey:careerJourney';
const JOBS_KEY = 'career-journey:jobs';
const MATCHES_KEY = 'career-journey:matches';
const MATCH_PREFERENCES_KEY = 'career-journey:matchPreferences';

/**
 * One-time migration from the old zustand `persist` envelope
 * (`{ state: { careerJourney, jobs }, version }` under `job-fit-storage`)
 * into the split keys this store now owns. Leaves the old key alone so
 * there's no destructive step if something goes wrong.
 */
function migrateFromOldBlobIfNeeded(): void {
  const alreadyMigrated = localStorage.getItem(CAREER_JOURNEY_KEY) !== null || localStorage.getItem(JOBS_KEY) !== null;
  if (alreadyMigrated) return;

  const raw = localStorage.getItem(OLD_COMBINED_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    const oldState = parsed?.state;
    if (!oldState) return;
    if (oldState.careerJourney !== undefined) {
      localStorage.setItem(CAREER_JOURNEY_KEY, JSON.stringify(oldState.careerJourney));
    }
    if (oldState.jobs !== undefined) {
      localStorage.setItem(JOBS_KEY, JSON.stringify(oldState.jobs));
    }
  } catch (err) {
    console.error('Failed to migrate legacy career-journey storage', err);
  }
}

export class LocalStorageDataStore implements DataStore {
  private migrated = false;

  private ensureMigrated() {
    if (this.migrated) return;
    this.migrated = true;
    migrateFromOldBlobIfNeeded();
  }

  async getCareerJourney(): Promise<any | null> {
    this.ensureMigrated();
    const raw = localStorage.getItem(CAREER_JOURNEY_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  async saveCareerJourney(journey: any): Promise<void> {
    localStorage.setItem(CAREER_JOURNEY_KEY, JSON.stringify(journey));
  }

  async listJobs(): Promise<Record<string, JobAnalysis>> {
    this.ensureMigrated();
    const raw = localStorage.getItem(JOBS_KEY);
    return raw ? JSON.parse(raw) : {};
  }

  async saveJob(job: JobAnalysis): Promise<void> {
    const jobs = await this.listJobs();
    jobs[job.id] = job;
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  }

  async deleteJob(id: string): Promise<void> {
    const jobs = await this.listJobs();
    delete jobs[id];
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  }

  async listMatches(): Promise<Record<string, JobMatch>> {
    const raw = localStorage.getItem(MATCHES_KEY);
    return raw ? JSON.parse(raw) : {};
  }

  async saveMatch(match: JobMatch): Promise<void> {
    const matches = await this.listMatches();
    matches[match.id] = match;
    localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
  }

  async deleteMatch(id: string): Promise<void> {
    const matches = await this.listMatches();
    delete matches[id];
    localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
  }

  async getMatchPreferences(): Promise<MatchPreferences | null> {
    const raw = localStorage.getItem(MATCH_PREFERENCES_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  async saveMatchPreferences(prefs: MatchPreferences): Promise<void> {
    localStorage.setItem(MATCH_PREFERENCES_KEY, JSON.stringify(prefs));
  }
}
