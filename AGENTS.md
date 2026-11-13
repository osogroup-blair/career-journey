# AGENTS.md — Coding Agent Guide

Career Journey is React 19 + Express on Node 24, with local account authentication, SQLite and private VM files. Read [ARCHITECTURE.md](ARCHITECTURE.md), [README.md](README.md) and [SELF_HOSTING.md](SELF_HOSTING.md) before changing deployment/auth/storage. Code wins when documentation disagrees; update the documentation.

## Orientation

- `npm run dev` starts the single Express/Vite process on port 47293 (or PORT).
- Accounts/data live under DATA_DIR (default ./data). Set ADMIN_EMAIL and a strong ADMIN_PASSWORD for first boot of an empty database. There is no default public demo password or unauthenticated development bypass.
- `server/platform.ts`: trusted user/admin middleware. `server/platform/{database,auth,storage,routes}.ts`: SQLite document repository, password/session storage, private files and owner-scoped account/data APIs. `src/data/HttpDataStore.ts` is the browser persistence implementation.
- Firebase is not used at runtime. `migration/export-firebase.mjs` is an optional read-only legacy exporter using a development-only SDK. Do not restore Firebase SDK imports or rules-dependent security to application code.
- Agents can read canonical Career Journey but cannot write it, approve patches or save canonical defaults. Human session credentials and agent credentials are separate.
- Platform AI uses Oso with Ollama fallback; only four legacy UI endpoints are BYOM-aware. Read ARCHITECTURE's AI provider abstraction before changing an AI endpoint.
- GitHub is source/tag storage only. **No GitHub Actions.** Releases and VM deploys use scripts/release.sh and scripts/deploy.sh. Never put .env, data/, backups/, private keys or migration-export/ in Git or images.

## Configuration

.env.example is the source of truth. APP_URL is the canonical URL. HTTPS is required for normal production cookies; ALLOW_HTTP_LOCAL=true is only for local HTTP testing. Registration defaults off and requires working SMTP for verification/reset links. Billing requires Stripe env vars; StillOpen remains admin-only until STILLOPEN_LICENSED=true. MCP and its writes/AI worker remain gated by separate flags.

## Conventions and gotchas worth knowing before you edit

- **HashRouter remains in use.** Preserve existing URLs and redirects.
- **No `@types/react` package installed.** JSX prop typing (e.g. `key`) behaves slightly differently than a typical CRA/Next setup as a result — see the comment in `src/pages/JobTracker.tsx:19-21` if something feels off with list-key typing.
- **`vite.config.ts` supports `DISABLE_HMR`**, explicitly there for agent-edit stability (a comment says not to remove it) — if you're making rapid edits and HMR state gets weird, that's the escape hatch, not a bug to fix.
- **`server.ts` is one ~1950-line file.** Resist the urge to "clean it up" into modules as a drive-by — every past refactor in this codebase has been scoped and verified deliberately (see the plan docs); an unscoped restructuring of the main request-routing file is exactly the kind of change that should be proposed, not just done.
- **Stripe webhook route must stay registered before `express.json()`** — it needs the raw body for signature verification. If you reorder middleware in `server.ts`, don't break this.
- **Individual route handlers re-derive `uid`/plan/admin status from the verified session, never the request body.** This is the actual security boundary for the whole API — preserve it in any new route.
- **`RequireAdmin` (client) and `requireAdmin` (server) are not the same protection.** The client component is UX only; the server middleware is the real gate. Never add an admin feature that skips the server-side check because "the page is already behind RequireAdmin."
- **Two prompt-override systems coexist** (admin-level local JSON files in `server/promptConfig/`, and per-user database documents at `users/{uid}/promptConfigs`) — check which one a code path actually reads before assuming "editing the prompt" means one specific thing. See [ARCHITECTURE.md § Data model](ARCHITECTURE.md#data-model).

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

See [ARCHITECTURE.md § Deployment and known limits](ARCHITECTURE.md#deployment-and-known-limits) for the full list with file references. Highlights:

1. `adminNotes`-leak-style bugs are the kind of thing this codebase has shipped before (found and fixed once already) — when touching `server/support.ts` or any user-facing read path, double check nothing internal-only leaks into a response.
2. The AI provider migration (19 of 23 endpoints still on the legacy Gemini-schema shim, and therefore not BYOM-aware) is the single largest piece of unfinished work, and the riskiest to rush — the payment plan doc explicitly deferred it rather than migrate blind without real provider credentials to test against. If you pick this up, verify each provider for real (`npm run verify:ai`), not just against Gemini.
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

Exercise UI/API changes at http://localhost:47293 (or PORT). Use isolated temporary DATA_DIR values for tests; never seed/delete real accounts as a test. `npm run verify:agents -- --live` now verifies local SQLite/auth/storage, not Firebase. See SELF_HOSTING.md for fixture import and deployment testing.
