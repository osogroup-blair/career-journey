import { Type } from "@google/genai";

/**
 * Every response schema server.ts's legacy (pre-Zod-abstraction) AI endpoints
 * pass as `config.responseSchema`, relocated here so both the real endpoint
 * and the generalized Test Run route (`/api/admin/prompts/:id/testRun`) use
 * the identical schema object and can never drift apart. No shape/logic
 * change from what each endpoint had inline before this file existed.
 */

export const PARSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    company: { type: Type.STRING },
    roleTitle: { type: Type.STRING },
    reportingLine: { type: Type.STRING },
    teamScope: { type: Type.STRING },
    mustHaves: { type: Type.ARRAY, items: { type: Type.STRING } },
    niceToHaves: { type: Type.ARRAY, items: { type: Type.STRING } },
    strategicSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
    industryDomain: { type: Type.ARRAY, items: { type: Type.STRING } },
    stageSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
    topCriticalSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    hardGates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          requirement: { type: Type.STRING },
        },
      },
    },
  },
  required: ["company", "roleTitle", "reportingLine", "teamScope", "mustHaves", "niceToHaves", "strategicSignals", "industryDomain", "stageSignals", "topCriticalSkills", "hardGates"],
};

export const CLARIFY_QUESTIONS_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      keywordId: { type: Type.STRING },
      keywordPhrase: { type: Type.STRING },
      questionText: { type: Type.STRING },
      suggestedAction: { type: Type.STRING },
      targetRoleId: { type: Type.STRING },
      proposedAdditionType: { type: Type.STRING, description: "'Add new deliverable' | 'Add new achievement' | 'Add new skill'" },
    },
    required: ["id", "keywordId", "keywordPhrase", "questionText", "suggestedAction", "targetRoleId", "proposedAdditionType"],
  },
};

export const AUDIT_GATES_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallVerdict: { type: Type.STRING, description: "'CLEAR TO APPLY' | 'VERIFY FIRST' | 'LIKELY AUTO-REJECT'" },
    gates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          requirement: { type: Type.STRING },
          verdict: { type: Type.STRING, description: "'CLEAR' | 'FAIL' | 'UNCERTAIN'" },
          reason: { type: Type.STRING },
          suggestedAction: { type: Type.STRING },
          evidenceRefs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, id: { type: Type.STRING } }, required: ["type", "id"] } },
          jdRefs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { segmentId: { type: Type.STRING } }, required: ["segmentId"] } },
        },
        required: ["category", "requirement", "verdict", "reason", "suggestedAction"],
      },
    },
  },
  required: ["overallVerdict", "gates"],
};

export const LITE_SCAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    parse: PARSE_SCHEMA,
    matchScore: { type: Type.NUMBER },
    verdict: { type: Type.STRING, description: "'PASS' | 'BORDERLINE' | 'SKIP'" },
    hardGateRisk: { type: Type.STRING, description: "'CLEAR TO APPLY' | 'VERIFY FIRST' | 'LIKELY AUTO-REJECT'" },
    topGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
    leadWith: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["parse", "matchScore", "verdict", "hardGateRisk", "topGaps", "leadWith"],
};

// Delta-based, not full-object-regeneration: asking Gemini to return an entire
// updated CareerJourney under a bare `{ type: Type.OBJECT }` reliably comes back
// `{}` (confirmed while building the Phase 4/5 builder endpoints - Gemini treats an
// OBJECT schema with no declared `properties` as "no properties allowed"). Every
// field below is a flat, fully-typed leaf, so there's nowhere for that trap to hide.
export const PATCH_DELTA_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reason: { type: Type.STRING },
    newAchievements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          category: { type: Type.STRING },
          targetRoleId: { type: Type.STRING },
        },
        required: ["title"],
      },
    },
    newSkills: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          category: { type: Type.STRING },
          proficiency: { type: Type.STRING },
          years_experience: { type: Type.NUMBER },
          last_used: { type: Type.STRING },
        },
        required: ["name"],
      },
    },
    newDeliverables: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          targetRoleId: { type: Type.STRING },
          targetInitiativeId: { type: Type.STRING },
          description: { type: Type.STRING },
          impact: { type: Type.STRING },
          capability_alignment: { type: Type.ARRAY, items: { type: Type.STRING } },
          skill_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["targetRoleId", "description"],
      },
    },
    updatedDeliverables: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          deliverableId: { type: Type.STRING },
          description: { type: Type.STRING },
          impact: { type: Type.STRING },
        },
        required: ["deliverableId"],
      },
    },
    updatedAchievements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          achievementId: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["achievementId"],
      },
    },
    updatedSkills: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          skillId: { type: Type.STRING },
          proficiency: { type: Type.STRING },
          years_experience: { type: Type.NUMBER },
          last_used: { type: Type.STRING },
        },
        required: ["skillId"],
      },
    },
  },
  required: ["reason"],
};

export const RESUME_STRATEGY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    outputBasename: { type: Type.STRING },
    headerTagline: { type: Type.STRING },
    executiveSummary: { type: Type.STRING },
    selectedOutcomes: { type: Type.ARRAY, items: { type: Type.STRING } },
    roleStrategies: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          company: { type: Type.STRING },
          titleReframe: { type: Type.STRING },
          note: { type: Type.STRING },
        },
        required: ["company", "titleReframe", "note"],
      },
    },
    skillRows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          content: { type: Type.STRING },
        },
        required: ["label", "content"],
      },
    },
    keywordPlacement: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["category", "keywords"],
      },
    },
    cautionClaims: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["outputBasename", "headerTagline", "executiveSummary", "selectedOutcomes", "roleStrategies", "skillRows", "keywordPlacement", "cautionClaims"],
};

export const GENERATE_RESUME_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    contactInfo: { type: Type.STRING },
    summary: { type: Type.STRING },
    skills: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { category: { type: Type.STRING }, terms: { type: Type.STRING } },
        required: ["category", "terms"],
      },
    },
    experience: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          company: { type: Type.STRING },
          companyDescriptor: { type: Type.STRING, description: "The canonical resume_company_descriptor for this role's employer, verbatim from the Career Journey, if one exists." },
          companyUrl: { type: Type.STRING, description: "The canonical resume_company_url for this role's employer, verbatim from the Career Journey, if one exists." },
          title: { type: Type.STRING },
          dates: { type: Type.STRING },
          location: { type: Type.STRING },
          bullets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                evidenceRefs: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { type: { type: Type.STRING }, id: { type: Type.STRING } },
                    required: ["type", "id"],
                  },
                },
              },
              required: ["text"],
            },
          },
        },
        required: ["company", "title", "dates", "location", "bullets"],
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          institution: { type: Type.STRING },
          degree: { type: Type.STRING },
          graduationDate: { type: Type.STRING },
        },
        required: ["institution", "degree", "graduationDate"],
      },
    },
  },
  required: ["name", "contactInfo", "summary", "skills", "experience", "education"],
};

export const COVER_LETTER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    content: { type: Type.STRING },
    wordCount: { type: Type.NUMBER },
  },
  required: ["content", "wordCount"],
};

export const GENERATE_FORM_ANSWERS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { fieldId: { type: Type.STRING }, answer: { type: Type.STRING } },
        required: ["fieldId", "answer"],
      },
    },
  },
  required: ["answers"],
};

export const INTERVIEW_PREP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    likelyQuestions: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, why: { type: Type.STRING } }, required: ["question", "why"] },
    },
    meetingGoal: { type: Type.STRING },
    talkingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["likelyQuestions", "meetingGoal", "talkingPoints"],
};

export const OFFER_GUIDANCE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    askAbout: { type: Type.ARRAY, items: { type: Type.STRING } },
    avoidAsking: { type: Type.ARRAY, items: { type: Type.STRING } },
    negotiationAngles: { type: Type.ARRAY, items: { type: Type.STRING } },
    redFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["askAbout", "avoidAsking", "negotiationAngles", "redFlags"],
};

export const COMPARE_OFFERS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    perOffer: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          jobId: { type: Type.STRING },
          pros: { type: Type.ARRAY, items: { type: Type.STRING } },
          cons: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["jobId", "pros", "cons"],
      },
    },
    recommendation: { type: Type.STRING },
  },
  required: ["perOffer", "recommendation"],
};

// Gemini's structured-output mode treats a bare `{ type: Type.OBJECT }` (no
// `properties`) as "an object with no properties allowed" and returns `{}` —
// learned by actually testing this endpoint, not by inspection. The draft needs a
// concrete (if partial) shape so the model has somewhere to put what it extracts.
export const DRAFT_CAREER_JOURNEY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    person: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        location: { type: Type.STRING },
        phone: { type: Type.STRING },
        email: { type: Type.STRING },
        linkedin: { type: Type.STRING },
      },
    },
    roles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          organization: { type: Type.STRING },
          title: { type: Type.STRING },
          start_date: { type: Type.STRING },
          end_date: { type: Type.STRING },
          location: { type: Type.STRING },
          description: { type: Type.STRING },
          initiatives: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                deliverables: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      description: { type: Type.STRING },
                      impact: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    achievements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          category: { type: Type.STRING },
          role_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
    skills_index: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          category: { type: Type.STRING },
          proficiency: { type: Type.STRING },
          last_used: { type: Type.STRING },
        },
      },
    },
    education: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          institution: { type: Type.STRING },
          program: { type: Type.STRING },
          degree_type: { type: Type.STRING },
          start: { type: Type.STRING },
          end: { type: Type.STRING },
        },
      },
    },
  },
};

export const BUILD_JOURNEY_FROM_RESUME_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    draftCareerJourney: DRAFT_CAREER_JOURNEY_SCHEMA,
    notes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["draftCareerJourney", "notes"],
};

export const BUILD_JOURNEY_CHAT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    assistantMessage: { type: Type.STRING },
    updatedDraft: DRAFT_CAREER_JOURNEY_SCHEMA,
    readyForReview: { type: Type.BOOLEAN },
  },
  required: ["assistantMessage", "updatedDraft", "readyForReview"],
};

export const REFINE_FROM_INTERVIEW_ANSWER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    last_used: { type: Type.STRING },
    proficiency: { type: Type.STRING },
    years_experience: { type: Type.NUMBER },
    summary: { type: Type.STRING },
  },
  required: ["summary"],
};

/** Keyed by prompt id — undefined for `applicationAssistant`/`interviewPrepChat`, which are free-text chat, not structured. */
export const LEGACY_RESPONSE_SCHEMAS: Record<string, object> = {
  parse: PARSE_SCHEMA,
  clarifyQuestions: CLARIFY_QUESTIONS_SCHEMA,
  auditGates: AUDIT_GATES_SCHEMA,
  liteScan: LITE_SCAN_SCHEMA,
  patchJourney: PATCH_DELTA_SCHEMA,
  resumeStrategy: RESUME_STRATEGY_SCHEMA,
  generateResume: GENERATE_RESUME_SCHEMA,
  coverLetter: COVER_LETTER_SCHEMA,
  generateFormAnswers: GENERATE_FORM_ANSWERS_SCHEMA,
  interviewPrep: INTERVIEW_PREP_SCHEMA,
  offerGuidance: OFFER_GUIDANCE_SCHEMA,
  compareOffers: COMPARE_OFFERS_SCHEMA,
  buildJourneyFromResume: BUILD_JOURNEY_FROM_RESUME_SCHEMA,
  buildJourneyChat: BUILD_JOURNEY_CHAT_SCHEMA,
  refineFromInterviewAnswer: REFINE_FROM_INTERVIEW_ANSWER_SCHEMA,
};
