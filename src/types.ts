import type { ListingStatus } from './types/discovery';
export type JobStage =
  | 'Intake'
  | 'Parsed'
  | 'Rating'
  | 'Tailored Application'
  | 'Apply'
  | 'Interview'
  | 'Offer'
  | 'Archive';

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
    /** The Career Journey role this entry was written from. Missing on resumes generated before role-level build controls existed. */
    roleId?: string;
    company: string;
    companyDescriptor?: string;
    companyUrl?: string;
    title: string;
    dates: string;
    location: string;
    bullets: { text: string; evidenceRefs?: EvidenceRef[] }[];
  }[];
  education: {
    institution: string;
    degree: string;
    graduationDate: string;
  }[];
  /** One-line entries for roles built as 'condensed' — filled deterministically from the Career Journey, never by the AI. */
  earlierExperience?: EarlierExperienceEntry[];
}

export type ResumeExperienceEntry = GeneratedResume['experience'][number];

export interface EarlierExperienceEntry {
  roleId: string;
  company: string;
  title: string;
  dates: string;
  /** The full entry, kept when a role is condensed from the preview so "Restore" can put it back unchanged. Never rendered. */
  restorable?: ResumeExperienceEntry;
}

/** A part of the tailored resume that can be regenerated on its own. */
export type ResumeSectionRef = { kind: 'summary' } | { kind: 'skills' } | { kind: 'role'; roleId: string };

export type ResumeRoleMode = 'full' | 'condensed' | 'excluded';

/** Per-job controls for how the tailored resume is built — chosen on the Build Settings screen before generation. */
export interface ResumeBuildOptions {
  pageTarget: 1 | 2;
  /** Keyed by Career Journey role id. A role with no entry is treated as 'full'. */
  roles: Record<string, { mode: ResumeRoleMode; maxBullets?: number }>;
  /** Free-text steer for this resume ("lead with platform work", "skip the consulting stint's tooling"). */
  guidance?: string;
}

export interface InterviewPrep {
  likelyQuestions: { question: string; why: string }[];
  meetingGoal: string;
  talkingPoints: string[];
  generatedAt: string;
  rehearsalTranscript?: { role: 'user' | 'assistant'; content: string }[];
}

export interface InterviewRound {
  id: string;
  roundName: string;
  interviewerName?: string;
  interviewerTitle?: string;
  format?: 'Phone' | 'Video' | 'Onsite' | 'Take-home';
  scheduledAt?: string;
  notes?: string;
  outcome: 'Scheduled' | 'Completed' | 'Passed' | 'Rejected';
  prep?: InterviewPrep;
}

export type ArchiveReason = 'Rejected' | 'No Response' | 'Withdrawn' | 'Position Filled' | 'Other' | 'Accepted Offer';

export interface JobAnalysis {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Single source of truth for both the Kanban column and per-job screen routing. */
  stage: JobStage;
  companyName: string;
  roleTitle: string;
  /** Where to apply — for a job promoted from a StillOpen scan, the employer's own application page. */
  jobLink?: string;
  /** Set when the job came from a StillOpen listing (Discover). Kept apart from jobLink: StillOpen's terms require linking the listing page, and the Apply stage re-checks its status. */
  source?: JobListingSource;
  compensationRange?: string;
  locationNotes?: string;
  jdText: string;
  recruiterNotes?: string;
  /** Deterministic paragraph/bullet segmentation of jdText, assigned at parse time — used for traceability (EvidenceTrace). */
  jdSegments?: { id: string; text: string }[];
  /** Stamped when the user finalizes the Rating stage; gates entry into Tailored Application. */
  ratingFinalizedAt?: string;

  appliedAt?: string;
  applicationMethod?: string;
  interviews?: InterviewRound[];
  archivedAt?: string;
  /** The stage the job was in immediately before being archived — lets the Archived tab show where it fell off. */
  archivedFromStage?: JobStage;
  archiveReason?: ArchiveReason;
  archiveNotes?: string;

  parse?: JDParse;
  keywords?: KeywordSignal[];
  contextEntries?: Record<string, ExperienceContext>;
  clarificationQuestions?: ClarificationQuestion[];
  careerJourneyPatch?: CareerJourneyPatch;
  /** The AI's full modified Career Journey, held here until the patch is explicitly approved — never applied automatically. */
  pendingCareerJourneyUpdate?: any;
  fitAnalysis?: FitAnalysis;
  hardGateAudit?: HardGateAudit;
  gateClarifications?: Record<string, { explanation: string; proof: string }>;
  resumeBuildOptions?: ResumeBuildOptions;
  resumeStrategy?: ResumeStrategy;
  keywordCoverage?: KeywordCoverage;
  resume?: GeneratedResume;
  /** On-demand AI review of the tailored resume against the JD (Stage 7 gate + ats_tactics.md rubric). */
  resumeAiScore?: ResumeAiScore;
  coverLetter?: CoverLetter;

  applicationAssistantTranscript?: { role: 'user' | 'assistant'; content: string }[];
  applicationFormFields?: ApplicationFormField[];
  applicationFormAnswers?: Record<string, string>;

  offer?: OfferDetails;
}

export interface JobListingSource {
  kind: 'stillopen';
  listingId: string;
  listingUrl: string | null;
  /** Last Apply-stage status check, cached so revisits within a few hours don't re-ask StillOpen. */
  status?: ListingStatus;
  statusCheckedAt?: string;
  closedAt?: string | null;
  closure?: string | null;
}

export interface ApplicationFormField {
  id: string;
  label: string;
  fieldType: 'text' | 'textarea' | 'select' | 'checkbox';
  options?: string[];
}

export interface OfferGuidance {
  askAbout: string[];
  avoidAsking: string[];
  negotiationAngles: string[];
  redFlags: string[];
}

export interface OfferDetails {
  baseSalary?: string;
  bonusTarget?: string;
  variableComp?: string;
  equity?: { type: string; amount: string; vestingSchedule: string; strikePrice?: string };
  benefitsNotes?: string;
  otherTerms?: string;
  startDate?: string;
  decisionDeadline?: string;
  receivedAt: string;
  guidance?: OfferGuidance;
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

/** Points at a real Career Journey item by id — the traceability anchor EvidenceTrace resolves. */
export interface EvidenceRef {
  type: 'deliverable' | 'achievement' | 'skill' | 'role' | 'education';
  id: string;
}

/** Points at a JobAnalysis.jdSegments entry by id — the JD-side traceability anchor. */
export interface JdRef {
  segmentId: string;
}

export interface KeywordSignal {
  id: string;
  phrase: string;
  category: 'Critical skill' | 'Required keyword' | 'Secondary keyword' | 'Hard gate' | 'Domain signal' | 'Tool / platform';
  jdImportance: 'High' | 'Medium' | 'Low';
  evidenceStatus: EvidenceStatus;
  /** Real Career Journey ids the model matched this keyword to — replaces the old free-text currentAnchor. */
  evidenceRefs: EvidenceRef[];
  /** JD segments this keyword's requirement was found in. */
  jdRefs: JdRef[];
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
  leadWith: { text: string; evidenceRefs?: EvidenceRef[]; jdRefs?: JdRef[] }[];
  gaps: { text: string; evidenceRefs?: EvidenceRef[]; jdRefs?: JdRef[] }[];
}

export interface HardGateAudit {
  overallVerdict: 'CLEAR TO APPLY' | 'VERIFY FIRST' | 'LIKELY AUTO-REJECT';
  gates: {
    category: string;
    requirement: string;
    verdict: 'CLEAR' | 'FAIL' | 'UNCERTAIN';
    reason: string;
    suggestedAction: string;
    evidenceRefs?: EvidenceRef[];
    jdRefs?: JdRef[];
  }[];
}

export interface ResumeStrategy {
  outputBasename: string;
  headerTagline: string;
  executiveSummary: string;
  selectedOutcomes: string[];
  roleStrategies: { roleId?: string; company: string; titleReframe: string; note: string }[];
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

export interface ResumeAiScore {
  /** 0-100 per ats_tactics.md's transparent scoring rubric. */
  overallScore: number;
  /** The score band and its estimated pass probability, e.g. "75-84 (~65-79% pass)". */
  band: string;
  criteria: { criterion: string; weight: number; score: number; note: string }[];
  roleIdentity: { readsAs: string; aligned: boolean; note: string };
  missingCriticalSkills: string[];
  suggestions: { area: 'Tagline' | 'Summary' | 'Skills' | 'Experience' | 'Formatting'; suggestion: string; keyword?: string }[];
  /** Keywords the Career Journey has no evidence for — reported, never fabricated. */
  honestGaps: string[];
  scoredAt: string;
  /** resumeFingerprint() of the resume that was scored — a mismatch means the score is stale. */
  resumeFingerprint: string;
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

export type MatchSource = 'manual-paste' | 'greenhouse' | 'lever' | 'stillopen';

export interface JobMatch {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: MatchSource;
  /** Dedup key for API-sourced postings: the posting's id on its origin ATS. */
  externalId?: string;
  /** Link back to the original posting, for API-sourced postings (for StillOpen, the listing page). */
  sourceUrl?: string;
  /** The employer's own application page, when the source provides one (StillOpen) — becomes the job's jobLink. */
  applyUrl?: string;
  /** Same names as on JobAnalysis, so promoting a match carries them straight into the job header. */
  compensationRange?: string;
  locationNotes?: string;
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

