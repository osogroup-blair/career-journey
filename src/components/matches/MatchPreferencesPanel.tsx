import { useStore } from '../../store';
import { Card, CardHeader, CardTitle, CardContent, Input, Label } from '../ui';
import { TagInput } from '../TagInput';
import { SlidersHorizontal, X } from 'lucide-react';

export default function MatchPreferencesPanel({ onClose }: { onClose: () => void }) {
  const { matchPreferences, updateMatchPreferences, careerJourney, updateCareerJourneyPerson } = useStore();

  const positioning = careerJourney?.person?.positioning || {};
  const targetRoleFamilies: string[] = positioning.target_role_families || [];

  const updatePositioning = (updates: Record<string, any>) => {
    updateCareerJourneyPerson({ positioning: { ...positioning, ...updates } });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="w-4 h-4 text-brand-600" />
          Match Preferences
        </CardTitle>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close preferences">
          <X className="w-4 h-4" />
        </button>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label>Target Role Families</Label>
          <p className="text-xs text-slate-500 mb-2 -mt-1">Feeds every match scan — stored on your Career Journey.</p>
          <TagInput
            tags={targetRoleFamilies}
            onChange={(tags) => updatePositioning({ target_role_families: tags })}
            placeholder="Add a role family, press Enter"
          />
        </div>
        <div>
          <Label htmlFor="workPreference">Work Preference</Label>
          <p className="text-xs text-slate-500 mb-2 -mt-1">Location, remote, and travel constraints.</p>
          <Input
            id="workPreference"
            defaultValue={careerJourney?.person?.work_preference || ''}
            onBlur={(e) => updateCareerJourneyPerson({ work_preference: e.target.value })}
            placeholder="e.g. Remote-first, willing to travel 10-20%"
            className="text-sm"
          />
        </div>
        <div>
          <Label>Excluded Keywords</Label>
          <p className="text-xs text-slate-500 mb-2 -mt-1">A posting containing any of these skips the AI scan entirely and is auto-dismissed.</p>
          <TagInput
            tags={matchPreferences.excludedKeywords}
            onChange={(tags) => updateMatchPreferences({ excludedKeywords: tags })}
            placeholder="e.g. Top Secret clearance, press Enter"
          />
        </div>
        <div>
          <Label htmlFor="minScore">Minimum Match Score to Show</Label>
          <p className="text-xs text-slate-500 mb-2 -mt-1">Hides lower-scoring postings from the list (0 = show everything).</p>
          <Input
            id="minScore"
            type="number"
            min={0}
            max={100}
            value={matchPreferences.minMatchScore}
            onChange={(e) => updateMatchPreferences({ minMatchScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            className="text-sm w-28"
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Tracked Companies</Label>
          <p className="text-xs text-slate-500 mb-2 -mt-1">
            Board tokens from Greenhouse or Lever career pages — e.g. "airbnb" from boards.greenhouse.io/airbnb, or the slug from jobs.lever.co/&lt;token&gt;. Check companies pulls their open postings automatically.
          </p>
          <TagInput
            tags={matchPreferences.trackedCompanies}
            onChange={(tags) => updateMatchPreferences({ trackedCompanies: tags })}
            placeholder="e.g. airbnb, press Enter"
          />
        </div>
      </CardContent>
    </Card>
  );
}
