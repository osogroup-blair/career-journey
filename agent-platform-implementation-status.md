> Storage/auth migration update: the current branch replaces Firebase with local SQLite/auth/private files. The phase assessment below records the earlier MCP foundation and is historical where it mentions Firebase deployment or credentials. See SELF_HOSTING.md and ARCHITECTURE.md for current operations. The storage migration does not imply the unfinished MCP parity phases are complete.

# Agent platform implementation status

Updated November 12, 2026. This is an implementation record, not a claim that the full roadmap has shipped.

## Implemented and verified

- Modular `/mcp` endpoint using the official TypeScript SDK 1.32.x and its supported Streamable HTTP protocol negotiation. Stateless requests; no obsolete SSE endpoint.
- Expiring, scoped manual bearer connections with hashed secrets, persisted request limits, revocation, account checks, host/origin checks and read-only Career Journey access.
- External OAuth resource-server verifier with issuer/audience/signature/expiry/client/subject/grant/scope checks. It does not implement an authorization server or hosted OAuth consent flow.
- Shared transactional services for jobs, matches, archive/restoration, rating finalization, job-specific resume settings, immutable drafts, selection into the current job, application packets, external reports, clarifications, follow-ups, interviews and offers.
- Cloud UI job/match saves use authenticated server CAS commands with queued local saves and conflict reporting. Career Journey remains on the user's existing editing path. Local storage mode remains available.
- Canonical writes, staged patches, person/role defaults, candidate claim approvals and user-only credential changes are absent from MCP tools. Agent schemas reject unknown command fields.
- Immutable structured resume/letter/form revisions; PDF and DOCX exports in private object storage; authenticated downloads, hashes, packet references and UI document/history pages.
- Durable single-step preparation queue for parse, keywords, fit, hard gates, strategy, resume and cover letter; stale/cancelled results do not replace current jobs. Interrupted work becomes unknown rather than being automatically paid and retried.
- Existing AI prompts, provider selection, quota consumption, feature checks and deterministic resume constraints are reused. Headless BYOM is explicitly unavailable.
- Tested managed-submission coordinator with user packet approval, reservations, concurrent retry protection and unknown outcomes. **No production employer adapter or managed submit tool is registered.**
- New collection rules/index configuration, private storage rules, account export additions and storage cleanup on account deletion.
- User pages at `#/agent-connections` and `#/agent-library`, linked from Settings. Cloud state refreshes on focus, not a complete real-time merge/editor implementation.

## Validation performed

Final local checks: **480 tests passed across 36 files**, `npm run lint` passed, `npm run build` passed, and `git diff --check` passed. The build retains its existing chunk-size/mixed-import warnings.

- Automated domain/HTTP/MCP/export/OAuth/worker/submission-coordinator tests, plus the existing repository suite; see the final validation result recorded below.
- Actual SDK client negotiation, scoped tool discovery, valid calls, invalid calls, authentication failures, CAS conflicts, private downloads and revocation against an isolated HTTP harness.
- `npm run verify:agents -- --live --ai` passed against the configured Firebase and Oso services, using a temporary fictional account. This verified Firebase sign-in, Firestore writes, read-only canonical evidence, PDF/DOCX storage/download, packet/report persistence, all seven implemented platform AI preparation steps, and revocation. The temporary account, documents and storage files were removed afterward. No employer was contacted and no external agent was onboarded.
- Browser smoke inspection of the new connection screen in local-only mode: controls render and missing cloud persistence is reported. Authenticated UI interaction and conflict UX still require end-to-end browser coverage.

## Phase-by-phase assessment

The original plan has Phase 0 plus Phases 1–7. These phases are **not all complete**.

| Phase | State | Remaining acceptance work |
|---|---|---|
| 0: contracts/decisions | Partial | Full action parity sign-off, two intended external-client OAuth interoperability checks. |
| 1: shared services | Partial | Domain commands exist and cloud job/match writes use CAS; complete store-orchestration extraction, live reconciliation, user-facing unsaved draft conflicts, deployed-rule verification remain. |
| 2: document/history | Partial | New/user-saved documents freeze revisions; bulk legacy backfill, richer revision comparison, retention/quota enforcement and migration rehearsal remain. |
| 3: delegated MCP | Partial | Manual connection and external JWT verification work; external authorization provider setup, full consent/refresh flow and real-client compatibility remain. |
| 4: preparation | Partial | Seven real provider steps passed; individual section regeneration, scoring/edit tools, assistant/form-generation parity, durable quota reservation and complete headless orchestration remain. |
| 5: external execution/tracking | Partial | Packets, reported receipts, follow-ups/interviews/offers work; complete user review/approval UX and external executor browser handoff/reconciliation integration remain. |
| 6: managed submission | Blocked on employer integration selection/access | Coordinator tested against a controlled fake adapter; no verified applicant-facing employer integration is configured. Do not advertise managed submission. |
| 7: full parity/general availability | Not complete | Discovery/StillOpen tools, Spotlight/support/prompt configuration parity, all-client tests, rollout metrics, security/retention review and production deployment acceptance remain. |

## Release controls

Keep `MCP_ENABLED`, `AGENT_WRITES_ENABLED`, and `AGENT_AI_ENABLED` false until the corresponding acceptance checks pass. No `.env` values were changed by implementation. Verification scripts temporarily override flags only in their own process.

Cloud UI writes now need the new server API. Deploy the client and server together, refresh old clients, then deploy the narrowed rules and collection-group index. Do not enable agent writes while old browser clients can still perform unconditional direct Firestore writes. Source rules are not proof that production rules are deployed.

Configure a real external OAuth provider before advertising OAuth onboarding. It must own PKCE, consent, resource binding and refresh/revocation and mint connection-bound claims based on verified platform identity, not untrusted user-supplied identifiers. Manual tokens are only for clients supporting explicit bearer headers.

Do not connect a production agent or enable managed employer submission based solely on the test suite. The gaps above are deliberately retained as release blockers rather than implemented as permissive fallbacks.

## Reproducible checks

```bash
npm test
npm run lint
npm run build
npm run verify:agents -- --live        # temporary Firebase account/storage, no AI
npm run verify:agents -- --live --ai   # also seven real provider calls
```

The cloud command explicitly creates a disposable test account and removes its resources in `finally`. It requires real Firebase credentials, a client API key and private object storage. The AI form consumes a small amount of real platform-provider usage. Never reuse an existing person's UID for this test.
