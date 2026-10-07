import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listDiscoveredJobs } from '../../lib/discoveryClient';
import { ArrowRight, Telescope } from 'lucide-react';

/**
 * Entry point to Discover (StillOpen). The caller gates it the same way the
 * Navbar does, so it only renders for accounts that can actually use the page.
 */
export default function DiscoverCard() {
  const [newCount, setNewCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Best-effort: the CTA works without a count, so failures just leave it off.
    listDiscoveredJobs()
      .then(({ jobs }) => {
        if (!cancelled) setNewCount(jobs.filter((j) => j.userState === 'new').length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      to="/discover"
      className="group relative block w-full overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-5 text-left text-white shadow-md shadow-brand-900/20 transition-shadow hover:shadow-lg hover:shadow-brand-900/30"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-brand-400/20 blur-2xl" />
      <Telescope className="pointer-events-none absolute -bottom-3 -right-3 h-24 w-24 text-white/10 transition-transform group-hover:-rotate-6" />

      <div className="relative">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-brand-100">
          <Telescope className="h-3.5 w-3.5" />
          Discover
        </div>

        {newCount ? (
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold leading-none">{newCount}</span>
            <span className="text-sm font-semibold text-brand-100">new listing{newCount === 1 ? '' : 's'}</span>
          </div>
        ) : (
          <h2 className="mt-3 text-xl font-extrabold leading-tight">Find your next role</h2>
        )}

        <p className="mt-1.5 text-xs text-brand-100/90">Verified-open listings, ranked against your Career Journey.</p>

        <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-bold text-brand-700 shadow-sm transition-colors group-hover:bg-brand-50">
          Discover new jobs
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
