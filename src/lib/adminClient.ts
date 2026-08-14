import { authHeaders } from './aiClient';
import { AllowedModelsConfig } from '../types/aiModels';

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return parsed?.error || text;
  } catch {
    return text;
  }
}

async function adminGet(path: string): Promise<any> {
  const res = await fetch(path, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

async function adminPost(path: string, body: any): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export interface FeatureFlags {
  freeLifetimeLimit: number;
  proMonthlyLimit: number;
  byomBurstPerMinute: number;
  byomDailyLimit: number;
  killSwitches: { matches: boolean; aiPipeline: boolean };
}

export interface AdminUserRow {
  uid: string;
  email: string | null;
  createdAt: string;
  plan: string;
  comped: boolean;
  subscriptionStatus?: string;
  freeAiActionsUsed: number;
  proMonthlyAiActionsUsed: number;
  byomProvider?: string;
}

export const getFeatureFlags = (): Promise<FeatureFlags> => adminGet('/api/admin/featureFlags');
export const saveFeatureFlags = (updates: Partial<FeatureFlags>): Promise<FeatureFlags> => adminPost('/api/admin/featureFlags', updates);

export const saveAllowedModels = (config: AllowedModelsConfig): Promise<void> => adminPost('/api/admin/allowedModels', config);

export const listAdminUsers = (): Promise<AdminUserRow[]> => adminGet('/api/admin/users');
export const setUserComped = (uid: string, comped: boolean): Promise<void> => adminPost(`/api/admin/users/${uid}/comp`, { comped });
