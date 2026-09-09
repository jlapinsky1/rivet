import React from 'react';
import { Truck } from 'lucide-react';
import StatusActionButton from './StatusActionButton';

const STATUS_LABELS = {
  scheduled:   'Scheduled',
  en_route:    'En Route',
  arrived:     'Arrived',
  in_progress: 'In Progress',
  completed:   'Completed',
};

const STATUS_ACCENT = {
  scheduled:   'bg-blue-500',
  en_route:    'bg-purple-500',
  arrived:     'bg-amber-500',
  in_progress: 'bg-green-500',
  completed:   'bg-gray-400',
};

const STATUS_BADGE = {
  scheduled:   'bg-blue-100 text-blue-700',
  en_route:    'bg-purple-100 text-purple-800',
  arrived:     'bg-amber-100 text-amber-800',
  in_progress: 'bg-green-100 text-green-800',
  completed:   'bg-gray-100 text-gray-600',
};

export default function NextJobCard({ job, onStatusAction, onSelectJob, statusLoading }) {
  if (!job) {
    return (
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-10 flex flex-col items-center justify-center gap-3">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
          <Truck className="w-8 h-8 text-gray-300" />
        </div>
        <p className="text-gray-400 font-medium text-base">No jobs today</p>
        <p className="text-gray-300 text-sm">Enjoy the day off 🤙</p>
      </div>
    );
  }

  const {
    id, bookingRef, status, depositConfirmed, crewBeforePhotoCount,
    appointmentWindow, customerName, fullAddress, title, price, hours, travel,
  } = job;

  const shortAddress = fullAddress?.split(',').slice(0, 2).join(',') ?? '';
  const accent = STATUS_ACCENT[status] ?? 'bg-gray-400';
  const badge  = STATUS_BADGE[status]  ?? 'bg-gray-100 text-gray-600';
  const isWorkItem = job.source === 'work_item';

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Colored top accent stripe */}
      <div className={`h-1.5 w-full ${accent}`} />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest">Next Job</p>
            <p className="text-sm text-gray-500 mt-0.5 font-medium">{appointmentWindow ?? (isWorkItem && travel ? travel : 'Time TBD')}</p>
          </div>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badge}`}>
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>

        {/* Job info */}
        <div>
          {title && <p className="text-sm text-gray-500 font-medium">{title}</p>}
          <h2 className="text-[26px] font-bold text-gray-900 leading-tight">{customerName}</h2>
          <p className="text-gray-500 mt-1">{shortAddress}</p>
          {bookingRef && <p className="text-xs text-gray-300 mt-1 font-mono">{bookingRef}</p>}
          {isWorkItem && price != null && (
            <div className="flex items-center gap-3 mt-2 text-sm">
              <span className="font-bold text-gray-900">${price.toLocaleString()}</span>
              {hours && <span className="text-gray-400">{hours}</span>}
            </div>
          )}
        </div>

        {/* Deposit indicator — only for bookings */}
        {!isWorkItem && (
          <div className={`text-xs font-semibold px-3 py-1.5 rounded-full inline-block ${
            depositConfirmed
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {depositConfirmed ? '✓ Deposit confirmed' : '⚠ Deposit pending'}
          </div>
        )}

        {/* Primary action */}
        <StatusActionButton
          status={status}
          depositConfirmed={depositConfirmed}
          crewBeforePhotoCount={crewBeforePhotoCount ?? 0}
          onAction={() => onStatusAction?.(id, status)}
          loading={statusLoading}
        />

        {/* View Details */}
        <button
          onClick={() => onSelectJob?.(id)}
          className="w-full py-3.5 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-sm active:bg-gray-100 transition-colors"
        >
          View Job Details
        </button>
      </div>
    </div>
  );
}
