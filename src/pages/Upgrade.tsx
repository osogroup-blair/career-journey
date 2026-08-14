import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../store';
import { auth } from '../lib/firebase';
import { startCheckout, openBillingPortal } from '../lib/billingClient';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, useToast } from '../components/ui';
import { PlanId } from '../types/billing';
import { CheckCircle2, Loader2, Radar, Sparkles } from 'lucide-react';

const FREE_LIFETIME_LIMIT = 20; // mirrors server/billing.ts's default — display only, server is the source of truth

type PlanCard = {
  plan: Exclude<PlanId, 'free'>;
  name: string;
  price: string;
  tagline: string;
  bullets: string[];
};

const PLAN_CARDS: PlanCard[] = [
  {
    plan: 'pro_monthly',
    name: 'Pro Monthly',
    price: '$30/mo',
    tagline: 'We run the AI for you',
    bullets: ['100 AI actions/month', 'Job Analysis (Matches) unlocked', 'Full application pipeline'],
  },
  {
    plan: 'byom_monthly',
    name: 'BYOM Monthly',
    price: '$15/mo',
    tagline: 'Bring your own model — your key, your provider',
    bullets: ['No app-side action cap', 'Choose Gemini, OpenAI, or Anthropic', 'Job Analysis (Matches) unlocked'],
  },
  {
    plan: 'byom_yearly',
    name: 'BYOM Yearly',
    price: '$120/yr',
    tagline: 'Same as BYOM Monthly, billed annually',
    bullets: ['No app-side action cap', 'Choose Gemini, OpenAI, or Anthropic', 'Job Analysis (Matches) unlocked'],
  },
];

const PLAN_LABEL: Record<PlanId, string> = {
  free: 'Free',
  pro_monthly: 'Pro Monthly',
  byom_monthly: 'BYOM Monthly',
  byom_yearly: 'BYOM Yearly',
};

export default function Upgrade() {
  const { billing, refreshBilling } = useStore();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<PlanId | 'portal' | null>(null);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (!checkout) return;
    if (checkout === 'success') {
      toast.success("Subscription active! It can take a few seconds for your plan to update below — refreshing now.");
      // The webhook lands async relative to this redirect, so poll briefly
      // rather than assume one refetch will already see the new plan.
      let attempts = 0;
      const interval = setInterval(() => {
        attempts += 1;
        refreshBilling();
        if (attempts >= 5) clearInterval(interval);
      }, 1500);
    } else if (checkout === 'cancelled') {
      toast.error('Checkout cancelled — no changes were made.');
    }
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubscribe = async (plan: Exclude<PlanId, 'free'>) => {
    const email = auth?.currentUser?.email;
    if (!email) {
      toast.error('Sign in required to subscribe.');
      return;
    }
    setLoadingPlan(plan);
    try {
      await startCheckout(plan, email);
    } catch (err: any) {
      toast.error(err?.message || 'Could not start checkout.');
      setLoadingPlan(null);
    }
  };

  const handleManageBilling = async () => {
    setLoadingPlan('portal');
    try {
      await openBillingPortal();
    } catch (err: any) {
      toast.error(err?.message || 'Could not open billing portal.');
      setLoadingPlan(null);
    }
  };

  if (billing === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-sm text-slate-500">
        Billing isn't available in local-only mode — sign in with a real account to manage a subscription.
      </div>
    );
  }

  const isPaid = billing.plan !== 'free';

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">Plans & Billing</h1>
        <div className="text-sm text-slate-500 flex items-center justify-center gap-2">
          Current plan: <Badge variant={isPaid ? 'success' : 'outline'}>{PLAN_LABEL[billing.plan]}</Badge>
        </div>
      </div>

      {!isPaid && (
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center space-y-1">
            <p className="text-sm text-slate-600">
              {billing.freeAiActionsUsed} of {FREE_LIFETIME_LIMIT} free AI actions used (lifetime — never resets)
            </p>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500"
                style={{ width: `${Math.min(100, (billing.freeAiActionsUsed / FREE_LIFETIME_LIMIT) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 flex items-center justify-center gap-1 pt-1">
              <Radar className="w-3.5 h-3.5" /> Job Analysis (Matches) requires a paid plan
            </p>
          </CardContent>
        </Card>
      )}

      {isPaid ? (
        <Card className="max-w-md mx-auto">
          <CardContent className="pt-6 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-sm text-slate-600">
              You're on <span className="font-semibold">{PLAN_LABEL[billing.plan]}</span>
              {billing.subscriptionStatus && billing.subscriptionStatus !== 'active' && (
                <span className="text-amber-600"> ({billing.subscriptionStatus})</span>
              )}
              .
            </p>
            {billing.subscriptionCurrentPeriodEnd && (
              <p className="text-xs text-slate-400">
                Renews {new Date(billing.subscriptionCurrentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            <Button onClick={handleManageBilling} disabled={loadingPlan === 'portal'} variant="outline">
              {loadingPlan === 'portal' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Manage billing
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-3 gap-4">
          {PLAN_CARDS.map((card) => (
            <Card key={card.plan} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-brand-500" />
                  {card.name}
                </CardTitle>
                <p className="text-2xl font-bold text-slate-900">{card.price}</p>
                <p className="text-xs text-slate-500">{card.tagline}</p>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between gap-4">
                <ul className="text-sm text-slate-600 space-y-1.5">
                  {card.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
                <Button onClick={() => handleSubscribe(card.plan)} disabled={loadingPlan !== null} className="w-full">
                  {loadingPlan === card.plan && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Subscribe
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
