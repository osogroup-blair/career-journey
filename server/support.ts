import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getBillingState } from "./billing";
import { sendEmail } from "./email";
import type { Ticket, TicketContext, TicketMessage, TicketStatus, TicketTriageType, TicketType } from "../src/types/support";

function appUrl(): string {
  return process.env.APP_URL || "http://localhost:47293";
}

/**
 * Fire-and-forget on purpose — sendEmail already catches its own errors (see server/email.ts),
 * so a notification failure never blocks or fails the ticket action that triggered it. Callers
 * below intentionally don't `await` these.
 */
function notifySupportOfNewTicket(ticket: Ticket): void {
  const notifyEmail = process.env.SUPPORT_NOTIFY_EMAIL;
  if (!notifyEmail) return;
  sendEmail({
    to: notifyEmail,
    subject: `New feedback: ${ticket.title}`,
    html: `<p><strong>${ticket.userEmail || ticket.uid}</strong> (${ticket.userPlan} plan) filed a "${ticket.type}" ticket from <code>${ticket.context.route}</code>:</p>
<p><strong>${ticket.title}</strong></p>
<p>${ticket.description}</p>
<p><a href="${appUrl()}/#/admin/tickets">Open Admin — Tickets</a></p>`,
  });
}

function notifySupportOfUserReply(ticket: Ticket, body: string): void {
  const notifyEmail = process.env.SUPPORT_NOTIFY_EMAIL;
  if (!notifyEmail) return;
  sendEmail({
    to: notifyEmail,
    subject: `New reply on: ${ticket.title}`,
    html: `<p><strong>${ticket.userEmail || ticket.uid}</strong> replied on their ticket:</p>
<p>${body}</p>
<p><a href="${appUrl()}/#/admin/tickets">Open Admin — Tickets</a></p>`,
  });
}

function notifyUserOfAdminReply(ticket: Ticket, body: string): void {
  if (!ticket.userEmail) return;
  sendEmail({
    to: ticket.userEmail,
    subject: `New reply on your feedback: ${ticket.title}`,
    html: `<p>You got a reply on "${ticket.title}":</p>
<p>${body}</p>
<p><a href="${appUrl()}/#/feedback">View in My Feedback</a></p>`,
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_TICKET_LIMIT = 20;

function ticketsCollection(app: App) {
  return getFirestore(app).collection("tickets");
}

function messagesCollection(app: App, ticketId: string) {
  return ticketsCollection(app).doc(ticketId).collection("messages");
}

/**
 * In-memory per-uid daily cap on ticket creation — same spirit as
 * rateLimiter.ts's fallbackUsage counter, but scoped to this module since
 * tickets aren't part of the AI-quota abstraction those counters serve.
 * Resets on server restart; that's fine for an abuse guard against a runaway
 * client loop, not a monetization control.
 */
const ticketCreationCounts = new Map<string, { count: number; resetAt: number }>();

function withinDailyTicketLimit(uid: string): boolean {
  const limit = Number(process.env.SUPPORT_TICKET_DAILY_LIMIT) || DEFAULT_DAILY_TICKET_LIMIT;
  const now = Date.now();
  const entry = ticketCreationCounts.get(uid);
  if (!entry || now >= entry.resetAt) {
    ticketCreationCounts.set(uid, { count: 1, resetAt: now + DAY_MS });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count += 1;
  return true;
}

export class TicketRateLimitError extends Error {
  constructor() {
    super("Daily ticket submission limit reached — try again tomorrow.");
    this.name = "TicketRateLimitError";
  }
}

export class TicketNotFoundError extends Error {
  constructor(ticketId: string) {
    super(`Ticket ${ticketId} not found`);
    this.name = "TicketNotFoundError";
  }
}

export class TicketAccessError extends Error {
  constructor() {
    super("You don't have access to this ticket");
    this.name = "TicketAccessError";
  }
}

/**
 * Creates a ticket on behalf of an authenticated user. userEmail/userPlan are
 * snapshotted server-side (via the Admin SDK's own record of the account and
 * the existing billing state) rather than trusted from the client, even
 * though the stakes here are low (a user lying about their own plan in their
 * own ticket) — cheap to get right since getBillingState is already a call
 * away.
 */
export async function createTicket(
  app: App,
  uid: string,
  userEmail: string | null,
  input: {
    type: TicketType;
    title: string;
    description: string;
    context: Omit<TicketContext, "timestamp">;
    /**
     * Raw PNG bytes, base64-encoded, uploaded here server-side via the Admin SDK (which bypasses
     * Storage security rules entirely) rather than the client uploading directly — this project's
     * Storage rules live in storage.rules but can't be deployed from this environment (no
     * `firebase login`-authenticated CLI available), so a client-side upload would 403 against
     * whatever default rules the bucket actually has live. Revisit as a direct client upload once
     * `firebase deploy --only storage` has actually been run against this project.
     */
    screenshotBase64?: string;
  }
): Promise<Ticket> {
  if (!withinDailyTicketLimit(uid)) {
    throw new TicketRateLimitError();
  }

  const billing = await getBillingState(app, uid);
  const now = new Date().toISOString();
  const ref = ticketsCollection(app).doc();

  let screenshotPath: string | undefined;
  if (input.screenshotBase64) {
    try {
      screenshotPath = `ticketScreenshots/${uid}/${ref.id}.png`;
      await getStorage(app)
        .bucket()
        .file(screenshotPath)
        .save(Buffer.from(input.screenshotBase64, "base64"), { contentType: "image/png" });
    } catch (e) {
      console.error("createTicket: screenshot upload failed — continuing without it", e);
      screenshotPath = undefined;
    }
  }

  const ticket: Ticket = {
    id: ref.id,
    uid,
    userEmail,
    userPlan: billing.plan,
    type: input.type,
    status: "new",
    title: input.title,
    description: input.description,
    context: { ...input.context, timestamp: now },
    ...(screenshotPath ? { screenshotPath } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(ticket);
  notifySupportOfNewTicket(ticket);
  return ticket;
}

/** Admin-only — generates a short-lived signed URL for a ticket's screenshot rather than exposing
 *  a public one; the bucket denies direct client reads entirely (see storage.rules). */
export async function getTicketScreenshotUrl(app: App, ticketId: string): Promise<string | null> {
  const ticket = await getTicketOrThrow(app, ticketId);
  if (!ticket.screenshotPath) return null;
  const [url] = await getStorage(app)
    .bucket()
    .file(ticket.screenshotPath)
    .getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000 });
  return url;
}

/** Sorts newest-first — shared by every list function here instead of chaining .orderBy onto a .where()
 *  query, which would require a manual composite Firestore index per filter combination. Fine at this
 *  app's scale (same reasoning as /api/admin/users's in-memory Promise.all in server.ts). */
function byNewestFirst(a: Ticket, b: Ticket): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/** Caller's own tickets only — the route calling this must pass the caller's own uid. */
export async function listTicketsForUser(app: App, uid: string): Promise<Ticket[]> {
  const snap = await ticketsCollection(app).where("uid", "==", uid).get();
  return snap.docs.map((d) => d.data() as Ticket).sort(byNewestFirst);
}

async function getTicketOrThrow(app: App, ticketId: string): Promise<Ticket> {
  const snap = await ticketsCollection(app).doc(ticketId).get();
  if (!snap.exists) throw new TicketNotFoundError(ticketId);
  return snap.data() as Ticket;
}

async function listMessages(app: App, ticketId: string): Promise<TicketMessage[]> {
  const snap = await messagesCollection(app, ticketId).orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => d.data() as TicketMessage);
}

/** Returns the ticket plus its thread — 403s (via TicketAccessError) if the caller isn't the ticket's owner. */
export async function getTicketForUser(
  app: App,
  uid: string,
  ticketId: string
): Promise<{ ticket: Ticket; messages: TicketMessage[] }> {
  const ticket = await getTicketOrThrow(app, ticketId);
  if (ticket.uid !== uid) throw new TicketAccessError();
  return { ticket, messages: await listMessages(app, ticketId) };
}

/** Appends a user reply — verifies ownership first, same access rule as getTicketForUser. */
export async function addUserMessage(app: App, uid: string, ticketId: string, body: string): Promise<TicketMessage> {
  const ticket = await getTicketOrThrow(app, ticketId);
  if (ticket.uid !== uid) throw new TicketAccessError();

  const message = await appendMessage(app, ticketId, { authorUid: uid, authorRole: "user", body });
  await ticketsCollection(app).doc(ticketId).set({ updatedAt: message.createdAt }, { merge: true });
  notifySupportOfUserReply(ticket, body);
  return message;
}

/** Admin-only — no ownership check, callers must already be gated by requireAdmin. */
export async function listAllTickets(
  app: App,
  filter?: { status?: TicketStatus; triageType?: TicketTriageType }
): Promise<Ticket[]> {
  let query: FirebaseFirestore.Query = ticketsCollection(app);
  if (filter?.status) query = query.where("status", "==", filter.status);
  if (filter?.triageType) query = query.where("triageType", "==", filter.triageType);
  const snap = await query.get();
  return snap.docs.map((d) => d.data() as Ticket).sort(byNewestFirst);
}

export async function getTicketForAdmin(app: App, ticketId: string): Promise<{ ticket: Ticket; messages: TicketMessage[] }> {
  const ticket = await getTicketOrThrow(app, ticketId);
  return { ticket, messages: await listMessages(app, ticketId) };
}

/**
 * Admin triage/status update — the only writer of triageType/priority/adminNotes/status.
 * Callers (the /api/admin/tickets/:id route) commonly destructure all four fields out of
 * a request body that only sets one of them, producing explicit `undefined` for the rest —
 * Firestore's Admin SDK rejects `undefined` field values outright, so those are dropped
 * here rather than trusting every caller to pre-filter its own partial update.
 */
export async function updateTicket(
  app: App,
  ticketId: string,
  updates: Partial<Pick<Ticket, "status" | "triageType" | "priority" | "adminNotes">>
): Promise<Ticket> {
  await getTicketOrThrow(app, ticketId); // 404s cleanly instead of silently upserting a stray doc
  const definedUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
  const ref = ticketsCollection(app).doc(ticketId);
  await ref.set({ ...definedUpdates, updatedAt: new Date().toISOString() }, { merge: true });
  return (await ref.get()).data() as Ticket;
}

export async function addAdminMessage(app: App, adminUid: string, ticketId: string, body: string): Promise<TicketMessage> {
  const ticket = await getTicketOrThrow(app, ticketId);
  const message = await appendMessage(app, ticketId, { authorUid: adminUid, authorRole: "admin", body });
  await ticketsCollection(app).doc(ticketId).set({ updatedAt: message.createdAt }, { merge: true });
  notifyUserOfAdminReply(ticket, body);
  return message;
}

async function appendMessage(
  app: App,
  ticketId: string,
  input: { authorUid: string; authorRole: "user" | "admin"; body: string }
): Promise<TicketMessage> {
  const ref = messagesCollection(app, ticketId).doc();
  const message: TicketMessage = { id: ref.id, ...input, createdAt: new Date().toISOString() };
  await ref.set(message);
  return message;
}
