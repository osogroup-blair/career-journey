---
name: job-fit-resume-tailor
description: "Use this skill whenever the candidate shares a job description, job posting, role link, or 'About the job' text and wants any of: a fit analysis, a fit rating, a tailored resume, or an ATS-optimized resume. Trigger on phrases like 'analyze this job', 'tailor my resume', 'is this a good fit', 'rate this role', 'should I apply', 'help me apply to this', 'pass the ATS', or any message that includes a pasted JD or a link to one. Also trigger when the candidate pastes JD content even without an explicit ask — assume they want the full pipeline. The skill reads the candidate's Career Journey data, scores the role on multiple dimensions, gives a Pass/Borderline/Skip recommendation, surfaces missing or under-captured keyword experience, stages approved Career Journey updates, then produces a tailored .docx and .pdf resume engineered to pass automated ATS screening. Use this even when the candidate only asks for one piece (e.g. 'just rate it') — the skill has a step-by-step mode for partial requests."
---

# Job Fit Analysis & ATS-Optimized Resume Tailor

This skill is the candidate's pipeline for evaluating job opportunities and producing tailored, ATS-passing resumes against their Career Journey data.

## What this skill does

Given a job description, this skill runs a nine-stage pipeline:

1. **Parse the JD** — extract role, scope, must-haves, nice-to-haves, signals, **and structured-field / screener risks**
2. **Keyword breakdown & experience recognition** — show the candidate the JD keyword map, explain what each keyword could count as in real work, identify whether it is already evidenced in the Career Journey, and capture any real but missing experience for a staged Career Journey update
3. **Score the fit** — multi-dimensional analysis against the candidate's Career Journey, including any approved newly captured experience, ending in a Pass / Borderline / Skip recommendation
4. **ATS structured-field audit** — explicit go/no-go check on the non-keyword filters that auto-reject before a human ever reads the resume (work authorization, location, license, minimum years, clearance, shift)
5. **Pause for approval** — present the analysis + structured-field audit, wait for the candidate to say "go" before writing the resume
6. **Generate the tailored resume** — `.docx` + `.pdf`, engineered to pass keyword scoring AND avoid structured-field auto-rejection
7. **Keyword scoring gate** — score the finished resume against the JD keyword list; must hit 85%+ before files are delivered, with a gap report and automatic rebuild on any fail
8. **Deliver** — present the resume files and summarize the tailoring choices
9. **Offer and run the cover-letter workflow** — after resume delivery, ask the candidate whether the application needs a cover letter; if yes, invoke `cover_letter_skill.md` for strategy, evidence selection, structure, and quality control, then apply `voice_skill.md` for the candidate's voice and anti-AI editing

Default mode is full-pipeline with two controlled approval points: one optional approval loop for adding newly recognized experience to the Career Journey after Stage 2, and one required approval gate before resume generation between Stages 4 and 6. If the candidate asks for only one piece ("just rate it", "just tailor the resume, I already know it's a fit"), skip the unrequested stages, but still show the keyword breakdown when evaluating a JD because it is part of recognizing hidden experience and improving the Career Journey over time.

### Why the structure changed (the ATS reality)

Deep research into how real ATS platforms (Greenhouse, Workday, Oracle/Taleo, Lever, iCIMS, Indeed) actually behave produced one core insight that reshaped this pipeline: **the highest auto-rejection risk comes from hard disqualifiers and parse failures, not from a low keyword score.** A resume with great content still gets screened out if the application answers "No" to a required screener (work authorization, location, license, minimum years), or if the parser can't extract dates, titles, and sections. Keyword match mostly affects *ranking and routing* — whether a human sees you early — not a hard reject. So the pipeline now treats ATS risk in three layers, in priority order: **hard gates → parseability → weighted content/keyword match.** See `references/ats_tactics.md` for the full model.

## Inputs

**Career Journey data** — the candidate's Career Journey as stored in their account is the factual source of truth for their career. If none is found, ask the candidate to complete their Career Journey before proceeding.

**Job description** — pasted text, attached document, or a link. If only a link is provided and the page is accessible, fetch it; otherwise ask for the pasted text.


## Default conversation start & application naming

The candidate may start a new job-applications conversation by pasting only the job description or job posting. Treat that as an explicit request to run the full pipeline. Do not ask what they want done when the pasted content is clearly a job description.

Immediately extract the **company** and **exact job title** from the posting and establish the canonical application name as:

`[Company] — [Exact Job Title]`

Use that canonical name consistently in analysis headings, application references, resume filenames, cover-letter references, and other generated artifacts.

When the product environment provides a supported way to set or influence the conversation title, use `[Company] — [Exact Job Title]` as the requested title. If the environment does not provide a conversation-renaming capability, do not claim the UI title was changed; still use the canonical application name everywhere the workflow controls.

## Stage 1 — Parse the JD

Extract and capture these elements from the JD. Do this internally; don't dump the full parse to the user unless they ask. Use the parse to drive Stage 2 and all downstream stages.

- **Company & role title** (exact title — immediately establish the canonical application name as `[Company] — [Exact Job Title]`; use it later for analysis, artifacts, resume filename, and cover-letter references)
- **Reporting line & team scope** (e.g. "reports to SVP CX, owns PS + Support + Education")
- **Stated must-haves** (the "Requirements" / "What you'll do" list)
- **Nice-to-haves** (preferred / bonus qualifications)
- **Strategic signals** — the language the company uses to describe its priorities (e.g. "AI-powered self-service", "transformational change", "voice of customer")
- **Industry / domain** (vertical SaaS, fintech, healthcare, etc.)
- **Stage signals** (Series A vs late-stage, named investors, named customers — these matter for fit)
- **Top 4–6 critical skills** — the highest-signal skills/tools/methods the JD centers on. Greenhouse calibration guidance says matching focuses on roughly 4–6 key skills, so identify which ones carry the most weight. These drive the Stage 2 keyword breakdown, the Stage 7 keyword scoring gate, and what the resume must lead with.
- **Hard gates / structured-field requirements** — the objective, binary criteria most likely to be wired into a *required screener question* that auto-rejects. Capture each one explicitly and whether the candidate clears it, sourced from their Career Journey's `person` and `education` fields — if the Career Journey is silent on a gate, mark it UNCERTAIN rather than assuming an answer:
  - **Work authorization** (e.g. "must be authorized to work in the US")
  - **Location / time zone** (derive the candidate's remote/onsite preference and location from `person.location` / `person.work_preference` — flag any on-site, hybrid, or specific-metro requirement that conflicts with it as a potential hard fail)
  - **Required license / certification / clearance** (e.g. PMP, security clearance, specific vendor certs — flag any the candidate's Career Journey doesn't show)
  - **Minimum years of experience** (note the threshold and whether the candidate's evidenced years clearly meet it)
  - **Required degree** (flag any role that hard-requires a completed bachelor's/master's if the candidate's `education` entries show an incomplete or different degree)
  - **Shift / travel / relocation** requirements
  - **Language** requirements (and whether the application is in a non-English language, which is its own parse risk)

Each hard gate gets a clear PASS / FAIL / UNCERTAIN flag. These feed Stage 4, where a single hard FAIL caps the whole opportunity regardless of how good the content match is.

## Stage 2 — Keyword breakdown & experience recognition

This is the discovery layer that helps the candidate recognize experience that may not yet be captured in their Career Journey. Do this immediately after parsing the JD and before scoring the fit, because newly recognized experience can change the fit analysis, keyword strategy, and resume evidence base.

### Purpose

For every meaningful JD keyword, skill, tool, method, responsibility, or domain signal, explain what real-world experience could count as evidence for that term. The goal is not to force a keyword into the resume. The goal is to help the candidate recognize, "I did something like that," so it can be added to the Career Journey honestly and used in future applications.

Use three sources for the breakdown:

1. **The JD parse from Stage 1** — especially the top 4–6 critical skills, named tools, role-title language, and repeated phrases.
2. **`references/jd_signal_map.md`** — use its role-family positioning guardrail and hard-gate table where they apply.
3. **The Career Journey data** — check whether each keyword is already evidenced by a role, initiative, deliverable, achievement, skill, or capability.

### Keyword categories

Classify each item into one of these categories:

- **Critical skill** — one of the top 4–6 signals the role is likely calibrated around.
- **Required keyword** — required or strongly repeated JD language that should appear in the resume if truthful.
- **Secondary keyword** — useful ATS/recruiter language, but not central enough to drive the resume.
- **Hard gate** — a structured-field or screener requirement, not a resume keyword.
- **Domain signal** — industry, customer type, workflow type, or business context that shapes fit.
- **Tool / platform** — named technology, framework, system, or software.

### Evidence status

For each keyword, assign one status:

- **EVIDENCED** — clearly supported by the current Career Journey. Name the role, initiative, deliverable, skill, or achievement that proves it.
- **PARTIAL** — related experience exists, but the current Career Journey wording does not fully support the JD's phrase.
- **MISSING / POSSIBLE** — not currently captured, but the keyword is broad enough that the candidate may have real experience if prompted.
- **NOT SUPPORTED** — no honest evidence found and no obvious prompt is likely to uncover it.
- **HARD GATE** — belongs in Stage 4, not in resume keyword stuffing.

### What counts as experience

For each keyword that is PARTIAL, MISSING / POSSIBLE, or high-value EVIDENCED, give the candidate concrete examples of what could count as experience. Make the examples practical and recognizable.

Examples of the pattern:

- **Customer Education** could include onboarding guides, enablement sessions, migration training, internal/external documentation, workshops, office-hours support, implementation playbooks, or reusable customer-facing learning assets.
- **Technical Support** could include answering staff or customer support questions, triaging issues, documenting fixes, reducing repeated questions with self-service resources, handling SaaS-tool onboarding, or building diagnostic workflows.
- **Change Management** could include migration planning, stakeholder communications, training, rollout sequencing, adoption support, cutover planning, or resistance/risk management during a platform transition.
- **Voice of Customer** could include turning discovery calls, implementation pain points, support issues, or customer objections into roadmap feedback, product gaps, demo changes, or delivery improvements.
- **Revenue Operations** could include pipeline visibility, proposal workflow design, scoping discipline, forecasting inputs, CRM hygiene, handoff workflows, or operating dashboards.

Be specific to the candidate's own background whenever possible — ground each prompt in a project, team, or deliverable already present in their Career Journey. For example, if the JD asks for "change management," prompt them with any migration, rollout, or transition project already in their Career Journey. If the JD asks for "customer education," ask whether any communications, onboarding, advisory, or implementation work included training or enablement assets that are not yet captured.

### Format the keyword breakdown

Show this section to the candidate during JD evaluation. Keep it compact but useful.

```
## Keyword Breakdown & Experience Recognition — [Company] — [Role Title]

| Keyword / phrase | Category | JD importance | Current evidence status | Current Career Journey anchor | What could count as experience | Recognition prompt for the candidate |
|---|---|---:|---|---|---|---|
| [Exact JD phrase] | [Critical skill / Required keyword / etc.] | [High / Medium / Low] | [EVIDENCED / PARTIAL / MISSING / NOT SUPPORTED / HARD GATE] | [Role / initiative / deliverable / skill / achievement, or "None found"] | [Concrete examples of work that would count] | [A direct question that helps the candidate recognize whether they have this experience] |
```

After the table, add:

```
**Potential Career Journey additions to confirm:**
- [Keyword] — [why it may be under-captured] — [what the candidate should confirm]
- [Keyword] — [why it may be under-captured] — [what the candidate should confirm]

Reply with any keyword where you recognize real experience that is not captured yet. Include what you did, where/when it happened, and any measurable outcome. I will stage the exact Career Journey update for approval before saving it.
```

If the candidate asked for only a fit rating, still include this breakdown because it affects whether the role is truly a fit. If the candidate asked to generate a resume immediately and the breakdown reveals likely missing experience, surface the missing-experience prompts before building unless they explicitly say to proceed without updating the Career Journey.

### Career Journey capture rules

When the candidate confirms that a PARTIAL or MISSING / POSSIBLE keyword reflects real experience, do not immediately rewrite the resume and do not silently mutate the Career Journey. Stage the update first.

For each confirmed experience, decide the smallest truthful Career Journey change needed:

- **Update an existing deliverable** when the experience is part of an existing initiative but the wording is incomplete.
- **Add a new deliverable** when the experience is a distinct output within an existing role/initiative.
- **Add a new achievement** when the experience creates a reusable proof point for future resumes.
- **Add a new skill** when the keyword is likely to recur across JDs and should be discoverable in `skills_index`.
- **Add a new capability/function** only when the experience represents a durable domain not covered by the current capability model.
- **Update links** so new achievements, deliverables, skills, and functions remain traceable.

Use existing ID patterns and increment deterministically:

- `SK-###` for skills
- `CAP-###` for capabilities
- `FUNC-###` for functions
- `INIT-###` for initiatives
- `DEL-###` for deliverables
- `ACH-###` for achievements

Never reuse an ID. Never invent an employer, client, metric, title, certification, degree, tool, or claim that the candidate did not confirm.

### Staged update approval format

Before saving an updated Career Journey, show the exact proposed changes in a concise patch-style format:

```
## Proposed Career Journey Update — [next version]

**Reason for update:** [JD/company/role and the keyword gap being captured]

**New or updated skills:**
- [SK-###] [name] — [category] — [proficiency] — [why this is supported]

**New or updated deliverables:**
- [ROLE-###] / [INIT-###] / [DEL-###] — [exact description] — [impact] — [capability_alignment] — [skill_ids]

**New or updated achievements:**
- [ACH-###] [title] — [description] — [category]

**Meta update:**
- version: [old] → [new]
- last_updated: [today]
- version_[new]_changes: [one-line change summary]

Approve this Career Journey update? (yes / no / change something first)
```

Only after the candidate approves, save the updated Career Journey. Never overwrite canonical data or add unconfirmed experience. Never leave a literal placeholder key such as `version_X_Y_changes` in the saved data.

## Stage 3 — Score the fit

Score the role on **four dimensions**, then give one overall recommendation.

### Dimensions

For each, give a one-line verdict plus a Strong / Moderate / Weak rating:

1. **Role scope fit** — does the JD's actual scope match the scope the candidate has demonstrably held per their Career Journey (level of ownership, team/org size, functions led)?
2. **Industry & domain fit** — is the vertical one the candidate has shipped in per their Career Journey, or adjacent enough to credibly transfer?
3. **Seniority & stage fit** — is the level (IC / Manager / Director / VP / C-suite, etc.) appropriate given the candidate's actual title and scope history, and is the company stage one where their strongest quantified outcome in the Career Journey is the kind of proof point they'd value?
4. **Technical & AI fit** — does the role lean on the specific technical depth, AI/tooling orchestration, or architecture-level thinking the candidate's Career Journey actually evidences? Roles that don't reward the candidate's actual differentiators are weaker fits even when the title looks right.

### Recommendation

End with one of three verdicts:

- **PASS** — strong alignment across most dimensions, clear path to a compelling resume, worth applying.
- **BORDERLINE** — real gaps exist but there's enough overlap that a sharp resume + cover letter could break through. Name the specific gaps and how the resume should compensate.
- **SKIP** — fundamental mismatch (wrong level, wrong domain, wrong work model). Say so plainly with the reason. Don't generate a resume for SKIP roles unless the candidate explicitly overrides.

### Format the output like this

```
## Fit Analysis — [Company] — [Role Title]

**Overall: PASS / BORDERLINE / SKIP**
[One-paragraph rationale]

**Role scope fit:** [Strong/Moderate/Weak] — [one line]
**Industry & domain fit:** [Strong/Moderate/Weak] — [one line]
**Seniority & stage fit:** [Strong/Moderate/Weak] — [one line]
**Technical & AI fit:** [Strong/Moderate/Weak] — [one line]

**What to lead with in the resume:**
- [3–5 specific angles from the candidate's Career Journey that map directly to the JD's top signals]

**Gaps to address or downplay:**
- [Honest list of where the candidate is light or mismatched, and the framing move to handle each]
```

Then continue to **Stage 4** (the structured-field audit) before asking the resume approval question. Do not ask for resume approval yet — the structured-field audit may change the recommendation.

## Stage 4 — ATS structured-field audit

This is the layer that catches the auto-rejections a great resume can't fix. Real ATS platforms let employers mark certain screener questions as **required**, and applicants who don't meet them are moved straight to a Rejected list — before any human or keyword scoring. So before investing in a tailored resume, do an explicit go/no-go on the hard gates captured in Stage 1.

For each hard gate, give a one-line verdict: **CLEAR**, **FAIL**, or **UNCERTAIN (verify)**. Be honest — the point of this layer is to stop the candidate wasting effort on a role an automated screener will reject regardless of resume quality.

### The hard-gate checklist

| Gate | Where to find the candidate's position | Flag when |
|---|---|---|
| Work authorization | `person` fields / Career Journey notes | Role requires authorization the Career Journey doesn't confirm, or sponsorship the candidate can't provide |
| Location / time zone | `person.location`, `person.work_preference` | Role is on-site, hybrid, or requires a specific metro / time zone that conflicts with the candidate's stated preference |
| Required degree | `education[]` entries (`completion_status`) | JD says "Bachelor's degree required" with no "or equivalent experience" escape hatch, and the Career Journey shows an incomplete or different degree |
| Required license / cert / clearance | `education[]` / certifications entries | JD hard-requires a specific credential the Career Journey doesn't show |
| Minimum years experience | Role dates in the Career Journey | Threshold is set above the candidate's clearly-evidenced years for the specific function asked |
| Shift / travel / relocation | `person.work_preference` | JD requires materially more travel, relocation, or recurring onsite presence than the candidate's stated tolerance |
| Language | `person` fields / Career Journey notes | Application or role requires another language the Career Journey gives no indication of (also a parse-risk factor) |

Anything the Career Journey doesn't address should be marked UNCERTAIN rather than assumed either way.

### How a hard gate changes the recommendation

- **Any clear FAIL on a likely-required screener** (especially work authorization, location, license, clearance) → the opportunity is effectively a **SKIP** even if Stage 3 said PASS, because the application will likely auto-reject before the resume is scored. Say this plainly. Offer to proceed anyway only if the candidate thinks the screener is soft or they have a workaround (e.g. willing to relocate, the "remote" is negotiable).
- **UNCERTAIN on a hard gate** → tell the candidate exactly what to verify before applying (e.g. "JD says hybrid — confirm whether fully remote is on the table before we invest in this"). Don't silently assume it's fine.
- **Degree requirement with no "or equivalent" language** → flag it, but note this is usually a soft gate for senior roles; recommend proceeding while being honest in the Education section. Only treat as a hard FAIL if the JD is emphatic ("degree is mandatory / will be verified").

### Format the structured-field audit like this

```
## ATS Structured-Field Audit — [Company] — [Role Title]

**Hard-gate verdict: CLEAR TO APPLY / VERIFY FIRST / LIKELY AUTO-REJECT**

- Work authorization: [CLEAR / FAIL / UNCERTAIN] — [one line]
- Location / remote: [CLEAR / FAIL / UNCERTAIN] — [one line]
- Degree: [CLEAR / FAIL / UNCERTAIN] — [one line]
- License / cert / clearance: [CLEAR / FAIL / UNCERTAIN] — [one line]
- Minimum years: [CLEAR / FAIL / UNCERTAIN] — [one line]
- Shift / travel / relocation: [CLEAR / FAIL / UNCERTAIN] — [one line]
- [Any other JD-specific screener]: [verdict] — [one line]

**Estimated ATS pass posture:** [one or two sentences. If all gates clear, note that the main risk reverts to keyword ranking, which the resume will handle. If a gate fails or is uncertain, state the cap on pass probability and what it means.]
```

If the hard-gate verdict is **CLEAR TO APPLY**, ask the approval question and proceed to Stage 5 on the candidate's go:

```
**Want me to generate the tailored resume?** (yes / no / change something first)
```

If the verdict is **VERIFY FIRST** or **LIKELY AUTO-REJECT**, surface that prominently, tell the candidate what to confirm or why it's a skip, and ask whether they want to proceed anyway before generating anything.

Then **stop**. Wait for the candidate's response.

## Stage 5 — Approval gate

If the candidate says yes, go, do it, sounds good, etc., proceed to Stage 6. If they want changes ("emphasize X more", "deprioritize the IT manager stuff"), incorporate the feedback and regenerate the analysis or jump straight into the resume with the adjustment baked in. If they say skip / not now, end cleanly.

## Stage 6 — Generate the tailored resume

The resume must be engineered to pass ATS first-pass screening AND read well to a human recruiter on the second pass. Both matter — many resumes optimize for one and fail the other.

### Resume positioning integrity gate

Before writing bullets, define the **candidate identity the top third must communicate**. The JD determines this identity. Do not let the candidate's implementation depth accidentally become their primary classification when the role is hiring for architecture, strategy, operating leadership, or executive advisory.

For senior enterprise architecture / strategy targets, a recruiter or ATS extraction should encounter senior signals before programming languages: **Enterprise Architecture, Business Architecture / Capability Mapping, Solution Architecture, Technology Roadmapping, Operating Model Design, Integration Architecture, Executive Advisory, AI / Automation Strategy, Portfolio Governance, and Presales / Professional Services architecture** where the JD supports them and the candidate's Career Journey evidences them. Programming languages/frameworks remain valuable proof of technical credibility but should normally appear later in the skills block or in evidence bullets rather than defining the headline identity when the JD targets a senior non-engineering role.

Run these checks before document assembly:

- **Target-role identity:** tagline + summary opening + first 2–3 outcome/experience bullets unmistakably describe the role family being targeted.
- **Summary depth:** 3–4 tightly written sentences should establish target scope, appropriate seniority context, one or two signature outcomes, and the mechanism that differentiates the candidate. Do not pad with soft skills.
- **Achievement distribution:** every substantive recent role should contain outcome evidence, not just a role summary. Use metrics when the Career Journey supports them; otherwise name an observable change, decision, scale, artifact, or business consequence. Never invent a percentage to make a bullet look measurable.
- **Skills seniority balance:** prioritize 8–12 high-value, role-aligned hard capabilities. Group implementation languages/tools into a supporting technical row unless the JD is explicitly hands-on.
- **Human specificity:** avoid generic executive/resume labels such as “seasoned,” “pioneer,” “results-driven,” “proven track record,” “dynamic leader,” or “strategic visionary.” The sentence should show the scope or result instead of naming an adjective.
- **Verb accuracy over thesaurus variety:** repeated “led,” “focused on,” and “supported” can flatten the document, but do not replace them with inflated synonyms. Prefer the verb that names the actual mechanism: architected, designed, built, established, scaled, reduced, mapped, evaluated, migrated, integrated, governed, advised, translated, or validated when those are factually supported.

### ATS-passing tactics — apply all of these

**Standing resume contact rule:** the resume header must use the candidate's own contact details from their Career Journey `person` object — a website as the final contact item when one exists. Do not include LinkedIn in the resume header unless the candidate explicitly requests it for a specific application.

**Canonical company descriptor rule:** Preserve each role's exact `resume_company_descriptor` value from the candidate's own Career Journey in every tailored resume — these are factual company context, not JD-specific positioning. Do not rewrite, remove, or replace a descriptor merely to improve ATS keyword matching or mirror a target JD. Tailor the role title, narrative, bullets, summary, outcomes, and skills instead.

**Canonical employer link rule:** When a role in the candidate's Career Journey contains `resume_company_url`, render the **visible company name** in the employer heading as an external hyperlink to that exact URL. Keep `resume_company_descriptor` immediately after the company name as normal visible text. Do not display raw company URLs in the resume body unless the candidate asks. Links are additive context for reviewers and link-aware systems; never assume an ATS or hiring AI will crawl them, so all required company context must remain in visible resume text.

1. **Keyword mirroring** — use the JD's actual vocabulary in the summary, skills section, and bullets. If the JD says "Customer Education", use "Customer Education" (not "training programs"). If it says "Professional Services", use that exact phrase. Don't be clever with synonyms.
2. **Standard section headers** — use plain headers ATS parsers recognize: "Executive Summary", "Professional Experience", "Core Skills", "Education". Avoid creative names like "Where I've Been" or "What I'm Good At".
3. **Front-load outcome evidence** — put the most relevant quantified result in the top third when the Career Journey supports it. Quantification is preferred, not mandatory. When no honest metric exists, use observable scope and consequence instead of fabricating a percentage.
4. **Title reframing** — a candidate's real titles often hide broader scope than the title alone suggests. Combine related roles into a single entry with a hybrid title that reflects the actual scope AND uses the JD's language when truthful. Example pattern: `[Real Title] | Head of [JD's term, e.g. "Professional Services & Customer Experience"]`. This is honest because the scope is real; it's strategic because it makes the ATS match the JD literally.
5. **Skills block with seniority control** — mirror the JD's important categories, but do not simply dump every technology mentioned in the candidate's history. For executive/architecture/strategy roles, senior architecture and operating capabilities come first; implementation languages and frameworks belong in a final technical-foundation row unless the JD explicitly centers hands-on engineering. Aim for 8–12 high-value capability phrases plus only the supporting technologies that materially improve the match.
6. **Achievement density by role** — recent substantive roles should normally have at least 2–4 outcome-oriented bullets, with the most recent/senior role carrying more when needed. A one- or two-sentence role narrative may explain scope, but bullets should demonstrate what the candidate built, changed, scaled, reduced, enabled, decided, or governed. Thin early roles can stay concise.
7. **Selected outcomes are a tool, not a mandatory duplicate section** — use 4–5 concise, JD-aligned proof points before Experience when they materially improve the 10-second scan. Keep each to roughly 1–2 rendered lines where practical and do not repeat role bullets word-for-word. If the section creates awkward page density or makes the document feel fragmented, reduce it or fold the proof into the summary and first role rather than preserving the section mechanically.
8. **No tables, no columns, no text boxes, no images, no headers/footers** — many ATS parsers mangle these. Single-column layout, plain paragraphs, plain bullets. Tab stops for right-aligned dates are fine because docx renders them as inline text.
9. **Standard fonts** — Calibri or Arial. No display fonts.
10. **File naming** — `[Candidate_Name]_Resume_[Company]_[RoleSlug].docx`. ATS systems often log the filename; making the role explicit is a small signal.
11. **Full month-year dates on every professional role** — write "January 2022 – March 2026", never "2022 – 2026" for recent work. Parsers extract start/end dates as structured fields and compute tenure from them. For education more than 15 years old, default to omitting the attendance/graduation years unless the application or JD explicitly requires them; keep the full dates in the Career Journey source of truth.
12. **Spell out acronyms with the abbreviation at least once** — if the JD uses an acronym, include both the long form and the short form somewhere on the resume (e.g. "Service-Oriented Architecture (SOA)", "Annual Recurring Revenue (ARR)"). Parsers and recruiters may match on either form; covering both maximizes the match. After the first long-form+abbreviation pairing, the short form alone is fine.
13. **Full, recognizable company and school names** — write the complete organization name, not an abbreviation, at least on first use (e.g. spell out a school's full name in the education header rather than an acronym). Greenhouse flags missing recognizable identifiers as a parse problem. Preserve each canonical one-line employer descriptor from the Career Journey exactly as defined so each organization is immediately contextualized.
14. **Standard, complete job titles** — parsers infer seniority from title strings, so use full industry-standard titles ("Senior Solutions Architect", not "Sr. Sol. Arch."). This is also why the hybrid title reframe in tactic 4 matters: it puts the JD's standard title language into a role header the parser will read for seniority.
15. **Keep the file small and text-based** — the finished `.docx`/`.pdf` should be well under 2.5 MB (Greenhouse's parse ceiling; the real file will be tiny since there are no images). The PDF must have a real text layer, never an image/scanned export. Stage 7 verifies this.
16. **Preserve employer hyperlinks without depending on them** — company names with canonical `resume_company_url` values must be clickable in the DOCX and PDF. Verify the links survived conversion. The visible employer name + descriptor must still parse as ordinary text; never move factual employer context behind the link.
17. **Resume language must sound sourced, not generated** — apply the Default Voice lightly. Use concrete nouns, real mechanisms, exact metrics, named systems/methods, and specific scope. Remove polished filler or claims that could describe any candidate. Do not optimize around speculative “AI detector” scores; optimize for truthful specificity that survives recruiter scrutiny.

### Resume structure — use this template

```
[CANDIDATE NAME]
[Tagline mirroring the JD's framing of the role | secondary positioning hook]
[Location]  •  [Phone]  •  [Email]  •  [Website]

EXECUTIVE SUMMARY
[3–4 sentences. Opening sentence establishes the target role identity and most relevant scope using the JD's language.
Second sentence gives one or two signature outcomes drawn from the candidate's strongest quantified results.
Third sentence explains the candidate's differentiating mechanism. Final sentence uses technical depth as supporting
credibility rather than the headline unless the target is explicitly hands-on.]

SELECTED EXECUTIVE OUTCOMES
[Usually 4–5 concise proof points, each with a BOLD lead label followed by one sentence. Use only when this section
materially improves the 10-second scan. Pick outcomes that map directly to the JD's top signals; quantify when
supported; avoid duplicating role bullets word-for-word. Reduce or omit the section if it fragments the page.]

PROFESSIONAL EXPERIENCE

[Employer — hyperlinked to canonical resume_company_url] — [resume_company_descriptor]                  [Start] – [End]
[Title, reframed with JD vocabulary where truthful]                            [Location]
[2-sentence narrative connecting the role to the target role.]
• [3–8 bullets with bold lead labels, ordered by alignment to JD priorities, not chronologically.
   Include at least one bullet per major JD signal, using the candidate's strongest quantified outcome first where relevant.]

[Repeat per role, most recent first. Earlier/less relevant roles get a shorter 2-sentence narrative and 0–2 bullets.]

CORE SKILLS & DOMAINS
[5–7 rows, label : content. Mirror the JD where useful, but control seniority: architecture/strategy/advisory
capabilities first, implementation languages/tools last unless the role is explicitly hands-on. Prioritize roughly
8–12 high-value capability phrases over a broad technology inventory.]

EDUCATION
[Institution]
[Degree / program]                                  [Location]
[One-line description. Default to omitting education dates when the attendance period is more than 15 years old;
include them only when the application/JD requires dates. Never imply degree completion that didn't happen.]
```

### Build the document

Read the current DOCX skill exposed by the runtime before writing any code. Do not hard-code a stale environment path; use the skill path provided by the active runtime. Follow its render-and-verify workflow, including visual inspection of every rendered page before delivery.

Then use the reference build script at `references/build_resume.js` as the starting template. It already has:
- US Letter page size
- Calibri font + navy accent color
- Section headers with bottom border
- Two-column role headers (left-aligned title + right-aligned dates via tab stop)
- Bold-lead bullets via the numbering config (not unicode bullets)
- Skill rows with tab-aligned labels

Copy the template into a writable working directory, fill in the JD-tailored content, and set `OUT_DIR` explicitly when practical. Generate the `.docx`, then use the active runtime's DOCX workflow to render it to page images, inspect every page visually, and produce the PDF from the validated document.

Before delivering, run the parseability self-check: confirm both files are under 2.5 MB, confirm the PDF has an extractable text layer (e.g. `pdftotext output.pdf - | head` returns the resume text, not empty), confirm dates are full month-year, and verify canonical employer hyperlinks are clickable in both DOCX and PDF. Then proceed to the Stage 7 keyword gate. **Do not present the files until Stage 7 passes.**

## Stage 7 — Keyword scoring gate

The resume is not delivered until it's scored against the JD and clears the bar. This is the measure-then-remediate step the ATS research calls for: don't assume the tailoring worked, verify it.

### How to score

1. Build the keyword list from Stage 1 and Stage 2: the JD's **top 4–6 critical skills** plus the named tools, methods, and the exact role-title language. Weight the top 4–6 critical skills most heavily.
2. Extract the resume's plain text (from the validated docx or `pdftotext` on the PDF) so you're scoring exactly what a parser would read, not the rendered layout.
3. For each keyword, check whether it appears in the resume text — counting exact matches and the long-form/short-form acronym pairs from tactic 10. Note *where* it appears (summary and most-recent role weight higher).
4. Compute coverage: **(matched critical-skill keywords + matched secondary keywords, weighted) ÷ total, as a percentage.**

### The gate

- **85%+ coverage of the JD keyword set, with every one of the top 4–6 critical skills present** → pass. Present the files (Stage 8 below).
- **Below 85%, or any top-critical skill missing** → do not deliver yet. Produce a short gap report listing each missing keyword and where it should go (summary, a specific role bullet, or the Core Skills vault). Then **rebuild automatically** wherever the keyword can be added truthfully — most gaps are terms that belong in the Core Skills section or are honest rephrasings of existing bullets. Re-score. Repeat until the gate passes or until the only remaining gaps are keywords the candidate genuinely can't claim (in which case, surface those to the candidate rather than fabricating them).

Never close a gap by inventing experience the candidate doesn't have. A keyword that can't be supported truthfully stays missing, and that gap is reported honestly — it's better to under-match than to put a false claim in front of a recruiter who will probe it in an interview.

### Seniority / role-identity gate

After the keyword gate passes, inspect the extracted resume text as if it were an ATS-generated candidate profile. Ask: **what would the first 8–12 skills/phrases make a recruiter think this candidate is?** For a senior architecture/strategy application, the answer must not be “implementation engineer” simply because those technologies are easy to extract.

- The tagline, summary, first outcomes, hybrid title, and first skills rows must reinforce the target role family.
- For architecture/strategy roles, enterprise architecture, solution architecture, operating-model/strategy, roadmapping, integration/ERP, executive advisory, and AI/automation architecture should outweigh implementation languages in prominence and frequency where the candidate's Career Journey supports them.
- If engineering tools dominate the extracted identity despite a non-engineering target, rebuild the summary/skills ordering and remove low-value technical clutter.
- Do not delete a JD-critical technology merely to look senior; reposition it as supporting evidence.

### Visual coherence gate

During the rendered-page inspection, check more than clipping. Confirm consistent section spacing, consistent date/title alignment, no orphaned company/title lines at page bottoms, no split bullet paragraphs, and no long selected-outcome bullets that create a jagged or fragmented page. Rebuild spacing/content density when the document feels uneven even if it is technically parseable.

### Format the gate result like this (only show the candidate if there was a fail+rebuild, otherwise just note the score in the post-generation summary)

```
Keyword gate: [PASS at NN%] / [rebuilt from NN% → NN%]
Top critical skills: [all present] / [list any that couldn't be truthfully included]
Remaining honest gaps: [none] / [list]
```

## Stage 8 — Deliver

Save both files to a writable, user-accessible output directory supported by the active runtime and return them using the runtime's supported artifact/file-link mechanism.

### Post-generation summary

After presenting the files, give the candidate a short note explaining the tailoring choices — what got reframed, what got cut, what got front-loaded, and why. This is the meta-commentary that lets them verify the strategic moves before they send it. Keep it tight, no more than 6–8 short paragraphs.


## Stage 9 — Cover Letter Offer & Handoff

After the tailored resume has passed validation, been delivered, and the post-generation summary is complete, always ask:

**Do you need a cover letter for this application?**

Do not create a cover letter automatically. Wait for the candidate to say yes, no, or give a modification.

If the candidate says yes, treat the following as the governing intent:

> I need a personalized cover letter in my own voice and not ai tells that convinces the hiring team that they want to interview and hear more about me from me

Before drafting, create an internal **Cover-letter opening hypothesis**: the most specific operating, product, technical, customer, commercial, or company-stage tension discovered during JD analysis that the candidate can credibly have a point of view about. This is an input to the Cover Letter Opening Thesis Gate, not finished prose.

If the JD/application materials do not provide a distinctive enough hypothesis to pass that gate, mark the handoff internally as `OPENING_RESEARCH_NEEDED` and perform targeted current company research before drafting rather than filling the gap with generic cover-letter language.

Then run the cover-letter workflow using the project skills in this order:

1. Use the candidate's Career Journey as the factual source of truth.
2. Reuse the exact company, exact role title, JD parse, top role signals, approved Career Journey additions, gaps, tailored-resume positioning, and the opening hypothesis already established for this application. Do not rerun Stages 1–8 just to write the cover letter.
3. Apply `cover_letter_skill.md` as the governing source for the Opening Thesis Gate, cover-letter strategy, company-specific point of view, evidence selection, structure, compression, research use, the Cover-letter Anti-Slop Hard Gate, and the 8.5+/10 quality gate.
4. Apply `voice_skill.md` in the **Default Voice** for sentence construction, natural rhythm, anti-AI editing, professional-writing-tell removal, the sentence-level anti-slop standard, and the AI-Suspicion Audit.
5. Deliver only after all four quality checks pass: Opening Quality **1.0/1.5 or higher**, **zero unresolved anti-slop flags sentence by sentence**, total cover-letter rubric **8.5/10 or higher**, and Voice AI-Suspicion Audit **2/10 or lower when reasonably achievable**.

Do not duplicate the resume in prose. The cover letter should create a reason to interview the candidate by showing that they understand the company's actual operating problem, have a useful point of view on it, and have enough specific evidence to make that point of view credible.

### Direct cover-letter requests

If the candidate asks for a cover letter, application letter, letter of interest, or an analysis/rewrite of an existing cover letter **without first completing the resume workflow**, still use `cover_letter_skill.md`.

- If the company, role, JD, and Career Journey evidence are already available in the conversation/project, use them directly. Do not force the full resume pipeline to restart.
- If the request is to analyze an existing cover letter, score it with the cover-letter rubric first and identify the highest-leverage improvements.
- If the candidate asks for a rewrite, use the supplied draft as input but rebuild the argument when necessary rather than preserving a weak structure.
- Run the Cover-letter Anti-Slop Hard Gate sentence by sentence before delivery. A polished paragraph, real metric, or strong overall rubric score does not excuse a slogan-like, unsupported, jargon-heavy, or unnecessary sentence.
- Build and test a cover-letter opening hypothesis before drafting. If the available application context cannot produce a distinctive opening that passes the Opening Thesis Gate, research the company rather than defaulting to category-level or conventional cover-letter language.
- If current company facts materially strengthen the argument, verify them with current sources before including them.
- If the candidate requests a formal `.docx` or PDF, preserve the resume's header/contact conventions, including the candidate's own clickable website URL if they have one.

## Edge cases

**The candidate asks directly for a cover letter or cover-letter critique** — use `cover_letter_skill.md` immediately with the current application context and Career Journey. Do not require a new fit analysis or resume build when the necessary job context already exists. Apply `voice_skill.md` after the cover-letter strategy is set.

**No Career Journey found** — ask the candidate to complete their Career Journey. Don't try to write a resume from scratch.

**JD is sparse or vague** — flag what's missing, do the best fit analysis possible from what's there, and ask the candidate if they have more context (recruiter notes, company research, founder interview). If the JD is too sparse to identify hard gates, say so — an unstated work-authorization or location requirement is a real risk you can't audit.

**A hard gate fails (Stage 4)** — say plainly that the application will likely auto-reject at the screener regardless of resume quality, and why. Don't generate a resume by default. Offer to proceed only if the candidate indicates the screener is soft or negotiable (e.g. "remote" is actually flexible, they'd relocate).

**The role is a SKIP (Stage 3 fit) or LIKELY AUTO-REJECT (Stage 4 gate)** — say so plainly with the reason. Offer to do the resume anyway if the candidate wants it for a reach application, but don't proceed by default.

**Keyword gate can't reach 85% truthfully (Stage 7)** — deliver the best honest version and tell the candidate exactly which keywords are missing and why they can't be claimed. Never fabricate experience to clear the gate.

**The candidate pastes a JD with no other instruction** — assume they want the full pipeline. Extract the company and exact job title immediately, establish `[Company] — [Exact Job Title]` as the canonical application name, run Stages 1–4, and stop at the required resume approval gate. Do not ask what they want done when the pasted content is clearly a job description.

**The candidate asks for only the rating** — run Stages 1 + 2 + 3 (fit analysis plus the structured-field audit, since the hard gates are part of an honest rating), then stop after presenting them. Don't ask the approval question.

**The candidate asks to "redo" or "try again"** — ask what to change before regenerating. Don't silently produce a different version.

**The candidate recognizes missing experience from the keyword breakdown** — pause the resume flow, stage the Career Journey update in the approval format from Stage 2, then save it only after approval. Resume generation should use the updated Career Journey if the experience is approved; otherwise proceed with the existing evidence base and treat the keyword as an honest gap.

## Companion skills

- `cover_letter_skill.md` — Governing strategy and quality-control skill for cover letters, application letters, letters of interest, and cover-letter critique/rewrite work. Use it at Stage 9 and for direct cover-letter requests.
- `voice_skill.md` — Governing candidate-voice and anti-AI style layer for cover letters, recruiter outreach, application answers, hiring-team messages, and other narrative communication.

## Reference files

- `references/build_resume.js` — Starting template for the docx generator. Copy this and modify the `children` array with JD-tailored content. Header now carries the parseability self-check and ATS content reminders (dates, acronyms, full names).
- `references/ats_tactics.md` — Deeper reference on how ATS systems actually screen. Read it for the **three-layer risk model** (hard gates → parseability → content), the **transparent 100-point scoring rubric and pass-probability caps**, the structured-field auto-reject behavior, and the parser-safe layout rules. Read this whenever doing the Stage 4 audit, the Stage 7 keyword gate, or when a role is unusual.
- `references/jd_signal_map.md` — Role-family positioning guardrail and the **hard-gate / screener-language table** used in Stage 1 extraction and the Stage 4 audit.
