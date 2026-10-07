import { useCallback, useState } from 'react';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * A per-browser UI preference (a collapsed section, a minimised banner) that
 * survives reloads. Storage can be unavailable (private mode, blocked site
 * data), so every read/write is best-effort and the fallback always works.
 */
export function useLocalPreference<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not persisted — still applies for this session.
      }
    },
    [key]
  );

  return [value, update];
}
