import React from 'react';
import { STILLOPEN_ATTRIBUTION } from '../types/discovery';

/**
 * StillOpen's terms require this wherever its data is shown: the words "Data
 * provided by StillOpen" linked to stillopen.work, with the logo where the
 * medium allows. (Each listing must also link to its own canonical_url.)
 */
export function StillOpenAttribution({ className = '' }: { className?: string }) {
  return (
    <a
      href={STILLOPEN_ATTRIBUTION.url}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 ${className}`}
    >
      <img src="https://stillopen.work/static/stillopen_logo.svg" alt="" className="h-4 w-auto" loading="lazy" />
      {STILLOPEN_ATTRIBUTION.text}
    </a>
  );
}
