# Tailored Resume Quality — Implementation Plan

Written 2026-10-07. Scope: the Job Tailoring Workflow's resume path (Rating → Tailored Application). The user's own complaints prompted it: tailored resumes fall short of ones they built elsewhere, and JD keywords aren't making it into the resume.

## Where the app is today (evidence)

Two test runs back this plan, and both can be reproduced with the eval script in Phase 0:

1. **Demo run**: a fictional Kestrel Pay "Senior PM, Platform" JD run against the demo Career Journey through the real prompts on the platform Oso models.
2. **Real comparison**: the Blitzy "Senior Solution Consultant" JD. It compares the app's resume (`Blair_Boylan_Resume_Blitzy_SeniorSolutionConsultant_CJ.pdf`), a ChatGPT-built resume for the same job, and the candidate's Career Journey v3.54.

| Measure (Blitzy JD) | App resume | ChatGPT resume |
|---|---|---|
| JD terms covered (38-term list) | **22** | **29** |
| JD terms the Career Journey supports but the resume misses | 12: demos, post-sale, adoption, expansion, customer feedback, roadmap, pipeline, software engineering, technical leadership, developer tooling, modernization, Microsoft | 5 |
| Word count (2-page target) | 549 | 1,044 |
| Nymbl entries | 3 separate entries with overlapping dates, each titled "… \| Head of Solution Consulting"; the CSO entry has 1 bullet | 1 combined employer entry, scope narrative, 8 bold-lead bullets |
| Strongest proof points used | "6x" only | $1.5M→$9.2M, ~$11M defense POC, tolling RFP, SC team 1→4, two weeks→three days |
| Dates / phone | `2026-03 - Present`, `6165401669` | `March 2026 - Present`, `616.540.1669` |
| Skills hygiene | "Commercial Momentum", "CTOs/CIOs/Engineers & Executives" listed as skills | JD-mirrored category labels with real skills |

Every one of those proof points exists in Career Journey v3.54. For example, "$11M" appears 8 times, "tolling" 11, "POC" 41 and "demo" 39. **The data was there; the pipeline didn't use it.**

### Root causes (verified in code)

| # | Cause | Where |
|---|---|---|
| R1 | The Rating stage's keyword list (what the score grades against) is never sent to `resumeStrategy`, `generateResume` or `regenerateResumeSection`. They only get the job parse, which has about 5 top skills. | `src/store.ts:339-340`, `server.ts` `/api/ai/resumeStrategy`, `/api/ai/generateResume` |
| R2 | Keyword extraction returns requirement *sentences*, not ATS terms. The demo run averaged 4.6 words per phrase and marked 28 of 50 critical, with near-duplicates. Exact-match scoring then reports present terms as "missing" (demo score 34%), and "Rebuild with missing keywords" feeds those sentences back. | `server/promptStore.ts` `keywords`, `src/lib/resumeScore.ts` |
| R3 | Gap Interview / "I have this" context is keyed by keyword id with no keyword phrase attached. It reaches the strategy but never `generateResume`. | `RatingStage.tsx` `saveContext`, `server.ts` routes |
| R4 | The writer ignores the strategy's own guardrails. The demo strategy listed REST/sandbox/payments under "Omit – No Evidence", and the resume claimed them anyway. 17 JD terms appeared that aren't in the Career Journey, and nothing checks after generation. | `generateResume` prompt ("ensure all … Keywords from the Job Parse are incorporated") |
| R5 | The output schema has nowhere for Selected Outcomes, role narratives or bold leads, though the knowledge files describe all three. The strategy's `selectedOutcomes`, which the user edits in Strategy Review, are silently dropped. | `server/ai/legacySchemas.ts` `GENERATE_RESUME_SCHEMA`, `src/types.ts` `GeneratedResume` |
| R6 | There's no concept of "several roles at one employer". Nymbl is 4 Career Journey roles, so it renders as 3 overlapping entries, and the bullet budget is split across them by recency (IT Manager gets 5, CSO gets 4). | `src/lib/resumeBuild.ts` `computeBulletBudget`, `BULLET_LADDER` |
| R7 | The bullet budget is filled as a quota. In the demo run, 10 of 15 bullets cited no evidence (generic duties). Trimming cuts from the tail, not the weakest. | `resumeBuild.ts` `enforceResumeConstraints` |
| R8 | Prompt noise: Career Journey v3.54 is about **123K tokens per resume call**, of which `links` is 35.8K and `meta` (version changelogs) is 13.7K. Achievements and roles, the actual evidence, are about 24K. It's also pretty-printed. | `projectCareerJourneyForResume`, routes use `JSON.stringify(x, null, 2)` |
| R9 | Small deterministic misses: dates are model-written (ISO format leaks through), the phone isn't formatted, the summary is capped at 70 words (comes out telegraphic), and with no `resume_preferences` every role defaults to `full`, including 2009–2013 coaching roles. | `resumeBuild.ts`, `src/lib/utils.ts` `formatContactLine` |

## Decisions (answered 2026-10-07)

1. **Format features** (Selected Outcomes, role narratives, bold leads) become **build settings the user turns on**, not fixed template changes.
2. **Unsupported claims are flagged for the user to decide.** The app never auto-removes or blocks them.
3. **Benchmark**: the Blitzy JD + Career Journey v3.54. The target is to match or beat the ChatGPT resume's coverage (29/38) with no unreviewed unsupported claims.

## Progress

**2026-10-07: Phases 0, 1 and 5 implemented.** Measured with `npm run eval:resume` on the Blitzy JD + Career Journey v3.54, using the role selection in `server/scripts/fixtures/blitzy-senior-solution-consultant.options.json`. This is one run, so expect some model variance.

| Measure | Before (app PDF) | After Phases 0, 1 and 5 | ChatGPT |
|---|---|---|---|
| JD terms covered (38) | 22 | 23 | 29 |
| Bullets citing no Career Journey evidence | n/a (PDF); 10 of 15 in the demo run | **0 of 19** | n/a |
| Headline proof points used | "6x" only | $1.5M→$9.2M, SC team 1→4, ~$11M defense POC, Boeing POC, Fortune 500 | all of these + tolling RFP, 2 weeks → 3 days |
| CSO entry bullets | 1 | 6 (most relevant role now gets the top rung) | 8 (combined Nymbl) |
| Dates / phone | `2026-03 - Present`, `6165401669` | `March 2026 – Present`, `616.540.1669` | same as after |
| Words | 549 | 740 | 1,044 |
| Career Journey tokens in the generateResume prompt | ≈ 123K (pretty-printed, full) | ≈ 45K (of 78K total; the knowledge files are another ≈ 31K) | — |

What moved: the evidence quality and the proof points. What didn't: term coverage. Two things still limit coverage:

1. **The keyword list (Phase 2).** This run's 30 "keywords" averaged **7.3 words** each, e.g. "Blitzy Fast culture — moving quickly and decisively". The keyword plan now reaches the writer, but it hands over sentences, not terms. The literal gate scored 9%, which is meaningless with phrases like that.
2. **Layout (Phase 4).** There are no role narratives or Selected Outcomes, and Nymbl is still split across three entries.

The keywords prompt also had to lose the noise. With the full Career Journey it timed out at the Oso router (524 after ~250s) twice in a row. It now uses the same `stripCareerJourneyNoise` projection, at 82K prompt tokens.


**2026-10-07: Phase 2 implemented**, plus a fix to Phase 1's writer prompt.

| Measure (Blitzy) | Phases 0, 1, 5 | + Phase 2 (run 2) | + writer checklist, no variant stacking (run 4) | ChatGPT |
|---|---|---|---|---|
| Keyword phrase length (avg words) | 7.3 | **1.8** (31 terms) | same list | — |
| App keyword gate | 9% (meaningless) | 79% | **88%, passes** | — |
| JD terms covered (38) | 23 | 22 | **28** | 29 |
| Uncited bullets | 0 / 19 | 0 / 19 | 0 / 19 | — |

The short keywords alone didn't move coverage: the writer still skipped USE keywords (Enterprise SaaS, Developer tooling, Customer feedback). What did move it was making the writer fill a planning-only `keywordPlan` (each USE keyword → section) before writing.

The first try at that (run 3, 29/38) stacked every alias side by side in the skills rows ("solution consulting, solutions consulting, solutions consultant…"). The prompt now treats aliases as alternatives to pick one of, and asks for one checklist entry per keyword. Model aliases that are just a broader or narrower form of the term ("adoption" for "Post-sale adoption") are dropped in `cleanKeywordBreakdown`.

Still open:
- **First-person summary.** Run 4's summary slipped into first person; a rule now forbids it (not yet re-measured).
- **Claims needing a second look.** "Drove … an $11M government defense application" is the kind of claim Phase 3 should flag for review.

**2026-10-07: Phase 4 implemented.** Build Settings has a Format card:
- combine employer roles (on by default)
- Selected Outcomes, role narratives, bold bullet labels (off by default)
- skills after the summary or before education
- "Make default" saves the choices to `person.resume_preferences.format`

Everything renders in all three templates and in the .docx and fallback PDF exports.

Measured with every format on, using `blitzy-senior-solution-consultant.all-formats.options.json` and the run-2 keywords. Each run was rendered through the real headless-Chrome export:

| Runs | JD terms (38) | Invented numbers | Pages (Classic / Modern / Executive) |
|---|---|---|---|
| 5–9 (first version) | 24–31, median 26 | **1 of 5 runs**: "70%", "80%", "30% expansion revenue", "20+", "100-person" | 3 / 3 / 3 |
| 10–12 (+ format-aware budget, no-derived-numbers rule) | 26, 29, 26 | none | run 11: 2 / 3 / 2 |
| 13, 15 (+ section length limits; run 14 hit an Oso router outage) | **29, 28** | none | 2 / 3 / 3 (Modern ~8 lines over, Executive only the Education line) |

Findings and fixes along the way:
- **Nymbl** renders as one entry ("Chief Strategy Officer | Head of …", January 2022 – March 2026) with a narrative.
- **Combining shrinks the bullet budget.** A combined employer gets one ladder rung plus one bullet per extra role (max 8), so combined Nymbl carries fewer bullets than the three separate entries did.
- **Selected Outcomes** come from the writer as structured lead/text built from the reviewed strategy outcomes. Parsing the strategy's free-text lines mislabelled outcomes written as "Claim: numbers".
- **Bold labels** are capped at 5 per entry and never applied to every bullet.
- **Education** fills from the Career Journey when the model returns none. One run put the education item inside `experience`; enforcement now drops malformed entries like that.
- **Page fit:** with outcomes or narratives on, each entry loses one bullet per setting, and the summary cap drops to 80 words (45 for 1 page). Narratives are limited to 35 words, outcomes to 20, skills rows to 8 terms. The budget is set before the template is chosen, so Modern and Executive can still run a few lines over on 2 pages. The editor's page estimate shows it.
- **Copied JD sentences** ("converted technical curiosity into commercial momentum") still appear in about half of runs despite the prompt rule. Phase 3 `jd-copy` flag.
- **Port 47293** is the Docker deployment (`career-journey:latest`), not a dev server. Use the `career-journey-dev-47294` launch config to run current code next to it.
---

## Phase 0 — Eval harness (do first; every later phase is measured with it)

`server/scripts/evalResume.ts` (`npm run eval:resume -- --cj <path> --jd <path> [--roles ...]`). It runs parse → keywords → strategy → resume in-process with the same prompt construction as the routes, on env-default platform models, with no Firestore. It writes the outputs plus a metrics JSON:

- Prompt tokens per call
- JD-term coverage: an atomic term list taken from the parse, and optionally a hand-curated list in `--terms`
- Career-Journey-supported terms that are missing
- Resume terms not found anywhere in the Career Journey (unsupported-claim candidates)
- Bullets with no `evidenceRefs`
- Word count and sections present

Commit the Blitzy and Kestrel JDs as fixtures under `server/scripts/fixtures/`. The Career Journey path stays a CLI argument, so the candidate's data never goes into the repo.

**Effort** S. **Done when** the script reproduces the "App resume" column above within noise.

## Phase 1 — Give the writer the right inputs (R1, R3, R4, R8)

1. **Keyword list into all three resume calls.** `store.ts` passes a compact `job.keywords` list (phrase, aliases, category, isTopCritical, evidenceStatus, evidenceRefs; hard gates excluded) to `generateResumeStrategy`, `generateFullResume` and `regenerateResumeSection`. That means updating the `src/lib/*Client.ts` wrappers, the routes, and `server/ai/promptSampleInputs.ts`.
2. **Context entries with meaning.** Send context entries joined to their keyword phrase (`{ keyword, experienceText, measurableOutcome, roleId }`) to both the strategy and the writer, not just the strategy.
3. **Prompt rules.** Replace "Keywords from the Job Parse" in `generateResume` with explicit rules:
   - every EVIDENCED/PARTIAL keyword appears at least once, in the JD's exact words, in the summary, skills or a bullet
   - top-critical keywords go in the summary or the first role's top bullets
   - NOT SUPPORTED / MISSING keywords and everything in `cautionClaims` stay out unless a context entry supports them
   - skills rows hold skills, not JD sentences
4. **Resume projection that drops noise.** `projectCareerJourneyForResume` always strips `links`, `meta` and `vocabularies`, plus achievements, deliverables and engagements linked only to non-full roles. The resume routes switch to compact `JSON.stringify` (no indent). Target: about 123K → ≤ 45K tokens for v3.54. Check what Admin › Prompts `careerJourneyFields` is set to for these prompts first, since it may already narrow this in production.

**Effort** S–M. **Tests**: `resumeBuild.test.ts` (projection strips noise, keeps evidence). **Eval target**: coverage ≥ 26/38 and ≥ 8 of the 12 missed supported terms recovered.

## Phase 2 — Keywords that are ATS terms (R2)

1. **Prompt + Zod schema** (`server/ai/schemas.ts`; this route is already on the provider-agnostic path):
   - `phrase` is 1–4 words, verbatim from the JD
   - new `aliases[]` (acronym or long-form pairs) and `requirementText` (the source sentence, shown in the UI)
   - `isTopCritical` capped at 8
   - hard gates only under category `Hard gate`
2. **Server-side cleanup** after the model returns: dedupe on `normalize()` plus aliases, enforce the critical cap, drop empty phrases.
3. **Scorer** (`resumeScore.ts`): match a keyword if the phrase *or any alias* is present.
4. **Editable keyword table** (Rating › Keyword Breakdown): edit phrase, delete, merge two rows, toggle critical, add a keyword. Pure helpers go in `src/lib/keywordEdits.ts` with tests.
5. **Existing jobs**: if a job's average phrase is longer than 4 words, show a "Re-analyze for sharper keyword matching" banner. Don't auto-migrate.

**Effort** M. **Tests**: `resumeScore.test.ts` (aliases), `keywordEdits` tests, dedupe tests.

## Phase 3 — Flag unsupported claims for review (R4, R7; decision 2)

1. **Strategy schema**: add `omitKeywords: string[]`, separate from `keywordPlacement`. Today the "Omit" group sits *inside* `keywordPlacement`, which reads as an instruction to place those terms. Strategy Review shows these as "Won't claim", and the user can move one back.
2. **`src/lib/resumeClaims.ts` `flagResumeClaims(resume, careerJourney, keywords, strategy)`**, deterministic and run client-side on every edit like the keyword score. It returns one flag per finding, with a location (summary / skills row / role + bullet index):
   - `no-evidence`: a bullet with empty `evidenceRefs`
   - `unknown-evidence`: a cited id that doesn't exist in the Career Journey
   - `unsupported-term`: the text contains a keyword marked NOT SUPPORTED / MISSING or in `omitKeywords`, and that term appears nowhere in the Career Journey text
   - `title-reframe`: a hybrid-title segment that isn't a real Career Journey title, so the user can confirm the reframe is honest
   - `invented-number`: a percentage, dollar amount, count or multiple that appears nowhere in the Career Journey or confirmed context, including figures derived from real ones ("2 weeks → 3 days" restated as "80% faster"). Added 2026-10-07: 1 of 8 Blitzy runs invented "70%", "80%", "30% expansion revenue", "20+ solutions" and "100-person firm", and it was the run with the best keyword coverage. `npm run eval:resume` already reports `numbersNotInCareerJourney`.
   - `jd-copy`: 5+ consecutive words copied from the JD ("converted technical curiosity into commercial momentum"). Added 2026-10-07: every all-formats run did this at least once despite a prompt rule against it.
3. **UI**: flag chips inline in the resume editor, reusing the existing hover controls, with **Keep** / **Remove** / **Rewrite** actions. Rewrite calls `regenerateResumeSection` with an instruction. "Keep" is stored as `job.resumeClaimDecisions` (keyed by flag kind + normalized text) so the flag doesn't come back. `ResumeScorePanel` adds "N claims need your review". Export isn't blocked, but the download button notes unreviewed flags.

**Effort** M. **Tests**: `resumeClaims.test.ts` covering each flag kind, plus Keep persistence.

## Phase 4 — Format build settings (R5, R6; decision 1)

Add `format` to `ResumeBuildOptions`, shown in `ResumeBuildSettings.tsx` as toggles:

| Setting | Default | What it does |
|---|---|---|
| `combineEmployerRoles` | **on** | Roles at the same employer (`companyKey`) become one entry: combined hybrid title, dates computed from the earliest start to the latest end, one shared bullet budget. Optional per-role sub-lines. |
| `selectedOutcomes` | off | 4–5 bold-lead proof points before Experience, taken from the strategy's (user-edited) `selectedOutcomes` |
| `roleNarratives` | off | A 1–2 sentence scope paragraph under each full employer entry |
| `boldLeads` | off | Bold lead labels on the top 3–5 bullets per entry. Labels mirror JD responsibilities, e.g. "POC & technical validation:" |
| `skillsPosition` | top | `top` or `bottom` |

A "Save as my default" checkbox writes these to `person.resume_preferences`.

- **Schema/types**: `GeneratedResume` gains:
  - `selectedOutcomes?: { lead, text, evidenceRefs }[]`
  - on each experience entry: `narrative?`, `roleIds?: string[]` (for combined entries)
  - on each bullet: `lead?`

  Update `GENERATE_RESUME_SCHEMA` and `REGENERATE_RESUME_SECTION_SCHEMA` to match (regenerate also gets a new `selectedOutcomes` section kind).
- **Determinism**: `buildResumeConstraintsBlock` states which formats are on. `enforceResumeConstraints` strips any field whose toggle is off, and computes combined entries' dates and roleIds from the Career Journey, never from the model.
- **Rendering**: all 3 templates in `ResumeTemplates.tsx` (and so `/print.html`), `server/docxBuilder.ts`, `server/pdfBuilder.ts` (fallback), `resumeToPlainText` (scoring), `usePageEstimate`, and edit controls for outcomes, narratives and leads in `ResumeEditControls.tsx` / `resumeEdits.ts`.

**Effort** L (biggest phase: schema + 3 templates + docx + pdf + editor). **Tests**: `resumeBuild.test.ts` (grouping, date math, stripping), `resumeEdits` tests. **Eval target**: the Nymbl entry renders once, with the $1.5M→$9.2M story in its first bullet.

## Phase 5 — Bullet budget and deterministic polish (R6, R7, R9)

1. **Budget is a ceiling.** Prompt: "Fewer proven bullets beat filler. Every bullet should cite evidence." When trimming, drop bullets without `evidenceRefs` first, then from the tail.
2. **Budget by relevance, not just recency.** Rank full entries by the count of EVIDENCED keywords whose `evidenceRefs` resolve to that role (`roleIdsForEvidenceRef` already exists), break ties by recency, then walk the ladder. Combined employer entries get the top rung.
3. **Smarter defaults when `resume_preferences` is absent**: condense roles that ended more than 10 years ago; keep explicit choices untouched.
4. **Deterministic formatting**:
   - experience and education dates are rewritten from the Career Journey `start_date`/`end_date` as "March 2026 – Present"
   - 10-digit US phone numbers render as `616.540.1669`
   - earlier-experience dates stay year-only
5. **Summary**: raise the 2-page cap to about 110 words (1-page: 60). Prompt for full sentences that include the headline metric verbatim from the Career Journey.

**Effort** S–M. **Tests**: `resumeBuild.test.ts` (budget order, evidence-first trim, date formatting, defaults).

## Phase 6 — "Fix missing keywords" keeps your edits

Replace the full rebuild in `ResumeScorePanel` with a targeted fix:

1. For each missing evidenced keyword, find the role it belongs to via `evidenceRefs` → `roleIdsForEvidenceRef`; if there's none, fall back to skills/summary.
2. Run `regenerateResumeSection` only on those sections, with an instruction naming the keywords.
3. Keep "Full rebuild" as a secondary action behind a confirm ("Replaces your manual edits").

**Effort** S–M.

## Phase 7 — Small fixes found along the way

- The patch download filename is hard-coded to `blair_boylan_career_journey_v…`. Use `nameSlug(person.name)` (`RatingStage.tsx:491`).
- Wire `diffCareerJourneyRoles` into the Patch tab (it's imported but unused), or remove the import.
- Warn on "Finalize Rating" when there's no keyword breakdown, since the score silently falls back to parse skills.

**Effort** S.

---

## Order and checkpoints

| Step | Phases | Checkpoint (eval on Blitzy JD + Career Journey v3.54) |
|---|---|---|
| 1 | 0 | Baseline reproduces about 22/38 |
| 2 | 1 + 5 | ≥ 26/38; prompt ≤ 45K tokens; no-evidence bullets roughly halved |
| 3 | 2 | Keyword score agrees with the hand-curated term list within ±5 pts |
| 4 | 3 | Every unsupported term in the output carries a flag |
| 5 | 4 | With combine + outcomes + leads on: ≥ 29/38 (ChatGPT parity); Nymbl renders once |
| 6 | 6, 7 | Fixing missing keywords leaves untouched sections byte-identical |

Each step: `npm test`, `npm run lint`, the eval script, then a short browser checklist for the user on `localhost:47293`. Each step is its own commit on `main`.

## Not in scope

- Moving `resumeStrategy` / `generateResume` off the legacy Gemini-schema shim onto `server/ai/`. Worth doing, and the schema changes here make it easier, but it needs real per-provider verification (`npm run verify:ai`) and is tracked separately in ARCHITECTURE.md.
- Cover letter changes. It benefits from Phase 1's inputs but has its own skill file and quality bar.
