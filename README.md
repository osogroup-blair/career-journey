# Career Journey — Structured AI Decision System & Resume Pipeline

An AI-native decision engine that transforms fragmented career experience into a persistent, structured source of truth—evaluating job fit, surfacing missing evidence through human-in-the-loop interviewing, and driving deterministic, high-coverage resume strategies.

Beyond the core pipeline, the app is a small SaaS: Firebase Auth accounts, Stripe subscriptions (with a bring-your-own-model option across Gemini/OpenAI/Anthropic), an admin console, and an in-app support/feedback loop. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical picture and [AGENTS.md](AGENTS.md) if you're a coding agent picking up work here.

---

## What Problem It Solves

Career information is inherently fragmented. Professional achievements, key metrics, technical competencies, and project nuances are scattered across legacy resumes, cover letters, self-evaluations, and forgotten notes. 

When applying to new roles, professionals face two major inefficiencies:
1. **Repeated Manual Tailoring**: Manually reframing past roles for every distinct job description is time-consuming and error-prone.
2. **Context Leakage & Lost Evidence**: Important context is forgotten or omitted, leading to weak keyword alignment on Automated Tracking Systems (ATS) and recruiters misjudging candidate fit.

Editing resumes one-off treats the document as the primary artifact rather than a derivative view. **Career Journey** solves this by establishing a persistent, structured career model. AI reasons against this single source of truth to compute match fidelity, identify evidence gaps, interview the user to enrich state, and deterministically generate target resumes.

---

## How It Works & Pipeline Architecture

Rather than treating resume generation as a single text-in/text-out prompt, Career Journey runs each job through a structured, multi-stage workflow (`src/layouts/JobLayout.tsx`). Each stage enforces strict JSON schema validation, turning LLM non-determinism into structured data pipelines. Earlier iterations of this app split evidence-matching, context-interview, journey-update, and fit-audit into separate top-level steps; they're now consolidated into a single **Rating** stage (as sub-tabs) after live-usability testing showed the separate steps didn't add value — see `job-fit-tool-iteration-plan.md` for that history. Old bookmarked URLs to those steps (`/keywords`, `/context`, `/patch`, `/fit`, `/strategy`, `/export`, `/preview`, `/cover-letter`) still resolve via redirects in `src/App.tsx`.

```
Intake ──► Parsed ──► Rating ──► Tailored Application ──► Apply ──► Interview ──► Offer
```

### Pipeline stages (`src/pages/`, one per stage)

1. **Job Intake** (`IntakeStage`): Company/role/comp/location metadata, plus JD input via paste, file upload, or fetch-from-URL (Greenhouse/Lever boards or a generic scrape).
2. **Parsed** (`ParsedStage`): Review/edit the AI-parsed JD — hard gates (location, clearance, experience thresholds), must-haves, nice-to-haves, strategic signals, top critical skills.
3. **Rating** (`RatingStage`) — four sub-tabs covering what used to be four separate pipeline steps:
   - **Fit & Gate**: dual-layer scoring across domain, technical, seniority, and hard-gate compliance (`CLEAR TO APPLY` / `VERIFY FIRST` / `LIKELY AUTO-REJECT`).
   - **Keywords**: every extracted ATS keyword evaluated against the Career Journey and categorized into evidence tiers (`EVIDENCED`, `PARTIAL`, `MISSING`, `NOT SUPPORTED`).
   - **Gaps**: targeted, AI-generated clarifying questions for weak/missing evidence.
   - **Patch**: confirmed answers are staged as a diffed Career Journey update and merged in on approval, permanently enriching the profile for future applications.
4. **Tailored Application** (`TailoredApplicationStage`) — four sub-tabs: generated resume (3 templates, editable, exportable to `.docx`), cover letter, an application-assistant chat, and auto-generated answers for arbitrary application-form fields.
5. **Apply** (`ApplyStage`): mark applied, method, then advance or archive with a reason.
6. **Interview** (`InterviewStage`): manage rounds, generate AI interview prep per round, rehearse in a chat thread.
7. **Offer** (`OfferStage`): capture offer details, get AI negotiation guidance, accept/decline.

### Beyond the per-job pipeline

- **Matches** (`/matches`): paste or bulk-import postings (including pulling every open role from a tracked Greenhouse/Lever company board) and get a quick AI verdict/score/gap-scan against your Career Journey before committing a posting to the full pipeline. Gated to paid plans (see Billing below).
- **Career Journey Builder** (`/build`): bootstrap a Career Journey from scratch — extract from a pasted resume, a guided AI chat interview, or a blank template.
- **Strengthen Journey** (`/strengthen`): surfaces weak spots (unquantified achievements, stale skills, thin role descriptions) and walks through AI-proposed refinements one at a time.
- **Simple Editor** (`/edit`) and **Advanced Editor** (`/journey`): a friendly CRUD form and a full raw-schema editor over every Career Journey section, respectively.
- **Job Tracker** (`/applications`): Kanban board across every pipeline stage.
- **Compare Offers** (`/compare-offers`): side-by-side AI comparison across every job currently in the Offer stage.

---

## Architectural & Design Principles

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DESIGN PRINCIPLES                               │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Structured Data is the Source of Truth                              │
│    Canonical state lives in validated JSON data models, not raw text.  │
│                                                                        │
│ 2. LLMs Interpret and Generate, But Do Not Own State                   │
│    Gemini, OpenAI, or Anthropic handles parsing, matching, and         │
│    drafting; structured schemas store and control state transitions.  │
│                                                                        │
│ 3. Weak Evidence Triggers Human Clarification                          │
│    Ambiguity or missing proof triggers targeted context interviews     │
│    rather than LLM hallucination.                                      │
│                                                                        │
│ 4. Staged Pipeline with Structured Schema Contracts                    │
│    Each stage accepts validated JSON and returns typed JSON responses  │
│    governed by Zod, enforced natively by whichever provider is active. │
└────────────────────────────────────────────────────────────────────────┘
```

- **Structured Data is the Source of Truth**: The *Career Journey* schema is a persistent JSON graph capturing roles, initiatives, deliverables, skills, and metrics.
- **LLMs Interpret & Generate, But Do Not Own Canonical State**: AI models reason over state, map semantics, and draft strategy—but state mutations are validated and stored explicitly in client-side state models.
- **Weak Evidence Triggers Human Clarification**: Rather than guessing or hallucinating missing experience, the system flags gap states (`PARTIAL` / `MISSING`) and prompts the candidate with precise questions.
- **Staged Generation via Typed Contracts**: Pipeline stages pass typed schemas forward. Downstream generators (Fit Audit, Resume Strategy) operate on structured analysis rather than unstructured prompts.

---

## Example Workflow

> **Scenario**: A target Job Description requires *"Experience with high-throughput workflow automation and dynamic routing."*

1. **Intake & Parse**: The system parses the posting and identifies `workflow automation` and `dynamic routing` as critical must-have requirements.
2. **Evidence Check**: The system queries the candidate's master Career Journey profile. It finds mentions of "backend orchestration at Stripe" but zero explicit mention of "dynamic routing algorithms." Status set to `PARTIAL`.
3. **Targeted Interview Question**: Step 4 generates a targeted prompt:
   > *"You noted backend orchestration at Stripe. Did you design any dynamic data routing workflows or custom queue logic in that role? What were the throughput or latency metrics?"*
4. **Human-in-the-Loop Enrichment**: The candidate answers: *"Yes, built a custom event router handling 50k events/sec with Redis sub/pub."*
5. **State Mutation**: The answer is parsed, merged into the canonical Career Journey JSON under the Stripe role, and logged in the persistent state change log.
6. **Rescore & Strategy**: The system re-evaluates `workflow automation` as `EVIDENCED`, incorporates the 50k events/sec metric into the Fit Audit score, and inserts the reframed bullet point into the Resume Strategy.

---

## Key Capabilities

- **Structured Job Intake & Parsing**: Automatic extraction of hard eligibility gates, primary skills, secondary skills, and company culture signals.
- **Granular Evidence Classification**: Automated evidence mapping (`EVIDENCED`, `PARTIAL`, `MISSING`, `NOT SUPPORTED`) across every candidate experience item.
- **Human-in-the-Loop Interview Engine**: Contextual gap-filling engine that continuously upgrades candidate career data.
- **Multidimensional Fit & Compliance Audit**: Quantitative scorecards covering domain, technical, seniority, and hard-gate criteria.
- **ATS Resume Strategy & Generation**: Deterministic positioning engine that builds tailored resumes tailored to specific job postings with real-time keyword coverage metrics.
- **Job Discovery / Matches**: bulk-scan postings (including pulling every open role from a tracked Greenhouse/Lever board) against the Career Journey for a quick fit verdict before committing to the full pipeline.
- **Multi-Provider AI, including Bring-Your-Own-Model**: Gemini, OpenAI, and Anthropic are all supported through one provider-agnostic client abstraction; paid BYOM subscribers can supply their own API key (stored client-side only) instead of using the app's platform key.
- **Freemium Billing (Stripe)**: free/Pro Monthly/BYOM Monthly/BYOM Yearly plans, quota enforcement, self-service Customer Portal.
- **Admin Console**: user/subscription visibility with comp overrides, feature flags + kill switches, BYOM allowed-models curation, AI prompt-template editing, and support-ticket triage.
- **In-App Support & Feedback**: a floating feedback widget (with optional screenshot capture) files a ticket the user can track in "My Feedback" and an admin triages in the console; triaged bugs/enhancements export to flat markdown in `backlog/` for a coding agent to pick up directly.

---

## System Architecture & Tech Stack

```
                     ┌──────────────────────────────┐
                     │      React 19 Frontend        │
                     │ (Vite + HashRouter + Zustand) │
                     └───────────────┬────────────────┘
                                     │
                    ┌────────────────┴─────────────────┐
                    │   DataStore interface (swappable) │
                    │  LocalStorageDataStore | Firestore │
                    └────────────────┬─────────────────┘
                                     │
                      ┌──────────────┴───────────────┐
                      │   Express API (server.ts)    │
                      │ Firebase auth · Stripe · rate│
                      │ limiting · admin · support    │
                      └──────────────┬────────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                │                    │                    │
        ┌───────┴───────┐   ┌────────┴────────┐   ┌───────┴───────┐
        │ Gemini (native) │   │ OpenAI (native) │   │ Anthropic (native) │
        │ platform + BYOM │   │      BYOM       │   │       BYOM         │
        └─────────────────┘   └─────────────────┘   └─────────────────────┘
```

- **Frontend**: React 19, TypeScript, Vite, React Router (`HashRouter`), Tailwind CSS v4, Zustand (persisted via the `DataStore` abstraction), React Hook Form + Zod.
- **Backend API**: single Express app (`server.ts`, ~1950 lines, ~44 routes) serving AI proxy endpoints, Stripe billing/webhooks, admin, and support-ticket APIs.
- **AI Architecture**: a provider-agnostic client abstraction (`server/ai/`) drives Gemini, OpenAI, and Anthropic from one Zod schema per endpoint — but this migration is **partial**: only 2 of ~19 `/api/ai/*` endpoints (`keywords`, `fitScore`) go through it today; the rest still call the Gemini SDK directly with hand-written schemas. See [ARCHITECTURE.md](ARCHITECTURE.md#ai-provider-abstraction) for exactly which.
- **Billing**: Stripe Checkout + Customer Portal + webhooks, entitlement state mirrored into Firestore (`users/{uid}/meta/billing`), never trusted from the client.
- **Build System**: Vite for client assets, `esbuild` for server compilation into a single CJS bundle.

---

## Project Structure

```
server.ts                    # Express app: route registration + ~19 inline /api/ai/* handlers
server/
  ai/                        # Provider-agnostic AI client abstraction (gemini/openai/anthropic + zod schemas)
  billing.ts, stripe.ts      # Plan/quota model, Stripe Checkout/Portal/webhooks
  support.ts, email.ts       # Ticket CRUD, screenshot storage, Resend notifications
  featureFlags.ts            # Quota limits + kill switches (Firestore-backed, cached)
  promptStore.ts             # Default AI prompt templates + admin override mechanism
  careerJourneyVersioning.ts # ID allocation + version bumping for the Career Journey schema
  knowledge.ts                # Loads server/knowledge/*.md into AI system prompts at startup
  knowledge/*.md              # The job-pipeline AI's own "skill" files (JD parsing, ATS, voice, cover letters)
  firebaseAdmin.ts            # Firebase Admin SDK init + requireFirebaseAuth/requireAdmin middleware
  docxBuilder.ts              # Resume/cover-letter .docx generation
  scripts/                    # npm run seed:demo | set:admin | verify:ai | seed:allowedModels | backlog:pull
src/
  App.tsx                    # Route table (see ARCHITECTURE.md for the full list)
  store.ts                   # Zustand store: job/journey/billing/admin state + the runAiTask() choke point
  types.ts, types/*.ts        # Domain types: job pipeline, Career Journey schema, billing, support, prompts, AI models
  layouts/                    # JobLayout (7-stage stepper), AdminLayout (sidebar + RequireAdmin gate)
  pages/                      # ~25 route-level views — job pipeline stages, Matches, admin screens, legal pages
  components/                  # AuthGate, RequireAdmin, FeedbackWidget, EvidenceTrace, shared UI primitives
  data/                        # DataStore interface + LocalStorageDataStore/FirestoreDataStore implementations
  lib/                         # AI/admin/billing/support API clients, Career Journey helpers, demo fixtures
backlog/                      # Gitignored, generated by `npm run backlog:pull` — triaged tickets as markdown
*-plan.md                     # Historical planning docs (payment system, admin/support, job-fit iteration)
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18+ recommended
- At least one AI provider key — **Gemini** is what the app defaults to for platform-tier users (`GEMINI_API_KEY`); OpenAI/Anthropic keys are only needed for BYOM testing or `npm run verify:ai`.

### Installation & Environment

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   At minimum, add a Gemini key:
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   ```
   `.env.example` documents every other variable (Firebase, Stripe, Resend, quota overrides) — all optional with sensible defaults except Stripe, which is required for billing to function at all. See [ARCHITECTURE.md](ARCHITECTURE.md) for what each subsystem needs to actually run end-to-end.

### Running Locally

Start the dev server (Express + Vite middleware on `http://localhost:47293`):
```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

### Other scripts

```bash
npm run lint              # tsc --noEmit — no automated test suite exists in this repo
npm run seed:demo         # Reset the shared demo account (Pro-comped, full fixture data)
npm run set:admin -- <email>   # Grant/revoke the admin custom claim
npm run seed:allowedModels     # Seed config/allowedModels with the current BYOM model list
npm run verify:ai         # Smoke-test the AI abstraction against every configured provider key
npm run backlog:pull      # Export triaged support tickets to backlog/*.md
```

---

## Firebase & Firestore (Optional Cloud Mode)

The app runs entirely on browser local storage by default — no Firebase project required, no paywall, no admin. Setting the `VITE_FIREBASE_*` env vars switches it into a Firestore-backed, multi-account mode without any code changes:

- `src/data/DataStore.ts` is the persistence interface every page depends on; `LocalStorageDataStore` (default) and `FirestoreDataStore` are interchangeable implementations of it.
- `src/components/AuthGate.tsx` (mounted in `src/main.tsx`, above `<App/>`) gates the app behind Firebase Auth and swaps in `FirestoreDataStore` once signed in. Sign-up is self-service (email/password), plus a one-click "Try the demo" login for the seeded demo account.
- `server/firebaseAdmin.ts` verifies a Firebase ID token (`requireFirebaseAuth`) on every `/api/ai/*`, `/api/sources/*`, `/api/admin/*`, `/api/export/*`, `/api/billing/*`, and `/api/support/*` route once configured, so a deployed instance can't have its AI quota burned by strangers. It no-ops in local dev without `FIREBASE_SERVICE_ACCOUNT_JSON`, but fails closed (500) in production if that var is missing.
- Firestore documents live under `users/{uid}/...` for per-user app data, plus top-level `tickets/`, `stripeEvents/`, and `config/` collections for cross-account admin/billing/support concerns — see [ARCHITECTURE.md](ARCHITECTURE.md#data-model) for the full collection map and `firestore.rules` for the access rules (which are unusually well-commented — read them directly for the actual security model).

**To turn cloud mode on:**

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com), enable **Firestore** and **Authentication → Email/Password**.
2. Copy the web app config (Project Settings → General → Your apps) into `.env` as the `VITE_FIREBASE_*` vars — see `.env.example`.
3. Generate a service account key (Project Settings → Service Accounts → Generate new private key) and paste the JSON into `.env` as `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Restart the app, sign up (or sign in), then visit `/migrate` once to copy any existing local data into Firestore.
5. Deploy security rules: `firebase deploy --only firestore:rules` (after `firebase use --add` to link this repo to your project), or paste the contents of `firestore.rules` into Firestore Database → Rules in the console and publish. **Known gap**: `storage.rules` (ticket screenshots) has never actually been deployed in this project's history — see `admin-support-hardening-plan.md` Phase 1–2 for why and the workaround currently in place.
6. To make yourself an admin: `npm run set:admin -- you@example.com`, then sign out/in (the `admin` custom claim is embedded in the ID token and only refreshes on new sign-in or after ~1h).

### Billing (Stripe)

Billing only works once `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and the three `STRIPE_PRICE_*` vars are set (see `.env.example`) — without them, `/upgrade` and quota gating won't function correctly. Locally, forward webhooks with `stripe listen --forward-to localhost:47293/api/billing/webhook`. Plans, quota model, and the BYOM (bring-your-own-model) flow are documented in [ARCHITECTURE.md](ARCHITECTURE.md#billing--plans).

### Support ticket email notifications (optional)

Leave `RESEND_API_KEY`/`SUPPORT_NOTIFY_EMAIL` unset to skip email entirely — the feedback/ticket loop still works fully via the admin console and Navbar badge; this only adds email notifications on new tickets/replies.

### Demo Data

For testing or demoing the app without touching your own account/resume, `npm run seed:demo` provisions a separate Firebase Auth account and fills it with a full set of fictional data — a made-up career journey ("Jordan Rivera"), one job in every pipeline stage (Intake through Archive), and a handful of matches across New/Promoted/Dismissed.

```bash
npm run seed:demo
```

- Requires `FIREBASE_SERVICE_ACCOUNT_JSON` to be set (see step 4 above) and Firestore rules to be deployed/published (step 6).
- Default login: `demo@career-journey.app` / `DemoPass123!` — override with `DEMO_EMAIL` / `DEMO_PASSWORD` in `.env` (see `.env.example`).
- Idempotent and safe to re-run any time — it wipes and rewrites the demo account's jobs/matches/career journey back to the seeded state, so it doubles as a reset.
- Source fixtures live in `src/lib/demo/`; the script itself is `server/scripts/seedDemo.ts`.
- Fresh/empty accounts (including a newly created real one) fall back to a blank Career Journey template, never real or demo data — see `src/lib/defaultData.ts`.

Hosting/API deployment (Firebase Hosting + Cloud Run for the Express server) is scaffolded in `firebase.json` but not yet deployed — that's the one remaining manual step once you're ready to put this on the public internet.

---

## What I Designed / Built

While this repository utilizes standard scaffolding patterns, the underlying architecture and core logic were hand-designed and built from scratch:

- **Persistent Career Schema & Domain Model**: Designed the multi-tier structured JSON model representing complex career trajectories, initiatives, deliverables, and skill mappings.
- **Multi-Stage AI Decision Pipeline**: Architected the sequential multi-stage LLM workflow, ensuring strict schema enforcement at every boundary.
- **Evidence Classifier & Gap Logic**: Developed the evaluation algorithm that categorizes candidate evidence and detects ambiguity.
- **Human-in-the-Loop Context Interview System**: Created the feedback mechanism that prompts users for missing data and mutates master profile state.
- **ATS Compliance & Strategy Generator**: Implemented the dual-layer audit system and resume strategy engine.
- **Freemium Billing, BYOM, and Admin Console**: Designed the plan/quota model, the provider-agnostic AI client abstraction, and the operator-facing admin tooling on top of it.
- **Support & Feedback Loop**: Built the in-app ticket system, including the coding-agent-facing backlog export.

---

## Why I Built This

I built **Career Journey** to solve a persistent operating problem in high-stakes job search: candidate context is lost when resumes are treated as static, one-off documents. 

Traditional resume builders focus on formatting or simple string replacement. In contrast, **Career Journey** models career history as structured, dynamic data. By combining a persistent source of truth with an AI reasoning pipeline and human-in-the-loop context gathering, candidates can evaluate fit objectively, capture missing nuance, and generate targeted applications backed by verified evidence.
