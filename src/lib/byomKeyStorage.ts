import { AIProviderId } from '../types/billing';

/**
 * BYOM API keys are deliberately never sent to Firestore or any server-side
 * store — see payment-system-plan.md's Phase 4 key-handling decision. This
 * is the only place the raw key value lives: the browser's localStorage,
 * scoped to this device. It's attached to AI requests via headers (see
 * aiClient.ts's authHeaders/byomHeaders) and read into server memory for the
 * duration of a single request only.
 */
const STORAGE_KEY = 'career-journey:byomKey';

export interface StoredByomKey {
  provider: AIProviderId;
  apiKey: string;
  model: string;
}

export function getStoredByomKey(): StoredByomKey | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredByomKey;
  } catch {
    return null;
  }
}

export function setStoredByomKey(value: StoredByomKey): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function clearStoredByomKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Client-side only — the server never sees the raw key, so it can't mask it for us. */
export function maskKey(apiKey: string): string {
  if (apiKey.length <= 8) return '••••';
  return `${apiKey.slice(0, 4)}···${apiKey.slice(-4)}`;
}
