# Job-Fit Tool — Iteration Plan

Source: audit findings relayed in chat (original `job-fit-tool-audit.md` not present in the repo as of 2026-08-12 — this plan re-verifies every claim against current source before scoping work). Codebase: `src/pages`, `src/layouts`, `src/components`.

## Status check on the audit's claims

- **Regression bug (Keywords → /journey)**: NOT currently broken. `src/App.tsx:31` defines `<Route path="/journey" element={<CareerJourney />} />`, and `src/pages/Keywords.tsx:437` calls `navigate('/journey')`. That resolves fine today. If a fix to `/` was applied earlier this session, it isn't in the working tree now — confirm before re-touching it, otherwise skip.
- Everything else below — duplicate Fit/Gate feature, duplicate route, jargon, `alert()`, silent patch overwrite, JSON dump — verified present at the line numbers cited.

---

## Workstream 1 — Collapse the duplicate pipeline step (quick win, do first)

**Problem**: `src/layouts/JobLayout.tsx:18-19` lists "Keyword Breakdown" (`/keywords`) and "Context Capture" (`/context`) as separate steps, but `src/App.tsx:36-37` routes both to the same `<Keywords />` component. Clicking step 3 → step 4 does nothing visible.

**Fix**: Merge into a single step.
- `src/layouts/JobLayout.tsx:18-19` → replace both entries with one: `{ name: 'Keyword Mapping & Context', path: `/job/${id}/keywords` }`
- `src/App.tsx:37` → remove the `context` route entirely (or keep as a redirect to `/keywords` for any saved links, but no in-app link should ever produce it).
- Search for any other `navigate(.../context)` calls and repoint them to `/keywords`.

**Effort**: ~30 min. **Risk**: none — purely route/nav cleanup, no state shape changes.

---

## Workstream 2 — Merge the duplicate Fit/Gate feature (biggest structural call — needs your steer)

**Problem**: Two near-identical implementations of the same hard-gate audit + fit scoring, including copy-pasted clarification-form logic:
- The "Diagnostics" tab inside `src/pages/Keywords.tsx` (tab state at line 19, tab button at lines 590-605, full render at lines 816-1062, clarification form at lines 863-978).
- The entire `src/pages/FitAnalysisPage.tsx` (pipeline step 6, `/fit`), which duplicates the same gate cards, clarification form (lines 147-260), and fit-dimension cards (lines 276-336) almost line-for-line.

**Recommendation**: Keep exactly one full implementation, in `FitAnalysisPage.tsx` (step 6). Reasons: it's already the dedicated pipeline step with its own sidebar slot and "Fit & ATS Audit" framing; it runs *after* the Career Journey patch is staged, which is the point where a fit verdict should actually be authoritative (Keywords-tab fit numbers are necessarily provisional since context hasn't been merged into the Journey yet).

**Fix**:
1. In `Keywords.tsx`, delete the `diagnostics` tab entirely: remove `'diagnostics'` from the `activeView` union (line 19), remove the tab button (lines 590-605), remove the full diagnostics render branch (lines 816-1062) and the `showClaraFormForGate`/`claraInputs` state + `submitGateClarification` function (lines 23-24, 57-74) that only exist to feed it.
2. Replace it with a compact, non-duplicated **live snapshot** — the scoreboard that already exists at lines 511-566 ("Live Fit Status" / "ATS Hard Gates" badges) is enough. Add one link/button next to it: "View full Fit & ATS Audit →" that routes to `/job/${id}/fit`.
3. Keep `recalculateFitAndGates()` in `Keywords.tsx` (lines 31-55) as-is — it's what powers that live scoreboard and is genuinely useful for immediate feedback while capturing context. Only the full duplicated *review UI* goes away, not the live scoring.
4. No changes needed to `FitAnalysisPage.tsx` itself — it becomes the single source of truth by default.

**Decision needed from you before I touch this**: confirm you want `FitAnalysisPage.tsx` as the canonical location (not the Keywords tab). If you'd rather go the other way — kill step 6 and make the Keywords-tab diagnostics canonical — the fix is symmetric (delete `FitAnalysisPage.tsx` + its route, keep the tab), just say so and I'll flip the plan.

**Effort**: ~2-3 hrs (mostly deletion + one link, plus manual re-test of the clarification flow end to end). **Depends on**: Workstream 1 (route cleanup) landing first so step numbering is stable.

---

## Workstream 3 — Cockpit jargon cleanup

**Problem**: The Journey *editor* (`EditJourney.tsx`) already uses plain language ("Edit Career Journey," "Profile" — `src/pages/EditJourney.tsx:396,405`). The Journey *cockpit* (`CareerJourney.tsx`, routed at `/journey`) and a few other pages never got that pass:

| File:line | Current text | Suggested |
|---|---|---|
| `CareerJourney.tsx:504` | "Career Journey Cockpit" (h1) | "Career Journey" |
| `CareerJourney.tsx:567` | "Cockpit Profile" | "Profile" |
| `CareerJourney.tsx:1949` | "Ontology Profile Workspace:" | "Profile Workspace:" |
| `CareerJourney.tsx:655` | "Raw Ontology JSON" | "Raw JSON" |
| `CareerJourney.tsx:736` | "Ontology Version" | "Version" |
| `CareerJourney.tsx:512` | "Option 1: Upload Existing Ontology JSON" | "Option 1: Upload Existing Career Journey JSON" |
| `ResumePreview.tsx:196` | "Ontology Re-Sync Engine: Push Refinements Back" | "Push Refinements Back to Career Journey" |
| `PatchReview.tsx:89` | "Synthesizing Ontology Modifications" | "Updating your Career Journey…" |
| `ParseReview.tsx:85` | "Hard Gates / Structured Risks" | "Hard Gates & Risks" |
| `Navbar.tsx:72` | "Master Taxonomy & Tailor" (tagline) | plain descriptive tagline, e.g. "Tailor your resume to any role" |
| `JobLayout.tsx:20` (step name) | "CJ Patch Staging" | "Career Journey Update" |

Also worth a look: `CareerJourney.tsx:11` has an internal comment "Robust 12-Tier Core Ontology Professional Sample" and `normalizeOntology` is used as a function name (lines 304, 320, 358, 369) — those are code-internal, not user-facing, so leave them unless you want full terminology consistency in the codebase too (optional, low priority).

**Effort**: ~1 hr, pure text edits. **Risk**: none. Can run in parallel with anything else.

---

## Workstream 4 — Replace `alert()` with inline banners

**Problem**: 19 `alert()` call sites across 7 files, inconsistent with the inline colored-banner pattern already used elsewhere in the app (e.g. the amber warning box in `Keywords.tsx:427-459`, the gate-risk banner in `FitAnalysisPage.tsx:262-270`).

Call sites:
- `src/components/Navbar.tsx:32,34`
- `src/pages/Keywords.tsx:60,85,102,139,182,452`
- `src/pages/FitAnalysisPage.tsx:51,60,74`
- `src/pages/PatchReview.tsx:36,51`
- `src/pages/CareerJourney.tsx:337,350,2036`
- `src/pages/Intake.tsx:53,82`
- `src/pages/ResumePreview.tsx:259,279`

**Fix**:
1. Build one shared component in `src/components/ui.tsx` — a `Toast`/`InlineBanner` with `variant: 'success' | 'error' | 'info'`, styled consistently with the existing amber/emerald/red banner patterns already in the app.
2. Add a minimal toast host: a small context/hook (`useToast()`) that queues messages and auto-dismisses, mounted once near the root in `App.tsx`. Keep it simple — no need for a dependency, ~40 lines.
3. Swap each `alert(...)` call for `toast.success(...)` / `toast.error(...)`, preserving the existing message copy.

**Effort**: ~2 hrs (component + hook ~45 min, sweeping 19 call sites ~1 hr, spot-check each flow). **Depends on**: nothing — can run anytime, but do it *after* Workstream 2 so you're not updating call sites in code that's about to be deleted (the diagnostics tab has 3 of the 19 alerts).

---

## Workstream 5 — Patch approval: add a diff view before merge

**Problem**: `src/pages/PatchReview.tsx:41-54` (`handleApprove`) applies the AI's full rewritten Career Journey (`updatedCJ`) to global state with a single click, backed only by a text summary (`patch.newSkills`, `patch.newDeliverables`, etc. rendered at lines 108-146) — never a diff against what's actually changing field-by-field. Now that the Journey is the centerpiece of the app, an unreviewed full overwrite is the riskiest single action in the tool.

**Fix**:
1. Before rendering the Approve button, compute a structural diff between `careerJourney` (current) and `updatedCJ` (proposed) — role-by-role, comparing `skills`, `deliverables`, `achievements` arrays. A shallow field-level diff is enough; no need for a generic deep-diff library given the known shape (`src/types.ts`).
2. Render it as an expandable "What's changing" section per affected role: added items in green, removed in red/struck-through, changed fields old→new. Reuse the existing `[NEW]`/`[UPDATE]` badge convention already in `PatchReview.tsx:123-124,133-134`, just apply it at the field level instead of only the summary-string level.
3. Gate the Approve button behind having viewed the diff at least once (optional but recommended — e.g. disable until the diff panel has been expanded).

**Effort**: ~3-4 hrs (diff logic + UI). **Depends on**: nothing structurally, but do after Workstream 4 so the new toast component is available for the "Patch approved" confirmation.

---

## Workstream 6 — Cosmetic cleanup

1. **Raw JSON dump in Patch Review** — `PatchReview.tsx:139-144` renders `JSON.stringify(patch.metaUpdate, null, 2)` directly in a `<pre>`-like block. Replace with a simple key/value row list (version, updated date, etc.) matching the styling already used for the New Skills / Deliverables / Achievements sections above it.
2. **No contextual Journey link mid-pipeline** — add a small "View Career Journey" link/icon in `JobLayout.tsx`'s header (near line 81-91, alongside the FIT/ATS badges) so users can reference their current Journey without leaving the job pipeline. Should open in a way that doesn't lose pipeline state — either a new tab or a slide-over, not a full navigate-away.

**Effort**: ~1 hr combined.

---

## Suggested order of attack

1. **Workstream 1** (route dedupe) — 30 min, unblocks nothing but is a visible bug fix, do it first.
2. **Workstream 2** (merge duplicate Fit/Gate) — biggest change, needs your confirmation on direction before I start.
3. **Workstream 3** (jargon) — do anytime, safe to parallelize with 2.
4. **Workstream 4** (alert → banner) — after 2, so we're not editing soon-to-be-deleted code.
5. **Workstream 5** (patch diff view) — after 4, reuses the toast component.
6. **Workstream 6** (cosmetic) — anytime, lowest priority.

## Open decision before implementation starts

Confirm: keep **`FitAnalysisPage.tsx`** (step 6) as the single canonical Fit/Gate review, and strip the duplicate down to a live-scoreboard-plus-link inside `Keywords.tsx`? If yes, I'll start on Workstream 1 and 2 together.
