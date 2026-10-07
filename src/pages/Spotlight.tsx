import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, Maximize2, Printer, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { auth } from '../lib/firebase';
import { useLocalPreference } from '../hooks/useLocalPreference';
import { buildSpotlightSnapshot, normalizeSpotlightSettings } from '../lib/spotlightSnapshot';
import { Badge, Button, Card } from '../components/ui';
import SpotlightPage from '../components/spotlight/SpotlightPage';
import {
  AchievementsPanel,
  BuildWarnings,
  ContactPanel,
  ExperiencePanel,
  IntroductionPanel,
  OutcomesPanel,
  SectionsPanel,
  SettingsUpdate,
  SpotlightRegion,
  StylePanel,
  VisitorsCanSee,
} from '../components/spotlight/SpotlightSettingsPanels';

type Device = 'desktop' | 'phone' | 'print';
type Theme = 'light' | 'dark';

const FRAME: Record<Device, string> = {
  desktop: 'rounded-lg',
  phone: 'max-w-[390px] rounded-[28px] border-8 border-slate-900',
  print: 'max-w-[760px] rounded-sm',
};

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-lg bg-white p-[3px] ring-1 ring-slate-200">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${o.value === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The Career Spotlight editor: choose what the hiring page shows, and see it as a hiring
 * manager would. Settings are per browser for now (Phase 1 of career-spotlight-plan.md);
 * publishing a shareable link comes with Phase 2, which moves them to the account.
 */
export default function Spotlight() {
  const { careerJourney } = useStore();
  const [stored, setStored] = useLocalPreference<unknown>(`spotlight.settings.${auth?.currentUser?.uid ?? 'local'}`, {});
  const settings = useMemo(() => normalizeSpotlightSettings(stored, careerJourney), [stored, careerJourney]);
  const { snapshot, warnings } = useMemo(() => buildSpotlightSnapshot(careerJourney, settings), [careerJourney, settings]);

  const [device, setDevice] = useLocalPreference<Device>('spotlight.preview.device', 'desktop');
  const [theme, setTheme] = useLocalPreference<Theme>('spotlight.preview.theme', 'light');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [fullPreview, setFullPreview] = useState<null | 'screen' | 'print'>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const pendingReveal = useRef<SpotlightRegion | null>(null);

  const update: SettingsUpdate = useCallback(
    (patch, region) => {
      pendingReveal.current = region ?? null;
      setStored({ ...settings, ...patch });
    },
    [settings, setStored],
  );

  // After a change, scroll the preview to the part it affects and outline it briefly.
  useEffect(() => {
    const region = pendingReveal.current;
    pendingReveal.current = null;
    const box = stage.current;
    if (!region || !box || box.offsetParent === null) return;
    const el = box.querySelector<HTMLElement>(`[data-region="${region}"]`);
    if (!el) return;
    const navOffset = region === 'hero' ? 0 : 64;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - navOffset;
    box.scrollTo({ top, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.add('sp-reveal');
    window.setTimeout(() => el.classList.remove('sp-reveal'), 900);
  }, [snapshot]);

  const hasJourney = !!(careerJourney?.person?.name || careerJourney?.roles?.length);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500">Journey / Spotlight</div>
            <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-extrabold tracking-tight text-slate-900">
              Spotlight <Badge variant="outline">Only you can see this</Badge>
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              The page you'll send to people who might hire you. Choose what it shows and see it the way they will. Sharing it as a link comes
              next; for now you can preview it and save it as a PDF.
            </p>
          </div>
          {hasJourney && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setFullPreview('screen')}>
                <Maximize2 className="mr-2 h-4 w-4" /> Full preview
              </Button>
              <Button onClick={() => setFullPreview('print')}>
                <Printer className="mr-2 h-4 w-4" /> Print or save as PDF
              </Button>
            </div>
          )}
        </div>

        {!hasJourney ? (
          <Card className="mt-6 max-w-2xl p-6 sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-xl font-extrabold text-slate-900">Your Spotlight is built from your Career Journey</h2>
            <p className="mt-1 text-sm text-slate-600">Add your roles and what you delivered in them first. The Spotlight turns that into a page for hiring managers.</p>
            <Link to="/build" className="mt-5 inline-flex">
              <Button>Build your Career Journey</Button>
            </Link>
          </Card>
        ) : (
          <>
            <div className="mt-5 lg:hidden">
              <div role="group" aria-label="Show" className="flex rounded-lg bg-slate-200 p-[3px]">
                {(['edit', 'preview'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={`flex-1 rounded-md py-2 text-sm font-semibold ${view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                  >
                    {v === 'edit' ? 'Edit' : 'Preview'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
              <div className={`${view === 'preview' ? 'hidden lg:grid' : 'grid'} gap-3.5`}>
                <BuildWarnings warnings={warnings} />
                <VisitorsCanSee settings={settings} snapshot={snapshot} careerJourney={careerJourney} />
                <IntroductionPanel settings={settings} careerJourney={careerJourney} update={update} />
                <OutcomesPanel settings={settings} snapshot={snapshot} careerJourney={careerJourney} update={update} />
                <ExperiencePanel settings={settings} careerJourney={careerJourney} update={update} />
                <AchievementsPanel settings={settings} snapshot={snapshot} careerJourney={careerJourney} update={update} />
                <SectionsPanel settings={settings} update={update} />
                <ContactPanel settings={settings} careerJourney={careerJourney} update={update} />
                <StylePanel settings={settings} update={update} />
              </div>

              <div className={`${view === 'edit' ? 'hidden lg:block' : 'block'} lg:sticky lg:top-20`}>
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Eye className="h-3.5 w-3.5" /> What a hiring manager sees
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Choice
                      label="Device"
                      value={device}
                      onChange={setDevice}
                      options={[
                        { value: 'desktop', label: 'Desktop' },
                        { value: 'phone', label: 'Phone' },
                        { value: 'print', label: 'Print' },
                      ]}
                    />
                    {device !== 'print' && (
                      <Choice
                        label="Viewer theme"
                        value={theme}
                        onChange={setTheme}
                        options={[
                          { value: 'light', label: 'Light' },
                          { value: 'dark', label: 'Dark' },
                        ]}
                      />
                    )}
                  </div>
                </div>
                <div ref={stage} className="h-[calc(100vh-10rem)] min-h-[480px] overflow-y-auto rounded-2xl bg-slate-200 p-2.5 sm:p-4">
                  {device === 'print' && <p className="mb-2.5 text-center text-xs text-slate-500">How the page looks printed or saved as a PDF.</p>}
                  <div className={`mx-auto overflow-clip shadow-xl ${FRAME[device]}`}>
                    <SpotlightPage snapshot={snapshot} mode={device === 'print' ? 'light' : theme} variant={device === 'print' ? 'print' : 'screen'} />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {fullPreview && <FullPreview snapshot={snapshot} theme={theme} variant={fullPreview} onClose={() => setFullPreview(null)} />}
    </div>
  );
}

/** The page on its own, edge to edge, as a visitor would see it. Prints without the app around it. */
function FullPreview({
  snapshot,
  theme,
  variant,
  onClose,
}: {
  snapshot: ReturnType<typeof buildSpotlightSnapshot>['snapshot'];
  theme: Theme;
  variant: 'screen' | 'print';
  onClose: () => void;
}) {
  const back = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const overflow = document.body.style.overflow;
    root.classList.add('sp-printing');
    document.body.style.overflow = 'hidden';
    back.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // The evidence drawer handles its own Escape; only close when it isn't open.
      if (e.key === 'Escape' && !document.querySelector('.sp-drawer')) onClose();
    };
    document.addEventListener('keydown', onKey);
    let printTimer: number | undefined;
    if (variant === 'print') printTimer = window.setTimeout(() => window.print(), 300);
    return () => {
      root.classList.remove('sp-printing');
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(printTimer);
    };
  }, [onClose, variant]);

  return createPortal(
    <div className="sp-print-root fixed inset-0 z-[60] overflow-y-auto bg-white" role="dialog" aria-modal="true" aria-label="Full preview of your Spotlight">
      <SpotlightPage snapshot={snapshot} mode={variant === 'print' ? 'light' : theme} variant={variant} />
      <div className="sp-print-toolbar fixed bottom-4 left-4 z-[65] flex items-center gap-2 rounded-full bg-slate-900 p-1.5 pl-2 text-white shadow-2xl">
        <button ref={back} type="button" onClick={onClose} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" /> Back to editor
        </button>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25">
          <Printer className="h-4 w-4" /> Print or save as PDF
        </button>
      </div>
    </div>,
    document.body,
  );
}
