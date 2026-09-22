import React from 'react';

function Row({ label, photos }) {
  if (!photos?.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</h3>
      <div className="flex gap-2 flex-wrap">
        {photos.map(photo => (
          <img key={photo.id} src={photo.signedUrl} alt="" className="w-28 h-28 rounded-xl object-cover bg-gray-100" />
        ))}
      </div>
    </div>
  );
}

export default function JobInvoice({ job, onBack }) {
  if (!job) return null;
  const price = job.price != null ? `$${Number(job.price).toLocaleString()}` : null;

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Invoice</p>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{job.title || 'Job'}</h1>
          <p className="text-gray-600 mt-1">{job.customerName}</p>
          {job.fullAddress && <p className="text-sm text-gray-500 mt-1">{job.fullAddress}</p>}
        </div>
        {price && <p className="text-2xl font-bold text-gray-900">{price}</p>}
        {job.description && <p className="text-gray-800 whitespace-pre-wrap">{job.description}</p>}
        <Row label="Customer photos" photos={job.customerPhotos} />
        <Row label="Before" photos={job.crewBeforePhotos} />
        <Row label="After" photos={job.crewAfterPhotos} />
      </div>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="touch-manipulation w-full py-4 rounded-xl bg-gray-900 text-white font-bold text-lg"
        >
          Back to jobs
        </button>
      )}
    </div>
  );
}
