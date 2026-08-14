import { create } from 'zustand';
import { JobAnalysis, JobMatch, MatchPreferences } from './types';
import { BillingState } from './types/billing';
import { FeatureFlags } from './types/featureFlags';
import { DEFAULT_CAREER_JOURNEY } from './lib/defaultData';
import { dataStore } from './data';
import { auth } from './lib/firebase';
import { generateId } from './lib/utils';
import { normalizeCareerJourney } from './lib/careerJourneyNormalize';
import { migrateLegacyJob, advanceStageIfEligible } from './lib/jobPipeline';
import { toastBridge } from './components/ui';
import * as aiClient from './lib/aiClient';

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
  runGenerateTailoredApplication: (jobId: string) => void;
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
  addSkillToIndex: (skill: any) => void;
  updateSkillAtIndex: (index: number, skill: any) => void;
  deleteSkillAtIndex: (index: number) => void;
  updateCareerJourneyMeta: (metaUpdates: any) => void;
  updateCareerJourneyPerson: (personUpdates: any) => void;
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

    runGenerateTailoredApplication: (jobId) => {
      const job = get().jobs[jobId];
      if (!job || !job.parse || !job.ratingFinalizedAt) return;
      get().runAiTask(jobId, 'generateTailoredApplication', 'Building tailored resume', async () => {
        const careerJourney = get().careerJourney;
        const resumeStrategy = await aiClient.generateResumeStrategy(job.parse!, careerJourney, job.contextEntries || {});
        const resume = await aiClient.generateFullResume(careerJourney, resumeStrategy, job.parse!);
        return { resumeStrategy, resume };
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
      const newJob: JobAnalysis = {
        id: jobId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stage: match.parse ? 'Parsed' : 'Intake',
        companyName: match.companyName,
        roleTitle: match.roleTitle,
        jdText: match.jdText,
        parse: match.parse,
      };

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
    addAchievementToRole: (roleId, achievement) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const role = copy.roles?.find((r: any) => r.id === roleId);
        if (role) {
          const id = achievement.id || generateId('ACH');
          const newAchievement = {
            ...achievement,
            id,
            title: achievement.title || achievement.label || 'New Achievement',
            role_ids: [roleId],
          };
          if (!Array.isArray(copy.achievements)) copy.achievements = [];
          copy.achievements.unshift(newAchievement);
          if (!copy.links) copy.links = { keywords: [], industries: [], education_alignment: [], deliverable_function: [], certification_alignment: [], deliverable_achievement: [], timeline_mappings: [] };
          if (!Array.isArray(copy.links.timeline_mappings)) copy.links.timeline_mappings = [];
          copy.links.timeline_mappings.push({
            id: generateId('MAP'),
            entity_type: 'achievement',
            entity_id: id,
            role_id: roleId,
            context: `Added via role editor for ${role.organization || role.company || 'this role'}.`,
          });
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    addDeliverableToRole: (roleId, description) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const role = copy.roles?.find((r: any) => r.id === roleId);
        if (role) {
          if (!Array.isArray(role.initiatives)) role.initiatives = [];
          if (role.initiatives.length === 0) {
            role.initiatives.push({ id: generateId('INIT'), name: 'General', description: '', deliverables: [] });
          }
          const initiative = role.initiatives[0];
          if (!Array.isArray(initiative.deliverables)) initiative.deliverables = [];
          initiative.deliverables.unshift({
            id: generateId('DEL'),
            description,
            impact: '',
            capability_alignment: [],
            skill_ids: [],
          });
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    updateRole: (roleId, updates) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const roleIndex = copy.roles?.findIndex((r: any) => r.id === roleId);
        if (roleIndex !== -1) {
          copy.roles[roleIndex] = { ...copy.roles[roleIndex], ...updates };
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    addRole: (role) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        if (!Array.isArray(copy.roles)) copy.roles = [];
        copy.roles.unshift(role);
        copy.meta.last_updated = new Date().toISOString().split('T')[0];
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    deleteRole: (roleId) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        copy.roles = (copy.roles || []).filter((r: any) => r.id !== roleId);
        copy.meta.last_updated = new Date().toISOString().split('T')[0];
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    updateAchievement: (achievementId, updates) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const idx = (copy.achievements || []).findIndex((a: any) => a.id === achievementId);
        if (idx !== -1) {
          copy.achievements[idx] = { ...copy.achievements[idx], ...updates };
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    deleteAchievement: (achievementId) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        copy.achievements = (copy.achievements || []).filter((a: any) => a.id !== achievementId);
        if (copy.links?.timeline_mappings) {
          copy.links.timeline_mappings = copy.links.timeline_mappings.filter(
            (m: any) => !(m.entity_type === 'achievement' && m.entity_id === achievementId)
          );
        }
        copy.meta.last_updated = new Date().toISOString().split('T')[0];
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    // Deliverables live nested under roles[].initiatives[].deliverables[] — searches
    // every role/initiative rather than requiring the caller to know where a given
    // deliverable id lives.
    updateDeliverable: (deliverableId, updates) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        for (const role of copy.roles || []) {
          for (const initiative of role.initiatives || []) {
            const idx = (initiative.deliverables || []).findIndex((d: any) => d.id === deliverableId);
            if (idx !== -1) {
              initiative.deliverables[idx] = { ...initiative.deliverables[idx], ...updates };
              copy.meta.last_updated = new Date().toISOString().split('T')[0];
              return { careerJourney: copy };
            }
          }
        }
        return state;
      });
      persistCareerJourney();
    },
    deleteDeliverable: (deliverableId) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        for (const role of copy.roles || []) {
          for (const initiative of role.initiatives || []) {
            const before = (initiative.deliverables || []).length;
            initiative.deliverables = (initiative.deliverables || []).filter((d: any) => d.id !== deliverableId);
            if (initiative.deliverables.length !== before) {
              copy.meta.last_updated = new Date().toISOString().split('T')[0];
              return { careerJourney: copy };
            }
          }
        }
        return state;
      });
      persistCareerJourney();
    },
    addSkillToIndex: (skill) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        if (!Array.isArray(copy.skills_index)) copy.skills_index = [];
        copy.skills_index.push(skill);
        copy.meta.last_updated = new Date().toISOString().split('T')[0];
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    updateSkillAtIndex: (index, skill) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        if (Array.isArray(copy.skills_index) && copy.skills_index[index] !== undefined) {
          copy.skills_index[index] = skill;
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      });
      persistCareerJourney();
    },
    deleteSkillAtIndex: (index) => {
      set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        if (Array.isArray(copy.skills_index)) {
          copy.skills_index.splice(index, 1);
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      });
      persistCareerJourney();
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
