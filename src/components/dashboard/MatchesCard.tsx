import { Link } from 'react-router-dom';
import { Badge, Card } from '../ui';
import { VERDICT_BADGE } from '../MatchSummary';
import { JobMatch } from '../../types';
import { ArrowRight, Radar } from 'lucide-react';

const MAX_ROWS = 4;
/** In fill mode the list scrolls, so it can afford to carry more than fits at a glance. */
const MAX_FILL_ROWS = 20;

export default function MatchesCard({
  matches,
  fill = false,
}: {
  matches: JobMatch[];
  /** On lg+, stretch to the remaining height of a flex column and scroll the list inside it. */
  fill?: boolean;
}) {
  const rows = matches.slice(0, fill ? MAX_FILL_ROWS : MAX_ROWS);

  return (
    <Card className={fill ? 'flex flex-col overflow-hidden lg:flex-1 lg:min-h-[16rem]' : undefined}>
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Radar className="w-4 h-4 text-brand-600" />
          New matches
          {matches.length > 0 && (
            <span className="rounded-full bg-brand-100 px-2 text-xs font-bold text-brand-700">{matches.length}</span>
          )}
        </h2>
        <Link to="/matches" className="text-xs font-semibold text-brand-600 hover:text-brand-800 flex items-center gap-1">
          {matches.length > 0 ? 'Review all' : 'Find matches'} <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-xs text-slate-500">
          Nothing waiting for review. Paste a few job descriptions on Matches to score how you stack up.
        </p>
      ) : (
        // lg:h-0 + flex-1: the list takes whatever height the pipeline leaves, without stretching the row itself.
        <ul className={`divide-y divide-slate-100 border-t border-slate-100 ${fill ? 'lg:h-0 lg:flex-1 lg:overflow-y-auto' : ''}`}>
          {rows.map((m, i) => (
            // Below lg there's no pipeline to align with, so keep the short list.
            <li key={m.id} className={fill && i >= MAX_ROWS ? 'hidden lg:block' : undefined}>
              <Link to="/matches" className="group flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="w-9 shrink-0 text-center text-lg font-extrabold text-brand-700">
                  {m.matchScore ?? '—'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900 truncate group-hover:text-brand-700">{m.roleTitle}</div>
                  <div className="text-xs text-slate-500 truncate">{m.companyName}</div>
                </div>
                {m.verdict && <Badge variant={VERDICT_BADGE[m.verdict] || 'default'}>{m.verdict}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
