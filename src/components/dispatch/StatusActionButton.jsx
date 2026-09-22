import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { bindTap } from './tap';

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
export default function StatusActionButton({ status, depositConfirmed, crewBeforePhotoCount, onAttempt, onAction, loading }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [box, setBox] = useState(null);
  const config = STATUS_CONFIG[status];

  if (!config) return null;

  const depositBlocked = config.requiresDeposit && !depositConfirmed;
  const photoBlocked   = config.requiresBeforePhoto && (crewBeforePhotoCount ?? 0) === 0;
  const isBlocked      = depositBlocked || photoBlocked;

  useEffect(() => {
    if (!confirming) return undefined;
    const vv = window.visualViewport;
    const place = () => {
      if (!vv) return;
      setBox({ top: vv.offsetTop, height: vv.height });
    };
    place();
    vv?.addEventListener('resize', place);
    vv?.addEventListener('scroll', place);
    return () => {
      vv?.removeEventListener('resize', place);
      vv?.removeEventListener('scroll', place);
    };
  }, [confirming]);

  function handleClick() {
    if (isBlocked || loading || busy || status === 'completed') return;
    if (onAttempt && onAttempt() === false) return;
    setError(null);
    setConfirming(true);
  }

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAction?.();
      setConfirming(false);
    } catch (err) {
      setError(err.message || 'Could not update the job');
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    if (busy) return;
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

      {confirming && createPortal(
        <div
          className="fixed left-0 right-0 z-[80] flex items-end justify-center bg-black/50"
          style={{ top: box?.top ?? 0, height: box?.height ?? '100dvh' }}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl mx-4"
            style={{ marginBottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
          >
            <p className="text-base font-semibold text-gray-900 mb-4">
              Confirm: {config.label}?
            </p>
            {error && (
              <p className="text-sm text-red-700 font-medium mb-4">{error}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                {...bindTap(handleCancel)}
                className="touch-manipulation flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                {...bindTap(handleConfirm)}
                className={`touch-manipulation flex-1 py-3 rounded-xl text-white font-bold ${config.color}`}
              >
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
