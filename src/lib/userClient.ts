import { authHeaders } from './aiClient';

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
 * Fetches the user's complete data archive from the backend (GDPR data export).
 */
export async function exportUserData(): Promise<any> {
  const res = await fetch('/api/user/export-data', {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

/**
 * Self-service account deletion (GDPR Right to Erasure).
 */
export async function deleteUserAccount(): Promise<{ ok: boolean }> {
  const res = await fetch('/api/user/account', {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}
