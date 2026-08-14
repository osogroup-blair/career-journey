import React from 'react';
import LegalPage from '../../components/LegalPage';

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="[fill in launch date]">
      <p>
        This Privacy Policy describes how Career Journey ("we", "us") collects, uses, and shares information when
        you use the Service.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">1. What we collect</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Account information:</strong> email address and authentication data (via Firebase Authentication).</li>
        <li><strong>Career Journey data:</strong> work history, skills, achievements, and related content you enter or upload.</li>
        <li><strong>Job/application data:</strong> job postings you paste or that we source, and the analysis/documents generated from them.</li>
        <li><strong>Billing data:</strong> your subscription plan and status — actual payment details (card numbers, etc.) are handled entirely by Stripe and never touch our servers.</li>
        <li><strong>Usage data:</strong> AI-action counts against your plan's quota, for enforcing plan limits.</li>
      </ul>

      <h2 className="text-base font-semibold text-slate-900 pt-2">2. What we don't collect</h2>
      <p>
        On Bring Your Own Model (BYOM) plans, your third-party AI provider API key is stored only in your browser's
        local storage and is never sent to or stored on our servers or database, in any form.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">3. How we use it</h2>
      <p>
        To provide the Service: processing your Career Journey and job data through an AI provider (our own on
        standard plans, or yours on BYOM plans) to generate the analysis and documents you request; enforcing plan
        limits; and account/billing administration.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">4. Who we share it with</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>AI providers</strong> (Google, OpenAI, Anthropic) — only the specific content needed to fulfill your request, only to the provider your plan or BYOM setting actually uses.</li>
        <li><strong>Stripe</strong> — for billing/subscription processing; we never see your full card number.</li>
        <li><strong>Google Firebase</strong> — our hosting, authentication, and database infrastructure.</li>
      </ul>
      <p>We do not sell your data.</p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">5. Data retention and deletion</h2>
      <p>
        We retain your data for as long as your account is active. Contact us to request deletion of your account
        and associated data, subject to what we're legally required to retain (e.g. billing records).
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">6. Security</h2>
      <p>
        We use industry-standard practices (encrypted connections, access-controlled database rules) to protect your
        data, but no system is perfectly secure — we can't guarantee absolute security.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">7. Your rights</h2>
      <p>
        Depending on where you live, you may have rights to access, correct, export, or delete your personal data.
        Contact us at [contact email] to exercise these rights.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">8. Changes</h2>
      <p>We may update this policy from time to time; material changes will be reflected by the "Last updated" date above.</p>
    </LegalPage>
  );
}
