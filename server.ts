import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { FULL_KNOWLEDGE, CAREER_JOURNEY_BUILDER_KNOWLEDGE } from "./server/knowledge";
import { computeNextIds, computeNextVersion, versionChangesKey } from "./server/careerJourneyVersioning";
import { generateId } from "./src/lib/utils";
import { buildResumeDocx, buildCoverLetterDocx } from "./server/docxBuilder";
import { requireFirebaseAuth } from "./server/firebaseAdmin";
import { requireWithinAiQuota } from "./server/rateLimiter";
import { getActivePrompt, getActivePromptFilled, getAllPromptConfigs, savePromptOverride, restorePromptDefault, DEFAULT_PROMPTS } from "./server/promptStore";

dotenv.config();

const KNOWLEDGE_PREAMBLE = `Reference material below is the candidate's job-application pipeline: project instructions plus five skill files (JD pipeline, cover letter, voice, ATS tactics, JD signal map). Follow these rules exactly wherever they apply to the task requested after the reference material. Do not summarize or explain the reference material back; use it silently to inform your output.

${FULL_KNOWLEDGE}

---
`;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Deterministic, non-AI segmentation of raw JD text into paragraph/bullet
 * chunks with stable ids — the traceability anchor that lets a keyword or
 * fit-gap claim point back to the exact JD text it came from (EvidenceTrace).
 * Split on blank lines first; if that yields one giant blob (JDs pasted
 * without paragraph breaks), fall back to splitting on line breaks.
 */
function segmentJdText(jdText: string): { id: string; text: string }[] {
  const byParagraph = jdText.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
  const chunks = byParagraph.length > 3 ? byParagraph : jdText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return chunks.map((text, i) => ({ id: `jd-${i}`, text }));
}

async function startServer() {
  const app = express();
  const PORT = 47293;

  app.use(express.json({ limit: '10mb' }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // No-op until FIREBASE_SERVICE_ACCOUNT_JSON is set (see server/firebaseAdmin.ts) —
  // guards the AI/sourcing endpoints once the app is deployed publicly.
  app.use("/api/ai", requireFirebaseAuth);
  app.use("/api/ai", requireWithinAiQuota);
  app.use("/api/sources", requireFirebaseAuth);
  app.use("/api/admin", requireFirebaseAuth);
  app.use("/api/export", requireFirebaseAuth);

  app.get("/api/admin/prompts", (req, res) => {
    res.json(getAllPromptConfigs());
  });

  app.post("/api/admin/prompts/:id", (req, res) => {
    const { id } = req.params;
    const { template } = req.body as { template: string };
    if (!(id in DEFAULT_PROMPTS)) return res.status(404).json({ error: `Unknown prompt "${id}"` });
    if (typeof template !== "string" || !template.trim()) return res.status(400).json({ error: "template is required" });
    const saved = savePromptOverride(id, template);
    res.json(saved);
  });

  app.post("/api/admin/prompts/:id/restore", (req, res) => {
    const { id } = req.params;
    restorePromptDefault(id);
    res.json({ id, template: DEFAULT_PROMPTS[id]?.template ?? "" });
  });

  // Runs a candidate prompt template (possibly unsaved edits) against a small
  // fixed sample so an admin can sanity-check a change before committing it.
  app.post("/api/admin/prompts/:id/testRun", async (req, res) => {
    try {
      const { id } = req.params;
      const { template, sampleJdText } = req.body as { template: string; sampleJdText?: string };
      if (id !== "parse") {
        return res.status(400).json({ error: "Test Run currently only supports the 'parse' prompt — other prompts need a full job/career-journey context to run meaningfully." });
      }
      const jdText = sampleJdText || "Senior Software Engineer at a Series B fintech startup. Requires 5+ years of backend experience, strong Python skills, and a Bachelor's degree in Computer Science. Remote-friendly within the US.";
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}\n${template}\n\nCompany: Sample Co\nRole: Sample Role\n\nJob Description:\n${jdText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              company: { type: Type.STRING }, roleTitle: { type: Type.STRING }, reportingLine: { type: Type.STRING },
              teamScope: { type: Type.STRING }, mustHaves: { type: Type.ARRAY, items: { type: Type.STRING } },
              niceToHaves: { type: Type.ARRAY, items: { type: Type.STRING } }, strategicSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
              industryDomain: { type: Type.ARRAY, items: { type: Type.STRING } }, stageSignals: { type: Type.ARRAY, items: { type: Type.STRING } },
              topCriticalSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              hardGates: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { category: { type: Type.STRING }, requirement: { type: Type.STRING } } } },
            },
          },
        },
      });
      res.json({ output: JSON.parse(response.text!) });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/parse", async (req, res) => {
    try {
      const { jdText, company, roleTitle } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('parse')}

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
      res.json({ ...JSON.parse(response.text!), jdSegments: segmentJdText(jdText) });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/keywords", async (req, res) => {
    try {
      const { parse, careerJourney, jdSegments } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('keywords')}

Job Parse:
${JSON.stringify(parse, null, 2)}

JD Segments (cite these ids in jdRefs):
${JSON.stringify(jdSegments || [], null, 2)}

Candidate Career Journey Context (cite real ids from here in evidenceRefs):
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
                evidenceRefs: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING, description: "'deliverable' | 'achievement' | 'skill' | 'role'" },
                      id: { type: Type.STRING }
                    },
                    required: ["type", "id"]
                  }
                },
                jdRefs: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { segmentId: { type: Type.STRING } },
                    required: ["segmentId"]
                  }
                },
                whatCouldCount: { type: Type.STRING },
                recognitionPrompt: { type: Type.STRING },
                resumePriority: { type: Type.STRING },
                isTopCritical: { type: Type.BOOLEAN },
                userContextStatus: { type: Type.STRING }
              },
              required: ["id", "phrase", "category", "jdImportance", "evidenceStatus", "evidenceRefs", "jdRefs", "whatCouldCount", "recognitionPrompt", "resumePriority", "isTopCritical", "userContextStatus"]
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
${getActivePrompt('clarifyQuestions')}

List of Gap Keywords and their ATS status:
${JSON.stringify(nonEvidenced, null, 2)}

Candidate Master Career Journey Roles:
${JSON.stringify((careerJourney?.roles || []).map((r: any) => ({ id: r.id, organization: r.organization, title: r.title })), null, 2)}`,
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
      const { parse, careerJourney, contextEntries, gateClarifications, jdSegments } = req.body;
      // Provide a simpler schema since Gemini struggles with nested enums sometimes
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('fitScore')}

Job Parse:
${JSON.stringify(parse)}
JD Segments (cite ids from here in jdRefs when a gap or lead-with point traces to specific JD text):
${JSON.stringify(jdSegments || [])}
Career Journey (cite real ids from here in evidenceRefs when a lead-with point traces to a specific deliverable/achievement/skill):
${JSON.stringify(careerJourney)}
Extra Context Entries:
${JSON.stringify(contextEntries)}
Candidate Custom Gate & Fit Clarifications (if any, where they explain and prove how they meet uncertain/failing requirements):
${JSON.stringify(gateClarifications || {})}

Generate an objective fit analysis. If the candidate has provided convincing explanations and objective proofs, factor them into upgrading the relevant dimension ratings ('Strong' | 'Moderate') and adjust the rationale and overallVerdict accordingly. For each leadWith/gaps entry, cite real evidenceRefs/jdRefs ids where applicable — leave them empty rather than inventing an id.`,
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
              leadWith: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    evidenceRefs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, id: { type: Type.STRING } }, required: ["type", "id"] } },
                    jdRefs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { segmentId: { type: Type.STRING } }, required: ["segmentId"] } }
                  },
                  required: ["text"]
                }
              },
              gaps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    evidenceRefs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, id: { type: Type.STRING } }, required: ["type", "id"] } },
                    jdRefs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { segmentId: { type: Type.STRING } }, required: ["segmentId"] } }
                  },
                  required: ["text"]
                }
              }
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
      const { parse, careerJourney, gateClarifications, jdSegments } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('auditGates')}

Job Parse (containing requirements & hard gates):
${JSON.stringify(parse, null, 2)}

JD Segments (cite ids from here in jdRefs where a gate's requirement text traces to specific JD text):
${JSON.stringify(jdSegments || [], null, 2)}

Candidate 'Career Journey' History (roles, initiatives, skills, dates, etc. — cite real ids from here in evidenceRefs):
${JSON.stringify(careerJourney || {}, null, 2)}

Active Candidate Clarifications / Proofs (if any, keyed by the gate category or requirement):
${JSON.stringify(gateClarifications || {}, null, 2)}`,
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
                    suggestedAction: { type: Type.STRING },
                    evidenceRefs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { type: { type: Type.STRING }, id: { type: Type.STRING } }, required: ["type", "id"] } },
                    jdRefs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { segmentId: { type: Type.STRING } }, required: ["segmentId"] } }
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

  // Below this length the stripped text is almost certainly a JS-rendered shell
  // page with no server-rendered JD content, not a real (if short) posting.
  const MIN_EXTRACTED_JD_LENGTH = 200;

  app.post("/api/sources/fetchJobFromUrl", async (req, res) => {
    const { url } = req.body as { url: string };
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url is required" });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: "That doesn't look like a valid URL." });
    }

    // Higher-fidelity structured extraction for known ATS boards, reusing the
    // same public APIs as fetchCompanyJobs above instead of scraping HTML.
    const greenhouseMatch = parsed.hostname.includes("greenhouse.io") ? parsed.pathname.match(/\/([^/]+)\/jobs\/(\d+)/) : null;
    const leverMatch = parsed.hostname.includes("lever.co") ? parsed.pathname.match(/^\/([^/]+)\/([a-f0-9-]+)/) : null;

    try {
      if (greenhouseMatch) {
        const [, token, jobId] = greenhouseMatch;
        const ghRes = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${jobId}?content=true`);
        if (ghRes.ok) {
          const j: any = await ghRes.json();
          return res.json({ jdText: stripHtml(j.content || ""), companyName: j.company_name || token, roleTitle: j.title });
        }
      } else if (leverMatch) {
        const [, token, postingId] = leverMatch;
        const leverRes = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}/${postingId}?mode=json`);
        if (leverRes.ok) {
          const j: any = await leverRes.json();
          const jdText = stripHtml([j.descriptionPlain || j.description, ...(j.lists || []).map((l: any) => `${l.text}\n${l.content || ""}`)].filter(Boolean).join("\n\n"));
          return res.json({ jdText, companyName: token, roleTitle: j.text });
        }
      }
    } catch (e) {
      console.error(`Structured fetch failed for "${url}", falling back to generic scrape`, e);
    }

    try {
      const pageRes = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; CareerJourneyBot/1.0)" } });
      if (!pageRes.ok) {
        return res.status(502).json({ error: `The site returned ${pageRes.status} — try pasting the job description instead.` });
      }
      const html = await pageRes.text();
      const jdText = stripHtml(html);
      if (jdText.length < MIN_EXTRACTED_JD_LENGTH) {
        return res.status(422).json({ error: "could_not_extract" });
      }
      return res.json({ jdText });
    } catch (e: any) {
      console.error(`Generic fetch failed for "${url}"`, e);
      return res.status(502).json({ error: "Couldn't reach that URL — try pasting the job description instead." });
    }
  });

  app.post("/api/ai/liteScan", async (req, res) => {
    try {
      const { jdText, careerJourney, archiveLearnings } = req.body;
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('liteScan')}

Job Description:
${jdText}

Candidate Career Journey:
${JSON.stringify(careerJourney || {}, null, 2)}
${archiveLearnings ? `\nLearnings from past application outcomes (weigh these — if this posting resembles a pattern that's previously led to rejection or a bad fit, reflect that in matchScore/verdict/topGaps rather than scoring on keyword overlap alone):\n${archiveLearnings}\n` : ''}`,
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

  // Delta-based, not full-object-regeneration: asking Gemini to return an entire
  // updated CareerJourney under a bare `{ type: Type.OBJECT }` reliably comes back
  // `{}` (confirmed while building the Phase 4/5 builder endpoints - Gemini treats an
  // OBJECT schema with no declared `properties` as "no properties allowed"). Every
  // field below is a flat, fully-typed leaf, so there's nowhere for that trap to hide.
  // The server applies the delta to the existing Career Journey itself, the same way
  // the Phase 5 interview-refinement endpoint does.
  const PATCH_DELTA_SCHEMA = {
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

  // Applies a PATCH_DELTA_SCHEMA-shaped delta to a deep copy of careerJourney,
  // assigning real IDs as it goes. Returns the updated journey plus human-readable
  // summary strings (PatchReview.tsx just renders these as bullet lists).
  function applyCareerJourneyDelta(careerJourney: any, delta: any, nextIds: Record<string, string>) {
    const cj = JSON.parse(JSON.stringify(careerJourney || {}));
    if (!Array.isArray(cj.achievements)) cj.achievements = [];
    if (!Array.isArray(cj.skills_index)) cj.skills_index = [];
    if (!Array.isArray(cj.roles)) cj.roles = [];

    // Local counters so multiple new items of the same type in one call get
    // distinct, incrementing IDs starting from the precomputed next-available value.
    const counters: Record<string, number> = {};
    const nextId = (prefix: string) => {
      if (!(prefix in counters)) {
        const base = nextIds[prefix] || `${prefix}-001`;
        counters[prefix] = parseInt(base.split("-")[1], 10) || 1;
      } else {
        counters[prefix]++;
      }
      return `${prefix}-${String(counters[prefix]).padStart(3, "0")}`;
    };

    const summary = {
      newSkills: [] as string[],
      updatedSkills: [] as string[],
      newDeliverables: [] as string[],
      updatedDeliverables: [] as string[],
      newAchievements: [] as string[],
      updatedAchievements: [] as string[],
    };

    for (const a of delta.newAchievements || []) {
      const id = nextId("ACH");
      cj.achievements.unshift({
        id,
        title: a.title,
        description: a.description || "",
        category: a.category || "",
        role_ids: a.targetRoleId ? [a.targetRoleId] : [],
      });
      summary.newAchievements.push(a.title);
    }

    for (const s of delta.newSkills || []) {
      const id = nextId("SK");
      cj.skills_index.push({ id, name: s.name, category: s.category || "", proficiency: s.proficiency || "", years_experience: s.years_experience, last_used: s.last_used || "" });
      summary.newSkills.push(s.name);
    }

    for (const d of delta.newDeliverables || []) {
      const role = cj.roles.find((r: any) => r.id === d.targetRoleId);
      if (!role) continue;
      if (!Array.isArray(role.initiatives)) role.initiatives = [];
      let initiative = d.targetInitiativeId ? role.initiatives.find((i: any) => i.id === d.targetInitiativeId) : role.initiatives[0];
      if (!initiative) {
        initiative = { id: nextId("INIT"), name: "General", description: "", deliverables: [] };
        role.initiatives.push(initiative);
      }
      if (!Array.isArray(initiative.deliverables)) initiative.deliverables = [];
      const id = nextId("DEL");
      initiative.deliverables.push({
        id,
        description: d.description,
        impact: d.impact || "",
        capability_alignment: d.capability_alignment || [],
        skill_ids: d.skill_ids || [],
      });
      summary.newDeliverables.push(d.description);
    }

    for (const d of delta.updatedDeliverables || []) {
      for (const role of cj.roles) {
        for (const initiative of role.initiatives || []) {
          const target = (initiative.deliverables || []).find((x: any) => x.id === d.deliverableId);
          if (target) {
            if (d.description) target.description = d.description;
            if (d.impact) target.impact = d.impact;
            summary.updatedDeliverables.push(target.description);
          }
        }
      }
    }

    for (const a of delta.updatedAchievements || []) {
      const target = cj.achievements.find((x: any) => x.id === a.achievementId);
      if (target) {
        if (a.title) target.title = a.title;
        if (a.description) target.description = a.description;
        summary.updatedAchievements.push(target.title);
      }
    }

    for (const s of delta.updatedSkills || []) {
      const target = cj.skills_index.find((x: any) => x.id === s.skillId);
      if (target) {
        if (s.proficiency) target.proficiency = s.proficiency;
        if (s.years_experience !== undefined) target.years_experience = s.years_experience;
        if (s.last_used) target.last_used = s.last_used;
        summary.updatedSkills.push(target.name);
      }
    }

    return { updatedCareerJourney: cj, summary };
  }

  app.post("/api/ai/patchJourney", async (req, res) => {
    try {
      const { careerJourney, contextEntries } = req.body;
      const nextIds = computeNextIds(careerJourney);
      const nextVersion = computeNextVersion(careerJourney?.meta?.version);
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview", // Need a smarter model for JSON merging
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('patchJourney')}

Existing Career Journey:
${JSON.stringify(careerJourney, null, 2)}

New Context Entries (key is Keyword ID, value is Context Object):
${JSON.stringify(contextEntries, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: PATCH_DELTA_SCHEMA,
        },
      });
      const delta = JSON.parse(response.text!);
      const { updatedCareerJourney, summary: deltaSummary } = applyCareerJourneyDelta(careerJourney, delta, nextIds);

      updatedCareerJourney.meta = updatedCareerJourney.meta || {};
      updatedCareerJourney.meta.version = nextVersion;
      updatedCareerJourney.meta.last_updated = new Date().toISOString().split("T")[0];
      const changesKey = versionChangesKey(nextVersion);
      updatedCareerJourney.meta[changesKey] = [delta.reason].filter(Boolean);

      const summary = {
        id: generateId("PATCH"),
        targetVersion: nextVersion,
        reason: delta.reason || "",
        ...deltaSummary,
        linkUpdates: [] as string[],
        metaUpdate: { version: nextVersion, changes: delta.reason || "" },
        approvalStatus: "Pending",
      };

      res.json({ updatedCareerJourney, summary });
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
${getActivePrompt('resumeStrategy')}
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

  // /api/ai/keywordCoverage retired (Phase 3) — the Rating stage's finalized
  // keyword evidence table now does this check once, before resume generation,
  // instead of re-scoring the drafted strategy after the fact.

  app.post("/api/ai/generateResume", async (req, res) => {
    try {
      const { careerJourney, strategy, parse, remediation } = req.body as { careerJourney: any; strategy: any; parse: any; remediation?: string[] };
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('generateResume')}
${remediation && remediation.length > 0 ? `\nThis is a REBUILD after a failed keyword gate. These keywords are missing and must be truthfully worked into the summary, skills, or a role bullet if any honest evidence supports them (do not fabricate experience for a keyword that has none): ${remediation.join(', ')}\n` : ''}

Career Journey:
${JSON.stringify(careerJourney, null, 2)}

Resume Strategy:
${JSON.stringify(strategy, null, 2)}

Job Parse:
${JSON.stringify(parse, null, 2)}`,
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
                              required: ["type", "id"]
                            }
                          }
                        },
                        required: ["text"]
                      }
                    }
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
${getActivePrompt('coverLetter')}

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

  app.post("/api/ai/applicationAssistant", async (req, res) => {
    try {
      const { transcript, parse, careerJourney, resume, fitAnalysis } = req.body as {
        transcript: { role: "user" | "assistant"; content: string }[];
        parse: any; careerJourney: any; resume: any; fitAnalysis: any;
      };
      const history = transcript.slice(0, -1).map((t) => `${t.role === "user" ? "Candidate" : "Assistant"}: ${t.content}`).join("\n");
      const latest = transcript[transcript.length - 1]?.content || "";
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('applicationAssistant')}

Job Parse:
${JSON.stringify(parse, null, 2)}

Tailored Resume (already generated for this job):
${JSON.stringify(resume || {}, null, 2)}

Fit Analysis:
${JSON.stringify(fitAnalysis || {}, null, 2)}

Career Journey:
${JSON.stringify(careerJourney, null, 2)}

Conversation so far:
${history}

Candidate's latest message: "${latest}"`,
      });
      res.json({ reply: response.text });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/generateFormAnswers", async (req, res) => {
    try {
      const { fields, parse, careerJourney, resume } = req.body as { fields: { id: string; label: string; fieldType: string; options?: string[] }[]; parse: any; careerJourney: any; resume: any };
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('generateFormAnswers')}

Fields:
${JSON.stringify(fields, null, 2)}

Job Parse:
${JSON.stringify(parse, null, 2)}

Tailored Resume:
${JSON.stringify(resume || {}, null, 2)}

Career Journey:
${JSON.stringify(careerJourney, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answers: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { fieldId: { type: Type.STRING }, answer: { type: Type.STRING } },
                  required: ["fieldId", "answer"]
                }
              }
            },
            required: ["answers"]
          }
        }
      });
      const { answers } = JSON.parse(response.text!);
      const byId: Record<string, string> = {};
      for (const a of answers) byId[a.fieldId] = a.answer;
      res.json({ answers: byId });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/interviewPrep", async (req, res) => {
    try {
      const { round, parse, fitAnalysis, careerJourney } = req.body as { round: any; parse: any; fitAnalysis: any; careerJourney: any };
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('interviewPrep')}

Interview Round:
${JSON.stringify(round, null, 2)}

Job Parse:
${JSON.stringify(parse, null, 2)}

Fit Analysis (known gaps and strengths for this role):
${JSON.stringify(fitAnalysis || {}, null, 2)}

Career Journey:
${JSON.stringify(careerJourney, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              likelyQuestions: {
                type: Type.ARRAY,
                items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, why: { type: Type.STRING } }, required: ["question", "why"] }
              },
              meetingGoal: { type: Type.STRING },
              talkingPoints: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["likelyQuestions", "meetingGoal", "talkingPoints"]
          }
        }
      });
      const result = JSON.parse(response.text!);
      result.generatedAt = new Date().toISOString();
      res.json(result);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/interviewPrepChat", async (req, res) => {
    try {
      const { transcript, round, parse, careerJourney } = req.body as {
        transcript: { role: "user" | "assistant"; content: string }[];
        round: any; parse: any; careerJourney: any;
      };
      const history = transcript.slice(0, -1).map((t) => `${t.role === "user" ? "Candidate" : "Coach"}: ${t.content}`).join("\n");
      const latest = transcript[transcript.length - 1]?.content || "";
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('interviewPrepChat')}

Interview Round:
${JSON.stringify(round, null, 2)}
Job Parse:
${JSON.stringify(parse, null, 2)}
Career Journey:
${JSON.stringify(careerJourney, null, 2)}

Conversation so far:
${history}

Candidate's latest message: "${latest}"`,
      });
      res.json({ reply: response.text });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/offerGuidance", async (req, res) => {
    try {
      const { offer, parse, careerJourney } = req.body as { offer: any; parse: any; careerJourney: any };
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('offerGuidance')}

Offer Details:
${JSON.stringify(offer, null, 2)}
Job Parse:
${JSON.stringify(parse, null, 2)}
Career Journey (for leverage/market positioning context):
${JSON.stringify(careerJourney, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              askAbout: { type: Type.ARRAY, items: { type: Type.STRING } },
              avoidAsking: { type: Type.ARRAY, items: { type: Type.STRING } },
              negotiationAngles: { type: Type.ARRAY, items: { type: Type.STRING } },
              redFlags: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["askAbout", "avoidAsking", "negotiationAngles", "redFlags"]
          }
        }
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/compareOffers", async (req, res) => {
    try {
      const { offers, careerJourney } = req.body as { offers: { jobId: string; companyName: string; roleTitle: string; offer: any }[]; careerJourney: any };
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${KNOWLEDGE_PREAMBLE}
${getActivePrompt('compareOffers')}

Offers:
${JSON.stringify(offers, null, 2)}
Career Journey (positioning/preferences context):
${JSON.stringify(careerJourney?.person?.positioning || {}, null, 2)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              perOffer: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    jobId: { type: Type.STRING },
                    pros: { type: Type.ARRAY, items: { type: Type.STRING } },
                    cons: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["jobId", "pros", "cons"]
                }
              },
              recommendation: { type: Type.STRING }
            },
            required: ["perOffer", "recommendation"]
          }
        }
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // Gemini's structured-output mode treats a bare `{ type: Type.OBJECT }` (no
  // `properties`) as "an object with no properties allowed" and returns `{}` —
  // learned by actually testing this endpoint, not by inspection. The draft needs a
  // concrete (if partial) shape so the model has somewhere to put what it extracts.
  const DRAFT_CAREER_JOURNEY_SCHEMA = {
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

  app.post("/api/ai/buildJourneyFromResume", async (req, res) => {
    try {
      const { resumeText } = req.body as { resumeText: string };
      const nextIds = computeNextIds({});
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${CAREER_JOURNEY_BUILDER_KNOWLEDGE}

---

${getActivePrompt('buildJourneyFromResume')}

Start ID numbering fresh from these values: ${JSON.stringify(nextIds)}.

Resume text:
${resumeText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              draftCareerJourney: DRAFT_CAREER_JOURNEY_SCHEMA,
              notes: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["draftCareerJourney", "notes"],
          },
        },
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/buildJourneyChat", async (req, res) => {
    try {
      const { transcript, currentDraft } = req.body as {
        transcript: { role: "user" | "assistant"; content: string }[];
        currentDraft: any;
      };
      const nextIds = computeNextIds(currentDraft || {});
      const transcriptText = (transcript || [])
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${CAREER_JOURNEY_BUILDER_KNOWLEDGE}

---

${getActivePrompt('buildJourneyChat')}

Current draft so far (merge each new answer into this, don't restart it): ${JSON.stringify(currentDraft || {})}

New IDs for anything you add this turn start from: ${JSON.stringify(nextIds)}

Conversation so far:
${transcriptText}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assistantMessage: { type: Type.STRING },
              updatedDraft: DRAFT_CAREER_JOURNEY_SCHEMA,
              readyForReview: { type: Type.BOOLEAN },
            },
            required: ["assistantMessage", "updatedDraft", "readyForReview"],
          },
        },
      });
      res.json(JSON.parse(response.text!));
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/refineFromInterviewAnswer", async (req, res) => {
    try {
      const { entityType, current, question, answer } = req.body as {
        entityType: "achievement" | "skill" | "role";
        current: Record<string, any>;
        question: string;
        answer: string;
      };
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `${CAREER_JOURNEY_BUILDER_KNOWLEDGE}

---

${getActivePromptFilled('refineFromInterviewAnswer', { entityType })}

Current ${entityType}: ${JSON.stringify(current)}

Question asked: ${question}

User's answer: ${answer}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
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
          },
        },
      });
      res.json(JSON.parse(response.text!));
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
      const nameSlug = String(resume?.name || "Resume").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]+/g, "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${nameSlug}_Resume_${companySlug}_${roleSlug}.docx"`);
      res.send(buffer);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/export/coverLetter.docx", async (req, res) => {
    try {
      const { coverLetter, companyName, roleTitle, candidateName, candidateContactInfo } = req.body;
      const buffer = await buildCoverLetterDocx(coverLetter, { name: candidateName, contactInfo: candidateContactInfo });
      const roleSlug = String(roleTitle || "Role").replace(/[^a-zA-Z0-9]+/g, "");
      const companySlug = String(companyName || "Company").replace(/[^a-zA-Z0-9]+/g, "");
      const nameSlug = String(candidateName || "CoverLetter").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]+/g, "");
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${nameSlug}_CoverLetter_${companySlug}_${roleSlug}.docx"`);
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
