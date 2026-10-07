import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SpotlightSnapshot } from '../types/spotlight';
import { evidenceTargetFromId } from '../lib/spotlightView';
import SpotlightPage from '../components/spotlight/SpotlightPage';
import SpotlightCard from '../components/spotlight/SpotlightCard';

/**
 * Entry for the public Career Spotlight page (spotlight.html, served at /s/:slug).
 * Deliberately free of the app: no auth, store or Firebase SDK. The server inlines the
 * snapshot; the API fetch is only a fallback if that script is missing.
 */

function readInline(): SpotlightSnapshot | null | undefined {
  const el = document.getElementById('spotlight-data');
  if (!el) return undefined;
  try {
    return JSON.parse(el.textContent || 'null');
  } catch {
    return undefined;
  }
}

function NotFound() {
  return (
    <div className="sp" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div className="sp-wrap" style={{ maxWidth: 560, textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.4rem', lineHeight: 1.1 }}>This page isn't available</h1>
        <p style={{ marginTop: 14, color: 'var(--sp-ink-2)' }}>The link may be mistyped, or its owner has taken the page down.</p>
      </div>
    </div>
  );
}

function Spotlight() {
  const [snapshot, setSnapshot] = useState<SpotlightSnapshot | null | undefined>(readInline);

  useEffect(() => {
    if (snapshot !== undefined) return;
    const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] ?? '');
    fetch(`/api/public/spotlights/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setSnapshot(body?.snapshot ?? null))
      .catch(() => setSnapshot(null));
  }, [snapshot]);

  if (snapshot === undefined) return null;
  if (!snapshot) return <NotFound />;
  // ?evidence=SK-001 opens the drawer on that skill, capability or achievement — a link a candidate can send.
  const evidence = new URLSearchParams(location.search).get('evidence');
  const slug = location.pathname.split('/').filter(Boolean)[1];
  return (
    <SpotlightPage
      snapshot={snapshot}
      initialEvidence={evidence ? evidenceTargetFromId(snapshot, evidence) : null}
      pdfUrl={slug ? `/s/${slug}/pdf` : undefined}
    />
  );
}

/**
 * Server-side renders (server/pdfRenderer.ts) inject the snapshot here instead: "card" is
 * the link-preview image, "print" the downloadable PDF. The body is marked ready once
 * React has painted, which is what the renderer waits for.
 */
interface RenderRequest {
  mode: 'card' | 'print';
  snapshot: SpotlightSnapshot;
  address?: string;
}

function Rendered({ request }: { request: RenderRequest }) {
  useEffect(() => {
    requestAnimationFrame(() => {
      document.body.dataset.ready = 'true';
    });
  }, []);
  return request.mode === 'card' ? (
    <SpotlightCard snapshot={request.snapshot} address={request.address} />
  ) : (
    <SpotlightPage snapshot={request.snapshot} mode="light" variant="print" />
  );
}

const renderRequest = (window as any).__SPOTLIGHT_RENDER__ as RenderRequest | undefined;

createRoot(document.getElementById('root')!).render(
  <StrictMode>{renderRequest ? <Rendered request={renderRequest} /> : <Spotlight />}</StrictMode>,
);
