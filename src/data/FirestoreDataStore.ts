import { Firestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { JobAnalysis, JobMatch, MatchPreferences } from '../types';
import { PromptConfig, PromptChangeLogEntry } from '../types/promptConfig';
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
  private promptConfigsCollectionRef() {
    return collection(this.db, 'users', this.uid, 'promptConfigs');
  }
  private promptConfigRef(id: string) {
    return doc(this.db, 'users', this.uid, 'promptConfigs', id);
  }
  private promptChangeLogCollectionRef(promptId: string) {
    return collection(this.db, 'users', this.uid, 'promptConfigs', promptId, 'changeLog');
  }

  async getCareerJourney(): Promise<any | null> {
    const snap = await getDoc(this.careerJourneyRef());
    return snap.exists() ? snap.data() : null;
  }

  // Firestore caps a single doc at 1MB. This doc holds the whole career journey
  // (roles/achievements/skills/education) as one blob, so warn well before that
  // ceiling rather than fail silently at write time. If this ever fires for real,
  // the fix is to split roles/achievements/skills_index/education into their own
  // subcollections under users/{uid}/..., mirroring the jobs/matches pattern above.
  private static readonly CAREER_JOURNEY_WARN_BYTES = 500_000;

  async saveCareerJourney(journey: any): Promise<void> {
    const clean = stripUndefined(journey);
    const size = new Blob([JSON.stringify(clean)]).size;
    if (size > FirestoreDataStore.CAREER_JOURNEY_WARN_BYTES) {
      console.warn(
        `careerJourney doc for uid ${this.uid} is ${(size / 1000).toFixed(0)}KB — approaching Firestore's 1MB doc limit.`
      );
    }
    await setDoc(this.careerJourneyRef(), clean);
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

  async getPromptConfigs(): Promise<Record<string, PromptConfig>> {
    const snap = await getDocs(this.promptConfigsCollectionRef());
    const configs: Record<string, PromptConfig> = {};
    snap.forEach((d) => { configs[d.id] = d.data() as PromptConfig; });
    return configs;
  }

  async savePromptConfig(config: PromptConfig): Promise<void> {
    const existing = await getDoc(this.promptConfigRef(config.id));
    if (existing.exists()) {
      const previous = existing.data() as PromptConfig;
      const entry: PromptChangeLogEntry = {
        id: `LOG-${Date.now()}`,
        promptId: config.id,
        version: previous.version,
        changedAt: new Date().toISOString(),
        previousTemplate: previous.template,
      };
      await setDoc(doc(this.promptChangeLogCollectionRef(config.id), entry.id), stripUndefined(entry));
    }
    await setDoc(this.promptConfigRef(config.id), stripUndefined(config));
  }

  async getPromptChangeLog(promptId: string): Promise<PromptChangeLogEntry[]> {
    const q = query(this.promptChangeLogCollectionRef(promptId), orderBy('changedAt', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as PromptChangeLogEntry);
  }
}
