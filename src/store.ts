import { create } from 'zustand';
import { JobAnalysis, JobMatch, MatchPreferences, ResumeBuildOptions, ResumeRoleMode, ResumeSectionRef } from './types';
import { BillingState } from './types/billing';
import { FeatureFlags } from './types/featureFlags';
import { DEFAULT_CAREER_JOURNEY } from './lib/defaultData';
import { dataStore } from './data';
import { auth } from './lib/firebase';
import { generateId } from './lib/utils';
import { buildJobFromMatch } from './lib/matchScan';
import { normalizeCareerJourney } from './lib/careerJourneyNormalize';
import * as journeyMutations from './lib/journeyMutations';
import { produceJourney, type IdAlloc } from './lib/journeyMutations';
import { migrateLegacyJob, advanceStageIfEligible } from './lib/jobPipeline';
import { toastBridge } from './components/ui';
import * as aiClient from './lib/aiClient';
import { scoreResumeKeywords, resumeFingerprint } from './lib/resumeScore';
import { defaultBuildOptions } from './lib/resumeBuild';
import { replaceRoleEntry } from './lib/resumeEdits';

const DEFAULT_MATCH_PREFERENCES: MatchPreferences = {
  excludedKeywords: [],
  minMatchScore: 0,
  trackedCompanies: [],
};

export interface AiTask {
  id: string;
  jobId: string;
  kind: string;
  label: string;
  startedAt: string;
  status: 'running' | 'error';
  error?: string;
}

interface AppState {
  jobs: Record<string, JobAnalysis>;
  matches: Record<string, JobMatch>;
  matchPreferences: MatchPreferences;
  careerJourney: any;
  activeAiTasks: Record<string, AiTask>;
  /**
   * Null in local-only mode (no Firebase, no billing concept — see
   * LocalStorageDataStore.getBilling) or before the first successful fetch.
   * Read-only, mirroring DataStore.getBilling: nothing in this store writes it.
   */
  billing: BillingState | null;
  /** From the `admin` custom claim on the signed-in user's ID token — see server/scripts/setAdmin.ts. False in local-only mode. */
  isAdmin: boolean;
  /** Active feature flags matrix and kill switches */
  featureFlags: FeatureFlags | null;
  hydrate: () => Promise<void>;
  /** Re-fetches billing state on demand — call after returning from Stripe Checkout/Portal, since webhooks land async and the store won't otherwise know a plan changed. */
  refreshBilling: () => Promise<void>;
  /** Re-fetches feature flags on demand */
  refreshFeatureFlags: () => Promise<void>;
  addJob: (job: JobAnalysis) => void;
  updateJob: (id: string, updates: Partial<JobAnalysis>) => void;
  deleteJob: (id: string) => void;
  archiveJob: (id: string, reason: JobAnalysis['archiveReason'], notes?: string) => void;
  /**
   * The one path every AI-triggering action goes through. Fire-and-forget from
   * the caller's perspective — the promise chain lives here in the store, not in
   * any component, so it keeps running (and writes its result to global state)
   * regardless of which screen is mounted when it resolves.
   */
  runAiTask: (jobId: string, kind: string, label: string, run: () => Promise<Partial<JobAnalysis>>) => void;
  dismissAiTask: (taskId: string) => void;
  runParseJob: (jobId: string, jdText: string) => void;
  runFitAndGateAudit: (jobId: string) => void;
  runKeywordExtraction: (jobId: string) => void;
  runClarifyQuestions: (jobId: string) => void;
  runPatchJourney: (jobId: string) => void;
  /** Plan + write in one go (Build without review, Re-plan and rewrite, keyword-gate rebuilds). Uses the job's saved resumeBuildOptions. */
  runGenerateTailoredApplication: (jobId: string, remediation?: string[]) => void;
  /** Step 1 of the reviewed flow: draft the resume strategy only, for the Strategy Review screen. */
  runResumeStrategy: (jobId: string) => void;
  /** Step 2 of the reviewed flow: write the resume from the job's current (possibly user-edited) strategy. */
  runGenerateResume: (jobId: string) => void;
  /** Rewrite one part of the existing resume (summary, skills, or one role) without touching the rest. */
  runRegenerateResumeSection: (jobId: string, section: ResumeSectionRef, instruction?: string) => void;
  /** Change one role's mode in the job's build options (from the preview's condense/remove/restore controls). */
  setResumeRoleMode: (jobId: string, roleId: string, mode: ResumeRoleMode) => void;
  runScoreResume: (jobId: string) => void;
  runGenerateCoverLetter: (jobId: string) => void;
  runApplicationAssistantMessage: (jobId: string, message: string) => void;
  runGenerateFormAnswers: (jobId: string) => void;
  runInterviewPrep: (jobId: string, roundId: string) => void;
  runInterviewPrepChatMessage: (jobId: string, roundId: string, message: string) => void;
  runOfferGuidance: (jobId: string) => void;
  addMatch: (match: JobMatch) => void;
  updateMatch: (id: string, updates: Partial<JobMatch>) => void;
  deleteMatch: (id: string) => void;
  /** Seeds a full JobAnalysis from a scanned match and hands it off to the existing pipeline. Returns the new job id, or null if the match doesn't exist. */
  promoteMatch: (matchId: string) => string | null;
  updateMatchPreferences: (updates: Partial<MatchPreferences>) => void;
  setCareerJourney: (data: any) => void;
  /**
   * The one write path for id-keyed Career Journey edits: clones the journey, runs the
   * recipe (see src/lib/journeyMutations.ts) with a sequential id allocator, stamps
   * meta.last_updated and persists. Returns whatever the recipe returns (e.g. a new id).
   */
  mutateCareerJourney: <T>(recipe: (draft: any, ids: IdAlloc) => T) => T | undefined;
  /** Creates a top-level achievement (with role_ids set) plus a links.timeline_mappings entry — the real cross-referencing model, not an embedded role.achievements[] entry. */
  addAchievementToRole: (roleId: string, achievement: any) => void;
  /** Creates a deliverable nested under the role's first initiative (creating a default initiative if the role has none) — the real model, not an embedded role.deliverables[] entry. */
  addDeliverableToRole: (roleId: string, description: string) => void;
  updateRole: (roleId: string, updates: any) => void;
  addRole: (role: any) => void;
  deleteRole: (roleId: string) => void;
  updateAchievement: (achievementId: string, updates: any) => void;
  deleteAchievement: (achievementId: string) => void;
  updateDeliverable: (deliverableId: string, updates: any) => void;
  deleteDeliverable: (deliverableId: string) => void;
  /** Appends to skills_index with a sequential SK-### id (any id passed in is ignored). */
  addSkillToIndex: (skill: any) => void;
  updateSkill: (skillId: string, updates: any) => void;
  /** Also removes the skill's copies under capability functions and every reference to its id. */
  deleteSkill: (skillId: string) => void;
  updateCareerJourneyMeta: (metaUpdates: any) => void;
  updateCareerJourneyPerson: (personUpdates: any) => void;
}

/** AI task kind for a single-section regenerate — distinct per section so each one shows its own spinner. */
export function resumeSectionTaskKind(section: ResumeSectionRef): string {
  return section.kind === 'role' ? `resumeSection:role:${section.roleId}` : `resumeSection:${section.kind}`;
}

export const useStore = create<AppState>((set, get) => {
  // Fire-and-forget persistence side effects, kept out of the synchronous
  // zustand reducers above so UI updates never wait on storage I/O.
  const persistCareerJourney = () => {
    const cj = get().careerJourney;
    if (cj) dataStore.saveCareerJourney(cj).catch((err) => console.error('Failed to save career journey', err));
  };
  const persistJob = (job: JobAnalysis) => {
    dataStore.saveJob(job).catch((err) => console.error('Failed to save job', err));
  };
  const persistJobDelete = (id: string) => {
    dataStore.deleteJob(id).catch((err) => console.error('Failed to delete job', err));
  };
  const persistMatch = (match: JobMatch) => {
    dataStore.saveMatch(match).catch((err) => console.error('Failed to save match', err));
  };
  const persistMatchDelete = (id: string) => {
    dataStore.deleteMatch(id).catch((err) => console.error('Failed to delete match', err));
  };

  return {
    jobs: {},
    matches: {},
    matchPreferences: DEFAULT_MATCH_PREFERENCES,
    careerJourney: normalizeCareerJourney(DEFAULT_CAREER_JOURNEY),
    activeAiTasks: {},
    billing: null,
    isAdmin: false,
    featureFlags: null,

    hydrate: async () => {
      const [careerJourney, jobs, matches, matchPreferences, billing, idTokenResult, featureFlagsRes] = await Promise.all([
        dataStore.getCareerJourney(),
        dataStore.listJobs(),
        dataStore.listMatches(),
        dataStore.getMatchPreferences(),
        dataStore.getBilling(),
        auth?.currentUser?.getIdTokenResult() ?? Promise.resolve(null),
        fetch('/api/features').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const normalizedJobs = Object.fromEntries(
        Object.entries(jobs ?? {}).map(([id, job]) => [id, migrateLegacyJob(job)])
      );
      set({
        careerJourney: normalizeCareerJourney(careerJourney ?? DEFAULT_CAREER_JOURNEY),
        jobs: normalizedJobs,
        matches: matches ?? {},
        matchPreferences: { ...DEFAULT_MATCH_PREFERENCES, ...(matchPreferences ?? {}) },
        billing,
        isAdmin: idTokenResult?.claims?.admin === true,
        featureFlags: featureFlagsRes,
      });
    },

    refreshBilling: async () => {
      const billing = await dataStore.getBilling();
      set({ billing });
    },

    refreshFeatureFlags: async () => {
      try {
        const res = await fetch('/api/features');
        if (res.ok) {
          const featureFlags = await res.json();
          set({ featureFlags });
        }
      } catch {
        // Ignore network failure
      }
    },

    addJob: (job) => {
      set((state) => ({ jobs: { ...state.jobs, [job.id]: { stage: 'Intake', ...job } } }));
      persistJob(get().jobs[job.id]);
    },
    updateJob: (id, updates) => {
      set((state) => {
        const existing = state.jobs[id];
        if (!existing) return state;
        const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
        return { jobs: { ...state.jobs, [id]: merged } };
      });
      const updated = get().jobs[id];
      if (updated) persistJob(updated);
    },
    deleteJob: (id) => {
      set((state) => {
        const newJobs = { ...state.jobs };
        delete newJobs[id];
        return { jobs: newJobs };
      });
      persistJobDelete(id);
    },
    archiveJob: (id, reason, notes) => {
      const existing = get().jobs[id];
      if (!existing) return;
      get().updateJob(id, {
        stage: 'Archive',
        archivedFromStage: existing.stage,
        archivedAt: new Date().toISOString(),
        archiveReason: reason ?? 'Rejected',
        archiveNotes: notes ?? existing.archiveNotes,
      });
    },

    runAiTask: (jobId, kind, label, run) => {
      const taskId = generateId('TASK');
      set((state) => ({
        activeAiTasks: {
          ...state.activeAiTasks,
          [taskId]: { id: taskId, jobId, kind, label, startedAt: new Date().toISOString(), status: 'running' },
        },
      }));

      run()
        .then((partial) => {
          const job = get().jobs[jobId];
          if (!job) return;
          const merged = { ...job, ...partial };
          const nextStage = advanceStageIfEligible(merged);
          get().updateJob(jobId, { ...partial, stage: nextStage });
          set((state) => {
            const tasks = { ...state.activeAiTasks };
            delete tasks[taskId];
            return { activeAiTasks: tasks };
          });
          toastBridge.success(
            nextStage !== job.stage
              ? `${job.companyName || 'Job'} — ${label} complete, moved to ${nextStage}.`
              : `${job.companyName || 'Job'} — ${label} complete.`
          );
        })
        .catch((err) => {
          console.error(`AI task "${kind}" failed`, err);
          set((state) => ({
            activeAiTasks: {
              ...state.activeAiTasks,
              [taskId]: { ...state.activeAiTasks[taskId], status: 'error', error: err?.message || String(err) },
            },
          }));
          toastBridge.error(`${label} failed: ${err?.message || err}`);
        });
    },

    dismissAiTask: (taskId) => {
      set((state) => {
        const tasks = { ...state.activeAiTasks };
        delete tasks[taskId];
        return { activeAiTasks: tasks };
      });
    },

    runParseJob: (jobId, jdText) => {
      const job = get().jobs[jobId];
      if (!job) return;
      get().runAiTask(jobId, 'parse', 'Parsing job description', async () => {
        const parse = await aiClient.parseJobDescription(jdText, job.companyName, job.roleTitle);
        const { jdSegments, ...jdParse } = parse as any;
        return { jdText, parse: jdParse, jdSegments };
      });
    },

    runFitAndGateAudit: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse) return;
      get().runAiTask(jobId, 'fitAudit', 'Auditing fit & gates', async () => {
        const careerJourney = get().careerJourney;
        const [fitAnalysis, hardGateAudit] = await Promise.all([
          aiClient.scoreFit(job.parse!, careerJourney, job.contextEntries || {}, job.gateClarifications, job.jdSegments),
          aiClient.auditHardGates(job.parse!, careerJourney, job.gateClarifications, job.jdSegments),
        ]);
        return { fitAnalysis, hardGateAudit };
      });
    },

    runKeywordExtraction: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse) return;
      get().runAiTask(jobId, 'keywords', 'Extracting keywords', async () => {
        const keywords = await aiClient.generateKeywordBreakdown(job.parse!, get().careerJourney, job.jdSegments);
        return { keywords };
      });
    },

    runClarifyQuestions: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse || !job.keywords) return;
      get().runAiTask(jobId, 'clarifyQuestions', 'Generating clarifying questions', async () => {
        const clarificationQuestions = await aiClient.generateClarifyingQuestions(job.parse!, get().careerJourney, job.keywords!);
        return { clarificationQuestions };
      });
    },

    runPatchJourney: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.contextEntries) return;
      get().runAiTask(jobId, 'patchJourney', 'Staging Career Journey patch', async () => {
        const { summary, updatedCareerJourney } = await aiClient.stageCareerJourneyPatch(get().careerJourney, job.contextEntries!);
        // Staged only — never applied until the user explicitly approves (see PatchTab.handleApprove).
        return { careerJourneyPatch: summary, pendingCareerJourneyUpdate: updatedCareerJourney };
      });
    },

    runGenerateTailoredApplication: (jobId, remediation) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse || !job.ratingFinalizedAt) return;
      const label = remediation?.length ? 'Rebuilding resume with missing keywords' : 'Building tailored resume';
      get().runAiTask(jobId, 'generateTailoredApplication', label, async () => {
        const careerJourney = get().careerJourney;
        const options = job.resumeBuildOptions ?? defaultBuildOptions(careerJourney);
        const resumeStrategy = await aiClient.generateResumeStrategy(job.parse!, careerJourney, job.contextEntries || {}, options, remediation);
        const resume = await aiClient.generateFullResume(careerJourney, resumeStrategy, job.parse!, options, remediation);
        return { resumeBuildOptions: options, resumeStrategy, resume };
      });
    },

    runResumeStrategy: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse || !job.ratingFinalizedAt) return;
      get().runAiTask(jobId, 'resumeStrategy', 'Drafting resume plan', async () => {
        const careerJourney = get().careerJourney;
        const options = job.resumeBuildOptions ?? defaultBuildOptions(careerJourney);
        const resumeStrategy = await aiClient.generateResumeStrategy(job.parse!, careerJourney, job.contextEntries || {}, options);
        return { resumeBuildOptions: options, resumeStrategy };
      });
    },

    runGenerateResume: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse || !job.resumeStrategy) return;
      get().runAiTask(jobId, 'generateTailoredApplication', 'Writing tailored resume', async () => {
        const careerJourney = get().careerJourney;
        // Read at run time so edits saved on the Strategy Review screen just before clicking are included.
        const current = get().jobs[jobId] ?? job;
        const options = current.resumeBuildOptions ?? defaultBuildOptions(careerJourney);
        const resume = await aiClient.generateFullResume(careerJourney, current.resumeStrategy!, current.parse!, options);
        return { resumeBuildOptions: options, resume };
      });
    },

    runRegenerateResumeSection: (jobId, section, instruction) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse || !job.resume) return;
      const label = section.kind === 'role' ? 'Rewriting role' : section.kind === 'skills' ? 'Rewriting skills' : 'Rewriting summary';
      get().runAiTask(jobId, resumeSectionTaskKind(section), label, async () => {
        const careerJourney = get().careerJourney;
        const options = job.resumeBuildOptions ?? defaultBuildOptions(careerJourney);
        const result = await aiClient.regenerateResumeSection(section, instruction, job.resume!, job.resumeStrategy, job.parse!, careerJourney, options);
        // Merge into the resume as it is *now* — the user may have kept editing other sections while this ran.
        const latest = get().jobs[jobId] ?? job;
        const base = latest.resume ?? job.resume!;
        const latestOptions = latest.resumeBuildOptions ?? options;
        if (section.kind === 'summary' && typeof result.summary === 'string') return { resume: { ...base, summary: result.summary } };
        if (section.kind === 'skills' && result.skills) return { resume: { ...base, skills: result.skills } };
        if (section.kind === 'role' && result.experienceEntry) {
          return {
            resume: replaceRoleEntry(base, section.roleId, result.experienceEntry, careerJourney),
            resumeBuildOptions: { ...latestOptions, roles: { ...latestOptions.roles, [section.roleId]: { ...latestOptions.roles[section.roleId], mode: 'full' } } },
          };
        }
        throw new Error('The AI returned nothing for that section — try again.');
      });
    },

    setResumeRoleMode: (jobId, roleId, mode) => {
      const job = get().jobs[jobId];
      if (!job) return;
      const options: ResumeBuildOptions = job.resumeBuildOptions ?? defaultBuildOptions(get().careerJourney);
      get().updateJob(jobId, { resumeBuildOptions: { ...options, roles: { ...options.roles, [roleId]: { ...options.roles[roleId], mode } } } });
    },

    runScoreResume: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse || !job.resume) return;
      const resume = job.resume;
      const tagline = job.resumeStrategy?.headerTagline || job.roleTitle;
      get().runAiTask(jobId, 'scoreResume', 'Scoring tailored resume', async () => {
        const keywordCoverage = scoreResumeKeywords(resume, tagline, job.keywords, job.parse);
        const result = await aiClient.scoreResume(resume, job.resumeStrategy, job.parse!, job.keywords, keywordCoverage, get().careerJourney);
        return { resumeAiScore: { ...result, resumeFingerprint: resumeFingerprint(resume) } };
      });
    },

    runGenerateCoverLetter: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse) return;
      get().runAiTask(jobId, 'coverLetter', 'Drafting cover letter', async () => {
        const coverLetter = await aiClient.generateCoverLetter(job.parse!, get().careerJourney, job.fitAnalysis, job.resumeStrategy);
        return { coverLetter };
      });
    },

    runApplicationAssistantMessage: (jobId, message) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse) return;
      const transcript = [...(job.applicationAssistantTranscript || []), { role: 'user' as const, content: message }];
      get().updateJob(jobId, { applicationAssistantTranscript: transcript });
      get().runAiTask(jobId, 'applicationAssistant', 'Application Assistant is thinking', async () => {
        const { reply } = await aiClient.sendApplicationAssistantMessage(transcript, job.parse!, get().careerJourney, job.resume, job.fitAnalysis);
        return { applicationAssistantTranscript: [...transcript, { role: 'assistant', content: reply }] };
      });
    },

    runGenerateFormAnswers: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse || !job.applicationFormFields?.length) return;
      get().runAiTask(jobId, 'generateFormAnswers', 'Drafting form answers', async () => {
        const { answers } = await aiClient.generateFormAnswers(job.applicationFormFields!, job.parse!, get().careerJourney, job.resume);
        return { applicationFormAnswers: { ...(job.applicationFormAnswers || {}), ...answers } };
      });
    },

    runInterviewPrep: (jobId, roundId) => {
      const job = get().jobs[jobId];
      const round = job?.interviews?.find((r) => r.id === roundId);
      if (!job || !job.parse || !round) return;
      get().runAiTask(jobId, 'interviewPrep', `Prepping for ${round.roundName}`, async () => {
        const prep = await aiClient.generateInterviewPrep(round, job.parse!, job.fitAnalysis, get().careerJourney);
        const interviews = (job.interviews || []).map((r) => (r.id === roundId ? { ...r, prep } : r));
        return { interviews };
      });
    },

    runInterviewPrepChatMessage: (jobId, roundId, message) => {
      const job = get().jobs[jobId];
      const round = job?.interviews?.find((r) => r.id === roundId);
      if (!job || !job.parse || !round?.prep) return;
      const transcript = [...(round.prep.rehearsalTranscript || []), { role: 'user' as const, content: message }];
      const interviewsWithUserMsg = (job.interviews || []).map((r) => (r.id === roundId ? { ...r, prep: { ...r.prep!, rehearsalTranscript: transcript } } : r));
      get().updateJob(jobId, { interviews: interviewsWithUserMsg });
      get().runAiTask(jobId, 'interviewPrepChat', 'Coach is thinking', async () => {
        const { reply } = await aiClient.sendInterviewPrepChatMessage(transcript, round, job.parse!, get().careerJourney);
        const finalTranscript = [...transcript, { role: 'assistant' as const, content: reply }];
        const interviews = (get().jobs[jobId]?.interviews || []).map((r) => (r.id === roundId ? { ...r, prep: { ...r.prep!, rehearsalTranscript: finalTranscript } } : r));
        return { interviews };
      });
    },

    runOfferGuidance: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse || !job.offer) return;
      get().runAiTask(jobId, 'offerGuidance', 'Getting negotiation guidance', async () => {
        const guidance = await aiClient.getOfferGuidance(job.offer, job.parse!, get().careerJourney);
        return { offer: { ...job.offer!, guidance } };
      });
    },

    addMatch: (match) => {
      set((state) => ({ matches: { ...state.matches, [match.id]: match } }));
      persistMatch(get().matches[match.id]);
    },
    updateMatch: (id, updates) => {
      set((state) => {
        if (!state.matches[id]) return state;
        return {
          matches: {
            ...state.matches,
            [id]: { ...state.matches[id], ...updates, updatedAt: new Date().toISOString() }
          }
        };
      });
      const updated = get().matches[id];
      if (updated) persistMatch(updated);
    },
    deleteMatch: (id) => {
      set((state) => {
        const newMatches = { ...state.matches };
        delete newMatches[id];
        return { matches: newMatches };
      });
      persistMatchDelete(id);
    },
    promoteMatch: (matchId) => {
      const match = get().matches[matchId];
      if (!match) return null;

      const jobId = generateId('JOB');
      const newJob = buildJobFromMatch(match, jobId, new Date().toISOString());

      set((state) => ({ jobs: { ...state.jobs, [jobId]: newJob } }));
      persistJob(get().jobs[jobId]);

      set((state) => ({
        matches: {
          ...state.matches,
          [matchId]: { ...state.matches[matchId], status: 'Promoted', promotedJobId: jobId, updatedAt: new Date().toISOString() }
        }
      }));
      persistMatch(get().matches[matchId]);

      return jobId;
    },
    updateMatchPreferences: (updates) => {
      set((state) => ({ matchPreferences: { ...state.matchPreferences, ...updates } }));
      dataStore.saveMatchPreferences(get().matchPreferences).catch((err) => console.error('Failed to save match preferences', err));
    },
    mutateCareerJourney: (recipe) => {
      const current = get().careerJourney;
      if (!current) return undefined;
      const { journey, result } = produceJourney(current, recipe);
      set({ careerJourney: journey });
      persistCareerJourney();
      return result;
    },
    addAchievementToRole: (roleId, achievement) => {
      get().mutateCareerJourney((d, ids) => {
        if (!journeyMutations.findRole(d, roleId)) return;
        const { id: _ignored, ...fields } = achievement || {};
        journeyMutations.addAchievement(d, ids, { ...fields, title: fields.title || fields.label || 'New Achievement' }, [roleId]);
      });
    },
    addDeliverableToRole: (roleId, description) => {
      get().mutateCareerJourney((d, ids) => {
        const role = journeyMutations.findRole(d, roleId);
        if (!role) return;
        const initiativeId = role.initiatives?.[0]?.id ?? journeyMutations.addInitiative(d, ids, roleId, { name: 'General' });
        if (initiativeId) journeyMutations.addDeliverable(d, ids, initiativeId, { description });
      });
    },
    updateRole: (roleId, updates) => {
      get().mutateCareerJourney((d) => journeyMutations.updateRole(d, roleId, updates));
    },
    addRole: (role) => {
      // Callers that pass their own id keep it; otherwise a sequential ROLE-### is allocated.
      get().mutateCareerJourney((d, ids) => {
        const id = journeyMutations.addRole(d, ids, role);
        if (role?.id) d.roles[0].id = role.id;
        return role?.id || id;
      });
    },
    deleteRole: (roleId) => {
      get().mutateCareerJourney((d) => journeyMutations.deleteRole(d, roleId));
    },
    updateAchievement: (achievementId, updates) => {
      get().mutateCareerJourney((d) => journeyMutations.updateAchievement(d, achievementId, updates));
    },
    deleteAchievement: (achievementId) => {
      get().mutateCareerJourney((d) => journeyMutations.deleteAchievement(d, achievementId));
    },
    updateDeliverable: (deliverableId, updates) => {
      get().mutateCareerJourney((d) => journeyMutations.updateDeliverable(d, deliverableId, updates));
    },
    deleteDeliverable: (deliverableId) => {
      get().mutateCareerJourney((d) => journeyMutations.deleteDeliverable(d, deliverableId));
    },
    addSkillToIndex: (skill) => {
      get().mutateCareerJourney((d, ids) => {
        const { id: _ignored, ...fields } = skill || {};
        return journeyMutations.addSkill(d, ids, fields);
      });
    },
    updateSkill: (skillId, updates) => {
      get().mutateCareerJourney((d) => journeyMutations.updateSkill(d, skillId, updates));
    },
    deleteSkill: (skillId) => {
      get().mutateCareerJourney((d) => journeyMutations.deleteSkill(d, skillId));
    },
    updateCareerJourneyMeta: (metaUpdates) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        copy.meta = { ...copy.meta, ...metaUpdates, last_updated: new Date().toISOString().split('T')[0] };
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    updateCareerJourneyPerson: (personUpdates) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        copy.person = { ...copy.person, ...personUpdates };
        if (copy.meta) copy.meta.last_updated = new Date().toISOString().split('T')[0];
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    setCareerJourney: (data) => {
      set(() => {
        if (!data) return { careerJourney: null };
        const normalized = normalizeCareerJourney(data);
        normalized.meta.last_updated = new Date().toISOString().split('T')[0];
        return { careerJourney: normalized };
      });
      persistCareerJourney();
    },
  };
});
