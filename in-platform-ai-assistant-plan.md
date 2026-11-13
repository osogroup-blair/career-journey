# In-platform AI assistant implementation plan

Created November 13, 2026. Initial Phases 1–5 have now been implemented as a default-off private beta. This document retains the proposed design; see [implementation status](assistant-implementation-status.md) for delivered behavior, deliberate scope choices, verification and remaining deployment/provider checks.

## 1. Product outcome

Add a persistent assistant to the authenticated application. Users can ask questions about the current screen, explain what they want in plain language, and have the assistant carry out supported work. It knows the active page, job, stage, tab and selected item; retrieves relevant saved information; executes validated platform commands; and shows the resulting changes in the page without a reload.

Example conversations:

- On Job Intake: “Add this posting and analyze its requirements.” Create the job if necessary, queue parsing, show progress, then link to Parsed.
- On Rating: “Why is this a weak fit?” Explain the stored analysis with links to career evidence and unresolved gates. Do not invent qualifications.
- On Tailored Application: “Make the cover letter shorter.” Create a new immutable revision and select it for this job, preserving previous and submitted materials.
- On Applications: “Archive the Acme job as Position Filled.” Resolve the exact job, execute the authorized update and refresh its card.
- On Interview: “Record a video interview next Tuesday at 2.” Resolve the date in the user's timezone and ask for missing information if needed; show the interpreted date before committing when ambiguous.
- On the Simple Editor: “Add this achievement to my last role.” Draft a proposed edit, link it to the correct role and show a human Apply control. The assistant cannot apply canonical edits itself.

“Changes to the platform” means changes to the user's application data and supported workflows. Editing source code, deploying the service and changing administrator/security policy are outside this assistant's initial authority. Text chat is the first release; speech input/output is a separate enhancement.

## 2. Verified foundation and gaps

This plan is based on the current checkout, not the older Firebase portions of the MCP roadmap. Read `ARCHITECTURE.md`, `README.md`, `SELF_HOSTING.md` and `agent-platform-implementation-status.md` alongside the code. The historical status document contains stale cloud operational details; SQLite and server authorization are current. There is no `backlog/` directory in this checkout at planning time.

| Existing code | Reuse | Missing work |
|---|---|---|
| `src/App.tsx` | HashRouter and global application chrome | Persistent assistant host and explicit page-context registration |
| `src/store.ts`, `src/data/HttpDataStore.ts`, `src/components/AuthGate.tsx` | Hydrated account data, queued writes and focus refresh protections | Targeted server-change reconciliation with unsaved form protection |
| `server/agent/service.ts`, `contracts.ts`, `repository.ts` | Strict command schemas, owner scoping, revisions, idempotency, job/match/artifact/application/interview/offer services | Assistant-specific policy wrapper and capability metadata |
| `server/agent/operations.ts`, `preparationRunner.ts` | Seven durable preparation steps: parse, keywords, fitScore, auditGates, resumeStrategy, generateResume, coverLetter | Durable multi-step conversation execution, bounded recovery, quota reservation |
| `server/agent/http.ts`, `index.ts` | Human API and separate MCP adapters | Shared service construction without enabling MCP or duplicating workers |
| `server/ai/types.ts`, `getAIClient.ts`, `resolveModelForPrompt.ts` | Validated structured responses, platform/BYOM selection, instrumentation | Assistant prompt registration and bounded action-selection loop |
| `src/lib/journeyMutations.ts`, `careerJourneyIds.ts` | Canonical mutation recipes, relationship cleanup and ID allocation | Human-only typed proposal review and atomic stale-check/apply service |
| Existing per-section/editor/application/interview chats | Domain prompts and useful task UI | Coexistence with global chat; avoid two assistants changing the same item independently |

Important code constraints:

- `Principal` currently distinguishes only `user` and `agent`. `requireScope` bypasses scope checks for users, and `AgentService.invoke` only applies its write flag to agents. Calling model-selected tools as an unrestricted human principal would bypass intended assistant limits.
- Existing agent operations use connection checks for agent principals. An internal assistant identity needs its own explicit execution authorization; it cannot use a fabricated external connection ID.
- Browser BYOM credentials arrive in request headers and are deliberately not persisted. Durable workers currently reject BYOM accounts. A browser conversation is not permission to store those keys or silently charge a platform provider.
- The provider interface exposes `generateStructured`, not a general native tool loop or token-streaming contract. Start with schema-validated action selection and progress events; do not make native tool calling across every provider a prerequisite.
- No production managed employer adapter is available. Preparing a packet and recording an external report do not submit an application.

## 3. User experience

Mount one `AssistantProvider` and `AssistantHost` inside the existing Router and authenticated app, keeping the host outside route elements so it survives navigation. Use a desktop side panel and a mobile drawer. A compact launcher appears on every private route; reserve space and coordinate positioning with FeedbackWidget and AiActivityIndicator. Public Spotlight pages, login/reset screens and public HTML remain separate and do not load private assistant context.

The panel contains:

- A visible context chip, such as “Acme · Rating · Keywords,” and an explicit control to use the current page for the next message.
- Suggested prompts appropriate to the page and the account's actual capabilities.
- Conversation history, new chat, rename/delete controls, and a clear indication of which thread is active.
- An activity timeline: reading evidence, updating job, generating letter, waiting for input, completed or failed.
- Result cards with affected objects, concise before/after values, links and provenance. Only show success after a durable command receipt.
- Review cards for canonical proposals and consequential actions; editable drafts remain visibly distinct from saved state.
- Stop, retry where safe, and recovery controls. Closing the panel does not cancel authorized durable platform work; logout/account disable prevents subsequent steps.

Use one active thread across pages by default, with explicit new-chat and job-scoped threads available. Navigation updates the context for future turns; it never silently retargets an in-flight request. Opening a thread from another job shows that thread's job prominently. Older transcript instructions are not standing authority for unrelated future actions.

Accessibility: keyboard launcher shortcut selected after checking existing shortcuts, focus trapping and return, labelled controls, Escape to close, reduced motion, readable mobile layout and polite progress announcements. Render generated Markdown safely, without raw HTML; allowlist internal navigation targets and sanitize external links.

## 4. Page awareness contract

Create a typed route registry in `src/assistant/pageRegistry.ts` and a `useAssistantPageContext` hook. Build context from React Router, page state and registered domain selections, never a DOM scrape or screenshot. Local tabs and filters must register their state because not all are represented in the URL.

Suggested client envelope:

```ts
type AssistantPageContext = {
  schemaVersion: 1;
  routeId: string;
  pathname: string;
  contextVersion: number;
  jobId?: string;
  stage?: string;
  tabId?: string;
  sectionId?: string;
  selectedEntity?: { type: string; id: string };
  filters?: Record<string, string | string[]>;
  knownRevisions?: Record<string, number>;
  hasUnsavedChanges: boolean;
  timezone: string;
};
```

Validate allowed keys, values and lengths per route. Strip secrets and arbitrary query parameters. Never send passwords, BYOM keys, auth tokens, admin raw payloads or the entire Zustand store. A user may explicitly attach a bounded unsaved text excerpt; label it unsaved and untrusted, and never pretend it is stored evidence.

The server resolves this envelope to an owner-scoped `ResolvedPageContext`. It re-fetches entities and revisions, derives plan/admin/feature access from the session and rejects mismatched job/stage/item references. Client context provides hints, not permissions. Record the context snapshot with each turn. Resolve “this job” from that snapshot; ask which job when no unique target exists.

| Page family | Context and initial behavior |
|---|---|
| Dashboard | Progress, bounded job summaries, next actions; explain and navigate |
| `/applications`, `/matches` | Current view, filters and selected IDs; list/create/update/archive/restore/promote supported records |
| `/job/:id/intake`, `/parsed` | Exact job/revision and selected requirement; create/update intake and run parse |
| `/job/:id/rating` | Tab and stored analysis; evidence explanation and supported preparation; canonical patch application stays human-only |
| `/job/:id/tailored` | Active artifact/kind/revision and tab; generate, revise, select and export documents |
| `/job/:id/apply` | Packet and reported application state; prepare/preflight and record user-reported outcomes; no employer submission |
| `/job/:id/interview`, `/offer`, `/compare-offers` | Selected round/offer and comparison set; record details and provide grounded help; acceptance/decline needs explicit decision handling |
| `/edit`, `/journey`, `/build`, `/strengthen` | Section/entity and saved journey hash; evidence reads and reviewable proposals |
| `/agent-library`, `/agent-connections` | Selected documents or connection metadata; help and read-only summaries; never expose tokens |
| `/spotlight`, `/discover`, `/feedback` | Page-specific help initially; writes added only after domain adapters and tests exist |
| `/settings`, `/profile`, `/upgrade` | Explain available controls and navigate; no credential, identity, billing or account deletion tools |
| `/admin/*` | Generic page help with no privileged data retrieval or mutation in the initial release |
| Legal and migration pages | Explain/navigate; no migration execution or policy/legal commitments |

Every private route gets the assistant shell. Every route does not need write tools on day one. Unsupported requests return an honest explanation and useful link.

## 5. Server architecture and execution authority

Request path:

```text
Assistant panel -> human-session assistant API -> context resolver
  -> bounded model planner -> policy/validation executor -> shared domain services
  -> durable receipts/events -> targeted UI reconciliation
```

Use `server/assistant/` modules. Keep `server.ts` integration to a route-registration call; preserve raw Stripe webhook ordering and existing CSRF middleware. Refactor `registerAgentPlatform` narrowly to expose one shared service bundle and one preparation worker. The internal assistant does not connect back to `/mcp`, provision a bearer connection or require external OAuth.

Introduce an explicit server-created assistant execution context, separate from the human API principal. Recommended implementation: extend trusted principal handling with an assistant variant and central capability policy, auditing every existing `p.type` branch. An alternative wrapper is acceptable only if all model-invoked paths enforce the same limits before dispatch. Do not cast an assistant into `type: 'user'` to reuse commands.

Assistant effective authority is the intersection of the verified account, configured assistant tool allowlist, active feature/plan gates, current request intent and any required action approval. Direct human UI actions retain their existing authorization. Keep new assistant-only tools out of external MCP registration unless separately reviewed and scoped.

Expand Tool metadata beyond `write`: domain, capability, effect class, affected entity types, reversibility, cost category and approval requirement. Page relevance helps select a small catalog; it is not an authorization boundary. A global request can still target another owned job when the user names it clearly.

Revalidate account, effective capabilities, flags, target ownership and revisions before every mutation and before publishing long-running results. Persist actor provenance identifying assistant run and initiating human; do not label model output as a human-authored fact.

## 6. Action and review policy

| Effect | Default behavior |
|---|---|
| Read, explain, search evidence | Execute within the request; minimize retrieval |
| Navigate or change local view | Execute approved internal UI action; do not discard dirty forms |
| Explicit reversible job/match update | Execute directly, show result and supported undo |
| Generate/revise draft or queue bounded preparation | Execute when requested and within displayed quota/cost policy |
| Ambiguous target, date, missing fact or conflicting edit | Request the missing information; preserve completed work |
| Canonical Career Journey edit | Persist proposal only; human reviews and applies through a human-only endpoint |
| Public publication, destructive bulk operation or consequential external effect | Show exact preview and require a user action bound to that payload |
| Credentials, permissions, payments, admin policy, account deletion, managed employer submission | No initial assistant tool; guide to existing controls |

A request such as “archive this job” is sufficient authority for that routine action. Do not add repeated confirmation prompts. “Help me with my applications” is not authority to archive every job or consume unbounded AI usage. Large batches must declare their target set and cap before execution.

Approval records bind owner, run, tool, exact payload hash, input revisions, expiry and one-use state. Only a human-authenticated approval route may create/consume approval. Models cannot mint approval IDs, simulate clicks or treat a quoted “yes” as approval. Changes to material inputs invalidate the preview.

Canonical proposals use typed entity operations and existing mutation recipes, not arbitrary JSON paths or replacement documents. Include source journey hash, target IDs, evidence references, diff and validation results. The human Apply transaction rechecks the hash, applies recipes, allocates IDs server-side, validates the full schema and bumps version. A conflict returns a refreshed review; never silently rebase factual edits. Preserve the prohibition on agent approval, staged-patch writes and saving canonical defaults.

Undo is a new revision-checked inverse operation, supported only where the domain can restore the prior state safely. Do not promise undo for provider spend, publication exposure, transmitted messages or external submissions.

## 7. Conversation runner and provider integration

Add a dedicated `platformAssistant` prompt/config ID using the existing admin prompt and model-resolution mechanisms. Use `StructuredAIClient.generateStructured` for an initial discriminated response: answer, tool request or clarification. Tool arguments are parsed again against the exact registered command schema. An unknown tool or argument is rejected before execution; tool results cannot change policy.

Run a bounded loop, initially at most six planner calls and eight tool executions per user turn, with a configurable timeout and token budget. These are proposed defaults to tune in a provider spike. Execute mutations sequentially; parallelize only independent reads. Persist each step before advancing. Stop on clarification, approval, budget exhaustion, cancellation, conflict or unsupported capability. Background generation returns operation IDs and resumes through durable state, rather than keeping a request open indefinitely.

Retrieve small relevant evidence slices first, then fetch exact referenced entities as needed. Reserve prompt/output headroom, bound tool-result size and trim older history. A generated conversation summary helps continuity but is untrusted narrative, not a replacement for fresh entity reads or user authorization. Show evidence links where an answer relies on specific career facts. An empty journey must still permit navigation help and creating an intake job.

Provider rollout:

1. Validate action-selection schemas against configured Oso and Ollama paths, including malformed output, timeout and refusal behavior. Disable execution on schema failure.
2. Launch durable execution for platform-provider accounts. Keep provider selection and allowed models under existing controls. No silent fallback that changes billing or disclosure expectations.
3. For BYOM accounts, initially show a clear capability explanation if durable chat is unavailable. Then add a request-bound BYOM mode using existing header handling: credentials live only for that request, are redacted from logs and are never included in transcripts, events or operations. A reconnect/restart requires the browser to resupply credentials. Background preparation remains unavailable until explicitly implemented; do not claim browser BYOM chat enables existing headless steps.
4. Native provider tool calling and token streaming can follow after the structured loop is proven. Progress streaming is independent of token streaming.

Budget the planner and domain AI calls separately. Add durable per-step quota reservations and idempotent settlement before broad write rollout; the current preparation service's usage tracking alone does not provide this. A command retry uses the same idempotency identity. A genuinely new user-requested generation uses a new one. Never automatically repeat an ambiguous paid provider request after a crash.

## 8. Persistence, API and recovery

Use owner-scoped SQLite document repository collections initially; do not introduce a second database or a hosted queue. Proposed collections:

| Collection | Contents |
|---|---|
| `assistantThreads` | Title, timestamps, scope/optional job, summary version, retention metadata |
| `assistantMessages` | Thread/run references, role, bounded content, context snapshot, references |
| `assistantRuns` | State, initiating session reference, authority snapshot, budgets, cancellation, lease/fence, event cursor |
| `assistantSteps` | Tool/AI step, validated inputs or safe references, idempotency identity, receipts, error/usage |
| `assistantEvents` | Ordered, bounded user-visible progress and affected entity revisions |
| `assistantApprovals` | Exact proposed action, hashes, expiry and approval consumption |
| `assistantJourneyProposals` | Typed proposed operations, base hash, diff, evidence, applied/discarded state |

Do not persist cookies, API keys or provider headers. Store only a non-secret session identifier sufficient to verify the initiating session remains active. Define ordering via transactional per-run event sequence numbers; timestamps alone are insufficient. Use bounded queries/pagination and measure scan cost because the current repository filters documents in application code. Add indexed relational storage only when measured needs justify it.

Proposed human-session API, all under `/api/assistant`:

- `GET/POST /threads`, `GET/PATCH/DELETE /threads/:id` and paginated `GET /threads/:id/messages`.
- `POST /threads/:id/turns`: validated text, page context, bounded optional attachments and client request ID; returns run ID.
- `GET /runs/:id`, `POST /runs/:id/cancel` and `GET /runs/:id/events?after=<sequence>`.
- `GET /capabilities`: current supported actions/reasons, without privileged internals.
- `POST /approvals/:id/approve` and `/reject`: explicit human controls, protected by existing CSRF checks.
- `POST /journey-proposals/:id/apply` and `/discard`: human-only; inaccessible through the model tool registry or MCP.

Prefer authenticated fetch streaming for progress with resumable event cursors and polling fallback. If using SSE framing, do not put credentials in query strings or depend on native EventSource for BYOM headers. Set no-store and test buffering, reconnect and timeouts through the existing Cloudflare Tunnel. Durable completion must work when the streaming connection closes.

Run states: queued, running, waiting_for_operation, needs_input, awaiting_approval, succeeded, failed, cancelled and unknown. A single runner claims each run transactionally with lease/fencing; cap per-user and global concurrency. Persist tool intent before execution and receipt afterward. On restart, reconcile idempotent domain commands and linked operations; mark ambiguous external/provider effects unknown. Recheck live session/account authority before resumed writes; an authority snapshot alone cannot authorize indefinite work.

Retention default proposal: 30 days for chat content and detailed tool payloads, configurable; keep minimal mutation provenance with the affected domain history under its own retention rules. User deletion of chat clears content and pending approvals, while domain mutations and their minimal audit history remain understandable. Account export/purge must include all assistant records and attachments, cancel runs and prevent workers recreating deleted data. Verify the existing export enumeration explicitly; do not assume recursive deletion implies complete export coverage.

## 9. Making changes visible without losing edits

Emit affected entity type/ID and committed revision after every mutation. Add targeted store refresh/merge actions; do not call full `hydrate()` after each tool. Flush/await queued saves for the affected entity before an explicitly requested assistant change when safe. Disable mutation and explain pending-save failure rather than racing it.

Each editable page registers dirty state and its base revision. If a form is dirty, the assistant can read saved state, draft a proposal or wait; it cannot overwrite the local buffer. On a committed remote update, clean entities merge immediately, while dirty entities show “This record changed” with compare/reload options. Ignore late older revisions. Refresh active queries such as tracker counts and the artifact library after changes.

Test multiple tabs and concurrent external MCP edits. Focus refresh is a fallback, not sufficient for chat-driven changes in the same tab. A browser-side dirty indicator is only a UX aid; server revisions remain mandatory because another tab can edit concurrently.

## 10. Security and privacy requirements

Treat postings, career text, uploaded documents, support replies, previous messages and tool output as untrusted data. They cannot grant capabilities or instruct the executor to ignore policy. Only strict server-owned tools reach domain services. There is no arbitrary fetch, SQL, filesystem, shell or generic `/api/data` tool.

Check tenant ownership for threads, runs, artifacts, approvals and every referenced entity independently. Reject fabricated context, guessed IDs, unknown nested fields and oversized transcripts. Keep internal support notes, admin data, provider credentials and payment details out of retrieval and result cards. Reuse allowlist projections and add sentinel tests for internal-only fields.

Add per-account/IP abuse limits where appropriate, per-run step/token limits, global worker limits and a content-free operational audit. Logs contain tool names, status, timing, run IDs and safe error codes, without resumes, full messages or form answers by default. Document which provider receives conversational context in the privacy copy before enabling broadly.

Keep server authorization for admin and paid features. An admin user chatting on an admin page does not automatically grant the assistant administrator tools. Discovery remains gated by the existing licence/feature policy. Public Spotlight publishing, if added later, uses its existing allowlist projection and a separate human preview.

## 11. Implementation work packages

Estimates are engineering days for one experienced engineer, including focused tests and review, excluding external provider access or product/design waiting time. Re-estimate after the first vertical slice.

### Phase 0 — Contracts and provider spike (2–3 days)

- Inventory actual route contexts, store writes, dirty-form behavior, tool side effects and prompt registrations.
- Write ADRs for assistant authority, canonical proposal flow, provider/BYOM behavior, retention and budget accounting.
- Prototype a read-only structured action loop against actual configured Oso/Ollama providers with fixture data.
- Define strict DTOs, run states, action policy, error taxonomy and capability responses.

Acceptance: page/context and action-policy matrices reviewed; real provider responses validate; fake/unknown tools cannot execute; no human-principal bypass.

### Phase 1 — Persistent read-only vertical slice (4–6 days)

- Add shell, route context registry, thread/message persistence and authenticated assistant routes.
- Add context resolver, evidence reads, planner limits, safe Markdown and event/poll transport.
- Register all private pages for help, with deep integrations on Dashboard and one job stage.
- Add retention/export/purge behavior and basic observability from the first persistent release.

Acceptance: move between pages without losing chat; ask “what am I looking at?” and receive a grounded answer for the correct owned job; guessed IDs/dirty draft secrets never leak; reload/reconnect recovers history. No data-writing model tools enabled.

### Phase 2 — Authorized job and pipeline actions (5–8 days)

- Implement trusted assistant executor and shared service-bundle construction; preserve independent MCP flags.
- Add create/update/transition/archive/restore, match promotion and interview/offer recording through strict commands.
- Implement idempotent run steps, authority checks, cancellation and targeted store reconciliation.
- Add result cards, ambiguity handling, selected reversible undo and bounded batch previews.

Acceptance: a requested archive visibly updates the correct card once; duplicate delivery does not repeat effects; simultaneous UI/MCP edits produce explicit conflict; logout/disable blocks later writes; canonical data hash remains unchanged across assistant mutation tests.

### Phase 3 — AI preparation and document workflow (5–8 days)

- Link conversation runs to the existing seven preparation operations and their prerequisites.
- Add planner/domain quota reservations, usage settlement, worker recovery and spend limits.
- Add evidence-grounded document revisions, artifact selection/export and stale-result handling.
- Present workflow progress and partial completion; do not finalize rating or candidate claims merely to unblock generation.

Acceptance: an authorized parse-to-draft workflow completes under a declared budget, preserves immutable document history and survives a disconnected panel; interrupted paid steps do not retry automatically; submitted artifacts remain unchanged. Missing BYOM support is explicit.

### Phase 4 — Human-applied canonical proposals (5–8 days)

- Add typed proposals and diff cards for a narrow initial set: roles, achievements and skills plus their supported relationships.
- Extract a server-safe canonical mutation/apply service from existing pure recipes without reorganizing unrelated store code.
- Implement human-only apply, atomic hash/revision checks, ID allocation, schema validation and version/history behavior.
- Integrate with existing editor/per-section assistant review so one consistent review path handles both.

Acceptance: chat drafts an achievement; the human sees exact changes and applies once; stale proposals require fresh review; direct assistant/MCP/API attempts cannot impersonate human approval; reference cleanup and unknown schema fields survive edits.

### Phase 5 — Broader page coverage and release hardening (4–7 days)

- Integrate every stage/tab and selected editor entity; exercise mobile/accessibility and conversation scoping.
- Add domain adapters for selected missing actions only after extracting existing service logic. Prioritize user feedback; Spotlight/support/discovery parity is separately scoped.
- Finish retention, diagnostics, Cloudflare reconnect testing, load checks and release/rollback runbook.
- Optionally deliver request-bound BYOM chat as a distinct tested slice; do not enable it by inference from existing model wrappers.

Acceptance: every private page reports accurate context and honest capabilities; all advertised writes have tests and browser evidence; no unsupported managed application claim; kill switches immediately prevent new steps.

Expected read-only internal pilot: 6–9 engineering days after work starts. Useful job/document assistant through Phase 3: 16–25 days. Broader release including initial canonical proposals and hardening: 25–40 days, roughly 5–8 engineering weeks. Request-bound BYOM, voice, admin writes and missing domain parity require separate estimates.

## 12. Proposed file map

| Area | Files |
|---|---|
| Contracts | `src/types/assistant.ts`; shared strict server contracts under `server/assistant/contracts.ts` |
| UI | `src/components/assistant/{AssistantHost,AssistantPanel,MessageList,ActionCard,ProposalCard,ContextChip}.tsx` |
| Context/client | `src/assistant/{AssistantProvider,pageRegistry,useAssistantPageContext}.tsx` (split extensions as appropriate), `src/lib/assistantClient.ts` |
| Server | `server/assistant/{index,routes,context,capabilities,policy,runner,repository,events,journeyProposals}.ts` |
| Integration | Small changes to `src/App.tsx`, relevant pages, `src/store.ts`, `server.ts`, `server/agent/index.ts` and trusted principal checks |
| AI/config | Existing prompt registry/schema/default-model/sample-input mechanisms; `platformAssistant` prompt; `.env.example`; feature flags and billing metadata |
| Verification | `server/assistant/__tests__/`; focused context/store/proposal tests and isolated browser fixtures |
| Documentation | `ARCHITECTURE.md`, `README.md`, `SELF_HOSTING.md`, this plan's implementation status |

Names above are proposed. Follow existing module/style conventions when implementation starts. Do not perform an unrelated `server.ts` refactor or replace HashRouter.

## 13. Verification and release gates

Run `npm test`, `npm run lint`, `npm run build` and `git diff --check` at implementation milestones. Use isolated temporary DATA_DIR values and fictional users. No real account seeding/deletion or employer applications as tests. Real provider checks consume usage and must be reported accurately.

Required meaningful tests:

1. Authorization: cookie/CSRF boundary, bearer rejection on human routes, session expiry/revocation, disabled accounts, cross-user thread/job/artifact IDs, capability/feature downgrades mid-run, assistant-versus-human principal isolation.
2. Context: HashRouter aliases/redirects, every private route, local tabs, selected IDs, rapid navigation, malformed context, ambiguous references and unsaved data attachment boundaries.
3. Mutation correctness: CAS conflicts, pending UI saves, duplicate turn delivery, idempotency-key payload mismatch, stale undo, approval replay/expiry/payload changes and canonical immutability.
4. Runner: step/token/time caps, cancelled/expired leases, worker restart at intent/receipt boundaries, duplicate workers, malformed model output and prompt injection in every retrieved data source.
5. AI/billing: planner versus preparation accounting, concurrent quota reservations, timeout/unknown behavior, no double settlement, BYOM key redaction and explicit unsupported background behavior. Run actual provider verification for each advertised path; mocks do not prove provider compatibility.
6. Documents/proposals: immutable drafts and submitted packets, exact export links, missing evidence, stale journey hashes, server ID generation, relationship cleanup and human-only apply.
7. UI: same-tab updates without reload, dirty-form protection, multi-tab changes, mobile drawer, keyboard/focus/screen-reader behavior and coexistence with existing assistants/widgets.
8. Privacy/operations: no internal-note leakage, secret-free logs/events, account export and purge, deletion during running work, retention cleanup, stream reconnect/cursor deduplication and proxy buffering.

Browser acceptance scenarios: create a fictional job from Intake; explain one rating with evidence links; archive/restore a tracker card; revise a letter preserving history; record an interview with timezone clarification; propose and human-apply a canonical achievement; reject stale edits in a second tab; stop/reconnect a generation without duplicate spend. Run the app with an isolated DATA_DIR on port 47293 or an explicit test PORT.

## 14. Rollout, flags and operational controls

Add documented, default-off `ASSISTANT_ENABLED`, `ASSISTANT_WRITES_ENABLED` and `ASSISTANT_JOURNEY_PROPOSALS_ENABLED`, plus limits for planner steps, tokens, turn duration, concurrency and retention. Use the existing AI kill switch and feature checks as well. Internal read-only assistance must not require `MCP_ENABLED=true`.

Initially retain existing `AGENT_AI_ENABLED` gating for reused preparation workers and clearly expose that dependency. If it later becomes a shared preparation flag, make that a deliberate compatibility change with tests/documentation, not a silent flag rename. Assistant write disable must apply even if unrelated human or MCP writers remain enabled.

Roll out to internal accounts: read-only -> routine job writes -> document generation -> canonical proposals -> wider availability. Track completion, clarification/conflict rates, tool denials, quota use, latency, unknown outcomes and user-reported wrong-context actions without collecting chat content in aggregate diagnostics.

Use additive SQLite/document changes and the existing release/deploy scripts. Preserve the existing VM and Cloudflare Tunnel; no GitHub Actions, new tunnel or Caddy. Rollback first disables assistant scheduling/writes, cancels queued work and retains receipts/proposals/history. Then deploy compatible code using the current script workflow. Do not restore an old database over newer user edits or re-enable an old unconditional writer.

## 15. First implementation ticket

Deliver Phase 0 and a narrow Phase 1 slice: persistent panel -> verified current-job context -> read-only evidence tools -> grounded answer -> reloadable thread. Keep all assistant mutations disabled. This proves page awareness, execution identity, provider reliability and the interaction model before introducing writes. Follow immediately with a revision-checked archive/restore vertical slice and its same-page UI update.
