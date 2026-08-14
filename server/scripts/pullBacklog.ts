import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert, App } from 'firebase-admin/app';
import { listAllTickets, getTicketForAdmin } from '../support';
import type { Ticket } from '../../src/types/support';

dotenv.config();

// process.cwd(), not __dirname — this is an ESM module ("type": "module" in package.json),
// where __dirname doesn't exist. Fine since `npm run backlog:pull` always runs from repo root.
const BACKLOG_DIR = path.resolve(process.cwd(), 'backlog');

// What counts as "actionable" for a coding agent to pick up — triaged as real work,
// not yet shipped/rejected. Matches admin-support-feedback-plan.md Phase 4.
const ACTIONABLE_TRIAGE_TYPES = new Set(['bug', 'enhancement']);
const ACTIONABLE_STATUSES = new Set(['triaged', 'backlogged', 'in_progress', 'in_review']);

function slugFor(ticket: Ticket): string {
  const prefix = ticket.triageType === 'bug' ? 'BUG' : 'ENH';
  return `${prefix}-${ticket.id.slice(0, 8)}`;
}

function renderMarkdown(ticket: Ticket, messages: { authorRole: string; body: string; createdAt: string }[]): string {
  const frontmatter = [
    '---',
    `id: ${ticket.id}`,
    `type: ${ticket.triageType}`,
    `priority: ${ticket.priority || 'unset'}`,
    `status: ${ticket.status}`,
    `reportedBy: ${ticket.userEmail || ticket.uid}`,
    `page: ${ticket.context.route}`,
    `createdAt: ${ticket.createdAt}`,
    '---',
    '',
  ].join('\n');

  const body = [`# ${ticket.title}`, '', ticket.description];

  if (ticket.adminNotes) {
    body.push('', '## Internal notes', ticket.adminNotes);
  }

  if (messages.length > 0) {
    body.push('', '## Thread');
    for (const m of messages) {
      body.push('', `**${m.authorRole === 'admin' ? 'Support' : 'User'}** (${m.createdAt}):`, m.body);
    }
  }

  body.push('', '---', `Context: ${ticket.context.route} · build ${ticket.context.appVersion} · ${ticket.context.userAgent}`);

  return frontmatter + body.join('\n') + '\n';
}

/**
 * Pulls every triaged bug/enhancement into flat markdown files under backlog/ (gitignored —
 * these contain user emails, and Firestore is the source of truth, not this directory) so a
 * coding agent working in this repo can read them the same way it reads payment-system-plan.md
 * or this feature's own plan doc: `ls backlog/`, no new tooling needed. Re-run any time; the
 * directory is wiped and rewritten from scratch each run so resolved/closed tickets don't leave
 * stale files behind.
 */
async function main() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set in .env — see the setup steps before running this script.');
    process.exit(1);
  }

  let app: App;
  try {
    const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    app = initializeApp({ credential: cert(credentials) });
  } catch (e) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON — check it is the full service account JSON on one line.', e);
    process.exit(1);
    return;
  }

  const allTickets = await listAllTickets(app);
  const actionable = allTickets.filter(
    (t) => t.triageType && ACTIONABLE_TRIAGE_TYPES.has(t.triageType) && ACTIONABLE_STATUSES.has(t.status)
  );

  fs.rmSync(BACKLOG_DIR, { recursive: true, force: true });
  fs.mkdirSync(BACKLOG_DIR, { recursive: true });

  for (const ticket of actionable) {
    const { messages } = await getTicketForAdmin(app, ticket.id);
    const filePath = path.join(BACKLOG_DIR, `${slugFor(ticket)}.md`);
    fs.writeFileSync(filePath, renderMarkdown(ticket, messages));
  }

  console.log(`Pulled ${actionable.length} actionable ticket(s) into ${BACKLOG_DIR}`);
  if (actionable.length > 0) {
    for (const t of actionable) console.log(`  ${slugFor(t)}.md — ${t.title} (${t.priority || 'no priority'})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to pull backlog:', err);
    process.exit(1);
  });
