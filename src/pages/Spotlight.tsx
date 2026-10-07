import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ExternalLink, Eye, Maximize2, Printer, Sparkles } from 'lucide-react';
import { useStore } from '../store';
import { isFirebaseConfigured } from '../lib/firebase';
import { useLocalPreference } from '../hooks/useLocalPreference';
import {
  buildSpotlightSnapshot,
  diffSpotlightSnapshots,
  normalizeSpotlightSettings,
  suggestSpotlightSlug,
  summarizeSpotlightChanges,
  validateSpotlightSlug,
} from '../lib/spotlightSnapshot';
import { publishSpotlight, SpotlightApiError, spotlightUrl, unpublishSpotlight } from '../lib/spotlightClient';
import { Badge, Button, Card, useToast } from '../components/ui';
import SpotlightPage from '../components/spotlight/SpotlightPage';
import { useSpotlightState } from '../components/spotlight/useSpotlightState';
import {
  AchievementsPanel,
  BuildWarnings,
  ContactPanel,
  ExperiencePanel,
  IntroductionPanel,
  OutcomesPanel,
  PublishingPanel,
  SectionsPanel,
  SettingsUpdate,
  SpotlightRegion,
  StylePanel,
  TemplatePanel,
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

const STATUS_STYLE = {
  live: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-amber-100 text-amber-800',
  off: 'bg-slate-200 text-slate-600',
};

function StatusPill({ tone, children }: { tone: keyof typeof STATUS_STYLE; children: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** Why publishing isn't available, in words the owner can act on. */
function blockedMessage(e: SpotlightApiError): { text: string; upgrade?: boolean } {
  if (e.status === 403) return { text: 'Publishing a Spotlight isn’t part of your plan. You can still preview it and save it as a PDF.', upgrade: true };
  if (e.status === 503) return { text: 'Publishing is paused for maintenance. Your settings are kept in this browser until it’s back.' };
  if (e.status === 501) return { text: 'Publishing needs an account. This copy of Career Journey runs without one, so you can preview and print only.' };
  return { text: 'Couldn’t reach the server, so publishing is unavailable for now. You can still preview and print.' };
}

const formatDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The Career Spotlight editor: choose what the hiring page shows, see it as a hiring manager
 * would, and publish it as a link (career-spotlight-plan.md). With an account the settings
 * live on the server; in local mode they stay in this browser and the page can only be
 * previewed and printed.
 */
export default function Spotlight() {
  const { careerJourney, billing, isAdmin } = useStore();
  const toast = useToast();
  const { loading, stored, setStored, remote, blocked, published, setPublished, views, save, cancelPendingSave } = useSpotlightState();
  // Free plans keep the footer mark; the server enforces this on publish, the editor mirrors it so the preview is honest.
  const canHideBadge = isAdmin || !billing || billing.comped === true || billing.plan !== 'free';
  const settings = useMemo(() => {
    const s = normalizeSpotlightSettings(stored, careerJourney);
    return canHideBadge ? s : { ...s, showBadge: true };
  }, [stored, careerJourney, canHideBadge]);
  const { snapshot, warnings } = useMemo(() => buildSpotlightSnapshot(careerJourney, settings), [careerJourney, settings]);
  const slug = settings.slug ?? suggestSpotlightSlug(careerJourney?.person?.name);

  const [device, setDevice] = useLocalPreference<Device>('spotlight.preview.device', 'desktop');
  const [theme, setTheme] = useLocalPreference<Theme>('spotlight.preview.theme', 'light');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [fullPreview, setFullPreview] = useState<null | 'screen' | 'print'>(null);
  const [publishing, setPublishing] = useState(false);
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

  // What the published page would gain from a publish now.
  const changes = useMemo(() => (published ? diffSpotlightSnapshots(published.snapshot, snapshot) : []), [published, snapshot]);
  const moved = !!published && slug !== published.slug;
  const dirty = !published || changes.length > 0 || moved;
  const changeSummary = [moved ? 'a new page address' : '', summarizeSpotlightChanges(changes)].filter(Boolean).join(' and ');
  const canPublish = remote && !blocked && validateSpotlightSlug(slug).ok && dirty && !publishing;

  const publish = async () => {
    setPublishing(true);
    cancelPendingSave();
    try {
      const { published: next } = await publishSpotlight({ ...settings, slug });
      setPublished(next);
      setStored({ ...settings, slug: next.slug });
      toast.success(`Published at ${spotlightUrl(next.slug)}`);
    } catch (e: any) {
      toast.error(e?.message || 'Couldn’t publish. Try again.');
    } finally {
      setPublishing(false);
    }
  };

  const unpublish = async () => {
    try {
      await unpublishSpotlight();
      setPublished(null);
      toast.success('Unpublished. The link no longer works.');
    } catch (e: any) {
      toast.error(e?.message || 'Couldn’t unpublish. Try again.');
    }
  };

  const hasJourney = !!(careerJourney?.person?.name || careerJourney?.roles?.length);
  const blockedInfo = blocked ? blockedMessage(blocked) : null;

  let status: { tone: keyof typeof STATUS_STYLE; text: string } | null = null;
  if (remote) {
    if (!published) status = { tone: 'off', text: 'Not published' };
    else if (dirty) status = { tone: 'pending', text: 'Unpublished changes' };
    else status = { tone: 'live', text: `Live · ${published.visibility === 'public' ? 'Public' : 'Unlisted'}` };
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <div className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500">Journey / Spotlight</div>
            <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-extrabold tracking-tight text-slate-900">
              Spotlight
              {status ? <StatusPill tone={status.tone}>{status.text}</StatusPill> : !loading && <Badge variant="outline">Only you can see this</Badge>}
              {remote && save === 'saving' && <span className="text-xs font-normal text-slate-400">Saving…</span>}
              {remote && save === 'error' && <span className="text-xs font-normal text-red-600">Settings not saved. Check your connection.</span>}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              The page you send to people who might hire you. Choose what it shows and see it the way they will
              {remote ? '. Nothing changes on the public page until you publish.' : '.'}
            </p>
          </div>
          {hasJourney && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setFullPreview('screen')}>
                <Maximize2 className="mr-2 h-4 w-4" /> Full preview
              </Button>
              <Button variant={remote && !blocked ? 'outline' : 'default'} onClick={() => setFullPreview('print')}>
                <Printer className="mr-2 h-4 w-4" /> Print or save as PDF
              </Button>
              {published && (
                <a href={`${spotlightUrl(published.slug)}?from=editor`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">
                    <ExternalLink className="mr-2 h-4 w-4" /> Open public page
                  </Button>
                </a>
              )}
              {remote && !blocked && (
                <Button onClick={publish} disabled={!canPublish}>
                  {publishing ? 'Publishing…' : !published ? 'Publish' : dirty ? 'Publish changes' : 'Published'}
                </Button>
              )}
            </div>
          )}
        </div>

        {hasJourney && published && dirty && changeSummary && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1">
              <span className="font-semibold">Not on your public page yet:</span> {changeSummary}. Published {formatDay(published.updatedAt)}.
            </p>
            <Button size="sm" variant="outline" onClick={publish} disabled={!canPublish}>
              Publish changes
            </Button>
          </div>
        )}
        {hasJourney && blockedInfo && isFirebaseConfigured && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <AlertCircle className="h-4 w-4 shrink-0 text-slate-400" />
            <p className="min-w-0 flex-1">{blockedInfo.text}</p>
            {blockedInfo.upgrade && (
              <Link to="/upgrade">
                <Button size="sm">See plans</Button>
              </Link>
            )}
          </div>
        )}

        {loading ? (
          <p className="mt-8 text-sm text-slate-500" role="status">
            Loading your Spotlight…
          </p>
        ) : !hasJourney ? (
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
                {remote && !blocked && <PublishingPanel settings={settings} slug={slug} published={published} views={views} update={update} onUnpublish={unpublish} />}
                <VisitorsCanSee settings={settings} snapshot={snapshot} careerJourney={careerJourney} publishing={remote && !blocked} />
                <TemplatePanel settings={settings} snapshot={snapshot} update={update} />
                <IntroductionPanel settings={settings} careerJourney={careerJourney} update={update} />
                <OutcomesPanel settings={settings} snapshot={snapshot} careerJourney={careerJourney} update={update} />
                <ExperiencePanel settings={settings} careerJourney={careerJourney} update={update} />
                <AchievementsPanel settings={settings} snapshot={snapshot} careerJourney={careerJourney} update={update} />
                <SectionsPanel settings={settings} update={update} />
                <ContactPanel settings={settings} careerJourney={careerJourney} update={update} />
                <StylePanel settings={settings} update={update} canHideBadge={canHideBadge} />
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
