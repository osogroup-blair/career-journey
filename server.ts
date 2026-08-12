import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/ai/parse", async (req, res) => {
    try {
      const { jdText, company, roleTitle } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `You are an expert ATS (Applicant Tracking System) parser and recruiter. Extract structured information from the following Job Description.
Identify the Hard Gates (work authorization, mandatory licenses, location, clearance), the Top Critical Skills (core competencies, mandatory tools), and Secondary Skills (nice to haves, acronyms, methodologies).
Company: ${company || ''}
Role: ${roleTitle || ''}

Job Description:
${jdText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
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
                    requirement: { type: Type.STRING }
                  }
                }
              }
            },
            required: ["company", "roleTitle", "reportingLine", "teamScope", "mustHaves", "niceToHaves", "strategicSignals", "industryDomain", "stageSignals", "topCriticalSkills", "hardGates"]
          }
        }
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/keywords", async (req, res) => {
    try {
      const { parse, careerJourney } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `You are an expert ATS screening system parser and technical recruiter evaluating a candidate's resume against a job description.
Your task is to exhaustively extract ALL relevant keywords, skills, and signals from the Job Parse, and evaluate if the Candidate's Career Journey supports them. 
Based on industry-standard ATS matching criteria (e.g., Workday, Greenhouse, Taleo), a typical ATS parse yields 20 to 40 distinct keywords and criteria. Extract them ALL.

Instructions:
1. Identify "Top Critical Skills" & "Hard Gates" (Non-negotiables):
   - These include core competencies, mandatory tools, non-negotiable domain expertise, work authorization, required licenses, mandatory years of experience, and location/shift constraints.
   - If a candidate lacks ANY of these, they would fail the initial screening gate.
   - Flag them with isTopCritical = true.
   - jdImportance should be 'High'.
   - Category should be 'Hard gate' or 'Critical skill'.

2. Identify "Secondary Keywords" (Preferred):
   - These are preferred skills, specific methodologies, soft skills, named technical platforms/tools, acronyms/synonyms, or "nice to haves".
   - They contribute to the 85% keyword match goal but aren't individual dealbreakers.
   - Flag them with isTopCritical = false.
   - Category can be 'Secondary keyword', 'Tool / platform', 'Domain signal', etc.

3. Identify Required Metrics / Experience Scope:
   - Extract expected experience levels, team sizes, budget domains, or implied outcomes.

4. For EACH extracted criterion, evaluate the "evidenceStatus" strictly based on the Candidate Career Journey Context:
   - "EVIDENCED": Clear proof in a specific project, deliverable, or achievement demonstrating applied experience.
   - "PARTIAL": Listed as a buzzword or in an unstructured list without applied context.
   - "MISSING / POSSIBLE": No clear evidence, but candidate's roles imply they might possess it.
   - "NOT SUPPORTED": Completely missing and unlikely based on background.

5. Populate "currentAnchor": point to the specific place in the Career Journey providing evidence (e.g., "Role X: Deliverable Y"). IMPORTANT: True evidence ("EVIDENCED") requires identifying a specific deliverable, project, or achievement. If EVIDENCED, this must be filled.

6. Be EXHAUSTIVE. Extract EVERY named tool, software, methodology, soft skill, and dimension of experience explicitly stated in the JD.

Job Parse:
${JSON.stringify(parse, null, 2)}

Candidate Career Journey Context:
${JSON.stringify(careerJourney || {}, null, 2)}
`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                phrase: { type: Type.STRING },
                category: { type: Type.STRING, description: "'Critical skill' | 'Hard gate' | 'Secondary keyword' | 'Tool / platform' | 'Domain signal' | 'Metric / Outcome' | 'Acronym/Synonym'" },
                jdImportance: { type: Type.STRING, description: "'High' | 'Medium' | 'Low'" },
                evidenceStatus: { type: Type.STRING, description: "'EVIDENCED' | 'PARTIAL' | 'MISSING / POSSIBLE' | 'NOT SUPPORTED' | 'HARD GATE'" },
                currentAnchor: { type: Type.STRING },
                whatCouldCount: { type: Type.STRING },
                recognitionPrompt: { type: Type.STRING },
                resumePriority: { type: Type.STRING },
                isTopCritical: { type: Type.BOOLEAN },
                userContextStatus: { type: Type.STRING }
              },
              required: ["id", "phrase", "category", "jdImportance", "evidenceStatus", "currentAnchor", "whatCouldCount", "recognitionPrompt", "resumePriority", "isTopCritical", "userContextStatus"]
            }
          }
        }
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/clarifyQuestions", async (req, res) => {
    try {
      const { parse, careerJourney, keywords } = req.body;
      
      const nonEvidenced = (keywords || []).filter((kw: any) => 
        kw.evidenceStatus === 'PARTIAL' || kw.evidenceStatus === 'MISSING / POSSIBLE'
      ).slice(0, 5); 
      
      if (nonEvidenced.length === 0) {
        return res.json([]);
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `You are an expert technical resume interviewer.
We are analyzing a candidate's master Career Journey against a job description. We found several gap areas where the candidate's journey has PARTIAL or MISSING evidence for keywords required by the job.

Your task is to generate exactly 1 clarifying question for each of the selected gap keywords so that when the candidate answers, we can generate a structured deliverable, achievement, or skill to patch into their Career Journey.

List of Gap Keywords and their ATS status:
${JSON.stringify(nonEvidenced, null, 2)}

Candidate Master Career Journey Roles:
${JSON.stringify((careerJourney?.roles || []).map((r: any) => ({ id: r.id, organization: r.organization, title: r.title })), null, 2)}

For each gap keyword, construct:
1. "questionText": A friendly, high-impact, professional question asking the candidate to recall a specific project, metrics, or team detail demonstrating this skill (e.g. "Did you design any dynamic data routing workflows during your time at Stripe? If so, what were the throughput metrics?").
2. "suggestedAction": A short instruction (e.g., "Provide the system name, team size, or throughput statistics").
3. "targetRoleId": The exact Role ID from the candidate's career journey where this experience is most likely to have occurred (e.g., "ROLE-001"). If it's a completely new skill or role, map it to the most relevant existing role.
4. "proposedAdditionType": How this should be synced back to the career journey. Choose one: 'Add new deliverable' | 'Add new achievement' | 'Add new skill'.

Return a structured JSON array matching the schema.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
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
                proposedAdditionType: { type: Type.STRING, description: "'Add new deliverable' | 'Add new achievement' | 'Add new skill'" }
              },
              required: ["id", "keywordId", "keywordPhrase", "questionText", "suggestedAction", "targetRoleId", "proposedAdditionType"]
            }
          }
        }
      });

      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/fitScore", async (req, res) => {
    try {
      const { parse, careerJourney, contextEntries, gateClarifications } = req.body;
      // Provide a simpler schema since Gemini struggles with nested enums sometimes
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Evaluate the fit between the candidate's journey and context vs the Job Parse.

Job Parse:
${JSON.stringify(parse)}
Career Journey:
${JSON.stringify(careerJourney)}
Extra Context Entries:
${JSON.stringify(contextEntries)}
Candidate Custom Gate & Fit Clarifications (if any, where they explain and prove how they meet uncertain/failing requirements):
${JSON.stringify(gateClarifications || {})}

Generate an objective fit analysis. If the candidate has provided convincing explanations and objective proofs, factor them into upgrading the relevant dimension ratings ('Strong' | 'Moderate') and adjust the rationale and overallVerdict accordingly.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              roleScopeFit: { type: Type.OBJECT, properties: { rating: { type: Type.STRING }, rationale: { type: Type.STRING } }, required: ["rating", "rationale"] },
              industryDomainFit: { type: Type.OBJECT, properties: { rating: { type: Type.STRING }, rationale: { type: Type.STRING } }, required: ["rating", "rationale"] },
              seniorityStageFit: { type: Type.OBJECT, properties: { rating: { type: Type.STRING }, rationale: { type: Type.STRING } }, required: ["rating", "rationale"] },
              technicalAiFit: { type: Type.OBJECT, properties: { rating: { type: Type.STRING }, rationale: { type: Type.STRING } }, required: ["rating", "rationale"] },
              overallVerdict: { type: Type.STRING, description: "'PASS' | 'BORDERLINE' | 'SKIP'" },
              rationale: { type: Type.STRING },
              leadWith: { type: Type.ARRAY, items: { type: Type.STRING } },
              gaps: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["roleScopeFit", "industryDomainFit", "seniorityStageFit", "technicalAiFit", "overallVerdict", "rationale", "leadWith", "gaps"]
          }
        }
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/auditGates", async (req, res) => {
    try {
      const { parse, careerJourney, gateClarifications } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `You are an expert technical recruiter and ATS compliance system evaluating a candidate's credentials against a list of "Hard Gates" (such as location, work authorization, clearances, or minimum years of experience).

Job Parse (containing requirements & hard gates):
${JSON.stringify(parse, null, 2)}

Candidate 'Career Journey' History (roles, initiatives, skills, dates, etc.):
${JSON.stringify(careerJourney || {}, null, 2)}

Active Candidate Clarifications / Proofs (if any, keyed by the gate category or requirement):
${JSON.stringify(gateClarifications || {}, null, 2)}

Your instructions:
1. Parse the candidate's Career Journey history to evaluate each hard gate.
2. If a gate specifies standard criteria such as "3+ years of experience in pre-sales / solutions engineering B2B SaaS" or "Java experience", look through the candidate's roles history, identify relevant roles, calculate the specific duration/tenure they served in each relevant role based on dates, and sum them up to determine if they meet the threshold.
3. Be transparent and helpful in your "reason": explain the calculated tenure of each role to show how you calculated the experience. E.g.: "Calculated from roles: Stripe (Lead Software Engineer: 3.4 years, 2023-Present) and Netflix (Senior Product Engineer: 2.8 years, 2020-2022). Total pre-sales / SaaS-related experience is 6.2 years, which satisfies the 3+ years requirement."
4. If either the candidate's 'Career Journey' history or their manual 'Active Candidate Clarifications/Proofs' provide convincing evidence that they fulfill the requirement, set the gate's verdict to "CLEAR".
5. If the evidence in their 'Career Journey' is partial or missing, and no manual clarifying proof is provided, set the verdict to "UNCERTAIN" or "FAIL", and suggest in "suggestedAction" that they update their profile or provide manual proof for that specific gate.
6. Set the 'overallVerdict' to "CLEAR TO APPLY" if all high-priority hard gates are "CLEAR", "VERIFY FIRST" if any are "UNCERTAIN", and "LIKELY AUTO-REJECT" if any are "FAIL".`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
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
                    suggestedAction: { type: Type.STRING }
                  },
                  required: ["category", "requirement", "verdict", "reason", "suggestedAction"]
                }
              }
            },
            required: ["overallVerdict", "gates"]
          }
        }
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/patchJourney", async (req, res) => {
    try {
      const { careerJourney, contextEntries } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview", // Need a smarter model for JSON merging
        contents: `You are an expert resume writer and data structure manager.
Your task is to take a candidate's existing CareerJourney JSON and a set of new context entries (experiences), and merge them thoughtfully.

Existing Career Journey:
${JSON.stringify(careerJourney, null, 2)}

New Context Entries (key is Keyword ID, value is Context Object):
${JSON.stringify(contextEntries, null, 2)}

Instructions:
1. For each context entry with approvalStatus="Approved for patch":
   - Find the specified target role via targetRoleId.
   - If proposedAdditionType includes "Update existing", find the target item using targetDeliverableId and modify its text/outcomes.
   - If proposedAdditionType includes "Add new", insert a new deliverable, achievement, skill, etc. into the target role.
   - Generate IDs for new items if needed.
2. Output BOTH the fully updated CareerJourney JSON object AND a summary of changes.

Format your output carefully to match the schema.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              updatedCareerJourney: { type: Type.OBJECT },
              summary: {
                type: Type.OBJECT,
                properties: {
                  reason: { type: Type.STRING },
                  newSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  updatedSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  newDeliverables: { type: Type.ARRAY, items: { type: Type.STRING } },
                  updatedDeliverables: { type: Type.ARRAY, items: { type: Type.STRING } },
                  newAchievements: { type: Type.ARRAY, items: { type: Type.STRING } },
                  updatedAchievements: { type: Type.ARRAY, items: { type: Type.STRING } },
                  metaUpdate: {
                    type: Type.OBJECT,
                    properties: {
                      version: { type: Type.STRING },
                      changes: { type: Type.STRING }
                    }
                  }
                }
              }
            },
            required: ["updatedCareerJourney", "summary"]
          }
        }
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/resumeStrategy", async (req, res) => {
    try {
      const { parse, careerJourney, contextEntries } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Generate a Resume Strategy for this job posting based on candidate's context.

Job Parse:
${JSON.stringify(parse)}
Career Journey:
${JSON.stringify(careerJourney)}
Extra Context Entries:
${JSON.stringify(contextEntries)}

Output a detailed strategy.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
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
                    note: { type: Type.STRING }
                  },
                  required: ["company", "titleReframe", "note"]
                }
              },
              skillRows: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    content: { type: Type.STRING }
                  },
                  required: ["label", "content"]
                }
              },
              keywordPlacement: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["category", "keywords"]
                }
              },
              cautionClaims: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["outputBasename", "headerTagline", "executiveSummary", "selectedOutcomes", "roleStrategies", "skillRows", "keywordPlacement", "cautionClaims"]
          }
        }
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/keywordCoverage", async (req, res) => {
    try {
      const { strategy, keywords } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Evaluate the generated Resume Strategy against the Original JD Keywords to ensure we hit ATS marks.

Strategy:
${JSON.stringify(strategy)}
Keywords:
${JSON.stringify(keywords)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              threshold: { type: Type.NUMBER },
              passed: { type: Type.BOOLEAN },
              criticalSkillCoverage: {
                type: Type.ARRAY,
                items: { type: Type.OBJECT, properties: { phrase: { type: Type.STRING }, present: { type: Type.BOOLEAN } }, required: ["phrase", "present"] }
              },
              secondaryKeywordCoverage: {
                type: Type.ARRAY,
                items: { type: Type.OBJECT, properties: { phrase: { type: Type.STRING }, present: { type: Type.BOOLEAN } }, required: ["phrase", "present"] }
              },
              missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              unsupportedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["score", "threshold", "passed", "criticalSkillCoverage", "secondaryKeywordCoverage", "missingKeywords", "unsupportedKeywords"]
          }
        }
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/generateResume", async (req, res) => {
    try {
      const { careerJourney, strategy, parse } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Generate a fully tailored Resume ready for PDF export, adhering to a strict 2-page limit.
Combine the candidate's existing CareerJourney data with the newly generated tailored Resume Strategy, ensuring all Top Critical Skills and Keywords from the Job Parse are organically incorporated.

Career Journey:
${JSON.stringify(careerJourney, null, 2)}

Resume Strategy:
${JSON.stringify(strategy, null, 2)}

Job Parse:
${JSON.stringify(parse, null, 2)}

Instructions:
1. Ensure the resume fits within a 2-page constraint (be concise with bullet points, max 4-5 per role, impact focused).
2. Use the strategy's exact wording for the Summary and core skills.
3. Organize experience chronologically.
4. If contact info isn't in careerJourney, put placeholders like "[Name]" or "user@example.com".
5. Return a strict JSON object of the GeneratedResume.
`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
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
                  required: ["category", "terms"]
                }
              },
              experience: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    company: { type: Type.STRING },
                    title: { type: Type.STRING },
                    dates: { type: Type.STRING },
                    location: { type: Type.STRING },
                    bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["company", "title", "dates", "location", "bullets"]
                }
              },
              education: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    institution: { type: Type.STRING },
                    degree: { type: Type.STRING },
                    graduationDate: { type: Type.STRING }
                  },
                  required: ["institution", "degree", "graduationDate"]
                }
              }
            },
            required: ["name", "contactInfo", "summary", "skills", "experience", "education"]
          }
        }
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
