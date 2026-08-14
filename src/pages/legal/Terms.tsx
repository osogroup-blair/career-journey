import React from 'react';
import LegalPage from '../../components/LegalPage';

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="[fill in launch date]">
      <p>
        These Terms of Service ("Terms") govern your use of Career Journey (the "Service"), operated by
        [Your Company/Entity Name] ("we", "us"). By creating an account or using the Service, you agree to these Terms.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">1. The Service</h2>
      <p>
        Career Journey helps you build a structured record of your work history ("Career Journey"), use it to
        evaluate and tailor applications to job postings, and — on paid plans — automatically discover and triage
        job postings ("Job Analysis"). The Service uses AI models to generate suggestions, scores, and drafted
        content; you are responsible for reviewing anything generated before relying on it or sending it to an employer.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">2. Accounts</h2>
      <p>
        You must provide accurate information when creating an account and are responsible for activity under it.
        Notify us promptly if you believe your account has been compromised.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">3. Plans and billing</h2>
      <p>
        The Service offers a free plan with a limited lifetime allowance of AI actions, and paid subscription plans
        billed through Stripe. Paid plans renew automatically until cancelled; you can cancel anytime through the
        billing portal in your account settings, and cancellation takes effect at the end of the current billing
        period unless stated otherwise. See our <a href="#/refunds" className="text-brand-600 hover:underline">Refund Policy</a> for refund terms.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">4. Bring Your Own Model (BYOM)</h2>
      <p>
        On BYOM plans, you may connect your own API key for a third-party AI provider (currently Google Gemini,
        OpenAI, or Anthropic). Your key is stored only in your browser, never on our servers, and is sent directly
        with your requests to power those specific AI actions. <strong>You are solely responsible for all costs, usage
        limits, and terms of service of your own account with that provider.</strong> We are not a party to your
        agreement with your AI provider and are not responsible for their availability, pricing, or output.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">5. Acceptable use</h2>
      <p>
        Don't use the Service to violate any law, misrepresent your qualifications in a way you know to be false,
        attempt to circumvent usage limits or paid-plan gating, or interfere with the Service's operation.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">6. Your content</h2>
      <p>
        You retain ownership of the career history, documents, and other content you provide. You grant us a limited
        license to process that content solely to provide the Service to you (including sending it to the AI
        provider handling a given request — our own for standard plans, or yours for BYOM plans).
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">7. Disclaimer and limitation of liability</h2>
      <p>
        The Service is provided "as is." AI-generated output (fit scores, gap analysis, drafted resumes/cover
        letters, interview prep, etc.) may be inaccurate or incomplete — it is a drafting aid, not professional
        career, legal, or hiring advice. To the maximum extent permitted by law, we are not liable for indirect,
        incidental, or consequential damages arising from your use of the Service.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">8. Changes</h2>
      <p>We may update these Terms from time to time; material changes will be reflected by the "Last updated" date above.</p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">9. Contact</h2>
      <p>Questions about these Terms: [contact email].</p>
    </LegalPage>
  );
}
