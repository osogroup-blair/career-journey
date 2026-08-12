import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { JobAnalysis } from './types';
import { DEFAULT_CAREER_JOURNEY } from './lib/defaultData';

interface AppState {
  jobs: Record<string, JobAnalysis>;
  careerJourney: any;
  addJob: (job: JobAnalysis) => void;
  updateJob: (id: string, updates: Partial<JobAnalysis>) => void;
  deleteJob: (id: string) => void;
  setCareerJourney: (data: any) => void;
  addAchievementToRole: (roleId: string, achievement: any) => void;
  addDeliverableToRole: (roleId: string, deliverable: string) => void;
  updateRole: (roleId: string, updates: any) => void;
  addRole: (role: any) => void;
  deleteRole: (roleId: string) => void;
  updateAchievementAtIndex: (roleId: string, index: number, achievement: any) => void;
  deleteAchievementAtIndex: (roleId: string, index: number) => void;
  updateDeliverableAtIndex: (roleId: string, index: number, deliverable: any) => void;
  deleteDeliverableAtIndex: (roleId: string, index: number) => void;
  addSkillToIndex: (skill: any) => void;
  updateSkillAtIndex: (index: number, skill: any) => void;
  deleteSkillAtIndex: (index: number) => void;
  updateCareerJourneyMeta: (metaUpdates: any) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      jobs: {},
      careerJourney: DEFAULT_CAREER_JOURNEY,
      addJob: (job) => set((state) => ({ jobs: { ...state.jobs, [job.id]: job } })),
      updateJob: (id, updates) => set((state) => ({
        jobs: {
          ...state.jobs,
          [id]: { ...state.jobs[id], ...updates, updatedAt: new Date().toISOString() }
        }
      })),
      deleteJob: (id) => set((state) => {
        const newJobs = { ...state.jobs };
        delete newJobs[id];
        return { jobs: newJobs };
      }),
      addAchievementToRole: (roleId, achievement) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const role = copy.roles?.find((r: any) => r.id === roleId);
        if (role) {
          if (!Array.isArray(role.achievements)) role.achievements = [];
          role.achievements.unshift(achievement);
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      }),
      addDeliverableToRole: (roleId, deliverable) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const role = copy.roles?.find((r: any) => r.id === roleId);
        if (role) {
          if (!Array.isArray(role.deliverables)) role.deliverables = [];
          role.deliverables.unshift(deliverable);
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      }),
      updateRole: (roleId, updates) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const roleIndex = copy.roles?.findIndex((r: any) => r.id === roleId);
        if (roleIndex !== -1) {
          copy.roles[roleIndex] = { ...copy.roles[roleIndex], ...updates };
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      }),
      addRole: (role) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        if (!Array.isArray(copy.roles)) copy.roles = [];
        copy.roles.unshift(role);
        copy.meta.last_updated = new Date().toISOString().split('T')[0];
        return { careerJourney: copy };
      }),
      deleteRole: (roleId) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        copy.roles = (copy.roles || []).filter((r: any) => r.id !== roleId);
        copy.meta.last_updated = new Date().toISOString().split('T')[0];
        return { careerJourney: copy };
      }),
      updateAchievementAtIndex: (roleId, index, achievement) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const role = copy.roles?.find((r: any) => r.id === roleId);
        if (role && Array.isArray(role.achievements) && role.achievements[index] !== undefined) {
          role.achievements[index] = achievement;
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      }),
      deleteAchievementAtIndex: (roleId, index) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const role = copy.roles?.find((r: any) => r.id === roleId);
        if (role && Array.isArray(role.achievements)) {
          role.achievements.splice(index, 1);
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      }),
      updateDeliverableAtIndex: (roleId, index, deliverable) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const role = copy.roles?.find((r: any) => r.id === roleId);
        if (role && Array.isArray(role.deliverables) && role.deliverables[index] !== undefined) {
          role.deliverables[index] = deliverable;
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      }),
      deleteDeliverableAtIndex: (roleId, index) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        const role = copy.roles?.find((r: any) => r.id === roleId);
        if (role && Array.isArray(role.deliverables)) {
          role.deliverables.splice(index, 1);
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      }),
      addSkillToIndex: (skill) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        if (!Array.isArray(copy.skills_index)) copy.skills_index = [];
        copy.skills_index.push(skill);
        copy.meta.last_updated = new Date().toISOString().split('T')[0];
        return { careerJourney: copy };
      }),
      updateSkillAtIndex: (index, skill) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        if (Array.isArray(copy.skills_index) && copy.skills_index[index] !== undefined) {
          copy.skills_index[index] = skill;
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      }),
      deleteSkillAtIndex: (index) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        if (Array.isArray(copy.skills_index)) {
          copy.skills_index.splice(index, 1);
          copy.meta.last_updated = new Date().toISOString().split('T')[0];
        }
        return { careerJourney: copy };
      }),
      updateCareerJourneyMeta: (metaUpdates) => set((state) => {
        if (!state.careerJourney) return state;
        const copy = JSON.parse(JSON.stringify(state.careerJourney));
        copy.meta = { ...copy.meta, ...metaUpdates, last_updated: new Date().toISOString().split('T')[0] };
        return { careerJourney: copy };
      }),
      setCareerJourney: (data) => set(() => {
        if (!data) return { careerJourney: null };
        const copy = JSON.parse(JSON.stringify(data));
        
        // Auto-normalize older or partial structures into standard 12-tier ontology cleanly
        if (!copy.meta) {
          copy.meta = { 
            owner: "User Profile", 
            version: "1.0.0", 
            framework: "TailorFlow v2", 
            description: "", 
            last_updated: new Date().toISOString().split('T')[0], 
            version_X_Y_changes: [] 
          };
        }
        if (!Array.isArray(copy.meta.version_X_Y_changes)) {
          copy.meta.version_X_Y_changes = [];
        }
        copy.meta.last_updated = new Date().toISOString().split('T')[0];
        
        if (!copy.roles) copy.roles = [];
        copy.roles = copy.roles.map((r: any, idx: number) => {
          const newRole = { ...r };
          if (!newRole.id) newRole.id = `ROLE-${String(idx + 1).padStart(3, '0')}`;
          if (!newRole.organization) newRole.organization = newRole.company || "Unknown Company";
          if (!newRole.company) newRole.company = newRole.organization;
          if (!newRole.start_date) newRole.start_date = newRole.dates?.split('-')[0]?.trim() || "2020";
          if (!newRole.end_date) newRole.end_date = newRole.dates?.split('-')[1]?.trim() || "Present";
          if (!newRole.dates) newRole.dates = `${newRole.start_date} - ${newRole.end_date}`;
          if (!Array.isArray(newRole.initiatives)) newRole.initiatives = [];
          if (!Array.isArray(newRole.deliverables)) newRole.deliverables = [];
          if (!Array.isArray(newRole.achievements)) newRole.achievements = [];
          if (!Array.isArray(newRole.skills)) newRole.skills = [];
          return newRole;
        });

        if (!copy.achievements) copy.achievements = [];
        if (!copy.skills_index) copy.skills_index = [];
        if (!copy.capabilities) copy.capabilities = [];
        if (!copy.links) copy.links = { keywords: [], industries: [], deliverable_achievement: [], education_alignment: [], timeline_mappings: [] };
        if (!copy.links.keywords) copy.links.keywords = [];
        if (!copy.links.industries) copy.links.industries = [];
        if (!copy.links.deliverable_achievement) copy.links.deliverable_achievement = [];
        if (!copy.links.education_alignment) copy.links.education_alignment = [];
        if (!copy.links.timeline_mappings) copy.links.timeline_mappings = [];

        if (!Array.isArray(copy.methodologies)) copy.methodologies = [];
        if (!Array.isArray(copy.functions)) copy.functions = [];
        if (!Array.isArray(copy.deliverables)) copy.deliverables = [];
        if (!Array.isArray(copy.customer_engagements)) copy.customer_engagements = [];
        if (!Array.isArray(copy.education)) copy.education = [];
        if (!copy.vocabularies) {
          copy.vocabularies = { 
            competency_levels: ["L1-Associate", "L2-Intermediate", "L3-Senior", "L4-Principal", "L5-Distinguished"], 
            proficiency_levels: ["Beginner", "Intermediate", "Advanced", "Expert"], 
            value_stream_stages: ["Discovery", "Definition", "Refinement", "Validation", "Scale Operations"] 
          };
        }

        return { careerJourney: copy };
      }),
    }),
    {
      name: 'job-fit-storage',
    }
  )
);
