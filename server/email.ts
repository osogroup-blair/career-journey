import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// Read lazily (functions, not module-level consts): this module is imported
// by server.ts before server.ts's own dotenv.config() call runs, since ESM
// hoists static imports ahead of the importing module's body — a module-level
// process.env read here would always see an unloaded environment and never
// pick up SMTP_USER/SMTP_PASS from .env (see server/rateLimiter.ts's
// dailyLimit() for the same pattern).
export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  if (!isEmailConfigured()) {
    console.log(`[email] SMTP_USER/SMTP_PASS not set — skipping email to ${input.to}: "${input.subject}"`);
    return;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    console.log(`[email] Sent successfully to ${input.to}`);
  } catch (e) {
    console.error('[email] send failed', e);
  }
}
