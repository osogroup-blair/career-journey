import { authHeaders } from './aiClient';
import { AllowedModelsConfig } from '../types/aiModels';
import { Ticket, TicketMessage, TicketStatus, TicketTriageType } from '../types/support';
import { PlanId } from '../types/billing';
import { FeatureFlags } from '../types/featureFlags';

export type { FeatureFlags };

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

async function adminDelete(path: string): Promise<any> {
  const res = await fetch(path, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export interface AdminUserRow {
  uid: string;
  email: string | null;
  displayName?: string | null;
  disabled?: boolean;
  isAdmin?: boolean;
  createdAt: string;
  lastSignInTime?: string | null;
  plan: PlanId;
  comped: boolean;
  subscriptionStatus?: string;
  freeAiActionsUsed: number;
  proMonthlyAiActionsUsed: number;
  byomProvider?: string;
}

export interface AdminUserDetail {
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
    emailVerified: boolean;
    disabled: boolean;
    isAdmin?: boolean;
    creationTime: string;
    lastSignInTime: string | null;
  };
  billing: {
    plan: PlanId;
    comped?: boolean;
    subscriptionStatus?: string;
    freeAiActionsUsed: number;
    proMonthlyAiActionsUsed: number;
    byomProvider?: string;
    byomModel?: string;
  };
  stats: {
    jobsCount: number;
    matchesCount: number;
    ticketsCount: number;
  };
}

export interface AdminAuditLog {
  id: string;
  actorUid: string;
  actorEmail?: string | null;
  targetUid: string;
  targetEmail?: string | null;
  action:
    | 'update_plan'
    | 'reset_quota'
    | 'set_comp'
    | 'set_status'
    | 'send_reset'
    | 'delete_user'
    | 'grant_admin'
    | 'revoke_admin';
  details: Record<string, any>;
  timestamp: string;
}

export const getFeatureFlags = (): Promise<FeatureFlags> => adminGet('/api/admin/featureFlags');
export const saveFeatureFlags = (updates: Partial<FeatureFlags>): Promise<FeatureFlags> => adminPost('/api/admin/featureFlags', updates);

export const saveAllowedModels = (config: AllowedModelsConfig): Promise<void> => adminPost('/api/admin/allowedModels', config);

export const listAdminUsers = (): Promise<AdminUserRow[]> => adminGet('/api/admin/users');
export const getUserDetail = (uid: string): Promise<AdminUserDetail> => adminGet(`/api/admin/users/${uid}/detail`);
export const setUserComped = (uid: string, comped: boolean): Promise<void> => adminPost(`/api/admin/users/${uid}/comp`, { comped });
export const setUserPlan = (uid: string, plan: PlanId): Promise<void> => adminPost(`/api/admin/users/${uid}/plan`, { plan });
export const setUserAdminRole = (uid: string, makeAdmin: boolean): Promise<{ ok: boolean; isAdmin: boolean }> =>
  adminPost(`/api/admin/users/${uid}/admin-role`, { makeAdmin });
export const resetUserQuota = (uid: string, quotaType?: 'free' | 'pro_monthly' | 'all'): Promise<void> =>
  adminPost(`/api/admin/users/${uid}/reset-quota`, { quotaType });
export const setUserDisabledStatus = (uid: string, disabled: boolean): Promise<{ ok: boolean; disabled: boolean }> =>
  adminPost(`/api/admin/users/${uid}/status`, { disabled });
export const sendUserPasswordReset = (uid: string): Promise<{ ok: boolean; resetLink?: string }> =>
  adminPost(`/api/admin/users/${uid}/send-reset`, {});
export const deleteAdminUser = (uid: string): Promise<{ ok: boolean }> => adminDelete(`/api/admin/users/${uid}`);
export const listAdminAuditLogs = (): Promise<AdminAuditLog[]> => adminGet('/api/admin/audit-logs');

export const listAdminTickets = (filter?: { status?: TicketStatus; triageType?: TicketTriageType }): Promise<Ticket[]> => {
  const params = new URLSearchParams();
  if (filter?.status) params.set('status', filter.status);
  if (filter?.triageType) params.set('triageType', filter.triageType);
  const qs = params.toString();
  return adminGet(`/api/admin/tickets${qs ? `?${qs}` : ''}`);
};

export const getAdminTicket = (id: string): Promise<{ ticket: Ticket; messages: TicketMessage[] }> =>
  adminGet(`/api/admin/tickets/${id}`);

export const updateAdminTicket = (
  id: string,
  updates: Partial<Pick<Ticket, 'status' | 'triageType' | 'priority' | 'adminNotes'>>
): Promise<Ticket> => adminPost(`/api/admin/tickets/${id}`, updates);

export const addAdminTicketMessage = (id: string, body: string): Promise<TicketMessage> =>
  adminPost(`/api/admin/tickets/${id}/messages`, { body });

/** Short-lived (5 min) signed URL — fetch fresh right before displaying, don't cache it. */
export const getAdminTicketScreenshotUrl = (id: string): Promise<{ url: string }> =>
  adminGet(`/api/admin/tickets/${id}/screenshot`);
