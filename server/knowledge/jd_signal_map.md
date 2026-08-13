# JD Signal Map

Quick reference for connecting JD signals to the candidate's own Career Journey. Use this to make sure the resume connects every major JD signal to a specific, evidenced story rather than generic claims.

## How to use this file

When Stage 1 parsing identifies a JD signal, look for a specific, dated, quantified, or named-project item in the candidate's own Career Journey (a deliverable, achievement, or skill entry) that proves it. Every claim in the resume needs a real anchor in the Career Journey — generic competence statements don't pass either the ATS or the human screen. Stage 2's evidence-matching does this exhaustively against whatever the candidate's Career Journey actually contains.

---

## Canonical employer headings

Preserve each role's exact `resume_company_descriptor` value from the candidate's own Career Journey in resume employer headings — never invent or rewrite one. Do not rewrite a descriptor merely to mirror a target JD or improve keyword matching; tailor the role title, narrative, bullets, summary, and skills instead.

### Canonical employer links

When `resume_company_url` exists on a role in the candidate's Career Journey, hyperlink the visible employer name in the resume heading to that exact canonical URL while leaving the descriptor visible as plain text. Treat these links as reviewer convenience and optional machine-readable context, not as evidence the ATS/AI will crawl external pages. Resume claims and employer context must remain self-contained.

## Role-family positioning guardrail

Use the signal map not only to find evidence, but to control the **candidate identity** the finished resume communicates. A candidate's implementation depth may be real, but it should not become the dominant profile for a senior architecture, strategy, or operating role simply because technical tools are easy ATS keywords.

| Target role family | Signals that should dominate top third + first skills rows | Supporting signals that should usually come later |
|---|---|---|
| Enterprise Architecture / Strategy | Enterprise Architecture; Business Capability Mapping; Value-Stream Mapping; Target-State Architecture; Technology Roadmapping; Operating Model Design; Integration Architecture; ERP Modernization; Executive Advisory; Portfolio Governance | Node.js; TypeScript; React.js; Python; SQL; low-code tools |
| Solutions Engineering / Technical Presales | Solutions Engineering; Discovery; Technical Presales; POC / Demo Delivery; Solution Architecture; Executive Stakeholder Management; Sales Enablement; API / Integration Architecture; Acceptance Criteria | Programming languages; CMS tools; low-code implementation details unless the JD asks for them |
| Chief of Staff / Strategy & Operations | Strategic Planning; Operating Rhythm; Organizational Effectiveness; Executive Decision Support; Cross-Functional Execution; KPI / Portfolio Governance; Board / Investor Materials; AI-Enabled Operations | Deep engineering stack details unless they prove a specific operating mechanism |
| Delivery / Professional Services Leadership | Professional Services; Implementation; Client Advisory; Delivery Governance; Scoping & Estimation; Resource / Capacity Planning; Customer Expansion Roadmaps; Change Management | Individual coding frameworks unless the role is player-coach/hands-on |

**Skill-section rule:** for senior non-engineering targets, put implementation languages/frameworks in the final technical-foundation row. The first 8–12 extracted skills should describe the target role family, not the candidate's earliest or most tool-specific work.

## Hard gates / screener language — extract these in Stage 1, audit in Stage 4

These are the JD phrases that usually become *required screener questions* — the layer that auto-rejects before keyword scoring. When you see this language, capture it as a hard gate and verdict it CLEAR / FAIL / UNCERTAIN against the candidate's actual position, sourced from their Career Journey's `person` and `education` fields. If the Career Journey doesn't state a position on a gate, verdict it UNCERTAIN rather than assuming an answer.

| JD language to watch for | Gate type | Where to find the candidate's position | Verdict guidance |
|---|---|---|---|
| "must be authorized to work in the US", "no sponsorship", "US citizens only" | Work authorization | `person.work_preference` / Career Journey notes | CLEAR if the Career Journey confirms authorization for the JD's country. "US citizens only" / clearance-tied → verify. |
| "onsite", "hybrid", "X days in office", "must be located in [metro]", "[City]-based" | Location / time zone | `person.location`, `person.work_preference` | FAIL if hard onsite/hybrid conflicts with the candidate's stated preference. UNCERTAIN if unclear. |
| "Bachelor's degree required", "degree in [field] required", "will verify education" | Degree | `education[]` entries (`completion_status`) | UNCERTAIN/soft for senior roles unless the Career Journey shows an incomplete/mismatched degree and the JD is emphatic; FAIL only then. Look for "or equivalent experience" escape hatch. |
| "PMP", "active security clearance", "[vendor] certification required", "licensed [X]" | License / cert / clearance | `education[]` / certifications entries | FAIL if hard-required and nothing in the Career Journey shows it held. Clearance can't be acquired quickly — treat as a real gate. |
| "minimum N years of [specific function]" | Minimum years | Role dates in the Career Journey | CLEAR if the candidate clearly evidences the years *in the function asked*, calculated from role dates. UNCERTAIN if thin. |
| "willing to travel N%", "frequent travel", "relocation required" | Travel / relocation | `person.work_preference` | CLEAR when travel is within the candidate's stated tolerance and no relocation is required beyond what they've indicated. UNCERTAIN/FAIL otherwise — surface to the candidate. |
| Application or role in a non-English language | Language + parse risk | `person` fields / Career Journey notes | FAIL if the Career Journey gives no indication of that language; also a parser caveat for cross-border ATS. |

If a JD has an explicit "Requirements" list with hard verbs ("must", "required", "minimum"), assume those are the most likely required screeners and audit each one. Soft "nice to have" / "preferred" items are *not* hard gates — they belong in the keyword/content layer, not Stage 4.
