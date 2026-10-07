import { authHeaders } from './aiClient';
import type { SpotlightSettings, SpotlightSnapshot } from '../types/spotlight';

/** Carries the HTTP status and the server's error code, so the editor can tell "taken" (409), "not on your plan" (403), "paused" (503) and "no account" (501) apart. */
export class SpotlightApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export interface PublishedSpotlightSummary {
  slug: string;
  visibility: 'unlisted' | 'public';
  publishedAt: string;
  updatedAt: string;
  snapshot: SpotlightSnapshot;
}

export type SlugAvailability = { ok: true; slug: string } | { ok: false; reason: 'too_short' | 'too_long' | 'invalid_characters' | 'reserved' | 'taken' };

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error body
  }
  if (!res.ok) throw new SpotlightApiError(parsed?.error || text || `Request failed (${res.status})`, res.status, parsed?.code);
  return parsed as T;
}

export function getSpotlight(): Promise<{ settings: SpotlightSettings | null; published: PublishedSpotlightSummary | null }> {
  return call('GET', '/api/spotlight');
}

export function saveSpotlightSettings(settings: SpotlightSettings): Promise<{ settings: SpotlightSettings }> {
  return call('PUT', '/api/spotlight/settings', { settings });
}

export function checkSpotlightSlug(slug: string): Promise<SlugAvailability> {
  return call('GET', `/api/spotlight/slug/${encodeURIComponent(slug)}`);
}

export function publishSpotlight(settings: SpotlightSettings): Promise<{ published: PublishedSpotlightSummary }> {
  return call('POST', '/api/spotlight/publish', { settings });
}

export function unpublishSpotlight(): Promise<{ ok: true }> {
  return call('DELETE', '/api/spotlight/publish');
}

/** The public address of a published page on this deployment. */
export function spotlightUrl(slug: string): string {
  return `${window.location.origin}/s/${slug}`;
}
