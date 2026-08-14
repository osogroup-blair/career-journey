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
- **Three AI providers** (Gemini, OpenAI, Anthropic) are supported, but only partially unified behind one abstraction — see [AI provider abstraction](#ai-provider-abstraction).
- **Stripe billing**, an **admin console**, and a **support-ticket system** are layered on top of the original single-user job-pipeline app; all three were added after the core pipeline and are documented in `payment-system-plan.md` / `admin-support-feedback-plan.md` / `admin-support-hardening-plan.md`, which are worth reading for *why* things are shaped the way they are, not just *what* they are.

---

## Frontend

### Routing (`src/App.tsx`)

`HashRouter`. Global chrome (`Navbar`, `AiActivityIndicator`, `FeedbackWidget`, `Footer`) wraps every route inside a `ToastProvider`. Auth gating happens one layer up, in `src/main.tsx`: if `isFirebaseConfigured` (i.e. `VITE_FIREBASE_*` env vars are set), the entire `<App/>` tree is wrapped in `<AuthGate>`; otherwise the app boots straight into local-only mode with no sign-in at all.

| Path | Component | Notes |
|---|---|---|
| `/` | `Dashboard` | Home: timeline, skills, applications rollup, `JourneyGuide` next-step banner |
| `/edit` | `EditJourney` | "Simple Editor" — CRUD form over roles/achievements/skills |
| `/build` | `CareerJourneyBuilder` | Bootstrap a Career Journey: resume extraction, guided chat, or blank template |
| `/strengthen` | `StrengthenJourney` | Gap-filling flow driven by `careerJourneyGaps.ts` |
| `/journey` | `CareerJourney` | "Advanced Editor" — full raw-schema editor, 2929 lines, every section as a tab |
| `/matches` | `Matches` | Job discovery / bulk AI scan, gated to paid plans |
| `/migrate` | `Migrate` | One-time localStorage → Firestore copy |
| `/applications` | `JobTracker` | Kanban board across pipeline stages |
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

`server/careerJourneyVersioning.ts` allocates new IDs (per-prefix counters: `SK, CAP, FUNC, INIT, DEL, ACH, ROLE, EDU, METH, ENG`) and bumps the `major.minor` version string whenever a patch is applied — the LLM never invents IDs itself.

---

## Backend / API surface

`server.ts` mounts middleware groups by path prefix before any individual route:

| Prefix | Middleware |
|---|---|
| `/api/ai` | `requireFirebaseAuth` + `requireWithinAiQuota` |
| `/api/sources` | `requireFirebaseAuth` + `requireAnyPaidPlan` |
| `/api/admin` | `requireFirebaseAuth` + `requireAdmin` |
| `/api/export` | `requireFirebaseAuth` |
| `/api/billing` | `requireFirebaseAuth` |
| `/api/support` | `requireFirebaseAuth` |

All of these no-op in local dev without `FIREBASE_SERVICE_ACCOUNT_JSON` set, **except** `requireFirebaseAuth`, which fails closed (500) if `NODE_ENV === "production"` and Firebase Admin isn't configured. The Stripe webhook route is registered with `express.raw()` *before* the global `express.json()` — required because Stripe signature verification needs the raw body.

Individual handlers re-derive `uid`/plan/admin status from the verified token rather than trusting the request body — this is called out explicitly in a comment at `server.ts:220-221` and is the load-bearing security assumption for the whole `/api/*` surface.

### Route groups (full list)

**Billing** — `POST /api/billing/webhook`, `createCheckoutSession`, `createPortalSession`, `byomSettings`, `validateByomKey`.
**Support** — `POST/GET /api/support/tickets`, `GET/POST /api/support/tickets/:id/messages`.
**Admin** — `/api/admin/tickets*` (list/get/update/reply/screenshot), `/api/admin/featureFlags` (get/set), `/api/admin/allowedModels` (set), `/api/admin/users` (list + comp toggle), `/api/admin/prompts*` (list/save/restore/test-run).
**AI pipeline** — `parse`, `keywords`, `clarifyQuestions`, `fitScore`, `auditGates`, `liteScan` (also individually gated by `requireAnyPaidPlan`), `patchJourney`, `resumeStrategy`, `generateResume`, `coverLetter`, `applicationAssistant`, `generateFormAnswers`, `interviewPrep`, `interviewPrepChat`, `offerGuidance`, `compareOffers`, `buildJourneyFromResume`, `buildJourneyChat`, `refineFromInterviewAnswer`.
**Sources** — `fetchCompanyJobs` (Greenhouse/Lever board scrape), `fetchJobFromUrl` (structured board parse with generic-HTML fallback).
**Export** — `resume.docx`, `coverLetter.docx` (streamed via `server/docxBuilder.ts`).
**Health** — `GET /api/health`.

### Supporting modules

- **`server/featureFlags.ts`** — single Firestore doc `config/featureFlags` (`freeLifetimeLimit`, `proMonthlyLimit`, `byomBurstPerMinute`, `byomDailyLimit`, `killSwitches: {matches, aiPipeline}`), env-var fallbacks, 30s in-memory cache invalidated on write.
- **`server/promptStore.ts`** (~29KB) — 19 hardcoded default prompt templates, one per pipeline stage. Admin overrides persist as **local JSON files** under `server/promptConfig/{id}.json`, not Firestore — a deliberate dev-mode shortcut per an inline comment ("local JSON file in dev; Firestore once that's live"), meaning admin prompt edits currently don't survive a redeploy to a fresh environment.
- **`server/knowledge.ts`** — loads `server/knowledge/*.md` once at process startup into `FULL_KNOWLEDGE` (six files, prepended as system prompt to most `/api/ai/*` calls) and `CAREER_JOURNEY_BUILDER_KNOWLEDGE` (one file, used only by the three Builder endpoints). These `.md` files are the job-pipeline AI's own prompt content — not developer docs — and are provider-agnostic already (no hardcoded references to Gemini/OpenAI/Anthropic).
- **`server/rateLimiter.ts`** — `requireWithinAiQuota`: falls back to a flat in-memory daily cap for unauthenticated/no-admin-app requests; for authenticated BYOM users, layers an in-memory per-minute burst check on top of the Firestore-backed quota transaction in `billing.ts`.
- **`server/email.ts`** — thin Resend wrapper for ticket notifications, separate from Firebase Auth's built-in mailer (which can only send fixed verification/reset templates). Never throws; no-ops (logs only) if `RESEND_API_KEY` is unset.
- **`server/docxBuilder.ts`** — builds resume/cover-letter `.docx` binaries with the `docx` package.

### `server/scripts/`

| Script | npm alias | Purpose |
|---|---|---|
| `seedDemo.ts` | `seed:demo` | Idempotent reset of the shared demo account (Pro-comped, full fixture data from `src/lib/demo/`) |
| `setAdmin.ts` | `set:admin -- <email> [--revoke]` | Grants/revokes the `admin` Firebase custom claim |
| `seedAllowedModels.ts` | `seed:allowedModels` | Overwrites `config/allowedModels` with the current BYOM model list |
| `verifyAiProviders.ts` | `verify:ai` | Smoke-tests the pilot schemas against every provider with a configured key |
| `pullBacklog.ts` | `backlog:pull` | Exports triaged tickets to gitignored `backlog/*.md` |

---

## AI provider abstraction

`server/ai/` defines one interface, `StructuredAIClient`: `{ provider, generateStructured({systemPrompt, prompt, schema: ZodType<T>}) => Promise<T> }`. Each provider implementation converts a single Zod schema into its own native structured-output mechanism, then **re-validates the parsed result against the same Zod schema** before returning (providers have been observed to return malformed shapes for nested/nullable schemas, per an inline comment):

- **Gemini** (`geminiClient.ts`, default `gemini-3.1-pro-preview`) — Zod → `zodToGeminiSchema.ts` → Gemini's `Type.OBJECT/STRING/...` `responseSchema` format. `zodToGeminiSchema` goes through Zod v4's `z.toJSONSchema()` first, then walks the tree; it explicitly throws on `$ref`/`$defs` (recursive/reused sub-schemas) — not yet needed by any real schema, but a real limitation if one is added.
- **Anthropic** (`anthropicClient.ts`, default `claude-sonnet-5`) — no native structured-output mode, so uses a single forced tool call (`tool_choice: {type:"tool", name:"emit_response"}`) with `input_schema: z.toJSONSchema(schema)`.
- **OpenAI** (`openaiClient.ts`, default `gpt-5.6-terra`) — `response_format: {type:"json_schema", ...}` in **non-strict** mode (deliberate — this app's schemas have genuinely optional fields that `strict:true` doesn't tolerate well).

**Routing** (`getAIClient.ts`, `getAIClientForRequest`): no admin app / no uid → platform Gemini singleton. Non-BYOM plan → platform Gemini singleton. BYOM plan → reads `X-BYOM-Key`/`X-BYOM-Provider`/`X-BYOM-Model` request headers (provider/model fall back to the user's saved `billing.byomProvider`/`byomModel` if headers are missing), builds a fresh client per request. Missing key/provider on a BYOM request throws `MissingByomKeyError`, mapped to a 400 (not 500).

**BYOM key handling**: the raw key is *never* stored server-side. `src/lib/byomKeyStorage.ts` is the only place it's persisted — browser `localStorage`, scoped to the device — and `aiClient.ts` attaches it as a header on every AI request. `POST /api/billing/validateByomKey` exercises the real client abstraction with a trivial schema to test a key before the user saves it, and never persists it regardless of outcome. Only the **choice** of provider+model is saved server-side (`POST /api/billing/byomSettings` → `billing.byomProvider`/`byomModel`).

**Migration status — read this before touching any `/api/ai/*` route.** Only two endpoints, `keywords` and `fitScore`, actually go through `getAIClientForRequest`/the Zod-schema abstraction (`server/ai/schemas.ts` has exactly two schemas: `KeywordsResponseSchema`, `FitAnalysisSchema`). Every other `/api/ai/*` endpoint — `parse`, `clarifyQuestions`, `auditGates`, `resumeStrategy`, `generateResume`, `coverLetter`, `applicationAssistant`, `generateFormAnswers`, `interviewPrep(+Chat)`, `offerGuidance`, `compareOffers`, `buildJourneyFromResume`, `buildJourneyChat`, `refineFromInterviewAnswer`, and the admin prompt test-run — calls the module-level `ai` const (a bare `GoogleGenAI` instance keyed off `GEMINI_API_KEY`) directly, with hand-written inline Gemini `Type.*` schemas. **This means BYOM subscribers' calls to everything except `keywords`/`fitScore` currently run on the platform Gemini key, not their own key/provider choice**, regardless of what they configured in `/settings`. This is a known, tracked gap — see `payment-system-plan.md`'s "Deliberately not done this pass" note and `AGENTS.md` for what finishing this migration would involve.

**Allowed models** (`config/allowedModels`, `src/types/aiModels.ts`): `Record<AIProviderId, AllowedModel[]>`, readable by any signed-in user, admin-write-only. Seeded list (`seedAllowedModels.ts`) — 3 tiers per provider: Gemini (`gemini-2.5-pro`, `gemini-3.7-flash`, `gemini-3.5-flash-lite`), OpenAI (`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`), Anthropic (`claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5-20251001`). Note the Gemini client's own hardcoded default (`gemini-3.1-pro-preview`) isn't actually in this seed list — a minor inconsistency, not yet reconciled.

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

- Screenshot capture is client-side (`html2canvas-pro`, chosen over vanilla `html2canvas` because the latter can't parse modern CSS color functions), opt-in per submission, base64-encoded and uploaded **server-side** by `createTicket` via the Admin SDK — a deliberate workaround, not the final design, because `storage.rules` (which would allow direct client→Storage upload) has never actually been deployed in this project (no `firebase login`-authenticated CLI has been available). See `admin-support-hardening-plan.md` Phase 1–2 for the intended end state.
- `adminNotes` is documented as internal-only and must never reach the ticket's owner — enforced via a `stripAdminFields` helper applied in the user-facing read paths only. If you touch `server/support.ts`, keep this filter in place; it was a real shipped leak, fixed in the hardening pass.
- Ticket list queries sort in-memory rather than using Firestore `.orderBy()`, because the required composite indexes were never deployed (same CLI-access constraint as above). Fine at current volume; a real cost at scale.
- Notifications (new ticket, user reply, admin reply) are fire-and-forget emails via Resend, no-op if unconfigured.
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

`firestore.indexes.json` is currently empty by design — the codebase avoids queries that would need a composite index (see the support-ticket in-memory-sort note above).

### Storage

`ticketScreenshots/{uid}/{fileName}` — intended rules (owner-write, <5MB, image/* only, read:false always) are written in `storage.rules` but **not deployed**; see [Support / feedback loop](#support--feedback-loop).

---

## Auth model

- **End users**: Firebase Auth, self-service email/password sign-up (`AuthGate.tsx`) plus a one-click demo login. Every authenticated request carries `Authorization: Bearer <idToken>`; `requireFirebaseAuth` verifies it and stashes `req.uid`/`req.isAdmin`.
- **Admins**: identified purely by a Firebase custom claim (`admin: true`), not a Firestore field or billing-doc role. Granted via `npm run set:admin -- <email>`. Embedded in the ID token, so `requireAdmin` is a single flag check with no extra round-trip — but also means a newly-granted admin must sign out/in (or wait ~1h for token refresh) before the claim takes effect.
- **BYOM keys** are an orthogonal concept — per-request headers from client-side storage, never tied to any auth claim or persisted server-side.

---

## Known inconsistencies / incomplete migrations

Kept here as a single list so nothing gets rediscovered from scratch. See `AGENTS.md` for which of these are worth picking up first.

1. **AI provider abstraction is 2/19 endpoints migrated.** BYOM users' calls to everything except `keywords`/`fitScore` silently run on the platform Gemini key. (`server/ai/`, `payment-system-plan.md`)
2. **Two separate prompt-override mechanisms**: `server/promptStore.ts` (admin, local JSON files) vs. `users/{uid}/promptConfigs` (per-user, Firestore). Not reconciled.
3. **`storage.rules` and the newest `firestore.rules`/`firestore.indexes.json` additions have never been deployed** to the live Firebase project — no authenticated `firebase login` CLI session exists in this environment. This forces the current server-side screenshot-upload and in-memory-sort workarounds.
4. **Admin prompt overrides live in local JSON files**, not Firestore — won't survive a redeploy to a fresh environment.
5. **`server/knowledge/project_instructions.md` references `build_resume.js`**, which doesn't exist in this repo (actual resume generation is `server/docxBuilder.ts` + the `generateResume`/`resumeStrategy` AI endpoints). This is prompt content fed to the app's own AI, not developer docs — worth fixing but touches AI behavior, so treat as a deliberate follow-up, not a docs typo.
6. **`config/allowedModels`'s seeded model list doesn't include the Gemini client's own hardcoded default** (`gemini-3.1-pro-preview`).
7. **Ticket-submission rate limiting is in-memory**, resets on every server restart (low-stakes abuse guard, not a monetization control — see `admin-support-hardening-plan.md` Phase 6 for the tradeoff discussion).
8. **No automated test suite exists anywhere in this repo.** `npm run lint` is `tsc --noEmit` only. Every feature to date has been verified by live manual testing against real accounts/Stripe test mode, documented inline in the plan docs.
9. **`package.json`'s `name` field is still `"react-example"`** and `version` is `"0.0.0"`, both unused placeholders from initial scaffolding.
