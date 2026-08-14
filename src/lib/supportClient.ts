import { authHeaders } from './aiClient';
import { Ticket, TicketMessage, TicketType, TicketContext } from '../types/support';
import { ref, uploadBytes } from 'firebase/storage';
import { storage, auth } from './firebase';

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    return parsed?.error || text;
  } catch {
    return text;
  }
}

async function supportGet(path: string): Promise<any> {
  const res = await fetch(path, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

async function supportPost(path: string, body: any): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

/** Captures the context every ticket is submitted with — route is passed in since only the caller (in a Router) knows it. */
export function captureTicketContext(route: string): Omit<TicketContext, 'timestamp'> {
  return {
    route,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    appVersion: import.meta.env.VITE_APP_VERSION || 'unknown',
  };
}

/**
 * Base64-encodes a captured screenshot for the ticket-creation body — sent to the server, which
 * uploads it via the Admin SDK (server/support.ts). Not a direct client-to-Storage upload: see
 * the screenshotBase64 doc comment in server/support.ts's createTicket for why.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]); // strip the "data:image/png;base64," prefix
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function uploadTicketScreenshot(blob: Blob): Promise<string> {
  if (!storage || !auth || !auth.currentUser) {
    throw new Error('Firebase Auth/Storage not configured or user not logged in');
  }
  const uid = auth.currentUser.uid;
  const randomId = Math.random().toString(36).slice(2);
  const path = `ticketScreenshots/${uid}/${randomId}.png`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return path;
}

export const createTicket = (input: {
  type: TicketType;
  title: string;
  description: string;
  context: Omit<TicketContext, 'timestamp'>;
  screenshotPath?: string;
}): Promise<Ticket> => supportPost('/api/support/tickets', input);

export const listMyTickets = (): Promise<Ticket[]> => supportGet('/api/support/tickets');

export const getMyTicket = (id: string): Promise<{ ticket: Ticket; messages: TicketMessage[] }> =>
  supportGet(`/api/support/tickets/${id}/messages`);

export const addMyTicketMessage = (id: string, body: string): Promise<TicketMessage> =>
  supportPost(`/api/support/tickets/${id}/messages`, { body });

export const getMyTicketScreenshotUrl = async (id: string): Promise<string | null> => {
  try {
    const res = await supportGet(`/api/support/tickets/${id}/screenshot`);
    return res.url;
  } catch (e: any) {
    if (e.message.includes("No screenshot")) return null;
    throw e;
  }
};
