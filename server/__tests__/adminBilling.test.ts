import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBillingState, setBillingFields, isPaidPlan } from '../billing';
import { logAdminAction } from '../auditLog';
import type { App } from 'firebase-admin/app';

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();

mockDoc.mockReturnValue({
  get: mockGet,
  set: mockSet,
  collection: mockCollection,
});

mockCollection.mockReturnValue({
  doc: mockDoc,
});

vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: () => ({
      collection: mockCollection,
      runTransaction: vi.fn(),
    }),
  };
});

describe('Admin Billing & Plan Management', () => {
  const mockApp = {} as App;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isPaidPlan correctly identifies free vs paid plans', () => {
    expect(isPaidPlan('free')).toBe(false);
    expect(isPaidPlan('pro_monthly')).toBe(true);
    expect(isPaidPlan('byom_monthly')).toBe(true);
    expect(isPaidPlan('byom_yearly')).toBe(true);
  });

  it('getBillingState creates default state when document does not exist', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    const state = await getBillingState(mockApp, 'user123');
    expect(state.plan).toBe('free');
    expect(state.freeAiActionsUsed).toBe(0);
    expect(state.proMonthlyAiActionsUsed).toBe(0);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: 'free',
        freeAiActionsUsed: 0,
      })
    );
  });

  it('setBillingFields updates specific fields with merge option', async () => {
    await setBillingFields(mockApp, 'user123', { plan: 'pro_monthly', comped: true });

    expect(mockDoc).toHaveBeenCalledWith('billing');
    expect(mockSet).toHaveBeenCalledWith(
      { plan: 'pro_monthly', comped: true },
      { merge: true }
    );
  });

  it('setBillingFields handles quota resets cleanly', async () => {
    await setBillingFields(mockApp, 'user123', {
      freeAiActionsUsed: 0,
      proMonthlyAiActionsUsed: 0,
      byomDailyActionsUsed: 0,
    });

    expect(mockSet).toHaveBeenCalledWith(
      {
        freeAiActionsUsed: 0,
        proMonthlyAiActionsUsed: 0,
        byomDailyActionsUsed: 0,
      },
      { merge: true }
    );
  });

  it('setBillingFields properly updates user plan to byom_yearly', async () => {
    await setBillingFields(mockApp, 'user123', { plan: 'byom_yearly' });

    expect(mockSet).toHaveBeenCalledWith(
      { plan: 'byom_yearly' },
      { merge: true }
    );
  });

  it('logAdminAction writes administrative events to Firestore', async () => {
    const entry = await logAdminAction(mockApp, {
      actorUid: 'admin_user',
      targetUid: 'user_target',
      action: 'update_plan',
      details: { plan: 'pro_monthly' },
    });

    expect(entry.actorUid).toBe('admin_user');
    expect(entry.targetUid).toBe('user_target');
    expect(entry.action).toBe('update_plan');
    expect(mockCollection).toHaveBeenCalledWith('admin_audit_logs');
    expect(mockSet).toHaveBeenCalled();
  });
});
