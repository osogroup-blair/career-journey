import { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSummary } from '../../lib/dashboardSummary';
import { JobStage } from '../../types';
import { Award, Briefcase, MessagesSquare, Radar } from 'lucide-react';

type IconType = ComponentType<{ className?: string }>;

/** The job tiles filter the pipeline in place; only Matches leaves the Dashboard. */
export default function JobStatTiles({
  tiles,
  stageFilter,
  onStageFilterChange,
}: {
  tiles: DashboardSummary['tiles'];
  stageFilter: JobStage | null;
  onStageFilterChange: (stage: JobStage | null) => void;
}) {
  const jobTiles: { label: string; value: number; stage: JobStage | null; icon: IconType }[] = [
    { label: 'Active applications', value: tiles.active, stage: null, icon: Briefcase },
    { label: 'Interviewing', value: tiles.interviewing, stage: 'Interview', icon: MessagesSquare },
    { label: 'Offers', value: tiles.offers, stage: 'Offer', icon: Award },
  ];

  const filterTo = (stage: JobStage | null) => {
    onStageFilterChange(stage);
    document.getElementById('pipeline')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const tileClass = (selected: boolean) =>
    `group text-left rounded-xl border bg-white p-4 shadow-xs hover:border-brand-300 hover:shadow-sm transition-all ${
      selected ? 'border-brand-500 ring-1 ring-brand-500/30' : 'border-slate-200'
    }`;
  const tileBody = (label: string, value: number, TileIcon: IconType) => (
    <>
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>{label}</span>
        <TileIcon className="w-4 h-4 text-slate-400 group-hover:text-brand-500 transition-colors" />
      </div>
      <div className="mt-1.5 text-2xl font-extrabold text-slate-900">{value}</div>
    </>
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {jobTiles.map(({ label, value, stage, icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => filterTo(stage)}
          aria-pressed={stageFilter === stage}
          className={tileClass(stageFilter === stage)}
        >
          {tileBody(label, value, icon)}
        </button>
      ))}
      <Link to="/matches" className={tileClass(false)}>
        {tileBody('Matches to review', tiles.matchesToReview, Radar)}
      </Link>
    </div>
  );
}
