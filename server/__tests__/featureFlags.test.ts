import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isFeatureEnabled, getFeatureFlags, setFeatureFlags, _resetFeatureFlagsCache } from '../featureFlags';
import { getDefaultFeatureMatrix, FeatureFlags } from '../../src/types/featureFlags';
import type { App } from 'firebase-admin/app';

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();

mockDoc.mockReturnValue({
  get: mockGet,
  set: mockSet,
});

mockCollection.mockReturnValue({
  doc: mockDoc,
});

vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: () => ({
      collection: mockCollection,
    }),
  };
});

describe('Feature Flags & Entitlement Evaluation', () => {
  const mockApp = {} as App;

  const baseFlags: FeatureFlags = {
    freeLifetimeLimit: 20,
    proMonthlyLimit: 100,
    byomBurstPerMinute: 30,
    byomDailyLimit: 500,
    killSwitches: {
      matches: false,
      aiPipeline: false,
    },
    features: getDefaultFeatureMatrix(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    _resetFeatureFlagsCache();
  });

  describe('isFeatureEnabled', () => {
    it('correctly checks default free vs paid permissions for job_matches', () => {
      expect(isFeatureEnabled(baseFlags, 'job_matches', { plan: 'free' })).toBe(false);
      expect(isFeatureEnabled(baseFlags, 'job_matches', { plan: 'pro_monthly' })).toBe(true);
      expect(isFeatureEnabled(baseFlags, 'job_matches', { plan: 'byom_monthly' })).toBe(true);
      expect(isFeatureEnabled(baseFlags, 'job_matches', { plan: 'byom_yearly' })).toBe(true);
    });

    it('grants full feature bypass to Admins regardless of tier', () => {
      // Free plan normally blocks job_matches and byom_custom_models
      expect(isFeatureEnabled(baseFlags, 'job_matches', { plan: 'free', isAdmin: true })).toBe(true);
      expect(isFeatureEnabled(baseFlags, 'byom_custom_models', { plan: 'free', isAdmin: true })).toBe(true);
      expect(isFeatureEnabled(baseFlags, 'cover_letter', { plan: 'free', isAdmin: true })).toBe(true);
    });

    it('grants full feature bypass to comped users regardless of tier', () => {
      expect(isFeatureEnabled(baseFlags, 'job_matches', { plan: 'free', comped: true })).toBe(true);
      expect(isFeatureEnabled(baseFlags, 'byom_custom_models', { plan: 'free', comped: true })).toBe(true);
    });

    it('respects custom matrix toggles when feature is disabled for pro_monthly', () => {
      const customizedFlags: FeatureFlags = {
        ...baseFlags,
        features: {
          ...baseFlags.features,
          cover_letter: {
            free: false,
            pro_monthly: false,
            byom_monthly: true,
            byom_yearly: true,
          },
        },
      };

      expect(isFeatureEnabled(customizedFlags, 'cover_letter', { plan: 'free' })).toBe(false);
      expect(isFeatureEnabled(customizedFlags, 'cover_letter', { plan: 'pro_monthly' })).toBe(false);
      expect(isFeatureEnabled(customizedFlags, 'cover_letter', { plan: 'byom_monthly' })).toBe(true);

      // Admin still gets access despite matrix toggle
      expect(isFeatureEnabled(customizedFlags, 'cover_letter', { plan: 'pro_monthly', isAdmin: true })).toBe(true);
    });

    it('emergency matches kill switch blocks job_matches even for admins', () => {
      const killSwitchFlags: FeatureFlags = {
        ...baseFlags,
        killSwitches: {
          matches: true,
          aiPipeline: false,
        },
      };

      expect(isFeatureEnabled(killSwitchFlags, 'job_matches', { plan: 'pro_monthly' })).toBe(false);
      expect(isFeatureEnabled(killSwitchFlags, 'job_matches', { plan: 'pro_monthly', isAdmin: true })).toBe(false);
      expect(isFeatureEnabled(killSwitchFlags, 'job_matches', { plan: 'free', comped: true })).toBe(false);

      // Other features should still work
      expect(isFeatureEnabled(killSwitchFlags, 'cover_letter', { plan: 'pro_monthly' })).toBe(true);
    });

    it('emergency global aiPipeline kill switch blocks all features for everyone', () => {
      const globalKillFlags: FeatureFlags = {
        ...baseFlags,
        killSwitches: {
          matches: false,
          aiPipeline: true,
        },
      };

      expect(isFeatureEnabled(globalKillFlags, 'job_matches', { plan: 'pro_monthly', isAdmin: true })).toBe(false);
      expect(isFeatureEnabled(globalKillFlags, 'cover_letter', { plan: 'pro_monthly', isAdmin: true })).toBe(false);
      expect(isFeatureEnabled(globalKillFlags, 'tailored_resume', { plan: 'free', comped: true })).toBe(false);
    });
  });

  describe('getFeatureFlags & setFeatureFlags', () => {
    it('returns merged feature matrix with defaults when snapshot is empty', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });

      const flags = await getFeatureFlags(mockApp);
      expect(flags.freeLifetimeLimit).toBe(20);
      expect(flags.features.job_matches.pro_monthly).toBe(true);
      expect(flags.features.job_matches.free).toBe(false);
    });

    it('merges stored custom toggles with default matrix', async () => {
      mockGet.mockResolvedValueOnce({
        exists: true,
        data: () => ({
          freeLifetimeLimit: 50,
          features: {
            job_matches: {
              free: true,
            },
          },
        }),
      });

      const flags = await getFeatureFlags(mockApp);
      expect(flags.freeLifetimeLimit).toBe(50);
      expect(flags.features.job_matches.free).toBe(true);
      // Other defaults are preserved
      expect(flags.features.tailored_resume.free).toBe(true);
    });

    it('setFeatureFlags saves updates to Firestore with merge', async () => {
      mockGet.mockResolvedValueOnce({ exists: false });

      await setFeatureFlags(mockApp, {
        killSwitches: { matches: true, aiPipeline: false },
      });

      expect(mockDoc).toHaveBeenCalledWith('featureFlags');
      expect(mockSet).toHaveBeenCalledWith(
        { killSwitches: { matches: true, aiPipeline: false } },
        { merge: true }
      );
    });
  });
});
