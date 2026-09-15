import React, { useState } from 'react';

const STATUS_CONFIG = {
  scheduled:   { label: 'Start Route',  color: 'bg-blue-600 hover:bg-blue-500',  requiresDeposit: true,  requiresBeforePhoto: false },
  en_route:    { label: 'Mark Arrived', color: 'bg-blue-600 hover:bg-blue-500',  requiresDeposit: false, requiresBeforePhoto: false },
  arrived:     { label: 'Start Job',    color: 'bg-green-600 hover:bg-green-500', requiresDeposit: true,  requiresBeforePhoto: true  },
  in_progress: { label: 'Finish Job',   color: 'bg-green-600 hover:bg-green-500', requiresDeposit: false, requiresBeforePhoto: false },
  completed:   { label: 'View Summary', color: 'bg-gray-500 hover:bg-gray-400',  requiresDeposit: false, requiresBeforePhoto: false },
};

/**
 * @param {object} props
 * @param {string} props.status
 * @param {boolean} props.depositConfirmed
 * @param {number} props.crewBeforePhotoCount
 * @param {function} props.onAction  - called when action is confirmed
 * @param {boolean} [props.loading]
 */
export default function StatusActionButton({ status, depositConfirmed, crewBeforePhotoCount, onAction, loading }) {
  const [confirming, setConfirming] = useState(false);
  const config = STATUS_CONFIG[status];

  if (!config) return null;

  const depositBlocked = config.requiresDeposit && !depositConfirmed;
  const photoBlocked   = config.requiresBeforePhoto && (crewBeforePhotoCount ?? 0) === 0;
  const isBlocked      = depositBlocked || photoBlocked;

  function handleClick() {
    if (isBlocked || loading || status === 'completed') return;
    setConfirming(true);
  }

  function handleConfirm() {
    setConfirming(false);
    onAction?.();
  }

  function handleCancel() {
    setConfirming(false);
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={isBlocked || loading}
        className={`w-full min-h-[64px] rounded-xl text-white text-lg font-bold transition-colors
          ${isBlocked || loading ? 'bg-gray-400 cursor-not-allowed' : config.color}`}
      >
        {loading ? 'Updating…' : config.label}
      </button>

      {depositBlocked && (
        <p className="mt-2 text-sm text-red-600 font-medium text-center">
          Deposit not confirmed. Contact the office before dispatching.
        </p>
      )}
      {!depositBlocked && photoBlocked && (
        <p className="mt-2 text-sm text-amber-700 font-medium text-center">
          Take at least one on-site before photo to start the job.
        </p>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <p className="text-base font-semibold text-gray-900 mb-4">
              Confirm: {config.label}?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className={`flex-1 py-3 rounded-xl text-white font-bold ${config.color}`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
