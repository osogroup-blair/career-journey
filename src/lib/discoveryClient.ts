import { authHeaders, byomHeaders } from './aiClient';
import type {
  DiscoveredJob,
  DiscoveredJobDetail,
  DiscoveredJobState,
  DiscoveryProfile,
  DiscoveryProfileUpdate,
  DiscoverySearchProfile,
} from '../types/discovery';

/** Carries the HTTP status so the Discover page can tell "not allowed" (403) and "needs Firebase" (501) apart from failures. */
export class DiscoveryApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()), ...extraHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error body
  }
  if (!res.ok) throw new DiscoveryApiError(parsed?.error || text || `Request failed (${res.status})`, res.status);
  return parsed as T;
}

export function getDiscoveryProfile(): Promise<{ profile: DiscoveryProfile; licensed: boolean }> {
  return call('GET', '/api/discovery/profile');
}

export function saveDiscoveryProfile(update: DiscoveryProfileUpdate): Promise<{ profile: DiscoveryProfile }> {
  return call('PUT', '/api/discovery/profile', update);
}

export function startDiscoveryRun(): Promise<{ started: boolean }> {
  return call('POST', '/api/discovery/run', {});
}

export function listDiscoveredJobs(): Promise<{ jobs: DiscoveredJob[] }> {
  return call('GET', '/api/discovery/jobs');
}

export function getDiscoveredJobDetail(id: string): Promise<DiscoveredJobDetail> {
  return call('GET', `/api/discovery/jobs/${encodeURIComponent(id)}/detail`);
}

export function updateDiscoveredJob(id: string, patch: { userState?: DiscoveredJobState; matchId?: string }): Promise<DiscoveredJob> {
  return call('PATCH', `/api/discovery/jobs/${encodeURIComponent(id)}`, patch);
}

/** An /api/ai route, so it carries the BYOM headers like every other AI call (see aiClient.ts). */
export function generateSearchProfile(cvText: string): Promise<{ searchProfile: DiscoverySearchProfile; rationale: string; dropped: string[] }> {
  return call('POST', '/api/ai/discoverySearchProfile', { cvText }, byomHeaders());
}
