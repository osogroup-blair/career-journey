import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { FULL_KNOWLEDGE } from "./server/knowledge";
import { computeNextIds, computeNextVersion, versionChangesKey } from "./server/careerJourneyVersioning";
import { generateId } from "./src/lib/utils";
import { buildResumeDocx, buildCoverLetterDocx } from "./server/docxBuilder";
import { requireFirebaseAuth } from "./server/firebaseAdmin";

dotenv.config();

const KNOWLEDGE_PREAMBLE = `Reference material below is Blair Boylan's actual job-application pipeline: his project instructions plus five skill files (JD pipeline, cover letter, voice, ATS tactics, JD signal map). Follow these rules exactly wherever they apply to the task requested after the reference material. Do not summarize or explain the reference material back; use it silently to inform your output.

${FULL_KNOWLEDGE}

---
`;

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

  // No-op until FIREBASE_SERVICE_ACCOUNT_JSON is set (see server/firebaseAdmin.ts) —
  // guards the AI/sourcing endpoints once the app is deployed publicly.
  app.use("/api/ai", requireFirebaseAuth);
  app.use("/api/sources", requireFirebaseAuth);

  app.post("/api/ai/parse", async (req, res) => {
    try {
      const { jdText, company, roleTitle } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
You are running Stage 1 (Parse the JD) of JD_pipeline_SKILL.md for Blair Boylan. Extract structured information from the following Job Description.

Follow Stage 1 exactly: extract company & exact role title (establish the canonical "[Company] — [Exact Job Title]" name), reporting line & team scope, must-haves, nice-to-haves, strategic signals, industry/domain, stage signals, and the top 4-6 critical skills.

For hardGates, audit against the Stage 1 / jd_signal_map.md hard-gate checklist specifically (work authorization, location/time zone, required degree, required license/cert/clearance, minimum years, shift/travel/relocation, language) and evaluate each against Blair's actual default position from the reference material above (US-authorized; remote-first from Telluride CO, Mountain Time, willing to travel 10-20%; Mechanical Engineering coursework at MSOE, not completed; no clearance/PMP held). Only include a hard gate here if the JD actually states or implies that requirement - do not invent gates the JD doesn't mention.

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
        contents: `${KNOWLEDGE_PREAMBLE}
You are running Stage 2 (Keyword breakdown & experience recognition) of JD_pipeline_SKILL.md for Blair Boylan.

Use jd_signal_map.md's JD-signal-to-anchor-story table wherever a JD phrase matches or closely resembles one of its rows: base "currentAnchor" and "whatCouldCount" on that table's anchor story and bullet framing rather than inventing generic phrasing. Use the role-family positioning guardrail table (jd_signal_map.md) to judge whether a keyword should be a dominant top-third signal or a supporting one for this JD's target role family.

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
                category: { type: Type.STRING, description: "Exactly one of: 'Critical skill' | 'Required keyword' | 'Secondary keyword' | 'Hard gate' | 'Domain signal' | 'Tool / platform'" },
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
        contents: `${KNOWLEDGE_PREAMBLE}
You are running the Stage 2 recognition-prompt step of JD_pipeline_SKILL.md for Blair Boylan (the "what counts as experience" pattern - be specific to Blair using jd_signal_map.md's anchor stories when a gap keyword matches one of its rows, e.g. prompt him with the Google Workspace to SharePoint migration for "change management", or the Nymbl PADRE motion for "revenue operations").

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
        contents: `${KNOWLEDGE_PREAMBLE}
You are running Stage 3 (Score the fit) of JD_pipeline_SKILL.md for Blair Boylan. Score these four dimensions exactly as Stage 3 defines them, not generically:

1. Role scope fit - does the JD's actual scope match Blair's executive scope at Nymbl + Oso Group (post-sales leadership, services scaling, AI-enabled delivery, operating-system design)?
2. Industry & domain fit - is the vertical one Blair has shipped in (healthcare, fintech, logistics, SaaS-adjacent enterprise software) or credibly adjacent?
3. Seniority & stage fit - is the level (VP / Director / Head of / Principal) appropriate given Blair's CSO + Founder background, and is the company stage one where his "$1.5M to $9.2M" scaling story would be a compelling proof point?
4. Technical & AI fit - does the role reward AI orchestration, solutions architecture, technical depth, or operating-system thinking - Blair's differentiators?

End with one of PASS / BORDERLINE / SKIP per Stage 3's definitions (PASS = strong alignment, clear resume path; BORDERLINE = real gaps but a sharp resume could break through, name the gaps; SKIP = fundamental mismatch, say so plainly).

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
        contents: `${KNOWLEDGE_PREAMBLE}
You are running Stage 4 (ATS structured-field audit) of JD_pipeline_SKILL.md for Blair Boylan. Use his actual default position on each gate type from the reference material above (work authorization: US-authorized; location: remote-first, Telluride CO, Mountain Time; degree: Mechanical Engineering coursework at MSOE, not completed - usually a soft gate for senior roles unless the JD is emphatic; license/cert/clearance: none held; travel/relocation: willing to travel 10-20%, no relocation) rather than inferring it solely from role-location fields in the Career Journey, which may be incomplete for older roles.

You are an expert technical recruiter and ATS compliance system evaluating a candidate's credentials against a list of "Hard Gates" (such as location, work authorization, clearances, or minimum years of experience).

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

  function stripHtml(html: string): string {
    return html
      // Greenhouse/Lever content fields arrive HTML-entity-escaped (e.g. "&lt;div&gt;"), so decode first.
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<\/(p|div|li|br|h[1-6])>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  app.post("/api/sources/fetchCompanyJobs", async (req, res) => {
    const { boardToken } = req.body as { boardToken: string };
    if (!boardToken || typeof boardToken !== "string") {
      return res.status(400).json({ error: "boardToken is required" });
    }
    const token = boardToken.trim();

    try {
      const ghRes = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`);
      if (ghRes.ok) {
        const data: any = await ghRes.json();
        const jobs = (data.jobs || []).map((j: any) => ({
          source: "greenhouse",
          externalId: String(j.id),
          companyName: j.company_name || token,
          title: j.title,
          location: j.location?.name,
          absoluteUrl: j.absolute_url,
          jdText: stripHtml(j.content || ""),
        }));
        return res.json({ source: "greenhouse", jobs });
      }
    } catch (e) {
      console.error(`Greenhouse lookup failed for "${token}"`, e);
    }

    try {
      const leverRes = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);
      if (leverRes.ok) {
        const data: any = await leverRes.json();
        if (Array.isArray(data)) {
          const jobs = data.map((j: any) => ({
            source: "lever",
            externalId: String(j.id),
            companyName: token,
            title: j.text,
            location: j.categories?.location,
            absoluteUrl: j.hostedUrl,
            jdText: stripHtml(
              [j.descriptionPlain || j.description, ...(j.lists || []).map((l: any) => `${l.text}\n${l.content || ""}`)]
                .filter(Boolean)
                .join("\n\n")
            ),
          }));
          return res.json({ source: "lever", jobs });
        }
      }
    } catch (e) {
      console.error(`Lever lookup failed for "${token}"`, e);
    }

    return res.status(404).json({ error: `No public job board found for "${token}" on Greenhouse or Lever. Check the token from the company's careers page URL.` });
  });

  app.post("/api/ai/liteScan", async (req, res) => {
    try {
      const { jdText, careerJourney } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
You are running a fast Match Triage Scan for Blair Boylan — a single-call condensed version of JD_pipeline_SKILL.md Stages 1, 3, and 4, used to rank a batch of job postings before he commits to the full pipeline on any one of them. Be decisive, not exhaustive: this is a triage signal, not the final audit.

In one pass:
1. Parse the JD exactly as Stage 1 does: company & exact role title, reporting line, team scope, must-haves, nice-to-haves, strategic signals, industry/domain, stage signals, top 4-6 critical skills, and hard gates (evaluated against Blair's actual default position: US-authorized; remote-first from Telluride CO, Mountain Time, willing to travel 10-20%; Mechanical Engineering coursework at MSOE, not completed; no clearance/PMP held). Only include a hard gate if the JD actually states or implies it.
2. Score fit using Stage 3's four dimensions (role scope, industry/domain, seniority/stage, technical & AI fit) against Blair's Career Journey below, and land on one verdict: PASS / BORDERLINE / SKIP.
3. Judge hard-gate risk the way Stage 4 does, and land on one of: "CLEAR TO APPLY" / "VERIFY FIRST" / "LIKELY AUTO-REJECT".
4. Give a 0-100 matchScore reflecting overall pursue-worthiness (weight the fit verdict and hard-gate risk together, not just keyword overlap).
5. List the 3-5 biggest evidence gaps (topGaps) and the 2-3 strongest proof points already in the Career Journey worth leading with (leadWith) — short, concrete phrases, not full sentences.

Job Description:
${jdText}

Candidate Career Journey:
${JSON.stringify(careerJourney || {}, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              parse: {
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
              },
              matchScore: { type: Type.NUMBER },
              verdict: { type: Type.STRING, description: "'PASS' | 'BORDERLINE' | 'SKIP'" },
              hardGateRisk: { type: Type.STRING, description: "'CLEAR TO APPLY' | 'VERIFY FIRST' | 'LIKELY AUTO-REJECT'" },
              topGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
              leadWith: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["parse", "matchScore", "verdict", "hardGateRisk", "topGaps", "leadWith"]
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
      const nextIds = computeNextIds(careerJourney);
      const nextVersion = computeNextVersion(careerJourney?.meta?.version);
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview", // Need a smarter model for JSON merging
        contents: `${KNOWLEDGE_PREAMBLE}
You are running the Career Journey capture step of JD_pipeline_SKILL.md for Blair Boylan. Never invent an employer, client, metric, title, certification, degree, tool, or claim Blair did not confirm in the context entries below - only structure what's already there.

ID discipline: never reuse an existing ID. When you add a new item, assign IDs starting exactly from these precomputed next-available values (increment further within this same call if you add more than one item of the same type): ${JSON.stringify(nextIds)}

Versioning: this patch becomes Career Journey version ${nextVersion} (bumped from ${careerJourney?.meta?.version || "unknown"}). Set updatedCareerJourney.meta.version to exactly "${nextVersion}" and updatedCareerJourney.meta.last_updated to today's date. Do not invent a different version number.

You are an expert resume writer and data structure manager.
Your task is to take a candidate's existing CareerJourney JSON and a set of new context entries (experiences), and merge them thoughtfully.

Existing Career Journey:
${JSON.stringify(careerJourney, null, 2)}

New Context Entries (key is Keyword ID, value is Context Object):
${JSON.stringify(contextEntries, null, 2)}

Instructions:
1. For each context entry with approvalStatus="Approved for patch":
   - Find the specified target role via targetRoleId.
   - If proposedAdditionType includes "Update existing", find the target item using targetDeliverableId and modify its text/outcomes.
   - If proposedAdditionType includes "Add new", insert a new deliverable, achievement, skill, etc. into the target role, using the precomputed next-available IDs above.
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
      const result = JSON.parse(response.text!);
      // Enforce version/ID discipline server-side rather than trusting the model's output.
      if (result.updatedCareerJourney) {
        if (!result.updatedCareerJourney.meta) result.updatedCareerJourney.meta = {};
        result.updatedCareerJourney.meta.version = nextVersion;
        result.updatedCareerJourney.meta.last_updated = new Date().toISOString().split("T")[0];
        const changesKey = versionChangesKey(nextVersion);
        result.updatedCareerJourney.meta[changesKey] = [result.summary?.reason].filter(Boolean);
      }
      if (result.summary) {
        result.summary.id = result.summary.id || generateId("PATCH");
        result.summary.targetVersion = nextVersion;
        result.summary.approvalStatus = "Pending";
        if (!Array.isArray(result.summary.linkUpdates)) result.summary.linkUpdates = [];
        if (result.summary.metaUpdate) {
          result.summary.metaUpdate.version = nextVersion;
        }
      }
      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/resumeStrategy", async (req, res) => {
    try {
      const { parse, careerJourney, contextEntries, remediation } = req.body as { parse: any; careerJourney: any; contextEntries: any; remediation?: string[] };
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
You are running Stage 6's resume positioning integrity gate (JD_pipeline_SKILL.md) for Blair Boylan. Before drafting the strategy, define the candidate identity the top third must communicate per the role-family positioning guardrail in jd_signal_map.md. Apply the title-reframing tactic from ats_tactics.md (hybrid title: "Real Title | Head of [JD's preferred phrase]") to roleStrategies.titleReframe. Preserve the canonical resume_company_descriptor values from the Career Journey exactly - never rewrite them to mirror the JD. Use exact JD terminology in keywordPlacement where truthful. headerTagline should mirror the JD's framing of the role.
${remediation && remediation.length > 0 ? `\nThis is a REBUILD after a failed Stage 7 keyword gate. Work these missing keywords truthfully into keywordPlacement, skillRows, and/or selectedOutcomes wherever the Career Journey honestly supports them - never fabricate evidence for one that has none: ${remediation.join(', ')}\n` : ''}
Generate a Resume Strategy for this job posting based on candidate's context.

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
        contents: `${KNOWLEDGE_PREAMBLE}
You are running Stage 7 (Keyword scoring gate) of JD_pipeline_SKILL.md for Blair Boylan. Weight the top 4-6 critical skills most heavily; a term appearing in the summary or most-recent role counts more than one buried in an older role. Compute coverage as (matched critical-skill keywords + matched secondary keywords, weighted) / total, as a percentage. Every one of the top critical skills must be present for the gate to pass, regardless of overall percentage.

Evaluate the generated Resume Strategy against the Original JD Keywords to ensure we hit ATS marks.

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
      const coverage = JSON.parse(response.text!);
      // Fixed 85% bar per Stage 7 - never let the model set its own threshold.
      const THRESHOLD = 85;
      coverage.threshold = THRESHOLD;
      const allCriticalPresent = (coverage.criticalSkillCoverage || []).every((c: any) => c.present);
      coverage.passed = allCriticalPresent && coverage.score >= THRESHOLD;
      res.json(coverage);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/generateResume", async (req, res) => {
    try {
      const { careerJourney, strategy, parse, remediation } = req.body as { careerJourney: any; strategy: any; parse: any; remediation?: string[] };
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
You are running Stage 6 (Generate the tailored resume) of JD_pipeline_SKILL.md for Blair Boylan. Apply ats_tactics.md's Screen 1 and Screen 2 tactics: keyword mirroring in the JD's exact vocabulary, standard section headers, full month-year dates, acronym long-form+short-form pairing on first use, and the role-identity/seniority-balance guardrail so implementation languages don't dominate a senior architecture/strategy identity. Apply Blair Voice lightly per Blair_Voice_SKILL.md rule 8 in the Job Applications integration section: remove generic executive adjectives ("seasoned," "results-driven," "proven track record"), use the verb that names the actual mechanism rather than swapping synonyms for style. Never fabricate a metric, employer, client, or credential that isn't in the Career Journey.
${remediation && remediation.length > 0 ? `\nThis is a REBUILD after a failed keyword gate. These keywords are missing and must be truthfully worked into the summary, skills, or a role bullet if any honest evidence supports them (do not fabricate experience for a keyword that has none): ${remediation.join(', ')}\n` : ''}
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
4. Use Blair's canonical contact details from the reference material above (phone, email, and blairboylan.com as the final contact item; no LinkedIn unless the request says otherwise). If contact info truly isn't derivable, use placeholders like "[Name]" or "user@example.com".
5. For each experience entry, if the matching Career Journey role has resume_company_descriptor and/or resume_company_url, populate companyDescriptor and companyUrl on that entry exactly as given - never rewrite the descriptor.
6. Return a strict JSON object of the GeneratedResume.
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
                    companyDescriptor: { type: Type.STRING, description: "The canonical resume_company_descriptor for this role's employer, verbatim from the Career Journey, if one exists." },
                    companyUrl: { type: Type.STRING, description: "The canonical resume_company_url for this role's employer, verbatim from the Career Journey, if one exists." },
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

  app.post("/api/ai/coverLetter", async (req, res) => {
    try {
      const { parse, careerJourney, fitAnalysis, resumeStrategy } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
You are running Stage 9 (Cover Letter) of JD_pipeline_SKILL.md for Blair Boylan, governed by Blair_Cover_Letter_SKILL.md for strategy/structure/quality and Blair_Voice_SKILL.md (Mode A: Blair Personal Voice) for sentence construction and anti-AI editing. Do not rerun the JD/fit analysis - reuse the parse, fit analysis, and resume strategy already supplied below.

Before writing, silently work through Blair_Cover_Letter_SKILL.md's Opening Thesis Gate: generate at least three materially different opening directions internally, reject any that fail the opening rejection test, and only draft the full letter once one clearly passes.

Default to four paragraphs, 325-400 words, one page. Use one primary proof story with one strong metric from the Career Journey, never a resume-in-prose. Never fabricate a client, employer, metric, or credential not present in the Career Journey.

Before returning your answer, silently self-apply, in order:
1. The Cover-letter Anti-Slop Hard Gate (Blair_Cover_Letter_SKILL.md section 10A) - reject slogans, buzzword stacks, unsupported tails on real metrics, process-as-reason phrasing, and canned conclusions.
2. Blair_Voice_SKILL.md's sentence-level anti-slop standard and AI-Suspicion Audit - target 2/10 or lower, no em dashes, no cover-letter throat clearing, no "What interests me about..." openings.
3. Blair_Cover_Letter_SKILL.md's 10-point rubric - only return a letter that would score 8.5/10 or higher. If your first draft would not, revise internally before responding. Do not narrate this process - return only the final passing letter.

Job Parse:
${JSON.stringify(parse, null, 2)}

Career Journey:
${JSON.stringify(careerJourney, null, 2)}

Fit Analysis (reuse, do not re-derive):
${JSON.stringify(fitAnalysis || {}, null, 2)}

Resume Strategy (reuse for positioning consistency):
${JSON.stringify(resumeStrategy || {}, null, 2)}

Return the final cover letter body text only (no subject line, no "Dear Hiring Manager" placeholder unless no name is available - use a natural team salutation like "Dear [Company] team," when no specific name is known), plus its word count.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              content: { type: Type.STRING },
              wordCount: { type: Type.NUMBER }
            },
            required: ["content", "wordCount"]
          }
        }
      });
      const result = JSON.parse(response.text!);
      result.approvalStatus = "Draft";
      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/export/resume.docx", async (req, res) => {
    try {
      const { resume, strategy, companyName, roleTitle } = req.body;
      const buffer = await buildResumeDocx(resume, strategy);
      const roleSlug = String(roleTitle || "Role").replace(/[^a-zA-Z0-9]+/g, "");
      const companySlug = String(companyName || "Company").replace(/[^a-zA-Z0-9]+/g, "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="Blair_Boylan_Resume_${companySlug}_${roleSlug}.docx"`);
      res.send(buffer);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/export/coverLetter.docx", async (req, res) => {
    try {
      const { coverLetter, companyName, roleTitle } = req.body;
      const buffer = await buildCoverLetterDocx(coverLetter);
      const roleSlug = String(roleTitle || "Role").replace(/[^a-zA-Z0-9]+/g, "");
      const companySlug = String(companyName || "Company").replace(/[^a-zA-Z0-9]+/g, "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="Blair_Boylan_CoverLetter_${companySlug}_${roleSlug}.docx"`);
      res.send(buffer);
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
