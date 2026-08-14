import { PlanId } from './billing';

export type FeatureKey =
  | 'job_matches'
  | 'tailored_resume'
  | 'cover_letter'
  | 'interview_prep'
  | 'offer_comparison'
  | 'strengthen_journey'
  | 'byom_custom_models'
  | 'export_pdf_docx';

export type FeatureCategory = 'discovery' | 'pipeline' | 'intelligence' | 'tools' | 'models';

export interface FeatureMetadata {
  id: FeatureKey;
  label: string;
  description: string;
  category: FeatureCategory;
  defaultPlans: Record<PlanId, boolean>;
}

export const FEATURE_METADATA: Record<FeatureKey, FeatureMetadata> = {
  job_matches: {
    id: 'job_matches',
    label: 'Job Discovery & Live Matches',
    description: 'Automated job feed triage, live scanner, and custom sourcing feeds.',
    category: 'discovery',
    defaultPlans: {
      free: false,
      pro_monthly: true,
      byom_monthly: true,
      byom_yearly: true,
    },
  },
  tailored_resume: {
    id: 'tailored_resume',
    label: 'AI Resume Tailoring & Diffing',
    description: 'Precision alignment of career journey to specific job descriptions with change tracking.',
    category: 'pipeline',
    defaultPlans: {
      free: true,
      pro_monthly: true,
      byom_monthly: true,
      byom_yearly: true,
    },
  },
  cover_letter: {
    id: 'cover_letter',
    label: 'AI Cover Letter Generation',
    description: 'Targeted, authentic cover letters crafted from your career evidence.',
    category: 'pipeline',
    defaultPlans: {
      free: true,
      pro_monthly: true,
      byom_monthly: true,
      byom_yearly: true,
    },
  },
  interview_prep: {
    id: 'interview_prep',
    label: 'AI Interview Coach & Prep',
    description: 'Role-specific behavioral and technical Q&A preparation based on your experience.',
    category: 'pipeline',
    defaultPlans: {
      free: true,
      pro_monthly: true,
      byom_monthly: true,
      byom_yearly: true,
    },
  },
  offer_comparison: {
    id: 'offer_comparison',
    label: 'Offer Evaluation & Comparison',
    description: 'Side-by-side total compensation, benefits, and equity analysis with negotiation scripts.',
    category: 'tools',
    defaultPlans: {
      free: true,
      pro_monthly: true,
      byom_monthly: true,
      byom_yearly: true,
    },
  },
  strengthen_journey: {
    id: 'strengthen_journey',
    label: 'AI Career Journey Diagnostic',
    description: 'Automated gap analysis, evidence scoring, and career narrative enrichment.',
    category: 'intelligence',
    defaultPlans: {
      free: true,
      pro_monthly: true,
      byom_monthly: true,
      byom_yearly: true,
    },
  },
  byom_custom_models: {
    id: 'byom_custom_models',
    label: 'Custom AI Providers (BYOM)',
    description: 'Connecting personal OpenAI, Anthropic, or custom Gemini API keys.',
    category: 'models',
    defaultPlans: {
      free: false,
      pro_monthly: false,
      byom_monthly: true,
      byom_yearly: true,
    },
  },
  export_pdf_docx: {
    id: 'export_pdf_docx',
    label: 'Formatted PDF & Word Export',
    description: 'Exporting customized resumes and cover letters in ATS-friendly PDF and DOCX formats.',
    category: 'tools',
    defaultPlans: {
      free: true,
      pro_monthly: true,
      byom_monthly: true,
      byom_yearly: true,
    },
  },
};

export interface FeatureFlags {
  freeLifetimeLimit: number;
  proMonthlyLimit: number;
  byomBurstPerMinute: number;
  byomDailyLimit: number;
  killSwitches: {
    matches: boolean;
    aiPipeline: boolean;
  };
  features?: Partial<Record<FeatureKey, Partial<Record<PlanId, boolean>>>>;
}

export function getDefaultFeatureMatrix(): Record<FeatureKey, Record<PlanId, boolean>> {
  const result: any = {};
  for (const key of Object.keys(FEATURE_METADATA) as FeatureKey[]) {
    result[key] = { ...FEATURE_METADATA[key].defaultPlans };
  }
  return result;
}
