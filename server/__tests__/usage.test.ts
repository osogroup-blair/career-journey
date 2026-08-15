import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordAiUsage, getUserAiUsage } from '../billing';
import type { App } from 'firebase-admin/app';

const mockAdd = vi.fn();
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
  add: mockAdd,
  get: mockGet,
});

vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: () => ({
      collection: mockCollection,
      runTransaction: vi.fn(),
    }),
    FieldValue: {
      increment: (n: number) => ({ _increment: n }),
    },
  };
});

describe('AI Token Usage Telemetry', () => {
  const mockApp = {} as App;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordAiUsage writes to aiUsageLogs and increments billing token counters for Free plan', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ plan: 'free', freeAiActionsUsed: 2 }),
    });
    mockAdd.mockResolvedValueOnce({ id: 'log_123' });
    mockSet.mockResolvedValueOnce(undefined);

    await recordAiUsage(mockApp, 'user123', {
      endpoint: 'parse',
      model: 'gemini-3.1-pro-preview',
      promptTokens: 450,
      completionTokens: 150,
      totalTokens: 600,
    });

    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'user123',
        endpoint: 'parse',
        model: 'gemini-3.1-pro-preview',
        promptTokens: 450,
        completionTokens: 150,
        totalTokens: 600,
      })
    );

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        lifetimeAiTokensUsed: { _increment: 600 },
        freeAiTokensUsed: { _increment: 600 },
      }),
      { merge: true }
    );
  });

  it('recordAiUsage increments proMonthlyAiTokensUsed for pro_monthly plan', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ plan: 'pro_monthly', proMonthlyAiActionsUsed: 5 }),
    });
    mockAdd.mockResolvedValueOnce({ id: 'log_456' });
    mockSet.mockResolvedValueOnce(undefined);

    await recordAiUsage(mockApp, 'user_pro', {
      endpoint: 'generateResume',
      model: 'gemini-3.7-flash',
      promptTokens: 1200,
      completionTokens: 800,
      totalTokens: 2000,
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        lifetimeAiTokensUsed: { _increment: 2000 },
        proMonthlyAiTokensUsed: { _increment: 2000 },
      }),
      { merge: true }
    );
  });

  it('recordAiUsage increments byomDailyTokensUsed when isByom is true', async () => {
    mockAdd.mockResolvedValueOnce({ id: 'log_789' });
    mockSet.mockResolvedValueOnce(undefined);

    await recordAiUsage(mockApp, 'user_byom', {
      endpoint: 'keywords',
      model: 'gemini-3.5-flash-lite',
      promptTokens: 300,
      completionTokens: 100,
      totalTokens: 400,
      isByom: true,
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        lifetimeAiTokensUsed: { _increment: 400 },
        byomDailyTokensUsed: { _increment: 400 },
      }),
      { merge: true }
    );
  });

  it('getUserAiUsage returns correctly sorted logs and summary totals', async () => {
    // Mock getBillingState
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        plan: 'pro_monthly',
        lifetimeAiTokensUsed: 15400,
        proMonthlyAiTokensUsed: 8200,
      }),
    });

    // Mock logs query snapshot
    mockGet.mockResolvedValueOnce({
      docs: [
        {
          id: 'log_1',
          data: () => ({
            timestamp: '2026-08-14T10:00:00.000Z',
            endpoint: 'parse',
            featureName: 'Job Description Parsing',
            model: 'gemini-3.1-pro-preview',
            promptTokens: 500,
            completionTokens: 200,
            totalTokens: 700,
          }),
        },
        {
          id: 'log_2',
          data: () => ({
            timestamp: '2026-08-14T12:30:00.000Z',
            endpoint: 'generateResume',
            featureName: 'Resume Bullet Generation',
            model: 'gemini-3.7-flash',
            promptTokens: 1200,
            completionTokens: 800,
            totalTokens: 2000,
          }),
        },
      ],
    });

    const summary = await getUserAiUsage(mockApp, 'user_pro');

    expect(summary.lifetimeTokensUsed).toBe(15400);
    expect(summary.currentPeriodTokensUsed).toBe(8200);
    expect(summary.recentLogs).toHaveLength(2);
    // Verified sorted in descending chronological order
    expect(summary.recentLogs[0].id).toBe('log_2');
    expect(summary.recentLogs[1].id).toBe('log_1');
  });
});
