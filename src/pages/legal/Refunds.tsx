import React from 'react';
import LegalPage from '../../components/LegalPage';

export default function Refunds() {
  return (
    <LegalPage title="Refund Policy" updated="[fill in launch date]">
      <p>
        This policy covers refunds for Career Journey's paid subscription plans (Pro Monthly, BYOM Monthly, BYOM
        Yearly), billed through Stripe.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">1. Cancellation</h2>
      <p>
        You can cancel your subscription anytime from the billing portal in your account settings. Cancellation
        stops future renewals; you keep access through the end of the billing period you already paid for. We don't
        prorate or refund the unused portion of a cancelled period by default.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">2. Refunds</h2>
      <p>
        [Decide your actual policy here — e.g.: "We offer refunds within 7 days of a first-time charge if you
        haven't meaningfully used the plan's paid features (Job Analysis/Matches). Contact [contact email] to
        request one." Or: "All sales are final except where required by law."] This is a business decision, not
        something to leave as a placeholder at launch.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">3. Failed payments</h2>
      <p>
        If a renewal payment fails, Stripe automatically retries it a few times (its standard dunning schedule)
        before your plan is downgraded to Free. Your data is never deleted when this happens — you keep everything
        you've built, you just lose access to paid features (like Job Analysis) until you resubscribe.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">4. Bring Your Own Model (BYOM) costs</h2>
      <p>
        Your BYOM subscription fee covers the app itself. Any usage costs charged by your own AI provider (Gemini,
        OpenAI, or Anthropic) are separate, billed directly by them to you, and are not something we can refund —
        we never see or collect that money.
      </p>

      <h2 className="text-base font-semibold text-slate-900 pt-2">5. Contact</h2>
      <p>Billing questions or refund requests: [contact email].</p>
    </LegalPage>
  );
}
