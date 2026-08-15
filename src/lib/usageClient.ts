import { authHeaders } from './aiClient';
import type { UserAiUsageSummary } from '../types/usage';

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return parsed?.error || text;
  } catch {
    return text;
  }
}

/**
 * Fetches the AI token usage summary and recent detailed usage logs for the signed-in user.
 */
export async function fetchUserAiUsage(): Promise<UserAiUsageSummary> {
  const res = await fetch('/api/user/usage', {
    method: 'GET',
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

/**
 * Fetches AI token usage summary for an admin inspecting a user.
 */
export async function fetchAdminUserAiUsage(uid: string): Promise<UserAiUsageSummary> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(uid)}/usage`, {
    method: 'GET',
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}
