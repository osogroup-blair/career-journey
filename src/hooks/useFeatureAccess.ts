import { useStore } from '../store';
import { FeatureKey, FEATURE_METADATA } from '../types/featureFlags';

export function useFeatureAccess(feature: FeatureKey): {
  allowed: boolean;
  featureLabel: string;
  reason?: string;
} {
  const { billing, isAdmin, featureFlags } = useStore();
  const meta = FEATURE_METADATA[feature];
  const featureLabel = meta?.label || feature;

  // Emergency kill switch
  if (featureFlags?.killSwitches?.aiPipeline) {
    return {
      allowed: false,
      featureLabel,
      reason: `${featureLabel} is temporarily unavailable during maintenance.`,
    };
  }

  if (feature === 'job_matches' && featureFlags?.killSwitches?.matches) {
    return {
      allowed: false,
      featureLabel,
      reason: 'Job Matches is temporarily unavailable.',
    };
  }

  // Admin & Comped users get full bypass access
  if (isAdmin || billing?.comped) {
    return { allowed: true, featureLabel };
  }

  const plan = billing?.plan || 'free';

  // Check custom feature flag matrix if loaded, else fallback to defaults
  let isEnabled = false;
  if (featureFlags?.features?.[feature]?.[plan] !== undefined) {
    isEnabled = Boolean(featureFlags.features[feature]![plan]);
  } else if (meta?.defaultPlans?.[plan] !== undefined) {
    isEnabled = meta.defaultPlans[plan];
  } else {
    isEnabled = plan !== 'free';
  }

  if (!isEnabled) {
    return {
      allowed: false,
      featureLabel,
      reason: `${featureLabel} is not enabled for the ${plan.replace('_', ' ')} plan.`,
    };
  }

  return { allowed: true, featureLabel };
}
