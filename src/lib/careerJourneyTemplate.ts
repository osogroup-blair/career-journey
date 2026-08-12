import { CareerJourney } from '../types/careerJourney';
import { normalizeCareerJourney } from './careerJourneyNormalize';

/**
 * A blank, shareable starting point — the real schema shape, one clearly-marked
 * example in every section (so a new user can see the pattern rather than guess it),
 * and no personal data. Distinct from "Export JSON" (a full backup of the user's own
 * data). `meta.template` marks the file so import can tell the two apart.
 */
export function buildCareerJourneyTemplate(): CareerJourney {
  const today = new Date().toISOString().split('T')[0];

  return normalizeCareerJourney({
    meta: {
      owner: 'Your Name',
      version: '0.1',
      framework: 'Career Journey',
      description: 'A structured record of your work history, skills, and evidence — used to tailor resumes and score job fit.',
      last_updated: today,
      template: true,
      version_0_1_changes: ['Initialized from the blank Career Journey template.'],
    },
    person: {
      name: 'Your Name',
      brand: '',
      summary: 'A short professional summary — who you are and what you do.',
      location: '',
      signature_outcomes: ['EXAMPLE — a top-line proof point, e.g. "Grew revenue from $1M to $5M in two years"'],
      phone: '',
      email: '',
      linkedin: '',
      website: '',
      github: '',
      work_preference: '',
      resume_contact_preference: '',
      positioning: {
        primary_tagline: '',
        target_role_families: [],
        role_orientation: '',
        narrative_anchors: [],
      },
    },
    education: [
      {
        id: 'EDU-001',
        institution: 'EXAMPLE — Your School Name',
        program: 'Your Degree or Program',
        degree_type: '',
        start: '',
        end: '',
        location: '',
        description: '',
        capability_alignment: [],
        skills_reinforced: [],
        achievements: [],
        completion_status: '',
        resume_display: '',
      },
    ],
    certifications: [],
    capabilities: [
      {
        id: 'CAP-001',
        name: 'EXAMPLE — a strategic capability area, e.g. "Solution Architecture"',
        description: '',
        maturity_level: '',
        functions: [
          {
            id: 'FUNC-001',
            name: 'EXAMPLE — a specific function within that capability',
            description: '',
            competency_level: '',
            value_stream_stage: '',
            skills: [
              { id: 'SK-001', name: 'EXAMPLE — a skill demonstrated in this function', description: '', proficiency: '', last_used: '' },
            ],
          },
        ],
      },
    ],
    roles: [
      {
        id: 'ROLE-001',
        organization: 'EXAMPLE — Company Name',
        title: 'Your Job Title',
        start_date: '',
        end_date: 'Present',
        dates: '',
        location: '',
        description: 'What this role was responsible for.',
        initiatives: [
          {
            id: 'INIT-001',
            name: 'EXAMPLE — a named project or initiative',
            description: '',
            deliverables: [
              {
                id: 'DEL-001',
                description: 'EXAMPLE — something you built, shipped, or delivered',
                impact: 'The measurable result it produced',
                capability_alignment: ['CAP-001'],
                skill_ids: ['SK-001'],
              },
            ],
          },
        ],
        positioning_note: '',
        company: 'EXAMPLE — Company Name',
        deliverables: [],
        achievements: [],
        skills: [],
        company_descriptor: '',
        resume_company_descriptor: '',
        resume_company_url: '',
      },
    ],
    achievements: [
      {
        id: 'ACH-001',
        title: 'EXAMPLE — a quantified achievement',
        description: 'What you did and the measurable outcome it produced.',
        category: '',
        role_ids: ['ROLE-001'],
      },
    ],
    skills_index: [
      { id: 'SK-001', name: 'EXAMPLE — a skill you have', category: '', proficiency: '', years_experience: undefined, last_used: '' },
    ],
    vocabularies: {
      maturity_levels: ['Foundational', 'Developing', 'Established', 'Advanced', 'Transformational'],
      competency_levels: ['Basic', 'Operational', 'Proficient', 'Specialized', 'Expert'],
      proficiency_levels: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      value_stream_stages: ['Strategy', 'Architecture', 'Execution'],
    },
    links: {
      keywords: [],
      industries: [],
      education_alignment: [],
      deliverable_function: [],
      certification_alignment: [],
      deliverable_achievement: [],
      timeline_mappings: [],
    },
    application_artifacts: { description: '', artifacts: [] },
    interview_answers: { description: '', answers: [] },
    methodologies: [],
    customer_engagements: [],
    functions: [],
    deliverables: [],
  });
}
