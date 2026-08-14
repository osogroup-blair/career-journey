import nodemailer from 'nodemailer';

export const isEmailConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  if (!isEmailConfigured) {
    console.log(`[email] SMTP_USER/SMTP_PASS not set — skipping email to ${input.to}: "${input.subject}"`);
    return;
  }
  try {
    await transporter.sendMail({
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
