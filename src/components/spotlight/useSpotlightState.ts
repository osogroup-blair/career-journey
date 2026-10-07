import { useCallback, useEffect, useRef, useState } from 'react';
import { auth, isFirebaseConfigured } from '../../lib/firebase';
import { useLocalPreference } from '../../hooks/useLocalPreference';
import { getSpotlight, PublishedSpotlightSummary, saveSpotlightSettings, SpotlightApiError, SpotlightViews } from '../../lib/spotlightClient';
import type { SpotlightSettings } from '../../types/spotlight';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_DELAY_MS = 800;
const hasKeys = (v: unknown) => !!v && typeof v === 'object' && Object.keys(v as object).length > 0;

/**
 * Where the Spotlight settings live. With an account they're loaded from and saved to the
 * server (debounced), and the per-browser settings from before publishing existed are
 * carried over once. Without one (local mode), or when the server says publishing isn't
 * available (`blocked`), they stay in this browser and the editor still previews and prints.
 */
export function useSpotlightState() {
  const [local, setLocal] = useLocalPreference<unknown>(`spotlight.settings.${auth?.currentUser?.uid ?? 'local'}`, {});
  const [stored, setStoredState] = useState<unknown>(isFirebaseConfigured ? null : local);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [remote, setRemote] = useState(false);
  const [blocked, setBlocked] = useState<SpotlightApiError | null>(null);
  const [published, setPublished] = useState<PublishedSpotlightSummary | null>(null);
  const [views, setViews] = useState<SpotlightViews | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<SpotlightSettings | null>(null);

  const saveNow = useCallback(async (settings: SpotlightSettings) => {
    window.clearTimeout(timer.current);
    pending.current = null;
    setSave('saving');
    try {
      await saveSpotlightSettings(settings);
      setSave('saved');
    } catch {
      setSave('error');
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let cancelled = false;
    getSpotlight()
      .then((r) => {
        if (cancelled) return;
        setRemote(true);
        setPublished(r.published);
        setViews(r.views ?? null);
        if (r.settings) setStoredState(r.settings);
        else {
          setStoredState(local);
          if (hasKeys(local)) saveNow(local as SpotlightSettings);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setBlocked(e instanceof SpotlightApiError ? e : new SpotlightApiError(String(e?.message ?? e), 0));
        setStoredState(local);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // Load once per mount; `local` is only the migration source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Don't lose a pending save when the editor closes.
  useEffect(
    () => () => {
      if (pending.current) saveSpotlightSettings(pending.current).catch(() => {});
      window.clearTimeout(timer.current);
    },
    [],
  );

  const setStored = useCallback(
    (settings: SpotlightSettings) => {
      setStoredState(settings);
      if (!remote) {
        setLocal(settings);
        return;
      }
      pending.current = settings;
      setSave('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => pending.current && saveNow(pending.current), SAVE_DELAY_MS);
    },
    [remote, setLocal, saveNow],
  );

  /** Publishing saves the settings itself, so a queued save is dropped rather than racing it. */
  const cancelPendingSave = useCallback(() => {
    window.clearTimeout(timer.current);
    pending.current = null;
    setSave('saved');
  }, []);

  return { loading, stored, setStored, remote, blocked, published, setPublished, views, save, cancelPendingSave };
}
