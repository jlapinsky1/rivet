import React, { useState, useEffect, useRef } from 'react';

function formatDollars(cents) {
  if (!cents || cents <= 0) return '-';
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function toISOLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * @param {object} props
 * @param {string} props.bookingId
 * @param {number} [props.approvedQuoteCents]   - read-only final amount
 * @param {number} props.crewBeforePhotoCount
 * @param {number} props.crewAfterPhotoCount
 * @param {function} props.onReview             - called with formData to advance to review step
 */
export default function CompletionForm({ bookingId, approvedQuoteCents, crewBeforePhotoCount, crewAfterPhotoCount, onReview }) {
  const storageKey = `dispatch_form_${bookingId}`;
  const saveTimer = useRef(null);

  const [form, setForm] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      technicianName:  '',
      itemsRemoved:    '',
      completionNotes: '',
      volumeEstimate:  '',
      disposalNotes:   '',
      completedAt:     toISOLocal(),
    };
  });

  const [error, setError] = useState(null);

  // Debounced localStorage save
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify(form)); } catch {}
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [form, storageKey]);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setError(null);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.technicianName.trim())  return setError('Technician name is required');
    if (!form.itemsRemoved.trim())    return setError('Items removed is required');
    if (!form.completionNotes.trim()) return setError('Completion notes are required');
    if (crewBeforePhotoCount < 1)     return setError('At least one before photo is required');
    if (crewAfterPhotoCount < 1)      return setError('At least one after photo is required');
    onReview({ ...form, completedAt: form.completedAt || new Date().toISOString() });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Complete Job</h2>

      {/* Photo count summary */}
      <div className="flex gap-3 mb-4">
        <div className={`flex-1 rounded-xl p-3 text-center text-sm font-medium ${crewBeforePhotoCount > 0 ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
          {crewBeforePhotoCount} before photo{crewBeforePhotoCount !== 1 ? 's' : ''}
        </div>
        <div className={`flex-1 rounded-xl p-3 text-center text-sm font-medium ${crewAfterPhotoCount > 0 ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
          {crewAfterPhotoCount} after photo{crewAfterPhotoCount !== 1 ? 's' : ''}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Technician / Crew Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.technicianName}
            onChange={e => update('technicianName', e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Items Removed <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.itemsRemoved}
            onChange={e => update('itemsRemoved', e.target.value)}
            placeholder="e.g. Couch, mattress, 3 bags of clothes"
            rows={3}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Completion Notes <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.completionNotes}
            onChange={e => update('completionNotes', e.target.value)}
            placeholder="Describe what was done, any access challenges, customer interaction, etc."
            rows={4}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Volume Estimate</label>
          <input
            type="text"
            value={form.volumeEstimate}
            onChange={e => update('volumeEstimate', e.target.value)}
            placeholder="e.g. Half truck load"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Disposal / Donation Notes</label>
          <textarea
            value={form.disposalNotes}
            onChange={e => update('disposalNotes', e.target.value)}
            placeholder="Where items are going, any donations"
            rows={2}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Completion Time</label>
          <input
            type="datetime-local"
            value={form.completedAt}
            onChange={e => update('completedAt', e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Final amount - read-only */}
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500 mb-0.5">Final Amount (Approved Quote)</p>
          <p className="text-xl font-bold text-gray-900">{formatDollars(approvedQuoteCents)}</p>
          <p className="text-xs text-gray-400 mt-0.5">Cannot be changed from this interface</p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        <button
          type="submit"
          className="w-full min-h-[64px] bg-green-600 hover:bg-green-500 text-white text-lg font-bold rounded-xl transition-colors"
        >
          Review &amp; Complete Job
        </button>
      </form>
    </div>
  );
}
