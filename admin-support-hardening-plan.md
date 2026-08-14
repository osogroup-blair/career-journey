# Admin/Support/Feedback Hardening Plan

Follow-up to `admin-support-feedback-plan.md`, whose 7 phases are fully shipped and merged
(commit `2d0e21d`). This plan addresses what a live-testing retrospective on that work
surfaced: one real bug, and a set of workarounds taken during implementation that were the
right call at the time but should be revisited now.

## Where things stand (grounds this plan)

- The full ticket/feedback loop works end-to-end today: `FeedbackWidget.tsx` (submission +
  opt-in screenshot) → `MyFeedback.tsx` (status/replies) → `AdminTickets.tsx` (triage) →
  `server/scripts/pullBacklog.ts` (`npm run backlog:pull`, exports triaged tickets to
  gitignored `backlog/*.md`). All of it was verified live against the real Firebase project
  during development, not just type-checked.
- **This environment has no `firebase login`-authenticated CLI.** That single constraint is
  the reason for three separate workarounds below (screenshot upload path, Firestore query
  shape, and the fact that `firestore.rules`'/`storage.rules`' newest additions were never
  actually deployed). None of them are insecure as shipped — see each phase for why — but
  they're not the intended long-term design either.
- One real, confirmed, unfixed bug exists: **`adminNotes` leaks to the ticket owner.** See
  Phase 0 — this should be the first thing whoever picks this up does, it's small and
  unambiguous.

## Phase 0 — Fix the `adminNotes` leak (do this first, no decision needed)

`Ticket.adminNotes` (`src/types/support.ts`) is documented as "Internal-only — never sent to
the user," but `getTicketForUser` and `listTicketsForUser` in `server/support.ts` return the
raw Firestore document unfiltered, including that field. `MyFeedback.tsx` never renders it,
but it's plainly visible in the `GET /api/support/tickets` and
`GET /api/support/tickets/:id/messages` JSON responses via devtools.

- In `server/support.ts`, add a small `stripAdminFields(ticket: Ticket): Ticket` helper that
  omits `adminNotes` (and nothing else — `triageType`/`priority` are fine to expose, only
  `adminNotes` is documented as internal-only).
- Apply it in `listTicketsForUser` (map over the array) and `getTicketForUser` (on the single
  ticket before returning).
- Do **not** apply it in `listAllTickets` / `getTicketForAdmin` — admins are supposed to see
  `adminNotes`.
- Verification: as a non-admin user, hit both endpoints directly (or inspect the Network tab
  in "My Feedback") on a ticket that has `adminNotes` set, confirm the field is absent from
  the response entirely (not just empty-string) while still present when the same ticket is
  fetched via the `/api/admin/tickets/*` routes.

## Phase 1 — Firebase CLI access (unlocks Phases 2 and 3 below)

Requires an interactive `firebase login` on a machine with browser access — not something a
coding agent can do unattended. **This phase is a human-only prerequisite step**; everything
in it needs to happen before Phases 2–3 can start, and it's fine to skip Phases 2–3 entirely
and leave the current workarounds in place indefinitely if that's the call.

1. `npm install -g firebase-tools` (or use `npx firebase-tools` per-command).
2. `firebase login` — opens a browser, authenticates against whichever Google account owns
   the `career-journey-e4018` Firebase project.
3. `firebase use career-journey-e4018` from the repo root (or `firebase use --add` if the
   project alias isn't already configured — check for a `.firebaserc` file; if absent, this
   step creates it).
4. `firebase deploy --only firestore:rules,storage` — deploys the `tickets` block already
   present in `firestore.rules` and all of `storage.rules` as currently written in the repo.
   Both files are already correct for the intended design; this step just needs a session
   with real credentials to actually push them.
5. Verification: in the Firebase Console, confirm Firestore Rules and Storage Rules both show
   the deployed timestamp matching this deploy, and their content matches the repo files.

## Phase 2 — Direct client-to-Storage screenshot upload (depends on Phase 1)

Today, `FeedbackWidget.tsx` captures a screenshot with `html2canvas-pro`, base64-encodes it
(`blobToBase64` in `src/lib/supportClient.ts`), and sends the whole thing inside the
`POST /api/support/tickets` JSON body; `server/support.ts`'s `createTicket` then uploads it to
Storage itself via the Admin SDK. This was a deliberate workaround for Phase 1 not existing
yet — the Admin SDK bypasses Storage rules entirely, so it worked regardless of what was or
wasn't deployed. It has real costs: base64 inflates payload size ~33%, the image transits
through the Express server twice (browser→server, server→Storage) instead of once
(browser→Storage directly), and it ties up the ticket-creation request for the duration of
the upload.

Once Phase 1's `storage.rules` are actually live, switch back to the originally-designed flow:

- `src/lib/supportClient.ts`: replace `blobToBase64` with a `uploadTicketScreenshot(blob):
  Promise<string>` that uploads directly to Storage from the browser using the `firebase/storage`
  client SDK (`getStorage`, `ref`, `uploadBytes`) at `ticketScreenshots/{uid}/{randomId}.png` —
  this exact function existed in an earlier iteration of this work before the Phase 1 blocker
  forced the redesign; it's a straightforward re-add, not new design work. `src/lib/firebase.ts`
  will need its `storage` export (a `FirebaseStorage` instance) re-added too — it was removed
  as dead code when this got reworked; see git history around the `admin-support-feedback-plan.md`
  Phase 7 commit for the exact prior shape of both files if useful as a reference.
- `server/support.ts`'s `createTicket`: change the `screenshotBase64` input back to
  `screenshotPath: string`, and validate it server-side with
  `input.screenshotPath.startsWith(\`ticketScreenshots/${uid}/\`)` before persisting it on the
  ticket (never trust a client-supplied path outright — same reasoning as the BYOM key
  validation pattern elsewhere in this codebase). Drop the `getStorage(app).bucket().file(...).save(...)`
  call entirely.
- `server.ts`'s `POST /api/support/tickets` route: swap `screenshotBase64` back to
  `screenshotPath` in the destructured body and the `createTicket` call.
- Verification: same as the original Phase 7 verification — submit with and without the
  screenshot toggle, confirm the ticket's `screenshotPath` is set correctly, confirm the admin
  "View attached screenshot" flow (unchanged — `getTicketScreenshotUrl`'s signed-URL approach
  doesn't need to change either way) still renders the image. Additionally: confirm a
  malformed/foreign-uid path in the request body is rejected (test by hand-crafting a
  `screenshotPath` that doesn't match your own uid and confirming the ticket is created without
  a screenshot attached, not with someone else's).

## Phase 3 — Real Firestore composite indexes (depends on Phase 1)

`listTicketsForUser` and `listAllTickets` in `server/support.ts` currently fetch by a single
`.where()` clause and sort newest-first **in memory** (`byNewestFirst`), instead of using
Firestore's `.orderBy()` at the query level — because `.where(field).orderBy(otherField)`
needs a manual composite index, and there was no way to deploy one. This means every ticket
list call — including the Navbar/AdminLayout badge poll, which runs every 2 minutes per admin
session — reads the **entire** `tickets` collection over the wire and discards most of it
client-side. Fine at current volume (dozens of tickets), a real cost once it's hundreds+.

- Add index definitions to `firestore.indexes.json` for: `tickets` collection, `(uid ASC,
  createdAt DESC)` (serves `listTicketsForUser`); `(status ASC, createdAt DESC)` and
  `(triageType ASC, createdAt DESC)` (serves `listAllTickets`'s two filter modes).
- `firebase deploy --only firestore:indexes` (can be combined with Phase 1's rules deploy).
  Composite index builds are asynchronous server-side — check the Firebase Console's Indexes
  tab for "Building" → "Enabled" before relying on them.
- Once enabled, revert `listTicketsForUser` and `listAllTickets` in `server/support.ts` to
  chain `.orderBy("createdAt", "desc")` onto the `.where()` query directly, and delete the
  now-unnecessary `byNewestFirst` sort (unless `getTicketForAdmin`'s message ordering also
  wants it — check before removing wholesale).
- Verification: with a realistic number of test tickets (10+), confirm list ordering is
  unchanged from before this phase, and confirm (via Firebase Console usage metrics, or just
  eyeballing response time) that reads dropped from "whole collection" to "just the matching
  subset."

## Phase 4 — Activate email notifications

`server/email.ts` and the three notification call sites in `server/support.ts`
(`notifySupportOfNewTicket`, `notifySupportOfUserReply`, `notifyUserOfAdminReply`) are fully
built and were verified against the real `sendEmail()` code path — the only untested leg is an
actual Resend API call, since no account exists yet.

1. Sign up at resend.com (free tier covers this volume comfortably).
2. Generate an API key.
3. Set `RESEND_API_KEY` and `SUPPORT_NOTIFY_EMAIL` in `.env` (both currently blank — see
   `.env.example` for the full set of related vars, including optional `SUPPORT_FROM_EMAIL`
   for a verified custom domain instead of Resend's shared `onboarding@resend.dev` test sender).
4. Verification: file a test ticket, confirm the notification email actually arrives (not just
   the "would have sent" log line); reply as admin, confirm the user-side notification arrives
   too; reply as the user on an existing ticket, confirm the support-side "new reply" email
   arrives.

No code changes needed — this phase is purely configuration.

## Phase 5 — Let ticket owners view their own screenshot

Per the original plan's explicit design ("owner-write/admin-read only"), a user who attaches a
screenshot can never see it again — only admins can view it, via
`GET /api/admin/tickets/:id/screenshot`. Revisit now that the feature has shipped and this gap
is concretely visible: `MyFeedback.tsx`'s ticket detail view shows every other field of a
ticket back to its owner except the screenshot they themselves uploaded.

- `server/support.ts`: add `getTicketScreenshotUrlForUser(app, uid, ticketId)` — same signed-URL
  logic as the existing `getTicketScreenshotUrl`, but checks `ticket.uid === uid` first (mirror
  `getTicketForUser`'s ownership check) instead of trusting the caller is already admin-gated.
- `server.ts`: add `GET /api/support/tickets/:id/screenshot` under the existing
  `requireFirebaseAuth`-gated `/api/support` group.
- `src/lib/supportClient.ts`: add `getMyTicketScreenshotUrl(id)`.
- `src/pages/MyFeedback.tsx`'s `TicketThread` component: add the same "View attached
  screenshot" → inline `<img>` pattern already used in `AdminTickets.tsx`'s `TicketDetail`
  (copy that block, swap the client call).
- Verification: as the ticket's own owner, view a screenshot you attached; as a *different*
  signed-in user, attempt to hit the new endpoint with someone else's ticket ID and confirm a
  403, not the image.

## Phase 6 — Persist the ticket-submission rate limit

`withinDailyTicketLimit` in `server/support.ts` uses an in-memory `Map` (`ticketCreationCounts`)
that resets on every server restart — meaning every deploy resets everyone's daily counter.
Contrast with the AI-quota pattern already established in `server/billing.ts`
(`checkAndConsumeAiQuota`), which persists usage in Firestore precisely so it survives restarts.

- Decide first (see Open Decisions below) whether this is worth doing — it's a low-stakes
  abuse-guard, not a monetization control, so the in-memory version may be perfectly fine
  indefinitely.
- If proceeding: add a `ticketSubmissionsToday` + `ticketSubmissionsResetAt` pair to a small
  per-user doc (either reuse `users/{uid}/meta/billing`, or a new
  `users/{uid}/meta/supportUsage` doc, consistent with how billing state is scoped) and move
  the check into a Firestore transaction, mirroring `checkAndConsumeAiQuota`'s shape.
- Verification: submit tickets up to the limit, restart the server mid-window, confirm the
  limit is still enforced (not reset) — this is the entire point of the change, so the test
  must include an actual restart, not just multiple requests in one server lifetime.

## Phase 7 — Screenshot/Storage retention policy

Nothing currently deletes a ticket's screenshot from Storage, ever — not on resolve, not on
close, not on any schedule. Storage usage grows unbounded as tickets accumulate.

- Decide the policy first (see Open Decisions) — options include: delete the screenshot the
  moment a ticket's status moves to `resolved`/`closed`/`wontfix` (via a hook in
  `updateTicket`); or a separate scheduled cleanup script (`server/scripts/*.ts`, run
  periodically, e.g. via `/loop` or a cron-based scheduled task) that sweeps screenshots for
  tickets closed more than N days ago.
- Whichever is chosen, implement it in `server/support.ts` (inline in `updateTicket`) or as a
  new `server/scripts/cleanupScreenshots.ts` (standalone, `npm run` entry, same shape as
  `pullBacklog.ts`).
- Verification: create a ticket with a screenshot, resolve/close it (or run the cleanup
  script, depending on which approach), confirm the Storage file is actually gone (not just
  the Firestore reference) — check via the Storage console or an Admin SDK `.exists()` call,
  the same way this was verified during the original Phase 7 build.

## Phase 8 — Backlog export workflow refinement

`pullBacklog.ts` only exports tickets with `status` in `triaged`/`backlogged`/`in_progress` —
the moment a ticket flips to `resolved`, it disappears from `backlog/` on the next pull, even
if the fix hasn't actually shipped yet (e.g., a coding agent opened a PR but it hasn't merged).

- This needs a real decision about the intended workflow (see Open Decisions) before any code
  changes: does "resolved" mean "fix is live" or "fix is in review"? If the latter, either
  don't flip to `resolved` until merge (process-only fix, no code change), or add a distinct
  intermediate status (e.g. `in_review`) to `TicketStatus` in `src/types/support.ts` and
  include it in `pullBacklog.ts`'s `ACTIONABLE_STATUSES` set, plus the `STATUS_OPTIONS`/
  `STATUS_LABEL`/`STATUS_VARIANT` maps in both `AdminTickets.tsx` and `MyFeedback.tsx`.
- Verification: run through a full triage → backlog pull → simulated fix → status change
  cycle and confirm the ticket stays visible in `backlog/` for exactly as long as intended.

## Phase 9 — Minimal test coverage

Every phase of the original build was verified live/manually in a browser session — there is
currently no automated test coverage anywhere in this feature (nor, notably, anywhere else in
this codebase — check for an existing test runner/config before introducing one from scratch).

- If a test runner doesn't already exist in this repo, that's a decision point in itself (see
  Open Decisions) — introducing one is a bigger commitment than it looks.
- If proceeding, prioritize server-side coverage over UI coverage — the highest-value/lowest-effort
  targets are `server/support.ts`'s access-control checks (`TicketAccessError` /
  `TicketNotFoundError` paths in `getTicketForUser`, `addUserMessage`, `getTicketForAdmin`) and
  the rate limiter (`withinDailyTicketLimit`), since those are exactly the kind of logic that
  silently breaks under refactoring without a human noticing in manual testing.
- Verification: tests actually catch a deliberately-reintroduced version of the Phase 0 bug
  (temporarily remove the `stripAdminFields` call and confirm a test fails) — a coverage
  suite that wouldn't have caught the one real bug this feature shipped with isn't testing the
  right things.

## Phase 10 — Housekeeping (unrelated to this feature, noticed in passing)

- Two stale test accounts from earlier, unrelated work —
  `test-signup-verify@career-journey.app` and `phase2-free-test@career-journey.app` — sit in
  Firebase Auth/Firestore and clutter the admin Users list. Delete via Firebase Console or a
  one-off Admin SDK script if a clean user list matters.
- `Navbar.tsx` and `AdminLayout.tsx` each run their own independent 2-minute poll of
  `listAdminTickets({ status: 'new' })` for the new-ticket badge count — harmless duplication,
  not a bug, but could be consolidated into a shared hook/context if it's ever worth the
  refactor.

## Open decisions before/while executing

- **Phase 1 (Firebase CLI access)**: is it worth doing at all? Everything downstream of it
  (Phases 2 and 3) is a pure efficiency/cleanliness improvement over a working current state,
  not a bug fix. Fine to defer indefinitely, or to do Phase 1 without doing 2/3 right away.
- **Phase 6 (persisted rate limit)**: is an in-memory, restart-resetting abuse-guard actually a
  problem at your deploy cadence and traffic, or is this over-engineering a low-stakes limit?
- **Phase 7 (retention policy)**: delete-on-resolve vs. scheduled sweep vs. do nothing and
  revisit if Storage costs ever become noticeable?
- **Phase 8 (backlog workflow)**: what does "resolved" actually mean in your workflow —
  shipped, or just decided/in-progress? This determines whether Phase 8 needs a new status at
  all.
- **Phase 9 (test coverage)**: does this codebase want a test runner introduced at all, given
  none exists today? If yes, which one (Vitest is the natural fit given this is already a Vite
  project) — that's a separate, larger decision than this feature alone should force.
