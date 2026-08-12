import { Firestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { JobAnalysis, JobMatch, MatchPreferences } from '../types';
import { DataStore } from './DataStore';

// Firestore rejects `undefined` field values outright; our types use them freely
// (e.g. `scanError: undefined` to clear a field), so every write goes through this.
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Firestore-backed DataStore, scoped under users/{uid}/... so the schema is
 * multi-tenant-ready even though today there's exactly one user. Swapped in by
 * AuthGate once a user is signed in — see src/data/index.ts.
 */
export class FirestoreDataStore implements DataStore {
  constructor(private db: Firestore, private uid: string) {}

  private careerJourneyRef() {
    return doc(this.db, 'users', this.uid, 'careerJourney', 'current');
  }
  private jobsCollectionRef() {
    return collection(this.db, 'users', this.uid, 'jobs');
  }
  private jobRef(id: string) {
    return doc(this.db, 'users', this.uid, 'jobs', id);
  }
  private matchesCollectionRef() {
    return collection(this.db, 'users', this.uid, 'matches');
  }
  private matchRef(id: string) {
    return doc(this.db, 'users', this.uid, 'matches', id);
  }
  private matchPreferencesRef() {
    return doc(this.db, 'users', this.uid, 'matchPreferences', 'current');
  }

  async getCareerJourney(): Promise<any | null> {
    const snap = await getDoc(this.careerJourneyRef());
    return snap.exists() ? snap.data() : null;
  }

  async saveCareerJourney(journey: any): Promise<void> {
    await setDoc(this.careerJourneyRef(), stripUndefined(journey));
  }

  async listJobs(): Promise<Record<string, JobAnalysis>> {
    const snap = await getDocs(this.jobsCollectionRef());
    const jobs: Record<string, JobAnalysis> = {};
    snap.forEach((d) => { jobs[d.id] = d.data() as JobAnalysis; });
    return jobs;
  }

  async saveJob(job: JobAnalysis): Promise<void> {
    await setDoc(this.jobRef(job.id), stripUndefined(job));
  }

  async deleteJob(id: string): Promise<void> {
    await deleteDoc(this.jobRef(id));
  }

  async listMatches(): Promise<Record<string, JobMatch>> {
    const snap = await getDocs(this.matchesCollectionRef());
    const matches: Record<string, JobMatch> = {};
    snap.forEach((d) => { matches[d.id] = d.data() as JobMatch; });
    return matches;
  }

  async saveMatch(match: JobMatch): Promise<void> {
    await setDoc(this.matchRef(match.id), stripUndefined(match));
  }

  async deleteMatch(id: string): Promise<void> {
    await deleteDoc(this.matchRef(id));
  }

  async getMatchPreferences(): Promise<MatchPreferences | null> {
    const snap = await getDoc(this.matchPreferencesRef());
    return snap.exists() ? (snap.data() as MatchPreferences) : null;
  }

  async saveMatchPreferences(prefs: MatchPreferences): Promise<void> {
    await setDoc(this.matchPreferencesRef(), stripUndefined(prefs));
  }
}
