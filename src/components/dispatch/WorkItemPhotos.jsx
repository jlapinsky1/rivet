import React, { useRef, useState } from 'react';
import { getRepo } from '../../utils/repository';

function Shot({ photo }) {
  return (
    <img src={photo.signedUrl} alt="" className="w-24 h-24 rounded-xl object-cover bg-gray-100 flex-shrink-0" />
  );
}

function AddRow({ label, kind, jobId, photos, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function onChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const repo = await getRepo();
      for (const file of files) {
        await repo.saveWorkItemCrewPhoto(jobId, kind, file);
      }
      await onUploaded?.();
    } catch (err) {
      setError(err.message || 'Photo upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{label}</h3>
      <div className="flex gap-2 flex-wrap">
        {photos.map(photo => <Shot key={photo.id} photo={photo} />)}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="touch-manipulation w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 flex-shrink-0"
        >
          <span className="text-2xl mb-1">{uploading ? '…' : '+'}</span>
          <span className="text-xs">{uploading ? 'Saving' : 'Photo'}</span>
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onChange} />
    </div>
  );
}

export default function WorkItemPhotos({ job, onUploaded }) {
  if (!job || job.status === 'completed') return null;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Before and after</h2>
      <p className="text-sm text-gray-500">These photos go on the invoice when the job is done.</p>
      <AddRow label="Before" kind="before" jobId={job.id} photos={job.crewBeforePhotos ?? []} onUploaded={onUploaded} />
      <AddRow label="After" kind="after" jobId={job.id} photos={job.crewAfterPhotos ?? []} onUploaded={onUploaded} />
    </div>
  );
}
