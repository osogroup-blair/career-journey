/**
 * Shared shapes for the support ticket system (admin-support-feedback-plan.md).
 * Tickets live at top-level tickets/{ticketId} — the client can only ever read
 * its own (see firestore.rules); every write goes through server/support.ts
 * using the Admin SDK, which bypasses security rules entirely.
 */

/** The user's own guess at submit time — not what drives the backlog. */
export type TicketType = 'bug' | 'idea' | 'question' | 'other';

/** Admin-set during triage (server/support.ts's updateTicket) — this is what actually drives the backlog export. */
export type TicketTriageType = 'bug' | 'enhancement' | 'question' | 'not_actionable';

export type TicketStatus = 'new' | 'triaged' | 'backlogged' | 'in_progress' | 'in_review' | 'resolved' | 'closed' | 'wontfix';

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

/** Auto-captured at submit time — client-supplied, so treat as unverified context, not a security boundary. */
export interface TicketContext {
  route: string;
  userAgent: string;
  viewport: string;
  /** Short git SHA or package.json version, stamped at build time — see vite.config.ts. */
  appVersion: string;
  /** ISO timestamp of capture, not necessarily equal to the ticket's createdAt (set server-side). */
  timestamp: string;
}

export interface Ticket {
  id: string;
  uid: string;
  userEmail: string | null;
  /** Billing plan snapshot at submit time — for triage context, not re-derived live. */
  userPlan: string;

  type: TicketType;
  triageType?: TicketTriageType;
  status: TicketStatus;
  priority?: TicketPriority;

  title: string;
  description: string;
  context: TicketContext;

  /**
   * Phase 7 (screenshot capture) — a Storage bucket path (e.g. "ticketScreenshots/{uid}/{id}.png"),
   * NOT a public URL. The bucket denies client reads entirely (see storage.rules); admins view it
   * via a short-lived signed URL generated on demand (GET /api/admin/tickets/:id/screenshot).
   */
  screenshotPath?: string;

  /** Internal-only — never sent to the user. */
  adminNotes?: string;

  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  authorUid: string;
  authorRole: 'user' | 'admin';
  body: string;
  createdAt: string;
}
