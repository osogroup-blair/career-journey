# Architecture

Technical reference for how Career Journey actually works today. This is the ground-truth doc — if it disagrees with `README.md`'s narrative sections, this file wins. Written primarily for a coding agent picking up work in this repo; see [AGENTS.md](AGENTS.md) for operational guidance (how to run things, known gaps, gotchas).

## Contents

- [High-level shape](#high-level-shape)
- [Frontend](#frontend)
- [Backend / API surface](#backend--api-surface)
- [AI provider abstraction](#ai-provider-abstraction)
- [Billing & plans](#billing--plans)
- [Admin console](#admin-console)
- [Support / feedback loop](#support--feedback-loop)
- [Data model](#data-model)
- [Auth model](#auth-model)
- [Known inconsistencies / incomplete migrations](#known-inconsistencies--incomplete-migrations)

---

## High-level shape

- **Single Express app** (`server.ts`, ~1950 lines) serves both the API and, in production, the built SPA. In dev, Vite runs in middleware mode inside the same process (`npm run dev` → `tsx watch server.ts`); there's no separate `vite dev` server.
- **Single Zustand store** (`src/store.ts`) is the frontend's only source of truth for jobs, matches, Career Journey, billing state, admin flag, and in-flight AI tasks. Every page reads from it; every mutation goes through it.
- **Dual persistence** via a `DataStore` interface (`src/data/DataStore.ts`): `LocalStorageDataStore` (default, no backend account needed) or `FirestoreDataStore` (once Firebase env vars are set and the user signs in). Both implement the same interface, so pages never know which one is active.
- **Platform AI runs through the Oso Model Router** (with local Ollama as the zero-config fallback); **BYOM** users can bring Gemini, OpenAI, Anthropic or Ollama, but only for 3 of 22 endpoints — see [AI provider abstraction](#ai-provider-abstraction).
- **Stripe billing**, an **admin console**, and a **support-ticket system** are layered on top of the original single-user job-pipeline app; all three were added after the core pipeline and are documented in `payment-system-plan.md` / `admin-support-feedback-plan.md` / `admin-support-hardening-plan.md`, which are worth reading for *why* things are shaped the way they are, not just *what* they are.

---

## Frontend

### Routing (`src/App.tsx`)

`HashRouter`. Global chrome (`Navbar`, `AiActivityIndicator`, `FeedbackWidget`, `Footer`) wraps every route inside a `ToastProvider`. Auth gating happens one layer up, in `src/main.tsx`: if `isFirebaseConfigured` (i.e. `VITE_FIREBASE_*` env vars are set), the entire `<App/>` tree is wrapped in `<AuthGate>`; otherwise the app boots straight into local-only mode with no sign-in at all.

| Path | Component | Notes |
|---|---|---|
| `/` | `Dashboard` | Home / action hub: title row with the next-step CTA (`computeJourneyProgress`; full / compact / hidden), then two collapsible sections — **Career Journey** (summary, health) and **Job search** (count tiles that filter the pipeline in place, Discover CTA (same gate as the Navbar link) + matches to review beside the pipeline with stalled-job flags). Section and CTA state persist per browser via `useLocalPreference`. Derived in `src/lib/dashboardSummary.ts`, cards in `src/components/dashboard/` |
| `/edit` | `EditJourney` | "Simple Editor" — ten sections (Profile, Roles, Projects, Achievements, Skills, Capabilities, Education, Certifications, Methodologies, Client Engagements), each a searchable, filterable, paginated list with inline editors; Cmd/Ctrl-K searches every section; per-section AI assistant. List state lives in the URL (`#/edit?section=skills&q=okr&item=SK-001`), which is how other pages deep-link to one item (`editPathFor` in `src/lib/journeySections.ts`). See below |
| `/build` | `CareerJourneyBuilder` | Bootstrap a Career Journey: resume extraction, guided chat, or blank template |
| `/strengthen` | `StrengthenJourney` | Gap-filling flow driven by `careerJourneyGaps.ts` |
| `/spotlight` | `Spotlight` | Career Spotlight editor: curation settings beside a live preview of the hiring-manager page (`src/components/spotlight/`), built from `buildSpotlightSnapshot` (`src/lib/spotlightSnapshot.ts`, an allowlist projection — never spread journey objects into it). Settings are per browser until publishing ships; see `career-spotlight-plan.md` |
| `/journey` | `CareerJourney` | "Advanced Editor" — full raw-schema editor, 2929 lines, every section as a tab |
| `/matches` | `Matches` | Job discovery / bulk AI scan, gated to paid plans |
| `/discover` | `Discover` | Scheduled StillOpen job search from a CV snapshot; pick listings to light-scan, promote into the pipeline. Admin-only until licensed — see [Job Discovery](#job-discovery-stillopen) |
| `/migrate` | `Migrate` | One-time localStorage → Firestore copy |
| `/applications` | `JobTracker` | Board (Kanban), List and Archived views of pipeline jobs |
| `/compare-offers` | `CompareOffers` | AI comparison across every job in the Offer stage |
| `/upgrade` | `Upgrade` | Plan cards → Stripe Checkout, or Customer Portal link |
| `/settings` | `Settings` | BYOM provider/model/key management |
| `/feedback` | `MyFeedback` | User's own support tickets + reply thread |
| `/admin` (+ children) | `AdminLayout` → `AdminUsers`/`AdminTickets`/`AdminFlags`/`AdminModels`/`AdminPrompts` | Behind `RequireAdmin` (client-side UX gate only — see [Auth model](#auth-model)) |
| `/terms`, `/privacy`, `/refunds` | `Terms`/`Privacy`/`Refunds` | Static, wrapped in `LegalPage`, carry a permanent "draft, not attorney-reviewed" banner |
| `/job/:id/*` | `JobLayout` → 7-stage stepper | See below |

**Per-job pipeline** (`src/layouts/JobLayout.tsx`), the 7-stage stepper:

`intake → parsed → rating → tailored → apply → interview → offer`

The pipeline used to have more top-level stages (`keywords`, `context`, `patch`, `fit` as separate steps; `strategy`/`export`/`preview`/`cover-letter` as separate steps). These were consolidated into `rating` (4 sub-tabs: Fit & Gate, Keywords, Gaps, Patch) and `tailored` (4 sub-tabs: Resume, Cover Letter, Assistant, Form) respectively — see `job-fit-tool-iteration-plan.md` for the rationale. The old URLs still resolve via `<Navigate replace>` redirects in `App.tsx:79-87`, so don't remove them without checking for external bookmarks/links first.

### State (`src/store.ts`)

Zustand store, `useStore`. Key shape:

```
jobs: Record<string, JobAnalysis>
matches: Record<string, JobMatch>
matchPreferences: MatchPreferences
careerJourney: CareerJourney
activeAiTasks: Record<string, AiTask>
billing: BillingState | null      // null = local-only mode, no paywall
isAdmin: boolean                   // from the `admin` custom claim on the ID token
```

`hydrate()` loads all of the above (jobs, matches, journey, billing, admin claim) in parallel on boot, and migrates any legacy job shape via `migrateLegacyJob()`. `runAiTask()` is the single choke point every AI-triggering UI action goes through: fire-and-forget from the caller, keeps running even if the user navigates away, auto-advances pipeline stage where eligible, surfaces toasts via an imperative `toastBridge` (so the store, which isn't a React component, can still trigger UI toasts). `AiActivityIndicator` renders whatever's in `activeAiTasks`.

### Persistence (`src/data/`)

- `DataStore.ts` — the interface. Note `getBilling()` and `getAllowedModels()` are explicitly read-only from the client (both are written server-side only).
- `LocalStorageDataStore.ts` — everything under `career-journey:*` keys. `getBilling()`/`getAllowedModels()` return `null` (no paywall applies locally).
- `FirestoreDataStore.ts` — everything under `users/{uid}/...`. `getBilling()` falls back to `defaultBillingState()` (free plan) rather than `null` — this distinction matters: `null` means "local-only, no gating at all," a default free-plan object means "cloud, gate as free tier." Conflating these was a real shipped bug, fixed in Phase 2 of `payment-system-plan.md`.
- `index.ts` — module-level swappable binding; `AuthGate.tsx` calls `setDataStore(new FirestoreDataStore(...))` on sign-in.

### Career Journey schema (`src/types/careerJourney.ts`)

The canonical Zod schema for the whole profile: `meta`, `person`, `education`, `certifications`, `capabilities → functions → skills`, `roles → initiatives → deliverables`, top-level `achievements` (linked to roles via `role_ids`/`links.timeline_mappings`, not embedded), `skills_index`, `vocabularies`, cross-reference `links`, `application_artifacts`, `interview_answers`, `methodologies`, `customer_engagements`. Every object schema is `.passthrough()` so unrecognized/future fields survive a round-trip through the AI pipeline rather than being silently dropped.

`src/lib/careerJourneyIds.ts` (re-exported by `server/careerJourneyVersioning.ts`) allocates new IDs (per-prefix counters: `SK, CAP, FUNC, INIT, DEL, ACH, ROLE, EDU, METH, ENG, CERT, MAP`) and bumps the `major.minor` version string whenever a patch is applied — the LLM never invents IDs itself. The client uses the same allocator, so ids made in the editor are sequential too.

**Editing the Career Journey.** Id-keyed edits go through `src/lib/journeyMutations.ts` (pure recipes; every delete also strips references to the removed ids from `links.*` and other entities' id arrays) via the store's single `mutateCareerJourney(recipe)` write path; every many-to-many link has a setter from each side (skill ↔ role via `role.skills`; capability ↔ role via `capability` timeline mappings; achievement ↔ role via `role_ids` + mappings; skill ↔ achievement/education/function; capability ↔ education), so the Simple Editor manages a relationship from whichever object you're on — only deliverable-level links (`skill_ids`, `capability_alignment`) are edited on the project and shown read-only elsewhere; the older store actions (`updateRole`, `addAchievementToRole`, …) are thin wrappers over it. The Simple Editor's section registry and search are `src/lib/journeySections.ts` / `src/lib/journeySearch.ts`; its components live in `src/pages/editJourney/` and `src/components/journey/` (fields, entity picker, `RoleResumeDetails`, shared with `/journey`). The Dashboard's Career Journey summary card resolves each role's id-linked evidence with `toRoleView` (`src/lib/careerJourneyRoleEvidence.ts`) — real data keeps `role.achievements`/`role.skills` as id strings.

---

## Backend / API surface

`server.ts` mounts middleware groups by path prefix before any individual route:

| Prefix | Middleware |
|---|---|
| `/api/ai` | `requireFirebaseAuth` + `requireWithinAiQuota` |
| `/api/sources` | `requireFirebaseAuth` + `requireAnyPaidPlan` |
| `/api/discovery` | `requireFirebaseAuth` + `requireFeature("job_discovery")` (admin-only while unlicensed) |
| `/api/admin` | `requireFirebaseAuth` + `requireAdmin` |
| `/api/export` | `requireFirebaseAuth` |
| `/api/billing` | `requireFirebaseAuth` |
| `/api/support` | `requireFirebaseAuth` |
| `/api/user` | `requireFirebaseAuth` |

All of these no-op in local dev without `FIREBASE_SERVICE_ACCOUNT_JSON` set, **except** `requireFirebaseAuth`, which fails closed (500) if `NODE_ENV === "production"` and Firebase Admin isn't configured. The Stripe webhook route is registered with `express.raw()` *before* the global `express.json()` — required because Stripe signature verification needs the raw body.

Individual handlers re-derive `uid`/plan/admin status from the verified token rather than trusting the request body — this is called out explicitly in a comment at `server.ts:220-221` and is the load-bearing security assumption for the whole `/api/*` surface.

### Route groups (full list)

**Billing** — `POST /api/billing/webhook`, `createCheckoutSession`, `createPortalSession`, `byomSettings`, `validateByomKey`.
**Support** — `POST/GET /api/support/tickets`, `GET/POST /api/support/tickets/:id/messages`.
**User & Privacy** — `GET /api/user/export-data` (full GDPR data archive), `DELETE /api/user/account` (self-service account purge — see [Data model](#data-model) for what deletion removes).
**Admin** — `/api/admin/tickets*` (list/get/update/reply/screenshot), `/api/admin/featureFlags` (get/set), `/api/admin/allowedModels` (set), `/api/admin/users` (list + plan override + quota reset + comp toggle), `GET /api/admin/users/:uid/detail`, `POST /api/admin/users/:uid/status` (suspend/reactivate), `POST /api/admin/users/:uid/send-reset`, `DELETE /api/admin/users/:uid`, `GET /api/admin/audit-logs`, `/api/admin/prompts*` (list/save/restore/test-run), `GET /api/admin/ai-calls` (the AI call log below, newest first, `?limit=` up to 1000).
**AI pipeline** — `parse`, `keywords`, `clarifyQuestions`, `fitScore`, `auditGates`, `liteScan` (also individually gated by `requireAnyPaidPlan`), `patchJourney`, `resumeStrategy`, `generateResume`, `regenerateResumeSection` (rewrites one summary/skills/role section in place), `scoreResume` (Tailored Application stage's on-demand AI review; the live keyword-match score beside it is client-side, `src/lib/resumeScore.ts`), `coverLetter`, `applicationAssistant`, `generateFormAnswers`, `interviewPrep`, `interviewPrepChat`, `offerGuidance`, `compareOffers`, `buildJourneyFromResume`, `buildJourneyChat`, `refineFromInterviewAnswer`, `journeySectionAssist` (the Simple Editor's per-section assistant: sends only that section's slice of the journey from `buildSectionContext`, and returns draft proposals cleaned by `sanitizeProposals` — allowed fields only, links to existing ids only; the user accepts each one, which applies it via `applyProposal` and appends a line to `meta.version_X_Y_changes`, all in `src/lib/journeyAssist.ts`), `discoverySearchProfile` (CV text → StillOpen searches; gated to `job_discovery` *before* the quota middleware).
**Sources** — `fetchCompanyJobs` (Greenhouse/Lever board scrape), `fetchJobFromUrl` (structured board parse with generic-HTML fallback).
**Discovery** (`server/discovery/routes.ts`, an Express Router mounted from `server.ts`) — `GET/PUT /api/discovery/profile`, `POST /api/discovery/run` (starts a run, returns 202; the page polls the profile), `GET /api/discovery/jobs` (re-checks status first if older than 6h), `GET /api/discovery/jobs/:id/detail` (proxies the full ad, only for ids already in the user's list), `PATCH /api/discovery/jobs/:id`, `GET /api/discovery/listings/:id/status` (the Apply stage's still-open check — only for a listing behind one of the caller's own jobs or matches).
**Export** — `resume.docx`, `resume.pdf`, `coverLetter.docx`, `coverLetter.pdf`. The resume PDF is printed by headless Chrome from `/print.html` (`src/print/main.tsx`, the same `ResumeTemplates.tsx` components the Tailored Application page shows) via `server/pdfRenderer.ts`, falling back to `server/pdfBuilder.ts` if no Chrome is found (`CHROME_PATH`). The resume `.docx` is a per-template hand-built approximation in `server/docxBuilder.ts` — mirror any template change there. The request carries `template` (`classic|modern|executive`).
**Health** — `GET /api/health`.

### Supporting modules

- **`server/featureFlags.ts`** — single Firestore doc `config/featureFlags` (`freeLifetimeLimit`, `proMonthlyLimit`, `byomBurstPerMinute`, `byomDailyLimit`, `killSwitches: {matches, aiPipeline}`), env-var fallbacks, 30s in-memory cache invalidated on write.
- **`server/promptStore.ts`** (~31KB) — 20 hardcoded default prompt templates, one per pipeline stage. Admin overrides persist as **local JSON files** under `server/promptConfig/{id}.json`, not Firestore — a deliberate dev-mode shortcut per an inline comment ("local JSON file in dev; Firestore once that's live"), meaning admin prompt edits currently don't survive a redeploy to a fresh environment.
- **`server/knowledge.ts`** — loads `server/knowledge/*.md` once at process startup into `FULL_KNOWLEDGE` (six files, prepended as system prompt to most `/api/ai/*` calls) and `CAREER_JOURNEY_BUILDER_KNOWLEDGE` (one file, used only by the three Builder endpoints). These `.md` files are the job-pipeline AI's own prompt content — not developer docs — and are provider-agnostic already (no hardcoded references to Gemini/OpenAI/Anthropic).
- **`server/rateLimiter.ts`** — `requireWithinAiQuota`: falls back to a flat in-memory daily cap for unauthenticated/no-admin-app requests; for authenticated BYOM users, layers an in-memory per-minute burst check on top of the Firestore-backed quota transaction in `billing.ts`.
- **`server/email.ts`** — thin Nodemailer wrapper for Gmail SMTP ticket notifications (`SMTP_USER`, `SMTP_PASS`), separate from Firebase Auth's built-in mailer (which can only send fixed verification/reset templates). Never throws; no-ops (logs only) if `SMTP_USER` or `SMTP_PASS` is unset.
- **`src/lib/resumeBuild.ts`** — the deterministic half of tailored-resume generation, shared by client and server. A job's `resumeBuildOptions` (page target 1/2, each Career Journey role as `full` / `condensed` / `excluded`, optional per-role bullet cap, free-text guidance) drives four things. `projectCareerJourneyForResume` strips non-full roles before the prompt. `buildResumeConstraintsBlock` appends a "Resume Constraints" block after the admin-editable prompt text, so an override can't drop it. `enforceResumeConstraints` runs on the model's output: it drops entries for non-full roles (matched by `roleId`, falling back to company name), caps bullets to the page-target budget, orders roles by recency, and rebuilds `earlierExperience` (condensed one-liners) from the Career Journey, never the model. Defaults come from `person.resume_preferences` and `role.resume_default` in the Career Journey. `src/lib/resumeEdits.ts` holds the immutable edit helpers behind the preview's hover controls.
- **Tailored resume flow** — Rating's Finalize only navigates. The Tailored Application stage then goes Build Settings → `resumeStrategy` → editable Strategy Review → `generateResume` → editor. The editor has per-bullet and per-role hover controls, single-section regenerate, and a page-count estimate (`src/hooks/usePageEstimate.ts`). "Build without review" and the keyword-gate rebuild run both AI calls back to back (`runGenerateTailoredApplication`).
- **`server/docxBuilder.ts`** — builds resume (three templates) and cover-letter `.docx` binaries with the `docx` package.
- **`server/pdfRenderer.ts`** / **`server/pdfBuilder.ts`** — resume PDF via headless Chrome (matches the screen) / basic pdfkit fallback and cover-letter PDF.

### `server/scripts/`

| Script | npm alias | Purpose |
|---|---|---|
| `seedDemo.ts` | `seed:demo` | Idempotent reset of the shared demo account (Pro-comped, full fixture data from `src/lib/demo/`) |
| `setAdmin.ts` | `set:admin -- <email> [--revoke]` | Grants/revokes the `admin` Firebase custom claim |
| `seedAllowedModels.ts` | `seed:allowedModels` | Overwrites `config/allowedModels` with the current BYOM model list |
| `verifyAiProviders.ts` | `verify:ai` | Smoke-tests the pilot schemas against every provider with a configured key |
| `verifyOso.ts` | `verify:oso` | Sends every prompt's sample input to its mapped Oso alias and checks the reply is schema-valid |
| `migrateAiConfigToOso.ts` | `migrate:oso` | Dry-run by default (`-- --apply` to write): moves stored AI defaults / per-prompt overrides off direct providers onto Oso aliases |
| `pullBacklog.ts` | `backlog:pull` | Exports triaged tickets to gitignored `backlog/*.md` |
| `cleanupUsers.ts` | `cleanup:users` | Clean up stale test/demo user accounts from Auth and Firestore |

---

## AI provider abstraction

`server/ai/` defines one interface, `StructuredAIClient`: `{ provider, generateStructured({systemPrompt, prompt, schema: ZodType<T>}) => Promise<T> }`. Each provider implementation converts a single Zod schema into its own native structured-output mechanism, then **re-validates the parsed result against the same Zod schema** before returning (providers have been observed to return malformed shapes for nested/nullable schemas, per an inline comment):

- **Gemini** (`geminiClient.ts`, default `gemini-3.1-pro-preview`) — Zod → `zodToGeminiSchema.ts` → Gemini's `Type.OBJECT/STRING/...` `responseSchema` format. `zodToGeminiSchema` goes through Zod v4's `z.toJSONSchema()` first, then walks the tree; it explicitly throws on `$ref`/`$defs` (recursive/reused sub-schemas) — not yet needed by any real schema, but a real limitation if one is added.
- **Anthropic** (`anthropicClient.ts`, default `claude-sonnet-5`) — no native structured-output mode, so uses a single forced tool call (`tool_choice: {type:"tool", name:"emit_response"}`) with `input_schema: z.toJSONSchema(schema)`.
- **OpenAI** (`openaiClient.ts`, default `gpt-5.6-terra`) — `response_format: {type:"json_schema", ...}` in **non-strict** mode (deliberate — this app's schemas have genuinely optional fields that `strict:true` doesn't tolerate well).

**Platform provider: the Oso Model Router** (`osoClient.ts`, `platformProvider.ts`). Platform (Free / Pro Monthly) traffic goes to `https://models.oso.group` (`OSO_ROUTER_URL`) — an OpenAI-compatible gateway (`/v1/chat/completions`, `/v1/embeddings`, `/v1/models`) that exposes model *aliases* (`oso/general`, `oso/fast`, `oso/reasoning`, `oso/code`, `oso/frontier`, …). Each alias tries an open-weight model on Vertex AI first and falls back through Gemini/Claude/GPT, so the app has one credential (`OSO_AI_API_KEY`) and no direct Gemini/OpenAI/Anthropic platform keys. Requests are deliberately minimal — `model` + `messages` only. No `response_format`, `tools`, `task_type` or `routing` object is sent by default, because the router turns each into a required capability or eligibility filter (422 `unsupported_capability`, or a single eligible model at `confidential` whose circuit breaker kept opening). JSON output is requested in the prompt and parsed/validated app-side. `OSO_DATA_CLASSIFICATION`, if set, opts back in to sending `routing.data_classification` (it must not exceed the Oso client's ceiling or every call gets a 403). Notes:
- **Résumé/career data is therefore sent with the router's default classification, not `confidential`.** Revisit once a fast target is eligible at `confidential`.
- Prompt → alias assignments live in `server/ai/osoAliasMap.ts`; verify with `npm run verify:oso`.
- Failures surface as `OsoRouterError` (router error envelope + `request_id`), mapped in `server.ts`'s `handleAiRouteError` to 429/503/502 without leaking upstream messages.
- `usage` is normalized by the router; `aiUsageLogs` additionally store `requestId` (and `actualModel` when the router reports `x-oso-actual-model`, which the chat-completions endpoint currently does not).
- Every AI call, success or failure and whatever the provider, also goes to the operational call log (`server/aiCallLog.ts`): one `[ai-call] …` stdout line plus a doc in the top-level `aiCallLogs` collection (prompt id, requested/actual model, how it was resolved — prompt override / global default / BYOM / admin test run — latency, tokens, error code, router request id, uid; never prompt or response content). The wrapping happens where clients are handed out (`getLegacyClientForPrompt` in `server.ts`, `getAIClientForRequest`), so new endpoints get it for free. Admin page: `#/admin/ai-calls`. Docs carry an `expireAt` 30 days out for a Firestore TTL policy, which has to be enabled once in the console.
- Context windows for `oso` models come from `GET /v1/models` (10-minute cache, `contextWindows.ts`); admin overrides still win.
- Admin: AI Defaults shows router status (`GET /api/admin/oso/status`); Models has "Sync from Oso" (`POST /api/admin/allowedModels/syncOso`). `npm run verify:oso` exercises every prompt against its alias; `npm run migrate:oso` rewrites stored admin config off direct providers. `.mcp.json` registers the router's read-only MCP server (`list_models`, `router_health`, `get_openapi_spec`) for coding agents — it cannot run inference.

**Routing** (`getAIClient.ts`, `getAIClientForRequest`): no admin app / no uid → platform client. Non-BYOM plan → platform client (provider/model resolved by `resolveModelForPrompt`: per-prompt override > global default; only `oso` and `ollama` are valid platform providers, and a stale stored `gemini/openai/anthropic` value falls back to the platform default with a warning). BYOM plan → reads `X-BYOM-Key`/`X-BYOM-Provider`/`X-BYOM-Model` request headers (provider/model fall back to the user's saved `billing.byomProvider`/`byomModel` if headers are missing), builds a fresh client per request. Missing key/provider — or `oso` as a BYOM provider, which is a platform credential and never user-selectable — throws `MissingByomKeyError`, mapped to a 400 (not 500).

**BYOM key handling**: the raw key is *never* stored server-side. `src/lib/byomKeyStorage.ts` is the only place it's persisted — browser `localStorage`, scoped to the device — and `aiClient.ts` attaches it as a header on every AI request. `POST /api/billing/validateByomKey` exercises the real client abstraction with a trivial schema to test a key before the user saves it, and never persists it regardless of outcome. Only the **choice** of provider+model is saved server-side (`POST /api/billing/byomSettings` → `billing.byomProvider`/`byomModel`).

**Migration status — read this before touching any `/api/ai/*` route.** Only four endpoints, `keywords`, `fitScore`, `discoverySearchProfile` and `journeySectionAssist`, go through `getAIClientForRequest`/the Zod-schema abstraction (`server/ai/schemas.ts`; `journeySectionAssist` builds one schema per editor section). Every other `/api/ai/*` endpoint — and the admin prompt Test Run — goes through `getLegacyClientForPrompt` in `server.ts` → `createLegacyGenAI` (`server/ai/legacyGenAIShim.ts`), which speaks a Gemini-style `generateContent` surface with hand-written Gemini `Type.*` schemas (`legacySchemas.ts`, converted to JSON Schema by `geminiSchemaToJsonSchema.ts`). That path resolves the *platform* provider only (Oso or Ollama), so **BYOM subscribers' calls to everything except `keywords`/`fitScore`/`discoverySearchProfile`/`journeySectionAssist` run on the platform, not their own key/provider choice**. Known, tracked gap.

**Allowed models** (`config/allowedModels`, `src/types/aiModels.ts`): `Record<AIProviderId, AllowedModel[]>` (including a platform-only `oso` list synced from the router), readable by any signed-in user, admin-write-only. Seeded list (`seedAllowedModels.ts`) — 3 tiers per provider: Gemini (`gemini-2.5-pro`, `gemini-3.7-flash`, `gemini-3.5-flash-lite`), OpenAI (`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`), Anthropic (`claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`). Note the Gemini client's own hardcoded default (`gemini-3.1-pro-preview`) isn't actually in this seed list — a minor inconsistency, not yet reconciled.

---

## Billing & plans

Plans (`src/types/billing.ts`): `free | pro_monthly | byom_monthly | byom_yearly`.

Entitlement state lives at `users/{uid}/meta/billing`, lazily created with `defaultBillingState()` on first read, and is **server-write-only** (Firestore rules: `read: owner, write: false`) — the client can display it but never set it. Two independent gates:

- **`requireAnyPaidPlan`** (`server/billing.ts`) — hard 403 for free-tier users on `/api/sources/*` and `/api/ai/liteScan` (i.e. Matches/Job Discovery is entirely paywalled). Comped users always pass. Also enforces the `killSwitches.matches` feature flag (503 if tripped).
- **`checkAndConsumeAiQuota`** (`server/billing.ts`, atomic Firestore transaction, invoked by `requireWithinAiQuota`) — the general `/api/ai/*` quota gate:
  - `comped: true` → unlimited, no consumption tracked.
  - `free` → lifetime cap (`freeLifetimeLimit`, default 20), never resets.
  - `pro_monthly` → per-calendar-month cap (`proMonthlyLimit`, default 100); resets on an elapsed-calendar-month approximation of the billing period, not the real Stripe period boundary (a known simplification, noted in code).
  - `byom_monthly`/`byom_yearly` → no spend cap (the user pays their own provider), just an abuse-guard: 24h rolling cap (`byomDailyLimit`, default 500) plus a separate in-memory per-minute burst cap (`byomBurstPerMinute`, default 30, enforced in `rateLimiter.ts` since a Firestore transaction is too slow for sub-minute windows).
  - Also checks the global `killSwitches.aiPipeline` emergency stop.

**Stripe** (`server/stripe.ts`): one Product, three recurring Prices via env vars. `createCheckoutSession` carries the Firebase `uid` two ways (`client_reference_id` and `subscription_data.metadata.firebaseUID`) for webhook resolution. Webhook handler dedupes via a `stripeEvents/{eventId}` idempotency ledger and handles `checkout.session.completed`, `customer.subscription.created` **and** `.updated` (both route to the same handler — Stripe fires `created`, not `updated`, on a brand-new subscription; missing this was a real shipped bug, see `payment-system-plan.md`), `customer.subscription.deleted` (reverts to free), `invoice.payment_failed` (marks `past_due`).

`comped: boolean` on the billing doc is an admin override (toggled via `POST /api/admin/users/:uid/comp`) that bypasses both the paid-plan gate and all quota checks — but is deliberately checked *after* the kill switches, so an emergency stop still overrides even a comped account.

---

## Admin console

Five pages under `/admin/*` (`AdminLayout` sidebar + `RequireAdmin` client gate): **Users** (cross-references every Firebase Auth account with its billing doc — plan, subscription status, usage, comp toggle; not paginated), **Tickets** (support triage), **Flags** (feature-flag/quota editor), **Models** (BYOM allowed-models curation), **Prompts** (AI prompt-template editor with restore-default and a Gemini-only test-run for the `parse` template).

Every admin page's real security boundary is server-side (`requireAdmin` on `/api/admin/*`) — the client-side `RequireAdmin` component exists purely so non-admins don't see broken/empty admin UI, and says as much in its own source comment.

---

## Support / feedback loop

`FeedbackWidget.tsx` (floating, global) → `POST /api/support/tickets` → `MyFeedback.tsx` (user's own thread) / `AdminTickets.tsx` (triage) → `npm run backlog:pull` → `backlog/*.md`.

- Screenshot capture is client-side (`html2canvas-pro`), opt-in per submission, uploaded directly to Firebase Storage via `uploadTicketScreenshot` in `src/lib/supportClient.ts`. Users can view their own attached screenshot in `MyFeedback.tsx` via signed URLs (`getTicketScreenshotUrlForUser`).
- `adminNotes` is documented as internal-only and must never reach the ticket's owner — enforced via a `stripAdminFields` helper applied in the user-facing read paths only. If you touch `server/support.ts`, keep this filter in place; it was a real shipped leak, fixed in the hardening pass.
- Ticket list queries sort in-memory rather than using Firestore `.orderBy()`, because the required composite indexes were never deployed (same CLI-access constraint as above). Fine at current volume; a real cost at scale.
- Notifications (new ticket, user reply, admin reply) are fire-and-forget emails via Nodemailer (Gmail SMTP), no-op if `SMTP_USER`/`SMTP_PASS` are unconfigured.
- `pullBacklog.ts` only exports tickets with `triageType` in `{bug, enhancement}` and `status` in `{triaged, backlogged, in_progress}` — a ticket disappears from `backlog/` the moment it's marked `resolved`, regardless of whether a fix has actually shipped.

---

## Data model

### Firestore

Client-writable (owner-only, `users/{uid}/...`):
`careerJourney/current`, `jobs/{jobId}`, `matches/{matchId}`, `matchPreferences/current`, `promptConfigs/{promptId}` (+ `changeLog` subcollection).

> Note: `promptConfigs` here is a **separate, per-user** prompt-override mechanism from the server's admin-level `promptStore.ts` file-based overrides — two distinct override systems currently coexist and are not reconciled. Confirm which one a given code path actually reads before assuming "prompt overrides" means one specific thing.

Server/Admin-SDK-only (client read-only or fully denied):
- `users/{uid}/meta/billing` — owner-read, write:false.
- `config/featureFlags`, `config/allowedModels` — any-signed-in-user-read, write:false.
- `stripeEvents/{eventId}` — fully denied to clients (idempotency ledger).
- `tickets/{ticketId}` (+ `messages` subcollection) — top-level (not nested under `users/`, so admin can query cross-account), owner-read-own-only, write:false.
- `users/{uid}/discovery/profile`, `users/{uid}/discoveredJobs/{stillopenId}`, `discoverySchedules/{uid}` — Job Discovery; fully denied to clients, read/written only through `/api/discovery`. `discoverySchedules` is top-level so the scheduler's `nextRunAt <= now` query needs no collection-group index. All three are included in the GDPR export and removed by both account-delete paths.

**Account deletion** — both `DELETE /api/user/account` (self-service: data, then Auth user) and `DELETE /api/admin/users/:uid` (Auth user, then data, then `delete_user` audit log) go through `purgeUserData` in `server/userData.ts`, which runs `recursiveDelete` on `users/{uid}`. Firestore never cascades a doc delete to its subcollections, so this is what removes everything above plus `meta/billing` and `aiUsageLogs` — and any per-user subcollection added later, with no code change. Top-level per-user records (`tickets/`, `aiCallLogs/`) are left in place.

`firestore.indexes.json` is currently empty by design — the codebase avoids queries that would need a composite index (see the support-ticket in-memory-sort note above).

### Storage

`ticketScreenshots/{uid}/{fileName}` — intended rules (owner-write, <5MB, image/* only, read:false always) are written in `storage.rules` but **not deployed**; see [Support / feedback loop](#support--feedback-loop).

---

## Job Discovery (StillOpen)

`/discover` searches [StillOpen](https://stillopen.work/agents)'s public API (fully-remote listings, each re-checked against the employer's own board) on a schedule the user picks, from a plain-text CV of their Career Journey.

- **CV snapshot** — `careerJourneyToText` (`src/lib/careerJourneyText.ts`) is deterministic and omits contact details; "out of date" is a string comparison with a fresh render. Refreshing the CV never rewrites the searches.
- **Searches** — StillOpen is keyword + exact-value filters (`loc`, `level`, `area`, `pay`), not CV-in. `discoverySearchProfile` (AI, user-triggered) proposes 3–6 queries and filters; `sanitizeAiSearchProfile` drops any value StillOpen wouldn't accept. Gotchas checked live: it takes `uk`, not `gb`; regions are `worldwide|emea|apac|latam|na` only; most listings have `level: unspecified`, so any level filter hides them. New country codes are probed against the live API on save.
- **Runs** (`server/discovery/runSearch.ts`) — no AI. Fan out queries × filters (capped at 24 calls), merge into `discoveredJobs` keeping the user's state (dismissed/scanned/promoted), status re-check everything else, delete closed listings and untouched ones not found for 14 days.
- **Scheduler** (`server/discovery/scheduler.ts`) — in-process `setInterval` every 15 min (the server is one long-running container), started in `app.listen`. Off without Firebase Admin or with `DISCOVERY_SCHEDULER=off`. Each run is claimed with a transaction on `discoverySchedules/{uid}.lockedUntil`, so extra replicas or a simultaneous "Search now" can't double-run a user. A user who has lost access has their discovery data deleted on their next due tick.
- **StillOpen client** (`server/discovery/stillOpenClient.ts`) — one process-wide throttle (~40/min, under the 60/min per-IP limit, since every user's run leaves from this server's IP), 10s timeouts, one retry honouring `Retry-After`, Zod-validated requests and responses.
- **Picking jobs** — the page ranks listings cheaply (`src/lib/discoveryRank.ts`), the user selects up to 15 to "Quick scan": the full ad is fetched on demand (never stored in `discoveredJobs`), then the existing light scan runs via `scanPostingIntoMatch` (`src/lib/matchScan.ts`, shared with Matches) and creates a `JobMatch` with `source: 'stillopen'`.
- **What a scan carries over** — the ad is built from StillOpen's `description_html` with `htmlToText` (`server/htmlToText.ts`, shared with the Greenhouse/Lever source routes), because its `description_text` has every line break stripped (one 7k-character line, checked live), which also left nothing for JD segmentation to split on. The match also gets `applyUrl` (the employer's own application page), `compensationRange` and `locationNotes` (`src/lib/discoveryFormat.ts`). Scanned rows on Discover show "Apply on employer site" and a "View JD" toggle; Matches cards show an Apply link.
- **Into the pipeline** — "Add to pipeline" is `promoteMatch`, built on `buildJobFromMatch` (`src/lib/matchScan.ts`): `jobLink` is the apply link (falling back to the posting link), salary/location fill the job header, and — for every promoted match, not only StillOpen — `jdSegments` are computed with the shared `segmentJdText` (`src/lib/jdSegments.ts`), since a scanned match skips the parse step that normally assigns them. A StillOpen job also carries `source: { kind: 'stillopen', listingId, listingUrl, status… }`, kept apart from `jobLink` for attribution. Promoting a match scanned before the apply link was carried over fetches it first. Back in the job, **Job Intake** opens on a read-only overview for any already-parsed job (not the paste form): role, links, salary/location, the quick-scan result it was promoted from (the match is found by its `promotedJobId`; `MatchSummaryCard`, `src/components/MatchSummary.tsx`) and the formatted JD, with "Edit details" for the form and re-parse. Intake only auto-forwards to Parsed when a parse finishes during the visit, so a promoted job no longer bounces off it.
- **Apply stage** — an "Open application" button for any job with a `jobLink`. For a StillOpen job it also shows the listing link with attribution and re-checks the listing's status (at most every 6h, cached on `job.source`); a closed listing gets a warning worded by StillOpen's `closure` and an "Archive as Position Filled" button. A failed check never blocks applying.
- **Licence & terms** — StillOpen's terms need a written licence for any use by or for an organisation. Until `STILLOPEN_LICENSED=true`, `job_discovery` is **admin-only** in `isFeatureEnabled` — comped accounts (the shared demo) and the plan matrix don't open it. Attribution ("Data provided by StillOpen" + logo, linked; each listing linked to its `canonical_url`) is the `StillOpenAttribution` component, shown on Discover and on Matches when a StillOpen match is visible. Evidence wording (`describeEvidence`) never calls a listing verified unless StillOpen's `evidence_type` is `ats_verified`/`board_verified`. Kill switch: `killSwitches.discovery` (Admin › Flags).

---

## Auth model

- **End users**: Firebase Auth, self-service email/password sign-up (`AuthGate.tsx`) plus a one-click demo login. Every authenticated request carries `Authorization: Bearer <idToken>`; `requireFirebaseAuth` verifies it and stashes `req.uid`/`req.isAdmin`.
- **Admins**: identified purely by a Firebase custom claim (`admin: true`), not a Firestore field or billing-doc role. Granted via `npm run set:admin -- <email>`. Embedded in the ID token, so `requireAdmin` is a single flag check with no extra round-trip — but also means a newly-granted admin must sign out/in (or wait ~1h for token refresh) before the claim takes effect.
- **BYOM keys** are an orthogonal concept — per-request headers from client-side storage, never tied to any auth claim or persisted server-side.

---

## Known inconsistencies / incomplete migrations

Kept here as a single list so nothing gets rediscovered from scratch. See `AGENTS.md` for which of these are worth picking up first.

1. **AI provider abstraction is 3/22 endpoints migrated.** BYOM users' calls to everything except `keywords`/`fitScore`/`discoverySearchProfile` silently run on the platform provider (Oso/Ollama). (`server/ai/`, `payment-system-plan.md`)
2. **Two separate prompt-override mechanisms**: `server/promptStore.ts` (admin, local JSON files) vs. `users/{uid}/promptConfigs` (per-user, Firestore). Not reconciled.
3. **`storage.rules` and the newest `firestore.rules`/`firestore.indexes.json` additions have never been deployed** to the live Firebase project — no authenticated `firebase login` CLI session exists in this environment. Screenshot uploads operate client-side (`uploadTicketScreenshot`), but rules/indexes remain unpushed until a CLI session deploys them.
4. **Admin prompt overrides live in local JSON files**, not Firestore — won't survive a redeploy to a fresh environment (the Docker setup keeps them on named volumes, so they survive image rebuilds on the same host, but not a move to a new one).
5. **`server/knowledge/project_instructions.md` references `build_resume.js`**, which doesn't exist in this repo (actual resume generation is `server/docxBuilder.ts` + the `generateResume`/`resumeStrategy` AI endpoints). This is prompt content fed to the app's own AI, not developer docs — worth fixing but touches AI behavior, so treat as a deliberate follow-up, not a docs typo.
6. **`config/allowedModels`'s seeded model list doesn't include the Gemini client's own hardcoded default** (`gemini-3.1-pro-preview`).
7. **Ticket-submission rate limiting is transactionally enforced in Firestore** (`requireWithinDailyTicketLimit` in `server/support.ts`).
8. **Automated test suite configured with Vitest** (`vitest.config.ts`, `server/__tests__/support.test.ts`). Run via `npm test` or `npx vitest run`.
9. **`package.json`'s `name` field is still `"react-example"`** and `version` is `"0.0.0"`, both unused placeholders from initial scaffolding.
