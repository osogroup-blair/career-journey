# ATS Passing Tactics — Deep Reference

The SKILL.md has the short version of these tactics. Read this file when:
- The role is highly competitive (Director+ at well-known SaaS companies)
- The JD has heavy domain-specific jargon you're not sure how to handle
- The candidate asks "is this going to actually pass the ATS?"
- You're tempted to use a non-standard layout decision

## How modern ATS screening actually works

There are two distinct screens to pass:

**Screen 1 — Parser & keyword match.** The ATS extracts text from the resume and scores it against the JD. Failures here are mechanical: parser couldn't read the file, headers weren't recognized as headers, key terms from the JD didn't appear, role titles didn't map to expected seniority.

**Screen 2 — Recruiter scan.** A human spends 7–30 seconds. Failures here are about narrative clarity: can they tell what level you operate at, what you've shipped, and why you're a fit for *this* role within 10 seconds of looking at the top third of the page?

Both screens have to pass. Many resumes that look beautiful to humans fail Screen 1; many that pass Screen 1 look generic and fail Screen 2.

---

## The three-layer risk model (read this first)

Deep research into how the major platforms (Greenhouse, Workday, Oracle/Taleo, Lever, iCIMS, Indeed) actually behave produced a more accurate mental model than "beat the keyword filter." The single most important correction: **a low keyword score rarely auto-rejects on its own.** Greenhouse's matching is explicitly assistive AI that does *not* auto-advance or auto-reject; Oracle calls its job-fit rating subjective; Workday ranks by match percentage. What these systems mostly do with keyword match is **rank and route** — decide whether a human sees you early — not hard-reject. The things that *do* auto-reject are objective screener questions and parse failures.

So assess ATS risk in three layers, in this priority order:

**Layer 1 — Hard gates (the real auto-reject).** Employers can mark screener questions as *required*; applicants who don't meet them are moved to a Rejected list before any human or keyword scoring. Indeed documents this directly. The usual required screeners: work authorization, location, minimum experience, required license/cert, security clearance, shift availability, willingness to travel, relocation, language. **If the application will answer "No" to a required screener, no amount of resume optimization rescues it.** This is the only true override in the model — it caps estimated pass probability near zero regardless of content. This is what Stage 4 of the pipeline audits.

**Layer 2 — Parseability (caps the score if the parser chokes).** If the document is image-based, scanned, unsupported, or likely to fail parsing, pass probability is capped low even with great content. If it's readable but risky (tables, columns, text boxes, header/footer contact info, acronym-only titles, unclear sections), apply a large penalty. Greenhouse names all of these as causes of partial or failed parsing. Concrete thresholds from the research:
- Greenhouse parse ceiling is **2.5 MB** (uploads are accepted up to 100 MB but may then fail/degrade in parsing). Lever's limit is 10 MB and it cannot parse image files at all. A clean text resume is tiny, so this is only a risk if images sneak in.
- **Image/scanned PDFs are the worst failure** — always export a text-layer PDF and verify it (`pdftotext file.pdf -` should return the resume text).
- **Contact info in headers/footers** can be read as document metadata, not body content. Keep it in the body, top-centered.
- **Incomplete titles/company names** ("Sr. Account Exec", initials-only orgs) parse worse than full standard forms.
- **Multilingual caveat** — some parsers (Oracle) may not fully process a resume written in a language different from the submission language. Treat language mismatch as a real risk for cross-border roles.

**Layer 3 — Weighted content/keyword match (ranking, mostly).** Once gates pass and the doc parses, the content score determines how well you rank. This is where keyword mirroring, the top 4–6 skills, title/function alignment, evidenced years, and metrics live. Important but *secondary* to the first two layers — a 95% keyword match behind a failed work-authorization screener still loses.

### Transparent scoring rubric (out of 100)

Use this to produce the ATS score in the structured-field audit and to reason about the keyword gate. It mirrors how vendors describe their weighting (Oracle lets admins weight education/experience/skills; Greenhouse uses weighted calibration over ~4–6 key skills).

| Criterion | Weight |
|---|---:|
| Non-negotiable requirements coverage | 15 |
| Skills and tools match | 20 |
| Job title and function alignment | 10 |
| Experience years and relevance | 15 |
| Education and certifications | 10 |
| File type and parseability | 10 |
| Section headings and chronology | 10 |
| Acronyms and synonym handling | 5 |
| Metrics and evidence quality | 5 |

**Score bands (when no hard gate fails):** 85–100 → ~80–95% pass; 75–84 → ~65–79%; 65–74 → ~45–64%; 55–64 → ~25–44%; 40–54 → ~10–24%; below 40 → under 10%.

**Caps applied after the band (the override layer):**

| Condition | Cap on pass probability |
|---|---:|
| Required screener clearly failed | 0–5% |
| Required license / work authorization / clearance missing | 0–20% |
| Image/scanned/unsupported resume or likely parse failure | 0–15% |
| Major parse-risk layout issues (tables, columns, text boxes) | 0–55% |
| Missing dates across core work history | 0–60% |
| Missing most of the top required skills | 0–40% |

This is a transparent *estimate*, not a reverse-engineered copy of any vendor's private weights. Exact weights are configurable per employer, role, and stage, and human reviewers can override scores. Treat it as a disciplined way to reason about risk, and always note that the model is an approximation if the candidate asks for precision.

### What this means for tailoring priorities

1. **Clear the gates first.** A perfect resume for a role with a failing required screener is wasted effort. Audit hard gates (Stage 4) before building.
2. **Never let parseability sink good content.** The build is already single-column, no-tables, text-layer — keep it that way; the score caps for parse failure are brutal.
3. **Then optimize keyword/content rank.** The 85% keyword gate (Stage 6) lives here. It improves *ranking*, which is the right goal for this layer.

---



## Screen 1 — Parser & keyword tactics

### Layout rules (parser-safe)

- **Single column only.** Two-column resumes parse erratically; the right column often gets concatenated to wrong sections.
- **No tables.** Even when used decoratively (e.g. for date alignment), tables can split bullets, lose ordering, or wipe content depending on the parser. Use tab stops instead.
- **No text boxes, no shapes, no images.** Most parsers ignore them; some parsers fail when they encounter them.
- **No headers or footers** for content. They sometimes get parsed as document metadata, not body content. Contact info goes in the body, top-centered.
- **Standard fonts only.** Calibri, Arial, Helvetica, Times New Roman, Georgia. Display fonts get substituted unpredictably.
- **Font size 10–12pt for body, 14–18pt for headings.** Smaller fails accessibility scans on some platforms.
- **Bullets via list formatting, not unicode characters.** A "•" character at the start of a paragraph parses as part of the text. A real list-formatted bullet parses as a list item.
- **Full month-year dates on every role.** "January 2022 – March 2026", not "2022 – 2026". Parsers extract start/end dates as structured fields and compute tenure from them; missing or year-only dates across core work history can cap pass probability (see the caps table). Year-only is fine only for roles 10+ years old.
- **Spell out acronyms with the abbreviation at least once.** Match-on-either-form: include "Service-Oriented Architecture (SOA)" so the parser hits whichever variant the JD uses. After the first pairing, the short form alone is fine.
- **Full, recognizable company and school names** at least on first use. Greenhouse flags missing recognizable identifiers as a parse problem. Preserve the canonical employer descriptors for Oso Group ("Business Operating Systems & AI Transformation Consulting"), Nymbl ("Custom Enterprise Software & AI Services Platform Development"), and Gloo ("Faith-Based Technology & AI Platform") so recruiters and parsers can immediately contextualize lesser-known organizations.
- **Employer hyperlinks are additive, not substitutive.** When the Career Journey provides a canonical `resume_company_url`, hyperlink the visible employer name to it. Keep the full company name and descriptor visible in ordinary text because ATS parsers are designed to extract resume content; do not assume they or downstream hiring AI will browse external sites. Verify the hyperlink survives DOCX→PDF conversion, but score parseability and keyword coverage from the visible text alone.
- **Complete, standard job titles.** Parsers infer seniority from the title string — "Senior Solutions Architect", never "Sr. Sol. Arch."

### Section header rules

ATS systems look for specific header strings to segment the resume. Use these (or close variants):

- `Executive Summary` / `Professional Summary` / `Summary`
- `Professional Experience` / `Work Experience` / `Experience`
- `Education`
- `Skills` / `Core Skills` / `Technical Skills`
- `Certifications` (if applicable)

Do NOT use creative names. "My Journey", "Where I've Been", "Stuff I'm Good At" — these fail segmentation, which means everything underneath them gets misclassified.

### Keyword matching tactics

The keyword match is not a search-and-replace exercise. ATS scoring models weight:

1. **Exact phrase matches** from the JD's must-have section
2. **Synonym matches** (somewhat — depends on the platform)
3. **Frequency** (a term mentioned 3 times scores higher than once, up to a saturation point)
4. **Position** (terms in the summary and most-recent role weight higher)

Tactics:

- **Mirror the JD's vocabulary exactly** in three places: summary opening, skills section, and most-recent role bullets. If the JD says "Customer Education", don't write "training programs" anywhere on the resume. Write "Customer Education".
- **Saturate the top third.** The summary plus the first 2–3 bullets of the most recent role should hit the JD's top 5 phrases at least once each.
- **Skills section as keyword vault.** This is where ATS-only terms live — terms the JD mentions that don't naturally fit into a narrative bullet. The skills section is also where you can include both the JD's term AND your team's term for the same thing without sounding redundant.
- **Don't keyword-stuff invisibly.** White text, microscopic font, hidden tables — these get caught and auto-reject on most modern platforms. Just write good bullets that happen to include the right terms.

### Role-identity balance — prevent the wrong candidate classification

Keyword coverage can be technically high while the extracted profile still tells the wrong story. This matters especially for candidates whose technical depth can cause a generic parser or recruiter scan to over-index on implementation languages and engineering tools even when the target is enterprise architecture, strategy, or executive advisory.

For each tailored resume, define the intended identity before writing:

- **Architecture / strategy targets:** Enterprise Architecture, Business Capability Mapping, Solution Architecture, Technology Roadmapping, Operating Model Design, Integration Architecture, ERP Modernization, Executive Advisory, Portfolio Governance, AI / Automation Strategy.
- **Solutions Engineering targets:** Solutions Engineering, Technical Presales, Discovery, POC / Demo Delivery, Solution Architecture, Executive Stakeholder Management, Sales Enablement, Integration / API Architecture.
- **Operations / Chief of Staff targets:** Strategic Planning, Operating Rhythm, Organizational Effectiveness, Cross-Functional Execution, Executive Decision Support, KPI / Portfolio Governance, AI-Enabled Operations.

Implementation technologies still belong when relevant, but they should support the identity rather than replace it. In the final text extraction, inspect the first 8–12 skills/phrases a recruiter would notice. If a senior architecture/strategy resume reads like a software-engineer profile, reorder and compress the technical inventory.

### Title reframing — an important tactic for candidates with broad scope

ATS systems do seniority and scope inference based on title strings. "Chief Strategy Officer" might not match a query for "VP Professional Services" even though the scope is comparable.

The fix: hybrid titles in the role header that include BOTH the real title AND a scope-accurate phrase using the JD's vocabulary. Format:

```
Real Title  |  Head of [JD's preferred phrase]
```

Examples:

- For a VP Customer Experience role: `Chief Strategy Officer  |  Head of Professional Services, Solutions & Customer Experience`
- For a VP Professional Services role: `Chief Strategy Officer  |  Head of Professional Services & Implementation`
- For a Director of Solutions Engineering role: `Chief Strategy Officer  |  Head of Solutions & Technical Presales`

This is honest because the scope is real. It's strategic because the ATS sees the JD's exact phrase in a senior role header.

The same tactic works for the Nymbl IT Manager and Solution Consultant sub-roles — consolidate them all under the CSO entry rather than listing separately, because separate entries make the executive scope look like a job-hopping pattern instead of a unified leadership role.

---

## Screen 2 — Human recruiter tactics

The human screen happens in the top third of page one. Optimize for that real estate.

### The "10-second test"

A senior recruiter, glancing at the top third, should be able to answer:

1. What's the candidate's level? (VP, Director, Founder, etc.)
2. What's their most recent / current scope?
3. What's the biggest, most relevant proof point?
4. Is there an obvious dealbreaker? (wrong industry, wrong location, wrong seniority)

If any of those four answers takes more than 2 seconds to find, the top third needs to be rewritten.

### Tactics

- **Tagline under the name** that uses the JD's role framing. This is one of the highest-leverage lines on the resume because it tells both the parser and the human what role family to use when interpreting the rest of the document.
- **Lead the summary with the most JD-aligned scope phrase.** Not "10+ years of experience" — that's filler. Start with the noun phrase that *is* the role, then show executive/C-suite scope and one or two signature outcomes.
- **Use quantified proof early when it is real.** A strong scale/growth story from the candidate's own Career Journey does heavy lifting for roles where scale, GTM, professional services, or operating transformation matter. Do not force it into an unrelated role, and never invent a percentage for a role that lacks a metric.
- **Selected Outcomes are optional leverage, not a mandatory block.** Use 4–5 concise, JD-aligned outcomes before Experience when they improve the 10-second scan. Keep them short and distinct from the role bullets. If they create a fragmented page or repeat the same proof twice, cut or reduce the section.
- **Achievement density should be consistent across substantive roles.** Recent/high-value roles should not be a strong summary followed by thin task descriptions. Give each substantive role enough result evidence to show what changed because of the candidate's work. Observable impact is acceptable when a hard metric is unavailable.
- **Skills must reflect seniority.** For senior architecture/strategy roles, lead with enterprise architecture, operating model, roadmapping, integration/ERP, executive advisory, AI/automation architecture, and governance. Put languages/frameworks in a supporting technical row unless the job is explicitly hands-on.
- **Bold lead-labels on bullets** only when they improve scanning. Not all bullets — that defeats the purpose. The 3–5 bullets that demonstrate the JD's top signals can use bold leads; the rest should read naturally.
- **Date alignment matters.** Right-aligned dates via tab stops let the eye scan the role progression vertically. Don't bury dates inline.
- **Page continuity matters too.** Keep company/title lines with the content that follows, avoid splitting bullet paragraphs across pages, and keep section spacing consistent. A parseable resume can still look careless if headings orphan or spacing changes from section to section.

---

## Things to avoid

- **Photos / headshots.** US convention is no photo; some ATS systems flag photos as a parser anomaly.
- **"References available upon request."** Filler. Cut it.
- **Hobbies / interests section** unless directly relevant to the role.
- **Soft-skill paragraphs in the summary** ("Passionate, detail-oriented team player..."). Cut all of it.
- **Generic AI-polished resume labels** such as "seasoned leader," "results-driven executive," "pioneer," "proven track record," "dynamic," or "visionary" when a specific scope/result can make the point. Recruiter trust comes from concrete evidence, not polished adjectives.
- **Thesaurus verb swapping.** Repetition of "led" can make bullets blur together, but replacing it with inflated verbs is worse. Use the action that actually happened: designed, architected, established, scaled, mapped, evaluated, migrated, integrated, governed, advised, validated, etc., only when supported.
- **First-person pronouns.** Resumes use the implied first person: "Designed and operationalized..." not "I designed and operationalized..."
- **Inconsistent tense.** Past roles in past tense, current roles in present tense. Always.
- **Dates without months** for recent roles. Use "January 2022 – March 2026" not "2022 – 2026". For roles over 10 years old, year-only is fine.
- **GPA and education dates more than 15 years old.** Default to omitting them unless the application/JD explicitly requires dates. Keep the underlying dates in the Career Journey source of truth. This reduces unnecessary age signaling without changing any factual education claim.

---

## When to break the rules

- **For a creative or design role**, layout sophistication is itself a signal. Different tactics apply; this file's guidance is for senior operating / technical / strategy roles.
- **For a "stealth" application** (the candidate already knows the hiring manager, or it's coming through a warm intro), the ATS pass matters less and the human-narrative pass matters more. Tilt the resume toward narrative.
- **For a clear-stretch application** (the candidate is reaching above their current level), don't try to disguise the gap with title gymnastics — be honest about scope, lean hard on differentiators that aren't level-bound.


## AI-authenticity note

Do not optimize the resume around vendor claims that recruiters can reliably detect AI-written resumes or around unsourced percentages about AI disqualification. Those claims are not needed for the strategy. The useful principle is simpler: a senior resume should sound specific enough that every important sentence can be traced to a real role, decision, artifact, metric, client context, or operating mechanism. Generic polish is a recruiter problem even when no AI tool was involved.
