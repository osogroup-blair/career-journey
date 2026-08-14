/**
 * Transactional email (admin-support-feedback-plan.md Phase 5) — ticket notifications only.
 * Deliberately separate from Firebase Auth's built-in mailer (server/firebaseAdmin.ts's
 * sendEmailVerification path): that one only sends Firebase's own fixed auth templates
 * (verification/reset), it cannot send arbitrary content like "you got a reply."
 *
 * Uses Resend's HTTP API directly rather than adding their SDK as a dependency — this is
 * the only email call site in the app, so a single fetch() call is simpler than a new
 * package for one endpoint.
 */

export const isEmailConfigured = Boolean(process.env.RESEND_API_KEY);

const DEFAULT_FROM = 'Career Journey <onboarding@resend.dev>'; // Resend's shared test sender — works with no domain verification, fine until a custom domain is set up.

/**
 * No-op (logged, not thrown) when RESEND_API_KEY isn't set — same posture as every other
 * optional-integration guard in this app (getAdminApp, isFirebaseConfigured): local dev
 * works without it, and a delivery failure here should never break the ticket action that
 * triggered it (see the callers in server/support.ts, which never await this for its
 * result — notification failures are logged, not surfaced to the user).
 */
export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  if (!isEmailConfigured) {
    console.log(`[email] RESEND_API_KEY not set — skipping email to ${input.to}: "${input.subject}"`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.SUPPORT_FROM_EMAIL || DEFAULT_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });
    if (!res.ok) {
      console.error(`[email] Resend API returned ${res.status}:`, await res.text());
    }
  } catch (e) {
    console.error('[email] send failed', e);
  }
}
