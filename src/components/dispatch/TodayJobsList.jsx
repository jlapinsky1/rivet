import React from 'react';

const STATUS_LABELS = {
  scheduled:   'Scheduled',
  en_route:    'En Route',
  arrived:     'Arrived',
  in_progress: 'In Progress',
  completed:   'Completed',
};

const STATUS_BADGE = {
  scheduled:   'bg-blue-100 text-blue-700',
  en_route:    'bg-purple-100 text-purple-800',
  arrived:     'bg-amber-100 text-amber-800',
  in_progress: 'bg-green-100 text-green-800',
  completed:   'bg-gray-100 text-gray-500',
};

export default function TodayJobsList({ jobs, nextJobId, onSelectJob }) {
  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1 pb-1">
        Today's Schedule
      </h3>
      {jobs.map(job => {
        const isCurrent   = job.id === nextJobId && job.status !== 'completed';
        const isCompleted = job.status === 'completed';
        const shortAddress = job.fullAddress?.split(',').slice(0, 2).join(',') ?? '';
        const displayName = job.title || job.customerName;
        const subtitle = job.title ? job.customerName : shortAddress;

        return (
          <button
            key={job.id}
            onClick={() => onSelectJob?.(job.id)}
            className={`w-full text-left rounded-2xl p-4 border transition-colors active:scale-[0.98] ${
              isCurrent
                ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-400'
                : isCompleted
                  ? 'bg-gray-50 border-gray-100 opacity-60'
                  : 'bg-white border-gray-100 active:bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-gray-400 mb-0.5 font-medium">{job.appointmentWindow ?? (job.travel || 'Time TBD')}</p>
                <p className={`font-bold truncate text-base ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>
                  {displayName}
                </p>
                <p className={`text-sm truncate mt-0.5 ${isCompleted ? 'text-gray-400' : 'text-gray-500'}`}>
                  {subtitle}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_BADGE[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABELS[job.status] ?? job.status}
                </span>
                {job.price != null && (
                  <p className={`text-sm font-bold mt-1 ${isCompleted ? 'text-gray-400' : 'text-gray-900'}`}>
                    ${job.price.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
