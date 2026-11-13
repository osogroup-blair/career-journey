# Career Journey — Structured AI Decision System & Resume Pipeline

An AI-native decision engine that transforms fragmented career experience into a persistent, structured source of truth—evaluating job fit, surfacing missing evidence through human-in-the-loop interviewing, and driving deterministic, high-coverage resume strategies.

Beyond the core pipeline, the app is a small SaaS: self-hosted accounts, Stripe subscriptions (with a bring-your-own-model option across Gemini/OpenAI/Anthropic), an admin console, and an in-app support/feedback loop. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical picture and [AGENTS.md](AGENTS.md) if you're a coding agent picking up work here.

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
- **Simple Editor** (`/edit`) and **Advanced Editor** (`/journey`): a section-by-section editor (roles, projects, achievements, skills, capabilities, education and more — each searchable and paginated, with Cmd/Ctrl-K search across everything and an AI assistant per section that drafts new items for you to approve) and a full raw-schema editor (links, vocabularies, changelog, raw JSON), respectively.
- **Job Tracker** (`/applications`): Kanban board across every pipeline stage, plus a searchable List view and an Archived view (with Restore).
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

React 19, Vite, HashRouter and Zustand provide the UI. One Express process serves the SPA and API. Node 24's built-in SQLite driver stores account and application data on the VM; private attachment/export files live beside the database. Local accounts use scrypt password hashes and revocable HttpOnly cookie sessions. Agents use distinct scoped credentials and can only read canonical Career Journey evidence.

Oso/Ollama provide platform AI; provider migration/BYOM coverage remains partial. Stripe billing, SMTP notifications, discovery and public Spotlight pages are optional integrations. Firebase is no longer required by the application. Its SDK is retained only as a development dependency for exporting an old installation.

## Getting Started

Requires Node 24+ for local development, or Docker Engine with Compose for a VM.

```bash
npm ci
cp .env.example .env
# Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 12 characters.
# For local development, also set APP_URL=http://localhost:47293.
npm run dev
```

Alternatively, use the [explicit private administrator seed workflow](SELF_HOSTING.md#explicit-administrator-seed-local-docker-and-vm) for local Docker and VM installs. Open `http://localhost:47293`, sign in, and remove `ADMIN_PASSWORD` from runtime configuration after the initial account is created. The database and private files persist under `DATA_DIR` (default `./data`). Configure Oso or a reachable Ollama server to use AI; Stripe and SMTP are optional.

## GitHub releases and VM deployment

No GitHub Actions or hosted build service is used. After committing changes, publish a checked release from your workstation and deploy that tag on the VM:

```bash
# Workstation:
./scripts/release.sh v1.0.0
# VM, in the repository clone with its private .env configured:
./scripts/deploy.sh v1.0.0
```

The deploy script builds on the VM, backs up persistent state with writers stopped, waits for health, and records the previous image for rollback. The existing VM Cloudflare Tunnel serves `https://career-journey.oso.group` and forwards to the private app origin; no additional reverse proxy is deployed. Read [SELF_HOSTING.md](SELF_HOSTING.md) for initial setup, secure configuration, backups, rollback, local account maintenance and Firebase export/import. Existing Firebase data has not automatically been cut over; imported users must set local passwords before production traffic moves.

## Verification

```bash
npm test
npm run lint
npm run build
npm run verify:agents -- --live
```

The agent check creates and removes an isolated local test account and files. `--ai` additionally invokes real AI providers. See [ARCHITECTURE.md](ARCHITECTURE.md) for implementation details and [agent platform status](agent-platform-implementation-status.md) for the remaining MCP roadmap.

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


## Agent integration (private beta)

A scoped MCP interface and application document library are being implemented. Career Journey is read-only for agents. The beta supports job/match management, immutable application documents, external application reports, follow-ups, interviews, offers and seven platform AI preparation steps. Remote access and workers are disabled by default; a full OAuth onboarding flow and managed employer submissions are not released.

See [implementation status and validation](agent-platform-implementation-status.md) before enabling connections. Settings links to **Agent connections** and the application document/history library. Cloud job/match writes now require the updated application API; deploy client/server together and verify the associated rules/indexes before enabling agent writes.
