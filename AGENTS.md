# AGENTS.md — Coding Agent Guide

You're working in **Career Journey**, a job-search/resume SaaS: React 19 + Express, Firebase, Stripe, and three AI providers. Read this file first, then [ARCHITECTURE.md](ARCHITECTURE.md) for how the system actually works, and [README.md](README.md) for the product framing. All three are kept in sync with the real implementation — if any of them disagrees with the code, trust the code and fix the doc.

## Orientation in one minute

- One Express process (`server.ts`) serves the API and, via Vite middleware in dev, the SPA. `npm run dev` starts everything.
- The app runs with **zero external services configured** by default — local-only storage, no auth, no billing. Every cloud feature (Firestore, Stripe, admin, email) is additive and gated behind env vars in `.env.example`; the app degrades gracefully without them (see the table below).
- Three AI providers exist, but the provider-agnostic abstraction (`server/ai/`) only covers 2 of ~19 AI endpoints. Assume any endpoint you touch is still on the old hand-written-Gemini-schema pattern unless you check `server/ai/schemas.ts` first. See [ARCHITECTURE.md § AI provider abstraction](ARCHITECTURE.md#ai-provider-abstraction) before changing anything AI-related.
- Automated tests exist via Vitest (`npm test` / `npx vitest run`, configured in `vitest.config.ts`), covering `server/support.ts` access-control and rate limiting. `npm run lint` is `tsc --noEmit`. When adding features, run tests and exercise changes live on the dev server.

## What env vars unlock what

| You want to work on | You need |
|---|---|
| Job pipeline / Career Journey / resume generation, local-only | Nothing but `GEMINI_API_KEY` |
| Multi-account, Firestore persistence, admin | `VITE_FIREBASE_*` + `FIREBASE_SERVICE_ACCOUNT_JSON` |
| Billing / plan gating / Upgrade page | The Firebase vars above **and** `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` (`stripe listen --forward-to localhost:47293/api/billing/webhook` for local webhook delivery) |
| BYOM (multi-provider AI) | An `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` for `npm run verify:ai`; real BYOM keys come from the user at runtime, never from env vars |
| Support ticket email notifications | `SMTP_USER` + `SMTP_PASS` + `SUPPORT_NOTIFY_EMAIL` (optional — the ticket loop works without email) |

Full list with defaults in `.env.example` — it's the actual source of truth, read it directly rather than trusting a paraphrase.

## Conventions and gotchas worth knowing before you edit

- **`HashRouter`, not `BrowserRouter`** (`src/App.tsx`) — URLs look like `#/matches`. Don't "fix" this to a path-based router without checking why (Firebase Hosting static-file routing is the likely reason, given `firebase.json`'s scaffolding).
- **No `@types/react` package installed.** JSX prop typing (e.g. `key`) behaves slightly differently than a typical CRA/Next setup as a result — see the comment in `src/pages/JobTracker.tsx:19-21` if something feels off with list-key typing.
- **`vite.config.ts` supports `DISABLE_HMR`**, explicitly there for agent-edit stability (a comment says not to remove it) — if you're making rapid edits and HMR state gets weird, that's the escape hatch, not a bug to fix.
- **`server.ts` is one ~1950-line file.** Resist the urge to "clean it up" into modules as a drive-by — every past refactor in this codebase has been scoped and verified deliberately (see the plan docs); an unscoped restructuring of the main request-routing file is exactly the kind of change that should be proposed, not just done.
- **Stripe webhook route must stay registered before `express.json()`** — it needs the raw body for signature verification. If you reorder middleware in `server.ts`, don't break this.
- **Individual route handlers re-derive `uid`/plan/admin status from the verified token, never the request body.** This is the actual security boundary for the whole API — preserve it in any new route.
- **`RequireAdmin` (client) and `requireAdmin` (server) are not the same protection.** The client component is UX only; the server middleware is the real gate. Never add an admin feature that skips the server-side check because "the page is already behind RequireAdmin."
- **Two prompt-override systems coexist** (admin-level local JSON files in `server/promptConfig/`, and per-user Firestore docs at `users/{uid}/promptConfigs`) — check which one a code path actually reads before assuming "editing the prompt" means one specific thing. See [ARCHITECTURE.md § Data model](ARCHITECTURE.md#data-model).
- **`storage.rules` and the newest `firestore.rules`/`firestore.indexes.json` entries are not deployed** to the live Firebase project (no authenticated `firebase login` session exists in this environment). Don't assume a rules file you edit is live — it isn't, until someone with CLI access runs `firebase deploy`. Direct client-side screenshot uploads (Phase 2) operate via Firebase Storage SDK; see `admin-support-hardening-plan.md` for remaining CLI/index phases.

## Where things live (quick index)

- API routes: `server.ts` (grep for `app.get(`/`app.post(` — full inventory in [ARCHITECTURE.md](ARCHITECTURE.md#backend--api-surface))
- AI provider clients: `server/ai/`
- Billing/quota logic: `server/billing.ts`, `server/stripe.ts`
- Support tickets: `server/support.ts`, `src/components/FeedbackWidget.tsx`, `src/pages/MyFeedback.tsx`, `src/pages/AdminTickets.tsx`
- Career Journey schema: `src/types/careerJourney.ts`
- Client-side AI/admin/billing/support API wrappers: `src/lib/*Client.ts`
- Job-pipeline stage views: `src/pages/*Stage.tsx`, stepper shell in `src/layouts/JobLayout.tsx`
- The app's own AI "skill" prompts (job parsing, ATS tactics, voice, cover letters — loaded into the AI's system prompt at server startup, not developer docs): `server/knowledge/*.md`, loaded by `server/knowledge.ts`

## Planning docs and the ticket backlog

This repo carries hand-written planning docs at the root (`payment-system-plan.md`, `admin-support-feedback-plan.md`, `admin-support-hardening-plan.md`, `job-fit-tool-iteration-plan.md`). They're **historical record + forward-looking task lists**, not current-state documentation — each one opens with a "where the app is today" section that was accurate *when written*, then gets stale as work ships. For current state, trust [ARCHITECTURE.md](ARCHITECTURE.md) and the code, not these. For "what's the next thing to build and why," these are exactly the right place to look — especially `admin-support-hardening-plan.md`, where Phases 0, 2, 5, 6, 7, 9, and 10 have shipped.

`backlog/*.md` is generated (`npm run backlog:pull`), gitignored, and reflects live triaged support tickets — treat it the same way you'd treat any other planning doc: `ls backlog/` and read what's there before assuming there's nothing queued.

## Known incomplete work (in priority-ish order if you're looking for something to pick up)

See [ARCHITECTURE.md § Known inconsistencies / incomplete migrations](ARCHITECTURE.md#known-inconsistencies--incomplete-migrations) for the full list with file references. Highlights:

1. `adminNotes`-leak-style bugs are the kind of thing this codebase has shipped before (found and fixed once already) — when touching `server/support.ts` or any user-facing read path, double check nothing internal-only leaks into a response.
2. The AI provider migration (17 of 19 endpoints still hardcoded to Gemini) is the single largest piece of unfinished work, and the riskiest to rush — the payment plan doc explicitly deferred it rather than migrate blind without real provider credentials to test against. If you pick this up, verify each provider for real (`npm run verify:ai`), not just against Gemini.
3. Test coverage is growing — Vitest is configured (`vitest.config.ts`, `server/__tests__/support.test.ts`) covering support access control and rate limits (`npm test`). Further test expansion (e.g. `server/billing.ts` quota transactions) remains high value.

## Verifying your work

Run automated tests and static typechecks:

```bash
npm test
npm run lint
```

Then run the dev server and exercise UI/API changes in a browser:

```bash
npm run dev
```

against `http://localhost:47293`. For anything touching Firestore/billing/admin, you need real Firebase + Stripe test-mode credentials configured (see the env var table above) — there's no emulator setup in this repo. `npm run seed:demo` gives you a fully-populated, Pro-comped account to test against without needing your own data.
