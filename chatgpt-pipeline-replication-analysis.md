# Replicating the ChatGPT Job Applications Pipeline in the App — Gap Analysis

Compared the ChatGPT project (project instructions + `JD_pipeline_SKILL.md`, `Blair_Cover_Letter_SKILL.md`, `Blair_Voice_SKILL.md`, `ats_tactics.md`, `jd_signal_map.md`) against what the app actually does today: `server.ts` (the real Gemini backend — not mocked, despite the `mock-ai.ts` naming) and the pipeline pages in `src/pages`.

## Headline finding

The app's *architecture* already mirrors the ChatGPT pipeline closely — the route structure (Intake → Parse → Keywords/Context → Patch → Fit → Strategy → Export → Preview) maps almost 1:1 to the skill's 9 stages, and the TypeScript types (`JDParse`, `KeywordSignal`, `HardGateAudit`, `CareerJourneyPatch`, `ResumeStrategy`) mirror the skill's data shapes closely enough that this was clearly built *as* an attempt to productize this exact pipeline.

But the *intelligence* is mostly missing. Every `server.ts` endpoint sends Gemini a short, generic, one-paragraph instruction and the raw JSON — none of the detailed rules, defaults, tactics, or quality gates that make the ChatGPT project work well are actually present. The skill files total roughly 2,500 lines of carefully tuned logic; almost none of that text exists anywhere in the app. Right now Gemini is re-deriving Blair's preferences, tactics, and voice from scratch on every call instead of being told them, which is why a ChatGPT conversation using these skill files and this app running the "same" pipeline would produce meaningfully different, less reliable output.

Two things are true at once: the plumbing is basically right, and the actual pipeline logic needs to be transplanted in almost wholesale from the skill files.

## Prerequisite: the real Career Journey isn't loaded

`blair_boylan_career_journey_v3_33.json` (386KB, 8,262 lines — the real canonical data, current through 2026-08-11) exists only in your Downloads folder. The app ships with `src/lib/defaultData.ts`, a synthetic sample profile ("Robust 12-Tier Core Ontology Professional Sample" — a placeholder, not your data). Nothing in the repo or its `.gitignore`'d storage has ever loaded the real file. Every fit score, keyword match, and resume the app has generated so far was scored against fake data.

The real JSON does contain the load-bearing fields the skill files depend on — confirmed by grep: `work_preference` ("Remote-first... Telluride, CO... 10-20% travel"), `resume_company_descriptor` / `resume_company_url` per role, `degree_type: "Coursework (program not completed)"`, and a `skills_index` with 100+ entries. So once it's actually imported (Navbar already has an Import JSON button — `src/components/Navbar.tsx:24-38` — that should work), the data layer is fine. This has to happen before any prompt-fidelity fix matters, since right now every endpoint is reasoning over placeholder data regardless of prompt quality.

## Stage-by-stage gaps

### Stage 1 — Parse JD (`server.ts:23-70` vs `JD_pipeline_SKILL.md` Stage 1)

- No `[Company] — [Exact Job Title]` canonical naming convention anywhere in the app (not in this prompt, not in the UI, not in filenames).
- The hard-gate extraction is generic ("work authorization, mandatory licenses, location, clearance") instead of the skill's explicit 7-gate checklist with Blair's actual default position on each one (US-authorized, Telluride CO remote/Mountain Time, MSOE ME coursework not completed, no clearance/PMP, 10+ yrs leadership, 10-20% travel willingness, English). Gemini has to guess Blair's defaults from the JSON alone instead of being told them directly.

### Stage 2 — Keyword breakdown (`server.ts:72-143` vs Stage 2 + `jd_signal_map.md`)

- Reasonably close in spirit (exhaustive extraction, evidence-status classification), but never references `jd_signal_map.md`'s anchor-story table — the skill's single highest-leverage asset, mapping ~40 JD phrases directly to specific Career Journey evidence and exact bullet framing (e.g. "Scale" → Nymbl $1.5M→$9.2M → "lead with the 6x number and PADRE"). The app prompt asks Gemini to invent `whatCouldCount` / `recognitionPrompt` from nothing every time instead of handing it the pre-built lookup table.
- Schema mismatch: `server.ts:123` lets the model return categories like `'Metric / Outcome'` and `'Acronym/Synonym'`, which aren't in the `KeywordSignal['category']` union in `types.ts:78`. Harmless at runtime (JSON, no validation) but a sign the prompt and the type were never reconciled.

### Stage 3 — Fit scoring (`server.ts:205-246` vs Stage 3)

- This is the thinnest prompt in the file: `"Evaluate the fit... Generate an objective fit analysis."` The skill defines each of the four dimensions concretely (role scope fit *specifically* against Nymbl+Oso executive scope; seniority fit *specifically* tied to the CSO+Founder narrative and whether the $1.5M→$9.2M story would land at this company's stage). None of that framing exists in the prompt — Gemini has to reconstruct "what does a good fit look like for Blair" from the raw JSON alone, which is exactly the kind of judgment call that drifts between calls.

### Stage 4 — Hard gate audit (`server.ts:248-301` vs Stage 4 + `jd_signal_map.md` gate table)

- The best-implemented endpoint in the file — it already asks for tenure math shown in the reasoning, which matches the skill's spirit. Still missing Blair's specific default position per gate (the skill hands the model "Remote-only, Telluride CO, Mountain Time" as a given; the app prompt makes Gemini infer it from role-location fields in the JSON, which is less reliable, especially since defaultData.ts's location fields aren't guaranteed present in every role entry).

### Stage 2/5 — Career Journey patch (`server.ts:303-361` vs the "Career Journey capture rules" section)

- No ID discipline: the skill requires deterministic `SK-###` / `ACH-###` / `DEL-###` incrementing and never reusing an ID; the app prompt just says "Generate IDs for new items if needed."
- No versioning enforcement: the skill requires writing a *new* file (`v3_33` → `v3_34`), never overwriting, and updating `meta.version` / `meta.last_updated` / the matching `version_X_Y_changes` key. The app prompt has no instruction about this at all, and `PatchReview.tsx:47-49` applies the merged JSON directly to the single in-memory `careerJourney` object — there's no versioned-file output, no download, no "re-upload this" handoff. This is also exactly the "silent overwrite" risk flagged in the earlier UX audit (workstream 5 of the iteration plan) — it's the same root cause: the patch step was never built to match the skill's staged-approval, versioned-file model.

### Stage 6 — Resume generation (`server.ts:363-551` vs Stage 6 + `ats_tactics.md`)

This is the biggest gap. The skill's Stage 6 is ~150 lines of specific tactics; the app prompt is nine generic sentences. Missing entirely:
- Canonical employer descriptor/link preservation rules (`Oso Group — Business Operating Systems...`, etc.) — nothing stops Gemini from paraphrasing these, and the `GeneratedResume` type (`types.ts:11-28`) has no field to carry a company URL or a separate descriptor line at all, so even if the prompt asked for it, there's nowhere to put it.
- Title-reframing tactic (hybrid titles: `Chief Strategy Officer | Head of [JD's term]`).
- Role-identity / seniority-balance guardrail from `jd_signal_map.md` (don't let React/Node keywords make an architecture candidate read as a software engineer).
- ATS layout rules — full month-year dates, acronym long-form+short-form pairing, standard section headers, file naming convention (`Blair_Boylan_Resume_[Company]_[RoleSlug].docx`).
- Blair Voice applied lightly to bullets (banned generic-executive adjectives, verb accuracy over thesaurus-swapping).
- Selected Executive Outcomes section, tagline, structured template — the `GeneratedResume` type is flatter than the skill's template (no tagline field, no outcomes array, no per-role descriptor/link).

### Output format — no real DOCX, no verified text-layer PDF

`ResumePreview.tsx:49` calls `window.print()`. That's the entire "PDF export" mechanism. There's no `docx` file produced at all (nothing in `package.json` generates one), and no verification step (file size, extractable text layer, clickable hyperlinks surviving conversion) — all of which `ats_tactics.md` and Stage 6/7 treat as hard requirements. The skill's whole "parseability" risk layer has no equivalent in the app.

### Stage 7 — Keyword coverage gate (`server.ts:434-473` vs Stage 7)

- The 85% threshold and weighting logic (top 4-6 critical skills weighted heavier, position-in-document weighting) are left for Gemini to invent (`threshold` is a model-filled `NUMBER` field, not a fixed value the app enforces).
- No rebuild loop. The skill's gate is call → check → if it fails, patch the gap and re-score, repeat. `Export.tsx:22-33` calls the scorer exactly once and just displays pass/fail — there's no automatic remediation step.

### Stage 9 — Cover letter: does not exist

Nothing. No `/api/ai/coverLetter` endpoint, no `CoverLetter` type, no route, no page, no button anywhere in the UI. `Blair_Cover_Letter_SKILL.md` (688 lines: Opening Thesis Gate, four-paragraph structure, evidence-density rules, the anti-slop hard gate, the 10-point rubric with an 8.5 floor) and all of `Blair_Voice_SKILL.md`'s AI-Suspicion Audit have zero footprint in the app. This is the single largest missing capability, not a fidelity gap.

## Structural blockers worth naming before scoping work

1. **No shared "Blair constants" layer.** Contact info, banned resume adjectives, the employer descriptor/link table, the hard-gate default table, and the Blair Voice banned-phrase list all live only in the skill `.md` files. The app has no equivalent config that gets injected into prompts regardless of what's in a given Career Journey JSON snapshot — right now fidelity to these rules depends entirely on the model inferring them fresh from context each call.
2. **No multi-turn self-check loops.** The cover-letter and resume skills both require generate → score against a rubric → revise → re-score cycles (cover letter needs ≥8.5/10 and ≤2/10 AI-suspicion before delivery). Every `server.ts` endpoint is single-shot `generateContent`. Replicating the gates faithfully means adding at least one scoring+revision round-trip for resume keyword coverage and cover-letter quality, not just a better one-shot prompt.
3. **`GeneratedResume` and `ResumeStrategy` types are missing fields** the skill's template requires (employer URLs, descriptors, tagline, selected-outcomes array) — this is a schema change, not just a prompt change.

## What I'd recommend as the replication plan (pending your steer)

1. **Load the real Career Journey.** Confirm the Navbar's Import JSON flow works against the actual v3.33 file end to end; this unblocks everything else and needs no code changes if it already works.
2. **Build a server-side prompt library** — one module per skill file, holding the actual rules as reusable text blocks (hard-gate table, employer descriptor/link table, ATS tactics, voice banned-phrase list, jd_signal_map lookup) — and inject the relevant blocks into each `server.ts` endpoint instead of today's one-liners. This is the highest-leverage, lowest-risk change: same architecture, just actually telling Gemini the rules instead of hoping it infers them.
3. **Extend `GeneratedResume`/`ResumeStrategy`** to carry the fields the real template needs (tagline, selected outcomes, per-role descriptor + URL, hybrid title).
4. **Add the keyword-gate rebuild loop** (Stage 7) as an actual loop instead of a single score-and-stop.
5. **Fix the patch stage** to match the skill's ID discipline + versioned-file output (this folds into workstream 5 from the earlier UX plan — same fix serves both).
6. **Build the Cover Letter stage end-to-end**: type, endpoint (Cover Letter skill + Voice skill embedded, with a self-score-and-revise loop targeting the 8.5/10 + ≤2/10 gates), route, page, and the "do you need a cover letter?" prompt after resume delivery.
7. **Decide on real file output** — either add a real `.docx` generator (a library, not `window.print()`) with the text-layer/size/hyperlink verification the skill requires, or explicitly accept browser-print-PDF as good enough for now and drop that requirement. This is a real scope decision, not a small fix.

Items 2, 3, and 6 are where almost all the quality gap lives. Item 7 is the biggest unknown in terms of effort — happy to scope it separately once you've seen this.

## Open questions before I start

- Priority: does this replace or run alongside the earlier UX iteration plan (`job-fit-tool-iteration-plan.md`)? They overlap on the patch-approval fix (item 5 here = workstream 5 there).
- Scope on file output: real `.docx` generation, or is print-to-PDF acceptable for now?
- Should the cover-letter self-scoring loop actually call Gemini a second time to score+revise, or is a single well-prompted pass acceptable to start, with the rubric text included as instructions rather than enforced as a second pass?
