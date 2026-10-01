import { authHeaders } from './aiClient';

/**
 * POSTs to an /api/export/* endpoint (which sits behind requireFirebaseAuth, so
 * the bearer token is required) and saves the response as a file download.
 * Throws an Error with the server's message on failure so callers can toast it.
 */
export async function downloadExport(path: string, body: unknown, filename: string): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body — keep the status message */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
