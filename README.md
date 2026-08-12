# Career Journey — Structured AI Decision System & Resume Pipeline

An AI-native decision engine that transforms fragmented career experience into a persistent, structured source of truth—evaluating job fit, surfacing missing evidence through human-in-the-loop interviewing, and driving deterministic, high-coverage resume strategies.

---

## What Problem It Solves

Career information is inherently fragmented. Professional achievements, key metrics, technical competencies, and project nuances are scattered across legacy resumes, cover letters, self-evaluations, and forgotten notes. 

When applying to new roles, professionals face two major inefficiencies:
1. **Repeated Manual Tailoring**: Manually reframing past roles for every distinct job description is time-consuming and error-prone.
2. **Context Leakage & Lost Evidence**: Important context is forgotten or omitted, leading to weak keyword alignment on Automated Tracking Systems (ATS) and recruiters misjudging candidate fit.

Editing resumes one-off treats the document as the primary artifact rather than a derivative view. **Career Journey** solves this by establishing a persistent, structured career model. AI reasons against this single source of truth to compute match fidelity, identify evidence gaps, interview the user to enrich state, and deterministically generate target resumes.

---

## How It Works & Pipeline Architecture

Rather than treating resume generation as a single text-in/text-out prompt, Career Journey runs an 8-step structured workflow. Each step enforces strict JSON schema validation, turning LLM non-determinism into structured data pipelines.

```
Job Description ──► Structured Parse ──► Evidence Match ──► Context Interview
                                                                    │
Output ◄── Resume Strategy ◄── Fit Audit ◄── Career Journey Update ◄┘
```

### Scannable Pipeline Flow

1. **Job Intake (`Job Description`)**: Raw job posting, company, and metadata ingestion.
2. **JD Parse Review (`Structured Parse`)**: AI parses raw JDs into structured requirements: hard gates (location, clearance, experience thresholds), core skills, and strategic signals.
3. **Keyword Breakdown (`Evidence Match`)**: Every extracted ATS keyword is evaluated against the Career Journey master profile and categorized into evidence tiers: `EVIDENCED`, `PARTIAL`, `MISSING`, or `NOT SUPPORTED`.
4. **AI Context Interview (`Context Interview`)**: Weak or missing requirements trigger targeted, context-aware interview questions to extract missing metrics and details.
5. **Update Journey (`Career Journey Update`)**: Confirmed answers are merged back into the master structured profile, permanently enriching state for future applications.
6. **Fit & ATS Audit (`Fit Audit`)**: Dual-layer scoring evaluating role scope, domain fit, technical alignment, and hard-gate compliance (`CLEAR TO APPLY`, `VERIFY FIRST`, `LIKELY AUTO-REJECT`).
7. **Resume Strategy (`Resume Strategy`)**: Computes positioning strategy, role reframes, and target keyword placement.
8. **Export & Build (`Output`)**: Final keyword coverage verification and rendering of exportable, ATS-optimized 2-page resumes.

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
│    Gemini handles parsing, matching, and drafting; structured schemas  │
│    store and control state transitions.                                │
│                                                                        │
│ 3. Weak Evidence Triggers Human Clarification                          │
│    Ambiguity or missing proof triggers targeted context interviews     │
│    rather than LLM hallucination.                                      │
│                                                                        │
│ 4. Staged Pipeline with Structured Schema Contracts                    │
│    Each stage accepts validated JSON and returns typed JSON responses  │
│    governed by Zod and Gemini JSON Schema enforcement.                 │
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

---

## System Architecture & Tech Stack

```
                     ┌────────────────────────┐
                     │   React 19 Frontend    │
                     │  (Vite + React Router) │
                     └───────────┬────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │  Zustand Persisted Store  │
                   │    (Local Master State)   │
                   └─────────────┬─────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │ Express API Middleware  │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │ Gemini API (@google/genai)    │
                 │ (Structured JSON-Schema)      │
                 └───────────────────────────────┘
```

- **Frontend**: React 19, TypeScript, Vite, React Router, Tailwind CSS v4, Zustand (state persistence via `localStorage`), React Hook Form + Zod.
- **Backend API**: Express server serving API middleware and proxying AI requests.
- **AI Architecture**: Google Gemini (`@google/genai`) using structured JSON-schema responses across all 8 pipeline steps.
- **Build System**: Vite for client assets, `esbuild` for server compilation.

---

## Project Structure

```
server.ts                # Express backend server + Gemini AI structured endpoints
src/
  App.tsx                # Client route definitions
  store.ts               # Zustand store: local job state + Career Journey persistence
  types.ts               # Complete TypeScript interface & domain models
  layouts/JobLayout.tsx   # Workflow container shell & pipeline progress tracking
  pages/                 # Pipeline step views (Intake, Parse, Keywords, Interview, Audit, Strategy, Export)
  components/            # Shared UI components & design system primitives
  lib/                   # Schema validation utilities & local offline AI fallbacks
```

---

## Getting Started

### Prerequisites

- **Node.js**: v18+ recommended
- **Gemini API Key**: Obtainable from Google AI / Google Cloud Console

### Installation & Environment

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Add your API key to `.env`:
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   ```

### Running Locally

Start the dev server (Express + Vite middleware on `http://localhost:3000`):
```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

---

## Firebase & Firestore (Optional Cloud Mode)

The app runs entirely on browser local storage by default — no Firebase project required. It's built to switch into a Firestore-backed, single-account-authenticated mode once one exists, without any code changes:

- `src/data/DataStore.ts` is the persistence interface every page depends on; `LocalStorageDataStore` (default) and `FirestoreDataStore` are interchangeable implementations of it.
- `src/components/AuthGate.tsx` gates the app behind Firebase Auth and swaps in `FirestoreDataStore` once signed in. There's no sign-up form — this app is scoped to one pre-provisioned account.
- `server/firebaseAdmin.ts` verifies a Firebase ID token on `/api/ai/*` and `/api/sources/*` once configured, so a deployed instance can't have its Gemini quota burned by strangers.
- Firestore documents live under `users/{uid}/...` — multi-tenant-shaped even though the app itself is single-user.

**To turn cloud mode on:**

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com), enable **Firestore** and **Authentication → Email/Password**.
2. Create the one account this app will use, under Authentication → Users → Add user.
3. Copy the web app config (Project Settings → General → Your apps) into `.env` as the `VITE_FIREBASE_*` vars — see `.env.example`.
4. Generate a service account key (Project Settings → Service Accounts → Generate new private key) and paste the JSON into `.env` as `FIREBASE_SERVICE_ACCOUNT_JSON`.
5. Restart the app, sign in, then visit `/migrate` once to copy any existing local data into Firestore.
6. Deploy security rules: `firebase deploy --only firestore:rules` (after `firebase use --add` to link this repo to your project).

Hosting/API deployment (Firebase Hosting + Cloud Run for the Express server) is scaffolded in `firebase.json` but not yet deployed — that's the one remaining manual step once you're ready to put this on the public internet.

---

## What I Designed / Built

While this repository utilizes standard scaffolding patterns, the underlying architecture and core logic were designed and built by **Blair**:

- **Persistent Career Schema & Domain Model**: Designed the multi-tier structured JSON model representing complex career trajectories, initiatives, deliverables, and skill mappings.
- **8-Step AI Decision Pipeline**: Architected the sequential multi-stage LLM workflow, ensuring strict schema enforcement at every boundary.
- **Evidence Classifier & Gap Logic**: Developed the evaluation algorithm that categorizes candidate evidence and detects ambiguity.
- **Human-in-the-Loop Context Interview System**: Created the feedback mechanism that prompts users for missing data and mutates master profile state.
- **ATS Compliance & Strategy Generator**: Implemented the dual-layer audit system and resume strategy engine.

---

## Why I Built This

I built **Career Journey** to solve a persistent operating problem in high-stakes job search: candidate context is lost when resumes are treated as static, one-off documents. 

Traditional resume builders focus on formatting or simple string replacement. In contrast, **Career Journey** models career history as structured, dynamic data. By combining a persistent source of truth with an AI reasoning pipeline and human-in-the-loop context gathering, candidates can evaluate fit objectively, capture missing nuance, and generate targeted applications backed by verified evidence.
