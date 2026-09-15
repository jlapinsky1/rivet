import React, { useState } from 'react';

/**
 * @param {object} props
 * @param {object} props.formData         - from CompletionForm
 * @param {number} props.crewBeforePhotoCount
 * @param {number} props.crewAfterPhotoCount
 * @param {boolean} props.isOnline
 * @param {function} props.onConfirm      - async, submits the job
 * @param {function} props.onBack
 */
export default function CompletionReview({
  formData,
  crewBeforePhotoCount,
  crewAfterPhotoCount,
  isOnline,
  onConfirm,
  onBack,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [offlineQueued, setOfflineQueued] = useState(false);

  async function handleConfirm() {
    if (submitting) return;

    if (!isOnline) {
      setOfflineQueued(true);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onConfirm(formData);
    } catch (err) {
      setSubmitError(err.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  function Row({ label, value }) {
    return (
      <div className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
        <span className="text-sm text-gray-500 w-36 flex-shrink-0">{label}</span>
        <span className="text-sm text-gray-900 font-medium flex-1">{value}</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
      <h2 className="text-lg font-bold text-gray-900">Review Job Completion</h2>

      <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2">
        <Row label="Before photos"    value={String(crewBeforePhotoCount)} />
        <Row label="After photos"     value={String(crewAfterPhotoCount)} />
        <Row label="Technician"       value={formData.technicianName} />
        <Row label="Items removed"    value={formData.itemsRemoved} />
        <Row label="Completion notes" value={formData.completionNotes} />
        {formData.volumeEstimate && <Row label="Volume"       value={formData.volumeEstimate} />}
        {formData.disposalNotes  && <Row label="Disposal"     value={formData.disposalNotes} />}
        <Row label="Completed at"     value={formData.completedAt ? new Date(formData.completedAt).toLocaleString() : '-'} />
      </div>

      <p className="text-sm text-gray-600 text-center">
        Mark this job complete and send the customer their completion package and remaining balance?
      </p>

      {offlineQueued && !isOnline && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-amber-800 text-sm font-medium">
            Saved on this device. Waiting for a connection to finish submitting.
          </p>
        </div>
      )}

      {submitError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3">
          <p className="text-red-700 text-sm font-medium">{submitError}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={submitting}
          className="flex-1 py-4 rounded-xl border border-gray-300 text-gray-700 font-semibold text-base disabled:opacity-50"
        >
          Go Back
        </button>
        <button
          onClick={handleConfirm}
          disabled={submitting || offlineQueued}
          className="flex-1 py-4 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting…' : 'Complete Job'}
        </button>
      </div>
    </div>
  );
}
