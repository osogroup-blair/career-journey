import { ReactNode, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import {
  SPOTLIGHT_ACCENTS,
  SPOTLIGHT_MAX_CAPTION,
  SPOTLIGHT_MAX_OUTCOMES,
  SPOTLIGHT_MAX_PINNED_ACHIEVEMENTS,
  SpotlightOutcomeChoice,
  SpotlightRoleMode,
  SpotlightSettings,
  SpotlightSnapshot,
} from '../../types/spotlight';
import { buildSpotlightSnapshot, defaultSpotlightRoleModes, extractLeadMetric, validateSpotlightSlug } from '../../lib/spotlightSnapshot';
import { checkSpotlightSlug, PublishedSpotlightSummary, spotlightUrl } from '../../lib/spotlightClient';
import { SPOTLIGHT_ACCENT_COLORS, formatRoleDates } from '../../lib/spotlightView';
import { rolesRecentFirst } from '../../lib/resumeBuild';
import { Badge, Button, Input, Label, SearchInput } from '../ui';

/** The region of the preview a setting affects; the editor scrolls the preview there on change. */
export type SpotlightRegion = 'hero' | 'outcomes' | 'arc' | 'experience' | 'achievements' | 'capabilities' | 'skills' | 'how' | 'background' | 'contact';

export type SettingsUpdate = (patch: Partial<SpotlightSettings>, region?: SpotlightRegion) => void;

// ---------- small controls ----------

function Panel({ title, hint, defaultOpen = true, children }: { title: string; hint?: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-slate-200 bg-white shadow-sm focus-within:border-brand-300">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <h2 className="flex-1 text-[15px] font-bold text-slate-800">
          {title}
          {hint && <span className="ml-1.5 text-xs font-normal text-slate-500">· {hint}</span>}
        </h2>
        <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-5 border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}

function Toggle({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  key?: string; // no @types/react: JSX doesn't strip `key` (see JobTracker.tsx)
  label: string;
  help?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {help && <span className="block text-xs text-slate-500">{help}</span>}
      </span>
      <span className="relative inline-flex h-[22px] w-[38px]">
        <input
          type="checkbox"
          role="switch"
          className="peer absolute inset-0 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2" />
        <span className="pointer-events-none absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  wide,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  wide?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={`${wide ? 'flex' : 'inline-flex'} flex-wrap gap-0.5 rounded-lg bg-slate-100 p-[3px]`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`${wide ? 'flex-1' : ''} whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            o.value === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Warn = ({ children }: { children: ReactNode }) => (
  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{children}</p>
);

// ---------- panels ----------

export function BuildWarnings({ warnings }: { warnings: { code: string; message: string }[] }) {
  if (!warnings.length) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      <div className="flex items-center gap-2 font-semibold">
        <AlertCircle className="h-4 w-4" /> Worth checking before you share this
      </div>
      <ul className="mt-1.5 list-disc space-y-1 pl-6">
        {warnings.map((w, i) => (
          <li key={i}>{w.message}</li>
        ))}
      </ul>
    </div>
  );
}

export function VisitorsCanSee({
  settings,
  snapshot,
  careerJourney,
  publishing,
}: {
  settings: SpotlightSettings;
  snapshot: SpotlightSnapshot;
  careerJourney: any;
  /** False in local mode, where there's no link to find. */
  publishing: boolean;
}) {
  const hiddenRoles = (careerJourney?.roles?.length ?? 0) - snapshot.roles.length;
  const rows: { ok: boolean; text: string; note?: string }[] = [
    ...(!publishing
      ? []
      : settings.visibility === 'public'
        ? [{ ok: false, text: 'Listed in search engines', note: 'Anyone searching your name may find it.' }]
        : [{ ok: true, text: 'Not listed in search engines', note: 'Anyone with the link can open it.' }]),
    snapshot.contact.phone ? { ok: false, text: 'Your phone number is shown', note: 'Anyone with the link can see it.' } : { ok: true, text: 'Your phone number is hidden' },
    snapshot.contact.email
      ? { ok: true, text: 'Your email is shown after a click', note: 'It is never written out in full in the page, which stops most scrapers.' }
      : { ok: true, text: 'Your email is hidden' },
    snapshot.person.targetRoles.length
      ? { ok: false, text: 'The roles you want are shown', note: snapshot.person.targetRoles.join(', ') }
      : { ok: true, text: 'The roles you want are hidden' },
    settings.availability === 'open_to_work'
      ? { ok: false, text: '"Open to work" is shown', note: 'A current employer who finds the page will see it.' }
      : { ok: true, text: settings.availability === 'hidden' ? 'Your availability is hidden' : 'Your availability is phrased discreetly' },
    hiddenRoles > 0
      ? { ok: true, text: `${hiddenRoles} ${hiddenRoles === 1 ? 'role is' : 'roles are'} hidden`, note: 'Their work and achievements are left out everywhere on the page.' }
      : { ok: true, text: 'Every role is shown' },
  ];
  return (
    <Panel title="What visitors can see">
      <ul className="grid gap-2.5">
        {rows.map((r) => (
          <li key={r.text} className="grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 text-sm">
            {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />}
            <span>
              {r.text}
              {r.note && <span className="block text-xs text-slate-500">{r.note}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-dashed border-slate-200 pt-3 text-xs text-slate-500">
        Never shown, whatever you choose here: interview answers, application notes, internal positioning notes, résumé settings and
        your Career Journey's change history.
      </p>
    </Panel>
  );
}

export function IntroductionPanel({ settings, careerJourney, update }: { settings: SpotlightSettings; careerJourney: any; update: SettingsUpdate }) {
  const person = careerJourney?.person ?? {};
  const fallback = person.brand || person.positioning?.primary_tagline || '';
  const targets: string[] = person.positioning?.target_role_families ?? [];
  return (
    <Panel title="Introduction">
      <div>
        <Label htmlFor="sp-headline">Headline</Label>
        <Input
          id="sp-headline"
          value={settings.headline ?? ''}
          placeholder={fallback || 'One line about what you do best'}
          maxLength={160}
          onChange={(e) => update({ headline: e.target.value || undefined }, 'hero')}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          {settings.headline ? (
            <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => update({ headline: undefined }, 'hero')}>
              Use the one from your Profile
            </button>
          ) : fallback ? (
            'Leave blank to use the brand line from your Profile.'
          ) : (
            'Your Profile has no brand line yet, so nothing shows unless you write one.'
          )}
        </p>
      </div>
      <div>
        <Label>Availability</Label>
        <Segmented
          wide
          label="Availability"
          value={settings.availability}
          onChange={(availability) => update({ availability }, 'hero')}
          options={[
            { value: 'open_to_work', label: 'Open to work' },
            { value: 'open_to_select', label: 'Open to select roles' },
            { value: 'hidden', label: "Don't show" },
          ]}
        />
      </div>
      <Toggle
        label="Say which roles you're looking for"
        help={targets.length ? targets.join(', ') : 'Add target roles in your Profile first.'}
        checked={settings.showTargetRoles}
        disabled={!targets.length}
        onChange={(showTargetRoles) => update({ showTargetRoles }, 'hero')}
      />
      {settings.showTargetRoles && <Warn>A current employer who finds the page will see this.</Warn>}
    </Panel>
  );
}

export function OutcomesPanel({
  settings,
  snapshot,
  careerJourney,
  update,
}: {
  settings: SpotlightSettings;
  snapshot: SpotlightSnapshot;
  careerJourney: any;
  update: SettingsUpdate;
}) {
  const signature: string[] = (careerJourney?.person?.signature_outcomes ?? []).filter((o: unknown) => typeof o === 'string' && o.trim());
  const chosen: SpotlightOutcomeChoice[] = settings.outcomes ?? signature.slice(0, SPOTLIGHT_MAX_OUTCOMES).map((text) => ({ text }));
  const chosenTexts = chosen.map((c) => c.text);
  const rows = [...chosen.filter((c) => signature.includes(c.text)).map((c) => c.text), ...signature.filter((t) => !chosenTexts.includes(t))];
  const full = chosen.length >= SPOTLIGHT_MAX_OUTCOMES;
  const evidenceCount = new Map(snapshot.outcomes.map((o) => [o.text, o.evidence.length]));

  const set = (next: typeof chosen) => update({ outcomes: next }, 'outcomes');
  const move = (text: string, dir: -1 | 1) => {
    const i = chosen.findIndex((c) => c.text === text);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= chosen.length) return;
    const next = [...chosen];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };

  return (
    <Panel title="Headline outcomes" hint={`${chosen.length} of ${SPOTLIGHT_MAX_OUTCOMES}`}>
      {signature.length === 0 ? (
        <p className="text-sm text-slate-600">Add signature outcomes to your Profile, then choose up to three to lead the page.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Pick up to three. The first figure in each is set large, with your caption under it. One without a figure is shown as a sentence.
          </p>
          <ol className="grid gap-2">
            {rows.map((text) => {
              const index = chosenTexts.indexOf(text);
              const selected = index >= 0;
              const choice = chosen[index];
              const lead = extractLeadMetric(text);
              const evidence = evidenceCount.get(text) ?? 0;
              return (
                <li key={text} className={`grid grid-cols-[18px_minmax(0,1fr)_auto] gap-2.5 rounded-lg border p-2.5 ${selected ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200'}`}>
                  <input
                    type="checkbox"
                    aria-label="Show this outcome"
                    className="mt-1 h-4 w-4 accent-brand-600"
                    checked={selected}
                    disabled={!selected && full}
                    onChange={(e) => set(e.target.checked ? [...chosen, { text }] : chosen.filter((c) => c.text !== text))}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">{text}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {lead ? (
                        <>
                          Large figure <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">{lead.parts.join(' → ')}</code>
                        </>
                      ) : (
                        <Badge variant="outline">No figure</Badge>
                      )}
                      {selected && <span>· {evidence ? `backed by ${evidence} linked ${evidence === 1 ? 'item' : 'items'}` : 'no linked work found'}</span>}
                      {!selected && full && <span>· uncheck one to swap</span>}
                    </div>
                    {selected && lead && (
                      <Input
                        aria-label="Caption under the figure"
                        className="mt-2 h-8 text-xs"
                        placeholder="Caption, e.g. ARR in 18 months"
                        maxLength={SPOTLIGHT_MAX_CAPTION}
                        value={choice.caption ?? ''}
                        onChange={(e) => set(chosen.map((c) => (c.text === text ? { ...c, caption: e.target.value || undefined } : c)))}
                      />
                    )}
                  </div>
                  {selected ? (
                    <div className="flex flex-col gap-0.5">
                      <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(text, -1)} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-35">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Move down" disabled={index === chosen.length - 1} onClick={() => move(text, 1)} className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-35">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span />
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Panel>
  );
}

const ROLE_MODE_LABEL: Record<SpotlightRoleMode, string> = { full: 'Full', condensed: 'One line', excluded: 'Hidden' };

export function ExperiencePanel({ settings, careerJourney, update }: { settings: SpotlightSettings; careerJourney: any; update: SettingsUpdate }) {
  const defaults = useMemo(() => defaultSpotlightRoleModes(careerJourney), [careerJourney]);
  const roles = rolesRecentFirst(careerJourney).filter((r: any) => r?.id);
  const setMode = (id: string, mode: SpotlightRoleMode) => {
    const next = { ...settings.roles };
    if (mode === (defaults[id] ?? 'full')) delete next[id];
    else next[id] = mode;
    update({ roles: next }, mode === 'excluded' ? 'arc' : 'experience');
  };
  return (
    <Panel title="Experience">
      <p className="text-xs text-slate-500">Each role starts from its résumé setting. Hidden roles are left out everywhere, including the timeline and evidence.</p>
      {roles.length === 0 ? (
        <p className="text-sm text-slate-600">Your Career Journey has no roles yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {roles.map((r: any) => {
            const mode = (settings.roles[r.id] as SpotlightRoleMode | undefined) ?? defaults[r.id] ?? 'full';
            const changed = settings.roles[r.id] !== undefined;
            return (
              <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">{r.title || 'Untitled role'}</div>
                  <div className="truncate text-xs text-slate-500">
                    {[r.organization || r.company, r.dates || formatRoleDates({ start: r.start_date, end: r.end_date, current: /present|current/i.test(r.end_date ?? '') })]
                      .filter(Boolean)
                      .join(' · ')}
                    {changed && ` · résumé setting is ${ROLE_MODE_LABEL[defaults[r.id] ?? 'full']}`}
                  </div>
                </div>
                <Segmented
                  label={`${r.title || 'Role'} on the page`}
                  value={mode}
                  onChange={(m) => setMode(r.id, m)}
                  options={(['full', 'condensed', 'excluded'] as const).map((value) => ({ value, label: ROLE_MODE_LABEL[value] }))}
                />
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function AchievementsPanel({
  settings,
  snapshot,
  careerJourney,
  update,
}: {
  settings: SpotlightSettings;
  snapshot: SpotlightSnapshot;
  careerJourney: any;
  update: SettingsUpdate;
}) {
  const [query, setQuery] = useState('');
  const suggested = useMemo(
    () => new Set(buildSpotlightSnapshot(careerJourney, { ...settings, pinnedAchievements: undefined }).snapshot.achievements.featuredIds),
    [careerJourney, settings],
  );
  const pinned = snapshot.achievements.featuredIds;
  const items = snapshot.achievements.items;
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((a) => `${a.title} ${a.category ?? ''}`.toLowerCase().includes(q)) : items;
  const full = pinned.length >= SPOTLIGHT_MAX_PINNED_ACHIEVEMENTS;
  const set = (next: string[]) => update({ pinnedAchievements: next }, 'achievements');

  return (
    <Panel title="Featured achievements" hint={`${pinned.length} of ${SPOTLIGHT_MAX_PINNED_ACHIEVEMENTS} pinned`} defaultOpen={false}>
      {items.length === 0 ? (
        <p className="text-sm text-slate-600">No achievements to feature. Achievements from hidden roles aren't listed.</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            Pin up to {SPOTLIGHT_MAX_PINNED_ACHIEVEMENTS}. Suggested ones have a figure and come from your most recent roles.
            {settings.pinnedAchievements && (
              <>
                {' '}
                <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => update({ pinnedAchievements: undefined }, 'achievements')}>
                  Use the suggestions
                </button>
              </>
            )}
          </p>
          {items.length > 10 && <SearchInput value={query} onValueChange={setQuery} placeholder="Search achievements" aria-label="Search achievements" />}
          <div className="-mx-1 grid max-h-80 gap-0.5 overflow-y-auto px-1">
            {shown.map((a) => {
              const on = pinned.includes(a.id);
              return (
                <label key={a.id} className={`grid grid-cols-[18px_minmax(0,1fr)] items-start gap-2.5 rounded-lg px-2 py-2 ${!on && full ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-brand-600"
                    checked={on}
                    disabled={!on && full}
                    onChange={(e) => set(e.target.checked ? [...pinned, a.id] : pinned.filter((id) => id !== a.id))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">{a.title}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {a.category}
                      {suggested.has(a.id) && <Badge variant="success">Suggested</Badge>}
                    </span>
                  </span>
                </label>
              );
            })}
            {shown.length === 0 && <p className="px-2 py-2 text-sm text-slate-500">No achievements match "{query}".</p>}
          </div>
        </>
      )}
    </Panel>
  );
}

const SECTION_TOGGLES: { key: keyof SpotlightSettings['sections']; label: string; help: string; region: SpotlightRegion }[] = [
  { key: 'arc', label: 'Career arc', help: 'A timeline of your roles.', region: 'arc' },
  { key: 'achievements', label: 'Selected achievements', help: 'The cards you pin above.', region: 'achievements' },
  { key: 'capabilities', label: 'Capabilities', help: 'Counted by delivered work.', region: 'capabilities' },
  { key: 'skills', label: 'Skills', help: 'Years of use and when last used.', region: 'skills' },
  { key: 'howIWork', label: 'How I work', help: 'Your methods and principles.', region: 'how' },
  { key: 'background', label: 'Background', help: 'Education, certifications and client work you marked for display.', region: 'background' },
];

export function SectionsPanel({ settings, update }: { settings: SpotlightSettings; update: SettingsUpdate }) {
  return (
    <Panel title="Sections" defaultOpen={false}>
      {SECTION_TOGGLES.map((t) => (
        <Toggle
          key={t.key}
          label={t.label}
          help={t.help}
          checked={settings.sections[t.key]}
          onChange={(on) => update({ sections: { ...settings.sections, [t.key]: on } }, on ? t.region : 'experience')}
        />
      ))}
      <div className="border-t border-slate-100 pt-4">
        <Toggle
          label="Show your self-rated levels"
          help='Words like "Advanced" next to capabilities and skills. Hiring managers tend to trust the evidence counts more.'
          checked={settings.showLevels}
          onChange={(showLevels) => update({ showLevels }, settings.sections.capabilities ? 'capabilities' : 'skills')}
        />
      </div>
    </Panel>
  );
}

export function ContactPanel({ settings, careerJourney, update }: { settings: SpotlightSettings; careerJourney: any; update: SettingsUpdate }) {
  const person = careerJourney?.person ?? {};
  const has = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  const channels: { key: keyof SpotlightSettings['contact']; label: string; help: string; defaultOn: boolean }[] = [
    { key: 'linkedin', label: 'LinkedIn', help: 'Also the second button at the top of the page.', defaultOn: true },
    { key: 'email', label: 'Email', help: 'Hidden until a visitor asks to see it.', defaultOn: false },
    { key: 'github', label: 'GitHub', help: '', defaultOn: true },
    { key: 'website', label: 'Website', help: '', defaultOn: true },
    { key: 'phone', label: 'Phone', help: 'Not recommended on a page anyone with the link can open.', defaultOn: false },
  ];
  return (
    <Panel title="Contact" defaultOpen={false}>
      {channels.map((c) => {
        const present = has(person[c.key]);
        return (
          <Toggle
            key={c.key}
            label={c.label}
            help={present ? c.help || person[c.key] : 'Not in your Profile.'}
            checked={present && (settings.contact[c.key] ?? c.defaultOn)}
            disabled={!present}
            onChange={(on) => update({ contact: { ...settings.contact, [c.key]: on } }, 'contact')}
          />
        );
      })}
      {settings.contact.phone && has(person.phone) && <Warn>Your phone number will be visible to anyone who has the link.</Warn>}
    </Panel>
  );
}

export function StylePanel({ settings, update, canHideBadge }: { settings: SpotlightSettings; update: SettingsUpdate; canHideBadge: boolean }) {
  return (
    <Panel title="Style" defaultOpen={false}>
      <div>
        <Label>Accent colour</Label>
        <div className="flex flex-wrap gap-2.5" role="group" aria-label="Accent colour">
          {SPOTLIGHT_ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              title={SPOTLIGHT_ACCENT_COLORS[a].name}
              aria-label={SPOTLIGHT_ACCENT_COLORS[a].name}
              aria-pressed={settings.accent === a}
              onClick={() => update({ accent: a }, 'hero')}
              className={`h-8 w-8 rounded-full border-2 border-white ring-1 ${settings.accent === a ? 'ring-2 ring-slate-900' : 'ring-slate-200'}`}
              style={{ background: SPOTLIGHT_ACCENT_COLORS[a].light }}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">Each one stays readable in light and dark mode.</p>
      </div>
      <Toggle
        label='"Made with Career Journey" in the footer'
        help={canHideBadge ? undefined : 'Included on the Free plan. Upgrade to remove it.'}
        checked={canHideBadge ? settings.showBadge : true}
        disabled={!canHideBadge}
        onChange={(showBadge) => update({ showBadge }, 'contact')}
      />
    </Panel>
  );
}

const SLUG_PROBLEM: Record<string, string> = {
  too_short: 'Use at least 3 characters.',
  too_long: 'Use 40 characters or fewer.',
  invalid_characters: 'Use lowercase letters, numbers and single hyphens.',
  reserved: 'That address is reserved. Choose another.',
  taken: 'Someone else has that address. Choose another.',
};

export function PublishingPanel({
  settings,
  slug,
  published,
  update,
  onUnpublish,
}: {
  settings: SpotlightSettings;
  /** The address the next publish will use: the setting, or one suggested from the name. */
  slug: string;
  published: PublishedSpotlightSummary | null;
  update: SettingsUpdate;
  onUnpublish: () => Promise<void>;
}) {
  const [availability, setAvailability] = useState<{ slug: string; problem: string | null } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = spotlightUrl(published?.slug ?? slug);

  // Check the address as it's typed: shape locally, then "taken" with the server.
  useEffect(() => {
    const local = validateSpotlightSlug(slug);
    if (local.ok === false) {
      setAvailability({ slug, problem: SLUG_PROBLEM[local.reason] });
      return;
    }
    if (slug === published?.slug) {
      setAvailability({ slug, problem: null });
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      checkSpotlightSlug(slug)
        .then((r) => !cancelled && setAvailability({ slug, problem: r.ok === false ? SLUG_PROBLEM[r.reason] : null }))
        .catch(() => !cancelled && setAvailability(null));
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [slug, published?.slug]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the address is on screen and selectable.
    }
  };

  const status = availability?.slug === slug ? availability : null;
  return (
    <Panel title="Publishing" hint="link and who can find it">
      <div>
        <Label htmlFor="sp-slug">Page address</Label>
        <div className="flex h-10 items-center overflow-hidden rounded-lg border border-slate-200 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
          <span className="whitespace-nowrap pl-3 pr-0.5 font-mono text-xs text-slate-400">{window.location.host}/s/</span>
          <input
            id="sp-slug"
            className="h-full min-w-0 flex-1 bg-transparent pr-3 font-mono text-[13px] outline-none"
            value={slug}
            spellCheck={false}
            autoComplete="off"
            maxLength={40}
            aria-describedby="sp-slug-state"
            onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
          />
        </div>
        <p id="sp-slug-state" className={`mt-1.5 flex items-center gap-1.5 text-xs ${status?.problem ? 'text-red-600' : 'text-emerald-700'}`}>
          {status &&
            (status.problem ? (
              <>
                <AlertCircle className="h-3.5 w-3.5" /> {status.problem}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {published && slug !== published.slug ? 'Available. The old link stops working when you publish.' : published ? 'Your current address' : 'Available'}
              </>
            ))}
        </p>
        {published && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{url}</code>
            <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        )}
      </div>
      <fieldset>
        <legend className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Who can find it</legend>
        <div className="grid gap-2">
          {(
            [
              { value: 'unlisted', title: 'Anyone with the link', body: 'Search engines are asked not to list it. Recommended.' },
              { value: 'public', title: 'Public', body: 'Can appear in search results for your name.' },
            ] as const
          ).map((o) => (
            <label key={o.value} className={`grid cursor-pointer grid-cols-[18px_minmax(0,1fr)] gap-2.5 rounded-lg border p-3 ${settings.visibility === o.value ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
              <input type="radio" name="sp-visibility" className="mt-0.5 accent-brand-600" checked={settings.visibility === o.value} onChange={() => update({ visibility: o.value })} />
              <span>
                <span className="block text-sm font-semibold text-slate-800">{o.title}</span>
                <span className="block text-xs text-slate-500">{o.body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {published &&
        (confirming ? (
          <div className="grid gap-2">
            <Warn>The link stops working for everyone who has it. Your settings are kept, so you can publish again later.</Warn>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onUnpublish();
                    setConfirming(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Unpublish
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
                Keep it live
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => setConfirming(true)}>
              Unpublish page
            </Button>
          </div>
        ))}
    </Panel>
  );
}
