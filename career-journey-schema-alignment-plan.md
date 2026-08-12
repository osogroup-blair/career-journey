# Career Journey Schema Alignment & Builder — Phased Plan

Source of truth for this analysis: `C:\Users\blair\Downloads\blair_boylan_career_journey_v3_35.json` (Blair's real, hand-maintained Career Journey — meta.version 3.35, 35 versions of changelog history) compared against everything the app currently ships: `src/lib/blair_career_journey.json` (bundled default, meta.version 3.33), `src/pages/CareerJourney.tsx` (the "Advanced Editor" / 12-tier cockpit), `src/pages/EditJourney.tsx` (the simple guided editor), `src/store.ts`, `src/data/*` (DataStore/LocalStorage/Firestore), and `server.ts` (how the backend consumes the object).

Structurally, the real JSON and the app's model are close — same 16 top-level keys, same array-of-typed-object shape for roles/achievements/skills_index/capabilities/etc. The gaps are specific and fixable, not a rewrite. Full findings below, then a 6-phase plan.

---

## What's actually different

### 1. Fields with zero editor support
- **`person`** — name, brand, summary, location, signature_outcomes, phone, email, linkedin, website, github, resume_contact_preference, and `positioning` (primary_tagline, target_role_families, role_orientation, narrative_anchors). Nothing in `CareerJourney.tsx`'s 12 sidebar tabs edits this. Yet `store.ts:324` already has an `updateCareerJourneyPerson` action wired and unused by any page, and `Matches.tsx:108,362` already **reads** `careerJourney.person.positioning` and `careerJourney.person.work_preference` for Match Preferences — so half the plumbing exists, the tab just doesn't.
- **`certifications`** (top-level array) — no tab, not defaulted in `normalizeOntology` or `store.ts`'s `setCareerJourney` sanitizer.
- **`application_artifacts`** (description + artifacts[]) — no tab, not defaulted.
- **`interview_answers`** (description + answers[], each with per-audience `version_for_X` variants) — no tab, not defaulted.

### 2. Partially-supported fields
- **`links`** — real schema has 7 sub-tables (`keywords`, `industries`, `education_alignment`, `deliverable_function`, `certification_alignment`, `deliverable_achievement`, `timeline_mappings`). The Links tab and both sanitizers only handle 5 — `deliverable_function` and `certification_alignment` are missing everywhere.
- **`education[]`** — real records carry `degree_type`, `start`/`end` (not the single `dates` string the UI uses), `capability_alignment[]`, `skills_reinforced[]`, `achievements[]`, `completion_status`, `resume_display`. The Education tab only edits institution/program/dates/location/description.
- **`roles[]`** — real records carry resume-facing fields (`positioning_note`, `company_descriptor`, `resume_company_descriptor`, `resume_company_url`) that neither `RoleEditForm` (simple editor) nor the Advanced Editor's roles tab expose.
- **`meta` changelog** — real data logs history per version (`version_3_2_changes` … `version_3_35_changes`, 35 keys). The UI (`CareerJourney.tsx`'s Meta tab, and both sanitizers) only knows a single generic `version_X_Y_changes` array. Loading the real file, the entire changelog history is invisible in the UI even though it's sitting right there in the JSON. `server/careerJourneyVersioning.ts:45` (`versionChangesKey`) already computes the correctly-named key server-side for new patches — the backend half of this is right, only the frontend display/edit is missing.

### 3. An actual architecture split (not just a missing field)
`EditJourney.tsx` (simple editor)'s `addAchievementToRole`/`addDeliverableToRole` write to **`role.achievements[]`/`role.deliverables[]`** — embedded arrays on the role object. The real schema (and the Advanced Editor, and everything downstream — `server.ts`'s prompts, Matches scoring, resume strategy) treats achievements and deliverables as **top-level entities** (`careerJourney.achievements[]`, `careerJourney.deliverables[]`) cross-referenced to roles via `links.timeline_mappings`. In the real data, every role's embedded `achievements`/`deliverables` arrays are empty — all the actual evidence lives at the top level.

Net effect: if you use the Simple Editor today, anything you add lands in a place the rest of the app (resume generation, fit scoring, matches) never reads. This isn't a cosmetic gap, it's a silent data black hole.

### 4. No schema enforcement anywhere
`careerJourney` is typed `any` end to end — `store.ts`, `DataStore.ts`, both DataStore implementations, `types.ts` (which has zero `CareerJourney` interface at all, only the job-analysis pipeline types). Import/export in `CareerJourney.tsx` round-trips through `JSON.parse`/`JSON.stringify` with no validation. `zod` is already a project dependency (`package.json`) but isn't used for this. The two ad hoc sanitizers (`normalizeOntology` in `CareerJourney.tsx`, `setCareerJourney` in `store.ts` — two separate, slightly different copies of the same logic) special-case a fixed list of keys rather than being schema-driven, which is exactly why `person`/`certifications`/`application_artifacts`/`interview_answers`/the 2 missing link tables silently fall outside their coverage.

*(Worth knowing: `C:\Users\blair\Downloads\career-journey.schema.json` already exists — a JSON Schema draft-07 covering `meta`, `person`, `education` with the richer fields above. It's not in the repo and I haven't verified it covers all 16 top-level keys, but it's a head start worth pulling in rather than writing Phase 1's schema from scratch.)*

### 5. Stale bundled data
The app's shipped default (`src/lib/blair_career_journey.json`) is version 3.33; the real file you maintain is 3.35 — missing the GitHub field, the Boeing/Nymbl engagement (ENG-005), and ACH-120/121/122, DEL-109/110.

### 6. Features that don't exist yet
- Nothing parses a resume or runs free-form chat to bootstrap a Career Journey from scratch.
- Nothing runs a general "strengthen your journey" interview. The only clarifying-question generator (`mockGenerateClarifyingQuestions`) is scoped to one job's keyword gaps (`Keywords.tsx`), not a standalone truth-seeking pass over the whole profile.
- The closest existing precedent for both is `mockStageCareerJourneyPatch` + `PatchReview.tsx` — an AI proposes changes, a human reviews and approves before anything is written to the store. That pattern is worth reusing rather than inventing a new one.

### 7. Related open item (not part of this plan, flagging for sequencing)
`job-fit-tool-iteration-plan.md` (Workstream 3, not yet executed) already flags `CareerJourney.tsx`'s "Cockpit"/"Ontology" jargon for a plain-language pass. Since Phase 2 below touches the same file to add tabs, it's worth doing that renaming in the same pass instead of a second round-trip through the file.

---

## Phase 1 — Schema foundation ✅ done (2026-08-12)

Goal: one schema, enforced everywhere, instead of `any` + two ad hoc partial sanitizers.

**Correction found mid-Phase-1, before any code was written**: verifying `C:\Users\blair\Downloads\career-journey.schema.json` against the real v3.35 file field-by-field (as planned) surfaced that the real structure is more nested than this plan originally described:
- `capabilities[].functions[]` are full nested objects (id, name, competency_level, value_stream_stage) each with their **own nested `skills[]`** — not the flat function-id-string array the app's Capabilities tab edits today.
- The real deliverable evidence lives at `roles[].initiatives[].deliverables[]` (id, description, `impact`, `capability_alignment[]`, `skill_ids[]`) — 58 of them. The top-level `functions[]` (3 items) and `deliverables[]` (2 items) arrays turned out to be **leftover scaffold data** — literally the app's original Stripe/Netflix sample content, never replaced. Decision (confirmed with Blair): model both shapes, keep the legacy top-level arrays as an editable "legacy index" rather than deleting or auto-fixing their content.
- `links.keywords` real field is `term`, not `keyword`; `links.industries` uses `entity_id`/`entity_type`, not `role_id`. The schema now accepts both old and new field names so nothing already in the data is lost; reconciling the *editor UI* to write the real field names is Phase 2 work.
- Roles also carry `team_leadership`, `advisory_ps_scope`, `organization_scale` — free-form structured objects, shape varies per role, modeled loosely.

**Shipped**:
- `src/types/careerJourney.ts` — full `zod` schema (all 16 top-level keys, corrected nested shapes above) with `CareerJourney` type inferred via `z.infer`. Every object is `.passthrough()` so an unrecognized field never gets silently dropped.
- `src/lib/careerJourneyNormalize.ts` — single schema-driven `normalizeCareerJourney()`, replacing the two divergent ad hoc sanitizers (`normalizeOntology` in `CareerJourney.tsx`, deleted; the inline logic in `store.ts`'s `setCareerJourney`, replaced). Both `store.ts` (on `setCareerJourney` and on `hydrate()`, so this now also runs on every app load, not just when visiting `/journey`) and `CareerJourney.tsx` (upload, raw-JSON save) call the same function.
- `src/lib/blair_career_journey.json` synced to the real v3.35 file.
- Meta tab now renders/edits *every* `*_changes` key in `meta` (sorted newest-first) instead of one hardcoded `version_X_Y_changes` — verified in-browser against the real data: 33 versioned changelog sections now visible that were previously invisible.
- Verified: real v3.35 file round-trips through `CareerJourneySchema` byte-identical (318,170 bytes in, 318,170 out) — confirms nothing is dropped or fabricated. `tsc --noEmit` clean. Manually verified in-browser (fresh load with localStorage cleared, and Meta tab) — no console errors.

**Deliberately deferred, not forgotten**: `careerJourney` is still typed `any` in `store.ts`'s `AppState` and in `DataStore.ts` — the new `CareerJourney` type exists and is used inside the normalizer, but propagating it through every consumer (`Dashboard.tsx`, `Keywords.tsx`, `Matches.tsx`, etc.) is bigger surgery better done in Phase 2 when those files are already being touched for the editor-gap work, rather than a separate blast-radius-only pass now.

---

## Phase 2 — Close the editor gaps

Goal: every field in the real schema is editable somewhere in the Advanced Editor.

- New **Person & Positioning** tab: name/brand/summary/location/contact fields, `positioning` block (tagline, target role families, role orientation, narrative anchors), signature outcomes. Wire to the already-existing `updateCareerJourneyPerson` store action.
- New **Certifications** tab (same CRUD pattern as the existing Education tab).
- New **Application Artifacts** tab (simple list CRUD — id/name/type/audience/positioning/notes).
- New **Interview Answers** tab (question + keyed per-audience answer variants).
- Extend **Education** tab: degree_type, start/end (replacing the single dates field), capability_alignment, skills_reinforced, achievements, completion_status, resume_display.
- Extend **Roles** tab (both editors): positioning_note, company_descriptor, resume_company_descriptor, resume_company_url, team_leadership, advisory_ps_scope, organization_scale (loose structured-note fields, not simple strings).
- Rebuild the **Capabilities** tab's function editor: real functions are nested objects with their own `skills[]`, not the comma-separated ID list it edits today. Same for **Roles → Initiatives**: deliverables live there (`impact`, `capability_alignment`, `skill_ids`), not just name/description.
- Fix the **Links → Keywords/Industries** tabs to read/write the real field names (`term` not `keyword`; `entity_id`/`entity_type` not `role_id`) — Phase 1's schema already accepts both, this is the UI catching up.
- Add the 2 missing **Links** sub-tables: deliverable↔function, certification↔alignment.
- Decide what to do with the legacy top-level `functions[]`/`deliverables[]` arrays (currently stale scaffold content) — keep editable as a clearly-labeled "legacy index," separate from the real nested data.
- Do the Workstream 3 jargon pass (item #7 above) while in this file.
- **Decision needed from you**: reconcile the Simple Editor's achievement/deliverable model (item #3 above). Recommended: change `addAchievementToRole`/`addDeliverableToRole` to create top-level `achievements[]`/`deliverables[]` records plus a `links.timeline_mappings` entry, matching the real schema, instead of writing to `role.achievements[]`. Alternative if you'd rather keep the Simple Editor minimal: strip achievement/deliverable editing from it entirely and point to the Advanced Editor, which already does this correctly.

**Effort**: ~3–4 days. **Depends on**: Phase 1 (new tabs read/write through the schema-driven normalizer, not another one-off).

---

**Phase 2 shipped 2026-08-12.** Open decision resolved (confirmed with Blair): the Simple Editor's achievement/deliverable writes now redirect to the real model — `addAchievementToRole` creates a top-level `achievements[]` record (with `role_ids`) plus a `links.timeline_mappings` entry; `addDeliverableToRole` creates an entry under the role's first initiative (creating a default one if none exists). Update/delete moved from role+index addressing to global-id addressing (`updateAchievement`/`deleteAchievement`/`updateDeliverable`/`deleteDeliverable`), since the storage location is no longer 1:1 with the role. New helper `src/lib/careerJourneyRoleEvidence.ts` resolves "what belongs to this role" for the Simple Editor's display without the UI needing to know the underlying model.

Shipped: Person & Positioning tab (wired to the previously-unused `updateCareerJourneyPerson`-equivalent path), Certifications tab, Application Artifacts tab, Interview Answers tab (handles the dynamic `version_for_*` keys as editable key/value pairs), extended Education fields (degree_type, start/end, capability_alignment, skills_reinforced, completion_status, resume_display), extended Roles with a collapsible "Resume & Positioning Details" section (positioning_note, company_descriptor, resume_company_descriptor/url, plus structured mini-forms for team_leadership/advisory_ps_scope/organization_scale), a full nested Capabilities → Functions → Skills editor (replacing the old flat comma-separated ID list; legacy string-id entries get a one-click "Upgrade to full entry"), an Initiative Deliverables editor (description/impact/capability_alignment/skill_ids) inside each role's initiatives, Links tab field-name fixes (`term`, `entity_id`/`entity_type` — old field names still read as a fallback so nothing already saved breaks), and the 2 previously-missing Links sub-tables (deliverable↔function, certification↔alignment) via a new reusable `SimplePairLinkCard`. Legacy top-level `functions[]`/`deliverables[]` tabs relabeled "Legacy Functions/Deliverables Index" with an explanatory note, left editable, not deleted. Folded in the Workstream 3 jargon cleanup for this file while already touching it ("Cockpit"/"Ontology" → plain language).

Verified: `tsc --noEmit` clean throughout; live-tested in-browser against the real v3.35 data — Person tab loads correctly, Roles tab shows the real nested initiative deliverables (DEL-100 etc.), Capabilities tab shows real nested FUNC-xxx functions each with their own skills, Links tab's 171 keyword / 7 industry rows populate with correct values (confirmed via DOM inspection, since input values don't show in the accessibility tree's text extraction — a false alarm caught and corrected during this pass), Application Artifacts (5) and Interview Answers (7, with all dynamic version keys) load correctly. Simple Editor add/delete round-tripped for both achievements and deliverables against the real data with no console errors and no data loss (deliverable count 7→8→7, achievement count 7→8→7).

**Deliberately deferred**: cosmetic copy inside the Legacy Functions/Deliverables tab bodies (beyond nav/header labels) still reads slightly stale ("Atomic Work Execution Functions" etc.) — not incorrect, just not fully reworded; low priority polish, not a functional gap.

## Phase 3 — Template export/import round-trip

Goal: "export as a template" and "load in the exports" both actually work, losslessly.

- **Export as Template**: new action that strips PII (name, phone, email, linkedin, website, github, location) and personal content (roles/achievements/deliverables/etc. content) but keeps the full skeleton — every top-level key present, vocabularies intact, one clearly-marked example role/achievement (the existing `COMPREHENSIVE_SAMPLE_JOURNEY` is the right shape for this, just needs to become a real "Download Template" button instead of an in-memory-only "Load Sample").
- **Export as Backup** (already exists as "Export JSON") — keep, but validate against the Phase 1 schema before download so a corrupted in-memory state can't produce a broken export.
- **Import**: validate against the schema on upload; surface field-level errors instead of a raw `JSON.parse` message or silent partial-drop. Distinguish "this is a template" (empty skeleton, fine to load fresh) from "this is a backup" (full data — confirm before overwriting anything in Firestore/local storage).
- Add a version-compatibility check: if an imported file's top-level keys are older/thinner than the current schema, auto-fill the gaps via the Phase 1 normalizer and tell the user what got added, rather than silently merging.

**Effort**: ~1–2 days. **Depends on**: Phase 1.

---

**Phase 3 shipped 2026-08-12.** Found and fixed a real bug while verifying: `MetaSchema`'s `.catchall(z.array(z.string()))` (added in Phase 1 for `version_*_changes` keys) rejected the new `meta.template: true` boolean flag outright — caught by running the template through its own schema before shipping, not just by eyeballing it. Widened the catchall to `z.union([z.array(z.string()), z.boolean(), z.string()])`.

Shipped: `src/lib/careerJourneyTemplate.ts` (`buildCareerJourneyTemplate()` — a blank, schema-valid starting point with one clearly-marked example per section, no personal data, tagged `meta.template: true`); `src/lib/careerJourneyImport.ts` (`parseCareerJourneyImport()` — one shared parse/validate/normalize path used by both the Navbar's global import and the Advanced Editor's import, replacing two separate ad hoc `JSON.parse` + `setCareerJourney` calls that neither validated nor warned about anything). Import now: surfaces schema validation issues instead of silently swallowing or dropping them; reports which top-level sections were missing from the file and got filled with empty defaults; confirms with the user before overwriting real existing data (skipped when importing a recognized template, since there's nothing to lose). Added a "Template" download action next to Export JSON in both the Navbar (global, all pages) and the Advanced Editor's two toolbars. Export now validates against the schema first and logs (not blocks) if something's wrong, so a broken in-memory state can't silently produce a broken file. Folded in the empty-state screen's jargon cleanup ("Cockpit" → "Career Journey", "Ontology JSON" → "Career Journey JSON") since it was being touched anyway.

Verified: standalone script round-tripped the template through the schema (valid, `isTemplate: true`, zero added sections), imported a deliberately partial/old-shaped file (correctly listed all 14 missing sections, still produced a fully valid normalized result), and re-imported the real v3.35 data (zero issues, zero added sections, correctly identified as *not* a template). `tsc --noEmit` clean; both Template and Export buttons clicked live in-browser (Navbar and Advanced Editor) with no console errors.

## Phase 4 — Career Journey Builder: resume or chat → structured JSON

Goal: a new user (or you, resetting) can go from nothing to a populated Career Journey without hand-filling 16 sections of a form.

- New route (e.g. `/build`) with three entry points: upload a resume (PDF/DOCX/TXT), free-form chat, or start blank (Phase 3's template).
- New backend endpoint in `server.ts` that takes resume text or a chat transcript and produces a **draft** CareerJourney using the same "AI proposes, human reviews before anything is written" pattern already proven by `mockStageCareerJourneyPatch` + `PatchReview.tsx` — reuse that review/staging UI rather than building a new one.
- Resume path: extract roles (org/title/dates/location), turn bullets into draft achievements/deliverables/skills, flag anything inferred at lower confidence for review.
- Chat path: multi-turn conversational intake, modeled on the tone/structure of the existing clarifying-question flow in `Keywords.tsx`, working chronologically through work history.
- ID assignment and versioning reuse `computeNextIds`/`computeNextVersion` from `server/careerJourneyVersioning.ts` — already built for exactly this.
- New knowledge file `server/knowledge/career_journey_builder_SKILL.md` (extraction rules, ID rules, voice — reusing `Blair_Voice_SKILL.md`'s tone rules for consistency, but generalized for a non-Blair user).
- Everything lands in a review screen before touching the store — never auto-overwrite existing data.

**Effort**: ~4–6 days. **Depends on**: Phase 1 (schema to generate into), Phase 2 (somewhere for the draft to land once approved).

---

**Phase 4 shipped 2026-08-12.** New route `/build` (`src/pages/CareerJourneyBuilder.tsx`), linked from the Navbar, with three entry points: paste/upload resume text, a guided chat, or a blank template download (reuses Phase 3's builder). Two new backend endpoints (`/api/ai/buildJourneyFromResume`, `/api/ai/buildJourneyChat`) use a new, deliberately generic knowledge file (`server/knowledge/career_journey_builder_SKILL.md` — no Blair-specific facts, unlike the JD pipeline's `KNOWLEDGE_PREAMBLE`) and extended `computeNextIds` (added `ROLE`/`EDU`/`METH`/`ENG` prefixes it didn't cover before). Everything lands in a review screen — nothing touches the store until the user explicitly approves, and approving over existing real data requires confirmation, matching Phase 3's import behavior.

Found and fixed two real bugs during live testing, not just code review:
1. **Gemini structured-output trap**: a bare `{ type: Type.OBJECT }` with no `properties` — the same shallow pattern the pre-existing `patchJourney` endpoint already used — makes Gemini return `{}` for that field every time. Caught by actually running the resume-extraction endpoint and inspecting the response, not by reading the code. Fixed by writing a concrete (if partial) nested schema (`DRAFT_CAREER_JOURNEY_SCHEMA`, covering person/roles/initiatives/deliverables/achievements/skills/education) shared by both new endpoints. Worth knowing: this same trap likely affects `patchJourney`'s `updatedCareerJourney` field too — not touched in this pass since it wasn't in scope, but flagged here for later.
2. **Chat flow UI bug**: the review screen was gated on "a draft object exists" rather than "the conversation says it's ready," so the chat mode jumped straight to review after the very first answer instead of continuing the conversation. Caught by actually running a multi-turn chat, not by reading the code — fixed with a separate `showReview` state, decoupled from the draft accumulating in the background.

Verified end to end against the real Gemini backend (not mocked): resume extraction on a sample resume produced 2 correctly-linked roles, 4 achievements, 5 skills, 1 education entry, and an honest note about missing month-level dates — nothing fabricated beyond what the source text stated. Chat mode ran a full 2-turn conversation, correctly recognized when it had enough for a first draft, and produced a consistent review. Confirmed Blair's real 14-role data was untouched by any of this testing (the overwrite-confirmation dialog was exercised and correctly blocked a test draft from landing).

## Phase 5 — Guided truth-seeking interview

Goal: not "get something down" (that's Phase 4) but "pressure-test what's already there" — generalizing the JD-specific clarifying-question pattern into a standalone mode.

- Scan the current CareerJourney for weak signals: achievements with no quantified metric, skills with no `years_experience`/stale `last_used`, thin role descriptions, capabilities with no linked functions or `timeline_mappings`.
- Generate a prioritized queue of specific, pointed questions ("You said you 'improved performance' at Acme — by how much, measured how, over what baseline?"), reusing the existing `mockGenerateClarifyingQuestions` pattern but decoupled from any single job.
- Each answer becomes a proposed patch through the same `mockStageCareerJourneyPatch` + review-before-commit gate as Phase 4 — one consistent mental model for "AI suggests, you approve" everywhere in the app.
- Surface a completeness signal (e.g. % of achievements with a quantified metric, % of skills with recent `last_used`) so it's visible where the profile is still thin.

**Effort**: ~3–4 days. **Depends on**: Phase 1, Phase 4 (shares the staging/review infrastructure).

---

**Phase 5 shipped 2026-08-12.** New route `/strengthen` (`src/pages/StrengthenJourney.tsx`), linked from the Navbar. `src/lib/careerJourneyGaps.ts` scans for three weak-signal patterns purely client-side (no AI needed for detection): achievements with no digit anywhere in title/description, skills whose `last_used` is missing or more than 3 years old, roles with a description under 40 characters — and reports a completeness percentage for each. Each gap becomes a specific, parameterized question (not a generic "tell me more") in a one-at-a-time queue.

Deliberately simpler than a literal reuse of `mockStageCareerJourneyPatch` + `PatchReview.tsx`: that pattern regenerates and returns the *entire* CareerJourney object, which Phase 4 proved is exactly the shape that triggers Gemini's empty-object trap unless every nested level is fully schema'd — impractical to do for a single-field edit. Instead, a new endpoint `/api/ai/refineFromInterviewAnswer` returns only the specific field(s) that should change (title/description/last_used/proficiency/years_experience, all flat strings/numbers, no nested-object risk) plus a one-line summary, and the client applies that delta directly via the existing Phase 2 store actions (`updateAchievement`, `updateRole`, `updateSkillAtIndex`). Still fully human-in-the-loop — nothing saves until the user reviews the proposed before/after and clicks Approve — just a lighter-weight review surface (inline card) than the full `PatchReview.tsx` page, which is built around the JD pipeline's per-job data model and doesn't fit a general "strengthen my whole profile" flow.

Verified live against the real Gemini backend and Blair's real data (not mocked, not a fixture): completeness scan correctly reported 9% of achievements (11/120) have a quantified metric, 78% of skills (107/137) have recent use, 100% of roles have full descriptions — numbers that make sense given the real data's shape. Submitted a real answer to a real weak achievement (ACH-001); the model correctly merged the new metrics into the existing description rather than replacing or discarding it. Approved it end-to-end to confirm the full save path works (verified in localStorage), then reverted that one field back to its original value immediately after, since this was Blair's real record and the test data didn't belong there permanently.

## Post-plan fix — patchJourney empty-object bug (2026-08-12)

The known follow-up flagged in Phases 4 and 5 (`patchJourney`'s `updatedCareerJourney: { type: Type.OBJECT }` almost certainly hitting the same Gemini empty-object trap) turned out to be real and severe: unlike the Builder/Strengthen endpoints where the trap produces an obviously-empty draft, `patchJourney` feeds straight into `PatchReview.tsx`'s "Approve & Merge JSON" button, which calls `setCareerJourney(updatedCJ)` — so on a real `{}` response, approving a patch would have **silently replaced a user's entire Career Journey with an empty shell**. Never confirmed to have actually happened to Blair's data (no evidence it did), but the failure mode was live in the code.

Rewrote `/api/ai/patchJourney` from "regenerate the whole object" to the same delta pattern used in Phase 5: `PATCH_DELTA_SCHEMA` asks Gemini for only what's new or changed (new achievements/skills/deliverables, updates to existing ones by ID) — every field a flat, fully-typed leaf, nothing left as a bare `OBJECT`. A new `applyCareerJourneyDelta()` function applies that delta to a deep copy of the real Career Journey server-side (assigning IDs via the existing `computeNextIds`, targeting roles/initiatives by ID for new deliverables), so the model never has to reproduce content it isn't changing. `PatchReview.tsx` and the `CareerJourneyPatch` type needed no changes — the response still carries `updatedCareerJourney` and a `summary` with the same string-array shape the UI already renders.

**Verified live**, not just typechecked: called the endpoint directly against Blair's real 3.35 data with synthetic "Approved for patch" context entries (one new achievement, one new skill, both targeting his real Oso Group role). Result: version correctly bumped to 3.36 with a new changelog entry, `ACH-123` and `SK-139` assigned correctly (no ID collisions, including against nested capability skill IDs computeNextIds has to scan for), both fields where they should be — and everything untouched by the patch (all 14 roles, all 311 timeline mappings, `person`, certifications, artifacts) came back byte-for-byte identical. Read-only test — never called `setCareerJourney`, so nothing in Blair's actual stored data was touched.

## Phase 6 — Multi-user note (no new work)

The Matches feature plan already shipped multi-tenant Firestore schema + single-account auth (see memory: `project-matches-feature`, Phase 4, code-complete). Once Phases 3–5 make Career Journey a real "start from zero" surface, that groundwork is exactly what's needed for a second real user to sign up and build their own — nothing further required here, just noting the dependency is already satisfied.

---

## Suggested order

1 → 2 → 3 can each ship independently and are the highest-leverage, lowest-risk work (schema correctness + no more silent data loss). 4 and 5 are the new user-facing feature and share infrastructure, so do 4 before 5. Total: roughly 3–4 weeks of focused work if done sequentially; 1–3 could compress if you want the "no data loss" guarantee fast and are willing to defer the new builder feature.
