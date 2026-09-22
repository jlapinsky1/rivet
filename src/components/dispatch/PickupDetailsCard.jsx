import React, { useState } from 'react';

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 text-left"
      >
        <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">{title}</span>
        <span className="text-gray-400 text-lg">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

export default function PickupDetailsCard({ job }) {
  if (!job) return null;

  if (job.source === 'work_item') {
    const price = job.price != null ? `$${Number(job.price).toLocaleString()}` : null;
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">The job</h2>
        {job.title && <p className="text-lg font-bold text-gray-900 leading-snug">{job.title}</p>}
        {job.description && <p className="text-gray-800 whitespace-pre-wrap">{job.description}</p>}
        {(price || job.hours) && (
          <p className="text-sm text-gray-500">
            {[price, job.hours, job.travel].filter(Boolean).join(' · ')}
          </p>
        )}
        {job.internalJobNotes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-amber-900 text-sm whitespace-pre-wrap">{job.internalJobNotes}</p>
          </div>
        )}
      </div>
    );
  }

  const {
    quantity, accessType, stairs, elevator, description,
    internalJobNotes, accessInstructions,
  } = job;

  const hasPickup = quantity || description;
  const hasAccess = accessType || stairs || elevator || accessInstructions;
  const hasNotes  = internalJobNotes;

  if (!hasPickup && !hasAccess && !hasNotes) return null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Pickup Details</h2>

      {hasPickup && (
        <Section title="What's Being Removed">
          {quantity && (
            <div className="mb-2">
              <span className="text-xs text-gray-400 uppercase">Volume / Quantity</span>
              <p className="text-gray-800 font-medium">{quantity}</p>
            </div>
          )}
          {description && (
            <div>
              <span className="text-xs text-gray-400 uppercase">Customer Description</span>
              <p className="text-gray-800 mt-1 whitespace-pre-wrap">{description}</p>
            </div>
          )}
        </Section>
      )}

      {hasAccess && (
        <Section title="Access &amp; Site Details">
          <div className="space-y-2">
            {accessType && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Access type</span>
                <span className="text-gray-800 font-medium capitalize">{accessType}</span>
              </div>
            )}
            {stairs && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Stairs</span>
                <span className="text-gray-800 font-medium">{stairs}</span>
              </div>
            )}
            {elevator && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Elevator</span>
                <span className="text-gray-800 font-medium capitalize">{String(elevator)}</span>
              </div>
            )}
            {accessInstructions && (
              <div className="pt-1">
                <span className="text-xs text-gray-400 uppercase block mb-1">Instructions</span>
                <p className="text-gray-800 text-sm whitespace-pre-wrap">{accessInstructions}</p>
              </div>
            )}
          </div>
        </Section>
      )}

      {hasNotes && (
        <Section title="Internal Job Notes">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-amber-900 text-sm whitespace-pre-wrap">{internalJobNotes}</p>
          </div>
        </Section>
      )}
    </div>
  );
}
