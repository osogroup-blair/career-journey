import { JobAnalysis, JobMatch, MatchPreferences } from '../types';
import { PromptConfig, PromptChangeLogEntry } from '../types/promptConfig';
import { BillingState } from '../types/billing';
import { AllowedModelsConfig } from '../types/aiModels';

/**
 * Persistence boundary for the app's data domains (Career Journey, Jobs, Matches).
 * Shaped after where this data lives once it moves to Firestore
 * (`users/{uid}/careerJourney/current` as a single doc, `users/{uid}/jobs/{jobId}`
 * and `users/{uid}/matches/{matchId}` as subcollections) so implementations can
 * be swapped without touching callers.
 */
export interface DataStore {
  getCareerJourney(): Promise<any | null>;
  saveCareerJourney(journey: any): Promise<void>;

  /**
   * Read-only: billing/plan state is written exclusively server-side (AI
   * quota transaction, Stripe webhooks) — see users/{uid}/meta/billing in
   * firestore.rules. There is no saveBilling here on purpose.
   */
  getBilling(): Promise<BillingState | null>;

  /**
   * Admin-managed BYOM model picker source (config/allowedModels) — read-only
   * from the client, same reasoning as getBilling. Null in local-only mode.
   */
  getAllowedModels(): Promise<AllowedModelsConfig | null>;

  listJobs(): Promise<Record<string, JobAnalysis>>;
  saveJob(job: JobAnalysis): Promise<void>;
  deleteJob(id: string): Promise<void>;

  listMatches(): Promise<Record<string, JobMatch>>;
  saveMatch(match: JobMatch): Promise<void>;
  deleteMatch(id: string): Promise<void>;

  getMatchPreferences(): Promise<MatchPreferences | null>;
  saveMatchPreferences(prefs: MatchPreferences): Promise<void>;

  getPromptConfigs(): Promise<Record<string, PromptConfig>>;
  savePromptConfig(config: PromptConfig): Promise<void>;
  getPromptChangeLog(promptId: string): Promise<PromptChangeLogEntry[]>;
}
