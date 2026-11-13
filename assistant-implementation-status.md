# In-platform assistant implementation and release status

Updated November 13, 2026. The initial implementation covers Phases 1–5 of `in-platform-ai-assistant-plan.md`, following the Phase 0 contracts work. It is a default-off private beta, not a production deployment or a claim of complete platform action parity.

## Delivered scope

| Phase | Delivered |
|---|---|
| 0 — contracts and spike | Strict page/turn/model/action contracts; distinct trusted assistant principal; server-owned tool policy; real Oso planner/tool verification. Ollama schema/error handling is tested, but its configured local endpoint was unreachable during the real verification attempt. |
| 1 — persistent read-only assistance | Global authenticated assistant panel, mobile drawer, accessible keyboard/focus controls, retained conversations, rename/delete, bounded history pagination, owner-scoped evidence reads, context resolution, progress polling and durable records. |
| 2 — job and pipeline actions | Shared transactional commands under assistant authority; explicit per-request permission for one routine change, otherwise exact action review; ambiguity responses; cancellation, idempotency, revision conflicts, activity receipts, archive undo and live store reconciliation. |
| 3 — preparation and documents | All seven existing preparation kinds available to the conversation runner; persistent operation handoff/recovery, immutable artifact creation/selection/export, separate planner/preparation quota identities and idempotent usage settlement. Finalizing rating and approving candidate claims remain human operations. |
| 4 — canonical proposals | Typed role/achievement/skill additions and edits, achievement-to-role links using existing mutation recipes, full review snapshots, server IDs, schema/version validation and atomic human-only apply with base-hash conflict detection. The model and MCP cannot apply proposals. |
| 5 — page coverage and hardening | Route-aware help throughout the private app, selected editor items, rating/tailored tabs, interview rounds, document selection and tracker/match/discovery views/filters; dirty-edit protection, retention/export/purge integration, bounded concurrency, release controls and operator documentation. |

The global assistant coexists with existing per-section/application/interview assistants. These keep their current domain behavior. Public Spotlight HTML and account sign-in/reset screens do not mount the authenticated assistant.

## Authority and review decisions

The internal assistant calls shared services directly; it does not create a remote MCP connection, borrow a human writer principal, or require OAuth onboarding. `Principal.type = assistant` is server-created and references a persisted run. Both the live account/session and run/thread state are checked before execution; transactional domain writers check authority again inside their write transaction. A deleted thread, disabled account, logged-out session, cancelled run, expired deadline or disabled assistant writes blocks further mutations.

By default, model-selected mutations produce an exact review card. A human can enable **Allow one routine change for this request** to permit one routine operation without another prompt; subsequent operations need review. Recording an offer or an external application report always needs review. Drafting a Career Journey proposal does not change canonical data; its separate **Apply reviewed changes** control always requires a human request and a matching base hash. This deliberately gives a clear per-request write permission instead of trying to infer unlimited authorization from conversational wording.

Canonical operations are intentionally narrow: add/update roles, achievements and skills, with role links on a new achievement. There is no arbitrary JSON patch, canonical replacement, canonical default writer, model-operated approval, administrator tool, payment/security/account-delete tool, public publish tool, employer submission tool, shell, SQL, filesystem or general HTTP tool.

## Runtime and storage

`server/assistant/` owns context validation, authority, policy, conversation execution, routes and proposal application. `registerAgentPlatform` constructs one shared service bundle and starts the assistant alongside the existing worker. Remote MCP flags remain independent. Preparation still requires `AGENT_AI_ENABLED=true`; the assistant does not start a duplicate preparation worker.

Owner-scoped collections are `assistantThreads`, `assistantMessages`, `assistantRuns`, `assistantSteps`, `assistantEvents`, `assistantApprovals` and `assistantJourneyProposals`. Only a hashed session reference is persisted. Cookies, bearer tokens and BYOM keys are never copied into these records. Existing account export includes the assistant collections and removes the session hash. Account deletion revokes/disables the account before purging descendants so background work cannot republish private records.

The single-VM runner executes one planner at a time, with one active turn per account and ten new turns per minute per account. Defaults are six planner steps, a 24,000 accumulated planner-token stopping threshold, a 60,000-character prompt limit and a five-minute run deadline. Token totals are checked between steps; a provider response can cross the threshold, so this is not an exact monetary cap. Planner output is capped at 4,096 tokens. Preparation calls have separate existing quotas and usage records. Approval previews expire after fifteen minutes and canonical proposals after one day. Runs needing an ambiguous provider retry become `unknown`; paid calls are never automatically replayed after restart.

The first transport is authenticated polling with ordered per-run event cursors, rather than a long-lived stream. Closing the panel does not stop authorized platform work. This avoids relying on Cloudflare streaming configuration for the first release. A browser reconnect resumes persisted status/history. Historical navigation events are not automatically replayed when a conversation is opened.

History defaults to thirty days from conversation creation, with hourly cleanup. Deleting a conversation removes its messages, run details, proposals and approvals. A small thread tombstone prevents in-flight work from reviving it. Domain changes, immutable application materials and their existing domain audit history remain. Account purge removes all assistant descendants. Quota reservation records retain minimal spend identity separately from chat content.

## UI synchronization and known limits

Server receipts trigger a store reconciliation without a page reload or a full account hydration. The current implementation refreshes the three application-data domains (jobs, matches and Career Journey), retaining newer revisions, rather than issuing one network request per affected object. Artifact/history views receive a refresh notification. A refresh does not adopt HTTP save revisions until the store can safely merge them; pending saves and newly dirty forms prevent that adoption.

Dirty edits are tracked conservatively across page inputs. The user saves/discards their edits and uses the panel's explicit acknowledgement before assistant mutations/refresh. Some search/filter inputs can therefore require an acknowledgement even though they do not change saved data. This favors preserving local work. It does not provide a complete collaborative editor or field-by-field merge UI. Other tabs still use the existing focus/CAS behavior; legacy canonical UI saves have not been converted into a new collaborative protocol.

SQLite document queries still scan/filter in application code. Assistant reads are owner/thread/run filtered and responses are bounded, but larger installations need measured indexing work. Long histories expose paginated messages, with recent messages/events in the primary panel snapshot. There is no semantic long-term memory or automatic historical conversation summarizer in this release.

## Provider and scope limitations

- Oso is verified against real tools, mutations and all seven existing preparation steps. Ollama uses the existing structured client, with schema, cancellation and output-limit tests, but the real local endpoint was unavailable. Do not present it as live-verified.
- Durable assistant chat initially supports platform-provider accounts. BYOM accounts see a capability explanation; their browser keys are not stored and there is no silent platform-billing fallback. Request-bound BYOM chat remains an optional follow-up from the plan.
- Voice, native model tool calling and token streaming are not part of this initial release.
- Spotlight, Discovery and Support have page-aware help but no new assistant write adapters. Existing Discovery licensing and server feature gates remain intact. Privileged admin pages receive generic help without administrator data/tools.
- Application packets/reports do not submit to employers. No production employer adapter is released.
- Production Cloudflare behavior, production enablement, load at real account scale and assistive-technology review remain deployment acceptance checks. Local desktop/mobile browser tests are not a claim of production validation.

## Verification performed

- `npm test`: 535 tests passed across 48 files, including new assistant authority, HTTP/CSRF/session isolation, approval replay/conflicts, canonical immutability and human apply, concurrency, cancellation, quota settlement, provider schema and browser persistence-race tests.
- `npm run lint`, `npm run build` and `git diff --check`: passed. The build retains the existing large-chunk and mixed-import warnings.
- `npm run verify:assistant`: real Oso planner -> owned job read -> grounded answer, followed by an explicitly authorized archive through CAS. Used a disposable local account/database; cleanup completed.
- `npm run verify:agents -- --live --ai` under a temporary DATA_DIR: local account/MCP authentication, immutable PDF/DOCX private exports/downloads, packets/preflight/synthetic reporting, all seven real AI steps, canonical immutability and revocation passed. Temporary account/files/data were removed. No employers contacted.
- Headless Chromium at 1440×1050 and 390×844: authenticated launcher/panel, real chat-driven archive and tracker refresh without a page reload passed; no browser errors. Screen captures were visually inspected. A second real-provider browser flow drafted a canonical achievement proposal, verified it had not been applied by the model, and used the human Apply control to persist one server-ID/versioned achievement; no browser errors.

The optional `--ollama` assistant verifier failed to reach localhost:11434 after its Oso checks passed. That result is retained above rather than being treated as a successful provider check.

## Enabling and rollback

See `SELF_HOSTING.md` for the exact enablement flags and release procedure. No real `.env` values, production accounts, tunnel routes or deployments were changed. Start with an internal account, read-only, then enable routine writes and finally proposals. Use the existing repository release/deploy scripts; there are no GitHub Actions or new hosting components.

Rollback starts by disabling assistant writes/proposals and the assistant itself, then deploying compatible runtime code. Retain the SQLite data and immutable artifacts; do not restore an older database over newer user changes. If preparation is shared with external agents, assess `AGENT_AI_ENABLED` separately rather than disabling it unintentionally.
