/**
 * Realistic-but-small fixtures for the generalized Test Run feature
 * (`/api/admin/prompts/:id/testRun`) — one entry per prompt id, keyed the
 * same way DEFAULT_PROMPTS (server/promptStore.ts) is. Several prompts
 * (coverLetter, generateResume, interviewPrep, offerGuidance, compareOffers)
 * need chained prior-pipeline-stage output, so those fixtures reference the
 * shared sample objects below rather than being authored in isolation.
 *
 * Test Run doesn't reproduce each production endpoint's exact contents-string
 * layout (see server.ts's ~19 real routes for that) — it renders the sample
 * input as labeled JSON underneath the prompt template and the knowledge
 * preamble. That's a deliberate simplification: byte-for-byte parity would
 * mean duplicating each route's bespoke string-building in two places (real
 * route + here) and risking the two drifting apart. What Test Run preserves
 * exactly is the part that actually varies when an admin edits something on
 * the AI Prompts page: the resolved model/provider, the knowledge-file
 * selection, the prompt template, the real response schema, and real token
 * usage from the real response.
 */

const SAMPLE_JD_TEXT = `Senior Software Engineer at a Series B fintech startup. Requires 5+ years of backend experience, strong Python skills, and a Bachelor's degree in Computer Science. Remote-friendly within the US.`;

const SAMPLE_CAREER_JOURNEY = {
  person: { name: "Sample Candidate", location: "Austin, TX", work_preference: "Remote", phone: "555-0100", email: "sample@example.com" },
  roles: [
    {
      id: "ROLE-001",
      organization: "Stripe",
      title: "Lead Software Engineer",
      start_date: "2023-01",
      end_date: "Present",
      location: "Remote",
      description: "Led a team building payments infrastructure.",
      initiatives: [
        {
          id: "INIT-001",
          name: "Dynamic routing",
          description: "Rebuilt transaction routing for reliability.",
          deliverables: [
            { id: "DEL-001", description: "Redesigned the payment routing service", impact: "Cut failed-transaction rate by 30%" },
          ],
        },
      ],
    },
  ],
  achievements: [{ id: "ACH-001", title: "Reduced infra costs by 25%", description: "Migrated workloads to more efficient instance types.", category: "Impact", role_ids: ["ROLE-001"] }],
  skills_index: [{ id: "SK-001", name: "Python", category: "Language", proficiency: "Expert", years_experience: 8, last_used: "2026" }],
  education: [{ id: "EDU-001", institution: "University of Texas", program: "Computer Science", degree_type: "BS", start: "2012", end: "2016" }],
};

const SAMPLE_PARSE_RESULT = {
  company: "Sample Co",
  roleTitle: "Senior Software Engineer",
  reportingLine: "Reports to VP Engineering",
  teamScope: "Payments platform team",
  mustHaves: ["5+ years backend experience", "Strong Python skills", "Bachelor's in Computer Science"],
  niceToHaves: ["Fintech experience"],
  strategicSignals: ["Series B growth stage"],
  industryDomain: ["Fintech"],
  stageSignals: ["Series B"],
  topCriticalSkills: ["Python", "Backend architecture", "Payments"],
  hardGates: [{ category: "Education", requirement: "Bachelor's degree in Computer Science" }],
};

const SAMPLE_JD_SEGMENTS = [
  { id: "jd-0", text: "Senior Software Engineer at a Series B fintech startup." },
  { id: "jd-1", text: "Requires 5+ years of backend experience, strong Python skills, and a Bachelor's degree in Computer Science." },
];

const SAMPLE_KEYWORDS = [
  { id: "kw-1", keywordPhrase: "Python", isTopCritical: true, evidenceStatus: "EVIDENCED", evidenceRefs: ["SK-001"] },
  { id: "kw-2", keywordPhrase: "Payments infrastructure", isTopCritical: true, evidenceStatus: "PARTIAL", evidenceRefs: [] },
];

const SAMPLE_FIT_ANALYSIS = {
  overallVerdict: "PASS",
  dimensions: [{ name: "Role scope fit", rating: "Strong", rationale: "Directly comparable scope at Stripe." }],
  leadWith: ["Led payments routing rebuild at Stripe"],
  gaps: ["No direct fintech-domain title yet"],
};

const SAMPLE_RESUME_STRATEGY = {
  outputBasename: "Sample_Candidate_Resume",
  headerTagline: "Senior Software Engineer | Payments Infrastructure",
  executiveSummary: "Backend engineer with 8 years building payments infrastructure at scale.",
  selectedOutcomes: ["Cut failed-transaction rate by 30%"],
  roleStrategies: [{ company: "Stripe", titleReframe: "Lead Software Engineer | Payments Platform", note: "Emphasize routing reliability work." }],
  skillRows: [{ label: "Languages", content: "Python, SQL" }],
  keywordPlacement: [{ category: "Critical skill", keywords: ["Python", "Payments infrastructure"] }],
  cautionClaims: [],
};

const SAMPLE_RESUME = {
  name: "Sample Candidate",
  contactInfo: "sample@example.com",
  summary: "Backend engineer with 8 years building payments infrastructure at scale.",
  skills: [{ category: "Languages", terms: "Python, SQL" }],
  experience: [{ company: "Stripe", title: "Lead Software Engineer", dates: "2023 - Present", location: "Remote", bullets: [{ text: "Redesigned payment routing, cutting failed-transaction rate by 30%.", evidenceRefs: [{ type: "deliverable", id: "DEL-001" }] }] }],
  education: [{ institution: "University of Texas", degree: "BS Computer Science", graduationDate: "2016" }],
};

const SAMPLE_INTERVIEW_ROUND = { name: "Hiring Manager Screen", interviewerTitle: "Engineering Manager", format: "30 min video call" };
const SAMPLE_OFFER = { baseSalary: "$185,000", equity: "0.05% over 4 years", bonus: "10% target", signingBonus: "$10,000", startDate: "2026-11-01" };
const SAMPLE_OFFERS = [{ jobId: "job-1", companyName: "Sample Co", roleTitle: "Senior Software Engineer", offer: SAMPLE_OFFER }];
const SAMPLE_TRANSCRIPT = [{ role: "user" as const, content: "What should I highlight about my payments experience?" }];
const SAMPLE_FIELDS = [{ id: "f1", label: "Why are you interested in this role?", fieldType: "textarea" }];
const SAMPLE_CONTEXT_ENTRIES = [
  { keywordId: "kw-2", questionText: "Did you lead any payments infra rebuilds?", answer: "Yes, redesigned routing at Stripe.", approvalStatus: "Approved for patch", proposedAdditionType: "Add new deliverable", targetRoleId: "ROLE-001" },
];

/** Per-prompt sample variables, rendered as labeled JSON blocks by renderSampleContents. */
export const SAMPLE_INPUTS: Record<string, Record<string, unknown>> = {
  parse: { company: "Sample Co", roleTitle: "Sample Role", jdText: SAMPLE_JD_TEXT },
  keywords: { parse: SAMPLE_PARSE_RESULT, jdSegments: SAMPLE_JD_SEGMENTS, careerJourney: SAMPLE_CAREER_JOURNEY },
  fitScore: { parse: SAMPLE_PARSE_RESULT, jdSegments: SAMPLE_JD_SEGMENTS, careerJourney: SAMPLE_CAREER_JOURNEY, contextEntries: [], gateClarifications: {} },
  clarifyQuestions: { keywords: SAMPLE_KEYWORDS, careerJourney: SAMPLE_CAREER_JOURNEY },
  auditGates: { parse: SAMPLE_PARSE_RESULT, jdSegments: SAMPLE_JD_SEGMENTS, careerJourney: SAMPLE_CAREER_JOURNEY, gateClarifications: {} },
  liteScan: { jdText: SAMPLE_JD_TEXT, careerJourney: SAMPLE_CAREER_JOURNEY },
  patchJourney: { careerJourney: SAMPLE_CAREER_JOURNEY, contextEntries: SAMPLE_CONTEXT_ENTRIES },
  resumeStrategy: { parse: SAMPLE_PARSE_RESULT, careerJourney: SAMPLE_CAREER_JOURNEY, contextEntries: [] },
  generateResume: { careerJourney: SAMPLE_CAREER_JOURNEY, strategy: SAMPLE_RESUME_STRATEGY, parse: SAMPLE_PARSE_RESULT },
  coverLetter: { parse: SAMPLE_PARSE_RESULT, careerJourney: SAMPLE_CAREER_JOURNEY, fitAnalysis: SAMPLE_FIT_ANALYSIS, resumeStrategy: SAMPLE_RESUME_STRATEGY },
  applicationAssistant: { transcript: SAMPLE_TRANSCRIPT, parse: SAMPLE_PARSE_RESULT, careerJourney: SAMPLE_CAREER_JOURNEY, resume: SAMPLE_RESUME, fitAnalysis: SAMPLE_FIT_ANALYSIS },
  generateFormAnswers: { fields: SAMPLE_FIELDS, parse: SAMPLE_PARSE_RESULT, careerJourney: SAMPLE_CAREER_JOURNEY, resume: SAMPLE_RESUME },
  interviewPrep: { round: SAMPLE_INTERVIEW_ROUND, parse: SAMPLE_PARSE_RESULT, fitAnalysis: SAMPLE_FIT_ANALYSIS, careerJourney: SAMPLE_CAREER_JOURNEY },
  interviewPrepChat: { transcript: SAMPLE_TRANSCRIPT, round: SAMPLE_INTERVIEW_ROUND, parse: SAMPLE_PARSE_RESULT, careerJourney: SAMPLE_CAREER_JOURNEY },
  offerGuidance: { offer: SAMPLE_OFFER, parse: SAMPLE_PARSE_RESULT, careerJourney: SAMPLE_CAREER_JOURNEY },
  compareOffers: { offers: SAMPLE_OFFERS, careerJourney: SAMPLE_CAREER_JOURNEY },
  buildJourneyFromResume: { resumeText: "Jane Doe — Senior Software Engineer at Stripe (2023-Present). Led payments routing rebuild, cut failed-transaction rate by 30%. BS Computer Science, University of Texas." },
  buildJourneyChat: { transcript: SAMPLE_TRANSCRIPT, currentDraft: {} },
  refineFromInterviewAnswer: { entityType: "achievement", current: SAMPLE_CAREER_JOURNEY.achievements[0], question: "What was the measurable impact?", answer: "It cut failed-transaction rate by 30% within one quarter." },
};

/**
 * Renders sample variables as a labeled JSON block appended after the prompt
 * template — a deliberately generic stand-in for each production route's own
 * bespoke contents-string assembly (see the module doc above for why).
 * `overrides` lets a caller substitute one variable (e.g. a Career-Journey-
 * field-projected version of `careerJourney`, for the contextSize estimator)
 * without duplicating the rest of that prompt's sample fixture.
 */
export function renderSampleContents(promptId: string, preamble: string, template: string, overrides?: Record<string, unknown>): string {
  const vars = { ...(SAMPLE_INPUTS[promptId] || {}), ...(overrides || {}) };
  const varsBlock = Object.entries(vars)
    .map(([key, value]) => `${key}:\n${JSON.stringify(value, null, 2)}`)
    .join("\n\n");
  return `${preamble}\n${template}\n\nSample input for this test run:\n\n${varsBlock}`;
}

/** The sample Career Journey object for a prompt, if its fixture includes one — used by the contextSize estimator to preview a careerJourneyFields selection. */
export function getSampleCareerJourney(promptId: string): any {
  return SAMPLE_INPUTS[promptId]?.careerJourney ?? null;
}
