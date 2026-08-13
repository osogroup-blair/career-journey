export type JobStatus =
  | 'Draft'
  | 'JD Parsed'
  | 'Keywords Reviewed'
  | 'Context Captured'
  | 'Career Journey Patch Staged'
  | 'Fit Scored'
  | 'Resume Strategy Ready'
  | 'Resume Build Ready'
  | 'Cover Letter Ready';

export interface CoverLetter {
  content: string;
  wordCount: number;
  approvalStatus: 'Draft' | 'Approved';
}

export interface GeneratedResume {
  name: string;
  contactInfo: string;
  summary: string;
  skills: { category: string; terms: string }[];
  experience: {
    company: string;
    companyDescriptor?: string;
    companyUrl?: string;
    title: string;
    dates: string;
    location: string;
    bullets: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    graduationDate: string;
  }[];
}

export type PipelineStage = 'Saved' | 'Rated' | 'Resume Created' | 'Applied' | 'Interview' | 'Archive';

export interface InterviewRound {
  id: string;
  roundName: string;
  scheduledAt?: string;
  notes?: string;
  outcome: 'Scheduled' | 'Completed' | 'Passed' | 'Rejected';
}

export type ArchiveReason = 'Rejected' | 'No Response' | 'Withdrawn' | 'Position Filled' | 'Other';

export interface JobAnalysis {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  companyName: string;
  roleTitle: string;
  jobLink?: string;
  compensationRange?: string;
  locationNotes?: string;
  jdText: string;
  recruiterNotes?: string;

  /** Kanban column for the real-world application funnel — separate from `status` (the tailoring workflow step). */
  pipelineStage?: PipelineStage;
  appliedAt?: string;
  applicationMethod?: string;
  interviews?: InterviewRound[];
  archivedAt?: string;
  archiveReason?: ArchiveReason;
  archiveNotes?: string;

  parse?: JDParse;
  keywords?: KeywordSignal[];
  contextEntries?: Record<string, ExperienceContext>;
  clarificationQuestions?: ClarificationQuestion[];
  careerJourneyPatch?: CareerJourneyPatch;
  fitAnalysis?: FitAnalysis;
  hardGateAudit?: HardGateAudit;
  gateClarifications?: Record<string, { explanation: string; proof: string }>;
  resumeStrategy?: ResumeStrategy;
  keywordCoverage?: KeywordCoverage;
  resume?: GeneratedResume;
  coverLetter?: CoverLetter;
}

export interface JDParse {
  company: string;
  roleTitle: string;
  reportingLine: string;
  teamScope: string;
  mustHaves: string[];
  niceToHaves: string[];
  strategicSignals: string[];
  industryDomain: string[];
  stageSignals: string[];
  topCriticalSkills: string[];
  hardGates: {
    category: string;
    requirement: string;
  }[];
}

export type EvidenceStatus = 'EVIDENCED' | 'PARTIAL' | 'MISSING / POSSIBLE' | 'NOT SUPPORTED' | 'HARD GATE';

export interface KeywordSignal {
  id: string;
  phrase: string;
  category: 'Critical skill' | 'Required keyword' | 'Secondary keyword' | 'Hard gate' | 'Domain signal' | 'Tool / platform';
  jdImportance: 'High' | 'Medium' | 'Low';
  evidenceStatus: EvidenceStatus;
  currentAnchor: string;
  whatCouldCount: string;
  recognitionPrompt: string;
  resumePriority: string;
  isTopCritical: boolean;
  userContextStatus?: 'Not reviewed' | 'Needs clarification' | 'Approved for patch' | 'Rejected';
}

export interface ExperienceContext {
  id: string;
  keywordId: string;
  experienceText: string;
  whereItHappened: string;
  whenItHappened: string;
  peopleTeams: string;
  toolsPlatforms: string;
  measurableOutcome: string;
  proof: string;
  confidenceLevel: 'High' | 'Medium' | 'Low';
  canAddToCareerJourney: 'Yes' | 'No' | 'Maybe';
  proposedAdditionType: 'Update existing deliverable' | 'Add new deliverable' | 'Add new achievement' | 'Add new skill' | 'Add new capability/function' | 'Do not add, resume-only context';
  targetRoleId?: string;
  targetDeliverableId?: string;
  notes: string;
  approvalStatus: 'Not reviewed' | 'Needs clarification' | 'Approved for patch' | 'Rejected';
}

export interface CareerJourneyPatch {
  id: string;
  targetVersion: string;
  reason: string;
  newSkills: string[];
  updatedSkills: string[];
  newDeliverables: string[];
  updatedDeliverables: string[];
  newAchievements: string[];
  updatedAchievements: string[];
  linkUpdates: string[];
  metaUpdate: any;
  approvalStatus: 'Pending' | 'Approved' | 'Rejected';
}

export interface FitAnalysis {
  roleScopeFit: { rating: 'Strong' | 'Moderate' | 'Weak'; rationale: string };
  industryDomainFit: { rating: 'Strong' | 'Moderate' | 'Weak'; rationale: string };
  seniorityStageFit: { rating: 'Strong' | 'Moderate' | 'Weak'; rationale: string };
  technicalAiFit: { rating: 'Strong' | 'Moderate' | 'Weak'; rationale: string };
  overallVerdict: 'PASS' | 'BORDERLINE' | 'SKIP';
  rationale: string;
  leadWith: string[];
  gaps: string[];
}

export interface HardGateAudit {
  overallVerdict: 'CLEAR TO APPLY' | 'VERIFY FIRST' | 'LIKELY AUTO-REJECT';
  gates: {
    category: string;
    requirement: string;
    verdict: 'CLEAR' | 'FAIL' | 'UNCERTAIN';
    reason: string;
    suggestedAction: string;
  }[];
}

export interface ResumeStrategy {
  outputBasename: string;
  headerTagline: string;
  executiveSummary: string;
  selectedOutcomes: string[];
  roleStrategies: { company: string; titleReframe: string; note: string }[];
  skillRows: { label: string; content: string }[];
  keywordPlacement: { category: string; keywords: string[] }[];
  cautionClaims: string[];
}

export interface KeywordCoverage {
  score: number;
  threshold: number;
  passed: boolean;
  criticalSkillCoverage: { phrase: string; present: boolean }[];
  secondaryKeywordCoverage: { phrase: string; present: boolean }[];
  missingKeywords: string[];
  unsupportedKeywords: string[];
}

export type MatchStatus = 'New' | 'Promoted' | 'Dismissed';
export type MatchVerdict = 'PASS' | 'BORDERLINE' | 'SKIP';
export type MatchHardGateRisk = 'CLEAR TO APPLY' | 'VERIFY FIRST' | 'LIKELY AUTO-REJECT';

export interface JobMatchScanResult {
  parse: JDParse;
  matchScore: number;
  verdict: MatchVerdict;
  hardGateRisk: MatchHardGateRisk;
  topGaps: string[];
  leadWith: string[];
}

export type MatchSource = 'manual-paste' | 'greenhouse' | 'lever';

export interface JobMatch {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: MatchSource;
  /** Dedup key for API-sourced postings: the posting's id on its origin ATS. */
  externalId?: string;
  /** Link back to the original posting, for API-sourced postings. */
  sourceUrl?: string;
  companyName: string;
  roleTitle: string;
  jdText: string;
  status: MatchStatus;
  parse?: JDParse;
  matchScore?: number;
  verdict?: MatchVerdict;
  hardGateRisk?: MatchHardGateRisk;
  topGaps?: string[];
  leadWith?: string[];
  scanError?: string;
  /** Set when a posting was auto-dismissed by the excluded-keyword prefilter, before any AI call was made. */
  dismissReason?: string;
  promotedJobId?: string;
}

export interface MatchPreferences {
  /** Case-insensitive substrings; a JD containing any of these skips the AI scan entirely and is auto-dismissed. */
  excludedKeywords: string[];
  /** 0-100. Matches scored below this are hidden from view (except already-promoted ones). 0 = show everything. */
  minMatchScore: number;
  /** Greenhouse/Lever job board tokens (the slug in boards.greenhouse.io/<token> or jobs.lever.co/<token>) to pull postings from on refresh. */
  trackedCompanies: string[];
}

export interface SourcedJobPosting {
  source: 'greenhouse' | 'lever';
  externalId: string;
  companyName: string;
  title: string;
  location?: string;
  absoluteUrl: string;
  jdText: string;
}

export interface ClarificationQuestion {
  id: string;
  keywordId: string;
  keywordPhrase: string;
  questionText: string;
  suggestedAction: string;
  targetRoleId?: string;
  proposedAdditionType: 'Add new deliverable' | 'Add new achievement' | 'Add new skill' | 'Update existing deliverable';
}

