# Admin Console, Support Tickets & Feedback Backlog Plan

## Where the app is today (grounds this plan)

- **Admin foundation already exists.** `admin` custom claim via `npm run set:admin` (`server/scripts/setAdmin.ts`), `requireFirebaseAuth`/`requireAdmin` middleware (`server/firebaseAdmin.ts`), the whole `/api/admin/*` namespace gated behind both. Four admin pages today — `AdminUsers.tsx`, `AdminFlags.tsx`, `AdminModels.tsx`, `AdminPrompts.tsx` — each following the same `RequireAdmin`-wrapped-page + `adminClient.ts` fetch-helper pattern, linked as flat items in the Navbar's "More" dropdown.
- **"See all subscriptions" is mostly built already.** `GET /api/admin/users` (`server.ts:246`) cross-references every Firebase Auth account with its Firestore billing doc and returns plan, subscription status, usage counters, and comped flag. `AdminUsers.tsx` renders it as a table with a comp toggle. What's missing for this ask is the ticket/feedback system, not subscription visibility.
- **No transactional email capability anywhere in the app.** Firebase Auth's built-in email (verification/password reset) is the only email path today, and it only sends Firebase's own fixed templates for auth events — it cannot send an arbitrary "new ticket filed" or "here's a reply" notification. If you want to be notified of new tickets without babysitting the admin dashboard, that's new infrastructure (Phase 5 below).
- **No Firebase Storage configured.** `firebase.json` only wires up Firestore + Hosting. `VITE_FIREBASE_STORAGE_BUCKET` exists in `.env` because it's a standard field in every Firebase SDK config blob, not because Storage has been provisioned. Relevant if you want real screenshot capture (Phase 7 below).
- **The existing Firestore rules pattern is the template for how tickets should work.** `firestore.rules` already draws exactly the distinction this feature needs: most collections are owner-read/owner-write; `users/{uid}/meta/billing` is owner-read but `write: if false` — server-only via the Admin SDK, because letting a client write its own plan would be a security hole. Ticket status/triage/priority needs the same treatment (server-only), while ticket content is closer to billing than to freeform app data because triage, cross-account visibility, rate-limiting, and notifications all need a server chokepoint — so ticket writes route through Express endpoints (Admin SDK), not direct client Firestore writes, even though that's a slightly heavier pattern than `careerJourney`/`jobs`.
- **No app build-version stamp exists anywhere** (`package.json` version is still `0.0.0`, unused). Worth having for triage ("which build was this filed against") — small addition, folded into Phase 0.

## Brainstorm — everything this actually needs to run (holistic pass)

Beyond what you described, a working loop needs:

- **Abuse prevention on ticket submission** — an open "message me" surface on every authenticated page needs a rate limit, same spirit as the existing AI-quota guards in `server/rateLimiter.ts`.
- **A way for the user to see their own ticket status** — otherwise it's a one-way mailbox and testers will re-file the same bug wondering if it landed. A lightweight "My Feedback" list + a reply thread per ticket.
- **A notification path to *you*** — the whole point of "collect user feedback" breaks down if the only way to see a new ticket is refreshing an admin page. Real email notification is a separate build (new provider, since Firebase Auth's mailer can't do this) — flagged as its own phase so it doesn't block shipping the core loop.
- **Privacy/consent for auto-captured context.** "Capture the page and their user details" is right to want automatically, but a screenshot can also capture other people's data on screen (e.g. if this ever grows multi-tenant) or content the tester didn't mean to send. Auto-capture non-visual context (route, plan, browser, app version) always; make screenshot capture an explicit opt-in toggle at submit time, not silent.
- **A real bug-vs-enhancement taxonomy**, separate from what the user thinks they're reporting. Users will mislabel constantly ("this is broken" for a feature they just don't like). Two fields: the user's own guess at submit time, and an admin-set triage classification that's what actually drives the backlog.
- **The backlog export format for a coding agent, concretely.** "A backlog a coding agent can iterate on" is the most specific and important part of this ask — the answer that fits this repo's existing conventions: this project already carries hand-written planning docs in its root (`payment-system-plan.md`, `job-fit-tool-iteration-plan.md`) that a coding agent just reads directly. The plan below generates the same kind of artifact automatically from triaged tickets — flat markdown files with frontmatter, pulled on demand — so Claude Code (or any coding agent working in this repo) can `ls backlog/` and read tickets exactly like it reads any other plan doc, no new tooling required on the agent side.
- **Admin information architecture, before it gets messy.** Today's 4 admin pages already live as flat links in a dropdown; this adds 1–2 more. Worth consolidating into a proper admin shell with a sidebar once that happens (Phase 6), rather than letting the "More" menu keep growing.
- **Data retention / what NOT to capture.** Tickets should snapshot minimal identifying context (uid, email, plan, route, browser) — never the user's full Career Journey content or job data, even if related to the bug. If more context is needed, ask the user to paste it, don't auto-scrape their data into a ticket.

## Data model

Two new top-level Firestore collections (top-level, not nested under `users/{uid}/...`, because admin needs to query across every account — the same reason `stripeEvents` and `config` are top-level rather than per-user).

**`tickets/{ticketId}`**
```
uid, userEmail, userPlan          // snapshot at submit time, for triage context
type: 'bug' | 'idea' | 'question' | 'other'   // user's own guess, set once at submission
triageType?: 'bug' | 'enhancement' | 'question' | 'not_actionable'  // admin-set, drives the backlog
status: 'new' | 'triaged' | 'backlogged' | 'in_progress' | 'resolved' | 'closed' | 'wontfix'
priority?: 'low' | 'medium' | 'high' | 'critical'   // admin-set
title, description                // user-entered
context: { route, userAgent, viewport, appVersion, timestamp }  // auto-captured
screenshotUrl?                    // Phase 7 only
adminNotes?                       // internal-only, never sent to the user
createdAt, updatedAt
```

**`tickets/{ticketId}/messages/{messageId}`** — the two-way thread:
```
authorUid, authorRole: 'user' | 'admin', body, createdAt
```

**Firestore rules addition** (`firestore.rules`) — owner can read their own tickets/messages; all writes are server-only via the Admin SDK (mirrors the `meta/billing` pattern exactly, for the reasons above):
```
match /tickets/{ticketId} {
  allow read: if request.auth != null && resource.data.uid == request.auth.uid;
  allow write: if false; // server-only — see server/support.ts
  match /messages/{messageId} {
    allow read: if request.auth != null
      && get(/databases/$(database)/documents/tickets/$(ticketId)).data.uid == request.auth.uid;
    allow write: if false;
  }
}
```
Admin's cross-account view never touches these rules at all — like `/api/admin/users`, it reads via the Admin SDK, which bypasses Firestore rules entirely.

## Phase plan

### Phase 0 — Foundation
- Add the `tickets` rules block above to `firestore.rules`.
- New `server/support.ts` module: `createTicket()`, `listTicketsForUser()`, `addUserMessage()`, `listAllTickets()` (admin, filterable by `status`/`triageType`), `updateTicket()` (admin), `addAdminMessage()` — same shape as `server/billing.ts`, all Admin-SDK-mediated.
- Simple per-uid daily rate limit on ticket creation (reuse the in-memory sliding-window pattern already in `server/rateLimiter.ts`'s `withinBurstLimit`/fallback-counter — e.g. 20/day, generous but spam-proof).
- Stamp a build version: inject `VITE_APP_VERSION` at build time (short git SHA or `package.json` version) via `vite.config.ts`'s `define`, so every ticket's `context.appVersion` says what build it was filed against.
- Verification: a ticket document can only be created through the server; a direct client Firestore write attempt is rejected by rules; a non-owner client read of another user's ticket is rejected.

### Phase 1 — Ticket submission API + feedback widget
- Server routes (mounted under a new `app.use("/api/support", requireFirebaseAuth)` group, same pattern as `/api/billing`):
  - `POST /api/support/tickets` — body `{ type, title, description, context }`; server fills in `uid`/`userEmail`/`userPlan` (via `getBillingState`) and `status: 'new'`.
  - `GET /api/support/tickets` — caller's own tickets + message counts, for "My Feedback".
  - `GET /api/support/tickets/:id/messages`, `POST /api/support/tickets/:id/messages` — thread for one ticket, 403s if `ticket.uid !== req.uid`.
- `src/lib/supportClient.ts` — thin fetch wrapper, same shape as `adminClient.ts`.
- `src/components/FeedbackWidget.tsx` — a floating "Feedback" button (visible app-wide, next to `AiActivityIndicator` in `App.tsx`), opens a small self-contained panel (no generic Dialog primitive exists yet in `ui.tsx` — build this as a standalone overlay component, same style as `AuthGate`'s full-screen panels rather than introducing a new primitive for one use). Fields: type (Bug / Idea / Question), title, description. Auto-captured context (current route, browser) shown read-only for transparency before submit.
- Verification: submit a ticket from three different pages, confirm `context.route` matches each; confirm the rate limit kicks in after the daily cap; confirm a second test account can't see the first account's ticket via `GET /api/support/tickets`.

### Phase 2 — "My Feedback" (user-facing status + replies)
- New page `src/pages/MyFeedback.tsx`, linked from Settings — list of the user's own tickets with status badges, click into a thread view, reply box (`POST .../messages`).
- Verification: file a ticket, reply to it as the user, confirm the thread renders in order with correct author attribution.

### Phase 3 — Admin Tickets inbox (triage)
- `GET /api/admin/tickets` (filterable by `status`/`triageType` query params), `POST /api/admin/tickets/:id` (status/triageType/priority/adminNotes), `POST /api/admin/tickets/:id/messages` (admin reply) — all under the existing `/api/admin` + `requireAdmin` gate in `server.ts`.
- `src/pages/AdminTickets.tsx` (`RequireAdmin`-wrapped, same as `AdminUsers.tsx`): table of tickets with status/type/priority filters and tabs (New / Triaged / Backlogged / In Progress / Resolved), a detail panel to set `triageType`/`priority`/`adminNotes`, and the reply thread.
- A small "new tickets" badge count in the Navbar admin menu (poll `GET /api/admin/tickets?status=new&count=true` on an interval) so new tickets are noticeable without a notification system yet.
- Verification: submit a ticket as a test user, triage it as admin (set type=bug, priority=high, status=triaged), confirm the test user sees the updated status and any admin reply in "My Feedback."

### Phase 4 — Backlog export for the coding agent
- New script `server/scripts/pullBacklog.ts` (Admin SDK, `tsx`, same shape as the other `server/scripts/*.ts` files) — queries tickets where `triageType` is `bug` or `enhancement` and `status` is `triaged`/`backlogged`/`in_progress`, writes one markdown file per ticket to a new `backlog/` directory at repo root: `backlog/BUG-<shortid>.md` / `backlog/ENH-<shortid>.md`, with frontmatter (`id`, `type`, `priority`, `status`, `reportedBy`, `page`, `createdAt`) and a body of title + description + full message thread + `adminNotes`.
- `npm run backlog:pull` script entry in `package.json`.
- Add `backlog/` to `.gitignore` — these files contain user email addresses (PII); pull them fresh from Firestore on demand rather than committing history. Firestore stays the source of truth; the markdown files are a disposable local working set for whoever (you or a coding agent) is about to act on them.
- Closing the loop stays manual by design: once an item ships, flip its status in the Admin Tickets UI (Phase 3 already supports this) — no auto-detection of "was this fixed" is attempted, since that's unreliable without tying tickets to specific commits.
- Verification: triage 2–3 tickets as bug/enhancement, run `npm run backlog:pull`, confirm the right markdown files appear with correct frontmatter and full thread content, confirm a `wontfix`/`resolved` ticket is excluded.

### Phase 5 — Email notifications
- New transactional email provider (Firebase Auth's mailer can't send arbitrary content — this needs its own service; Resend is a reasonable default: generous free tier, simple API, no domain-verification headache to get started). New env vars: `RESEND_API_KEY`, `SUPPORT_NOTIFY_EMAIL` (your inbox).
- `server/support.ts`: on `createTicket()`, email `SUPPORT_NOTIFY_EMAIL`; on `addAdminMessage()`, email the ticket's `userEmail`.
- This phase is explicitly decoupled from Phases 0–4 — the core loop (submit → triage → backlog → fix) works via the admin dashboard alone; notifications are a convenience layer, not a blocker.
- Verification: file a test ticket, confirm the notification email arrives; reply as admin, confirm the user-side notification email arrives.

### Phase 6 — Admin shell cleanup
- `src/layouts/AdminLayout.tsx` — sidebar nav (Users / Tickets / Flags / Models / Prompts), single `RequireAdmin` wrap at the layout level instead of per-page, nested routes under `/admin/*` in `App.tsx`.
- Collapse the Navbar's "More" dropdown admin links down to one "Admin" entry pointing at `/admin`.
- Verification: every existing admin page still works at its current URL; a non-admin hitting any `/admin/*` route still sees the same "Admin access required" gate.

### Phase 7 — Screenshot capture (optional/stretch)
- Requires provisioning Firebase Storage: enable it in the Firebase Console, add a `storage` key + `storage.rules` to `firebase.json`/repo root (uid-prefixed paths, owner-write/admin-read only — never a public bucket).
- Client: `html2canvas` (or similar) to capture the current viewport, explicit opt-in toggle in `FeedbackWidget.tsx` ("Attach a screenshot?", default off, with a preview before submit so nothing sensitive goes out unreviewed).
- Client uploads directly to Storage at an authenticated, uid-scoped path; a server endpoint validates the path belongs to the caller before saving the reference on the ticket (mirrors how BYOM key validation never trusts client-only claims — see `payment-system-plan.md` Phase 4).
- Verification: submit with and without the screenshot toggle; confirm an unauthenticated request to a screenshot URL is rejected; confirm a user can't reference another user's screenshot path.

## Open decisions for Blair

- **Ticket rate limit number** — 20/day per account suggested above as a starting guardrail; adjust once real tester volume is known (same "config/featureFlags, tunable without redeploy" pattern used for AI quotas could be reused here if you want it adjustable later rather than hardcoded).
- **Email provider** — Resend suggested for Phase 5 as the simplest default; say if you have an existing preference (SendGrid, Postmark, etc.) or already own a sending domain.
- **Whether Phase 7 (screenshots) is worth the Storage setup** — the auto-captured route/browser/plan context (Phases 0–1) covers most triage needs without it; screenshots add real value for visual bugs but are the most infrastructure-heavy phase here. Fine to ship 0–6 and revisit.
- **Whether "coding agent" backlog consumption should also be pushable**, not just pull-based — e.g. a `/loop`-style scheduled task that runs `backlog:pull` and pings you when new bug-priority=critical items land. Not in scope above; flag if wanted, it's a small addition once Phase 4 exists.
