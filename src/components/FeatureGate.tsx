import React from 'react';
import { Link } from 'react-router-dom';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import { FeatureKey } from '../types/featureFlags';
import { Button, Card, CardContent } from './ui';
import { Lock, Sparkles, ArrowRight } from 'lucide-react';

interface FeatureGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  compact?: boolean;
}

export default function FeatureGate({ feature, children, fallback, compact }: FeatureGateProps) {
  const { allowed, featureLabel, reason } = useFeatureAccess(feature);

  if (allowed) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (compact) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-sm flex items-center justify-between gap-3 my-2">
        <div className="flex items-center gap-2 text-amber-800">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>{reason || `${featureLabel} requires an upgraded subscription.`}</span>
        </div>
        <Link to="/upgrade">
          <Button size="sm" variant="outline" className="text-amber-800 border-amber-300 hover:bg-amber-100 shrink-0">
            Upgrade <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50/40 to-slate-50 shadow-sm max-w-xl mx-auto my-8">
      <CardContent className="p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center mx-auto shadow-inner">
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-900">{featureLabel}</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {reason || 'This feature is part of our premium tier. Upgrade your subscription to unlock instant access.'}
          </p>
        </div>
        <div className="pt-2">
          <Link to="/upgrade">
            <Button className="bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-sm">
              View Upgrade Options <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
