import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import StatusActionButton from './StatusActionButton';

const STATUS_LABELS = {
  scheduled:   'Scheduled',
  en_route:    'En Route',
  arrived:     'Arrived',
  in_progress: 'In Progress',
  completed:   'Completed',
};

const STATUS_COLORS = {
  scheduled:   'bg-blue-100 text-blue-800',
  en_route:    'bg-purple-100 text-purple-800',
  arrived:     'bg-amber-100 text-amber-800',
  in_progress: 'bg-green-100 text-green-800',
  completed:   'bg-gray-100 text-gray-700',
};

export default function DispatchJobHeader({
  job,
  crewBeforePhotoCount,
  onStatusAction,
  statusLoading,
  onBack,
  onFinishJob,
}) {
  const [needPhotos, setNeedPhotos] = useState(false);

  if (!job) return null;

  const { status, depositConfirmed, appointmentWindow, customerName, fullAddress } = job;
  const missingCrewPhotos = job.source === 'work_item'
    && status === 'in_progress'
    && ((job.crewBeforePhotoCount || 0) < 1 || (job.crewAfterPhotoCount || 0) < 1);
  const statusLabel = STATUS_LABELS[status] ?? status;
  const statusColor = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700';

  // Short address - first line only
  const shortAddress = fullAddress?.split(',')[0] ?? '';

  function handleAttempt() {
    if (missingCrewPhotos) {
      setNeedPhotos(true);
      return false;
    }
    setNeedPhotos(false);
    return true;
  }

  function handleAction() {
    if (missingCrewPhotos) {
      setNeedPhotos(true);
      throw new Error('Upload pictures to complete the job.');
    }
    if (status === 'in_progress') {
      return onFinishJob?.();
    }
    return onStatusAction?.(status);
  }

  return (
    <div className="bg-white border-b border-gray-100 px-4 pb-4 sticky top-0 z-30">
      {/* Back row */}
      <div className="flex items-center gap-2 h-11">
        <button
          onClick={onBack}
          className="flex items-center gap-0.5 text-blue-600 font-semibold text-base -ml-1"
        >
          <ChevronLeft className="w-5 h-5" />
          Jobs
        </button>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mb-3">
        <p className="text-xs text-gray-400 font-medium">{job.title || appointmentWindow || 'Time TBD'}</p>
        <h1 className="text-xl font-bold text-gray-900 leading-snug mt-0.5">{customerName}</h1>
        <p className="text-sm text-gray-500">{shortAddress}</p>
      </div>

      <StatusActionButton
        status={status}
        depositConfirmed={depositConfirmed}
        crewBeforePhotoCount={crewBeforePhotoCount}
        onAttempt={handleAttempt}
        onAction={handleAction}
        loading={statusLoading}
      />
      {(needPhotos || missingCrewPhotos) && (
        <p className="mt-3 text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 text-center">
          Upload pictures to complete the job.
        </p>
      )}
    </div>
  );
}
