import { authHeaders } from './aiClient';
import { PlanId, AIProviderId } from '../types/billing';

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return parsed?.error || text;
  } catch {
    return text;
  }
}

/** Redirects the browser to a hosted Stripe Checkout session for the given paid plan. */
export async function startCheckout(plan: Exclude<PlanId, 'free'>, email: string): Promise<void> {
  const res = await fetch('/api/billing/createCheckoutSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ plan, email }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const { url } = await res.json();
  window.location.href = url;
}

/** Redirects the browser to the Stripe Customer Portal for self-service plan changes/cancellation. */
export async function openBillingPortal(): Promise<void> {
  const res = await fetch('/api/billing/createPortalSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const { url } = await res.json();
  window.location.href = url;
}

/**
 * Tests a BYOM key with a real minimal call before it's ever saved to
 * localStorage — the key itself is never sent to this app's database, this
 * request just proves the key works. See src/lib/byomKeyStorage.ts.
 */
export async function validateByomKey(provider: AIProviderId, apiKey: string, model: string): Promise<{ valid: boolean; error?: string }> {
  const res = await fetch('/api/billing/validateByomKey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ provider, apiKey, model }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

/** Saves the provider + model *choice* server-side (not the key — see validateByomKey). */
export async function saveByomSettings(provider: AIProviderId, model: string): Promise<void> {
  const res = await fetch('/api/billing/byomSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ provider, model }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
}
