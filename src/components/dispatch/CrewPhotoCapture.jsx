import React, { useRef, useState, useCallback } from 'react';
import { getRepo } from '../../utils/repository';

const UPLOAD_STATUS = { PENDING: 'pending', UPLOADING: 'uploading', UPLOADED: 'uploaded', FAILED: 'failed' };

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function PhotoThumbnail({ entry, onDelete, onRetry }) {
  const { file, preview, status, error } = entry;

  return (
    <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
      {preview && (
        <img src={preview} alt="Preview" className="w-full h-full object-cover" />
      )}

      {/* Status overlay */}
      {status === UPLOAD_STATUS.UPLOADING && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {status === UPLOAD_STATUS.UPLOADED && (
        <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">✓</span>
        </div>
      )}
      {status === UPLOAD_STATUS.FAILED && (
        <div className="absolute inset-0 bg-red-900/70 flex flex-col items-center justify-center p-1">
          <p className="text-white text-xs text-center mb-1">Failed</p>
          <button
            onClick={() => onRetry(entry.id)}
            className="text-xs bg-white text-red-700 rounded px-2 py-0.5 font-semibold"
          >
            Retry
          </button>
        </div>
      )}
      {status === UPLOAD_STATUS.PENDING && (
        <button
          onClick={() => onDelete(entry.id)}
          className="absolute top-1 right-1 w-5 h-5 bg-gray-900/70 text-white rounded-full text-xs flex items-center justify-center"
        >
          ×
        </button>
      )}
    </div>
  );
}

function PhotoSection({ label, kind, bookingId, entries, setEntries }) {
  const inputRef = useRef(null);

  const uploadPhoto = useCallback(async (entry, bookingId) => {
    const repo = await getRepo();

    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: UPLOAD_STATUS.UPLOADING } : e));

    try {
      // Step 1: Get signed upload URL
      const { signedUrl, storagePath } = await repo.getDispatchPhotoUploadUrl(
        bookingId,
        entry.file.name,
        entry.file.type || 'image/jpeg',
        kind
      );

      // Step 2: PUT file to signed URL
      const putRes = await fetch(signedUrl, {
        method:  'PUT',
        body:    entry.file,
        headers: { 'Content-Type': entry.file.type || 'image/jpeg' },
      });
      if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

      // Step 3: Register photo in DB
      await repo.saveDispatchPhoto({
        bookingId,
        storagePath,
        fileName:    entry.file.name,
        contentType: entry.file.type || 'image/jpeg',
        sizeBytes:   entry.file.size,
        kind,
        capturedAt:  new Date().toISOString(),
      });
      // storagePath is discarded from client state here - never stored or rendered

      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: UPLOAD_STATUS.UPLOADED, storagePath: null } : e));
    } catch (err) {
      console.error('CrewPhotoCapture: upload failed:', err);
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: UPLOAD_STATUS.FAILED, error: err.message } : e));
    }
  }, [kind, setEntries]);

  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const newEntries = files.map(file => {
      const id = generateId();
      const preview = URL.createObjectURL(file);
      const entry = { id, file, preview, kind, status: UPLOAD_STATUS.PENDING };
      // Auto-upload
      setTimeout(() => uploadPhoto(entry, bookingId), 0);
      return { ...entry, status: UPLOAD_STATUS.UPLOADING };
    });

    setEntries(prev => [...prev, ...newEntries]);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  function handleDelete(id) {
    setEntries(prev => {
      const entry = prev.find(e => e.id === id);
      if (entry?.preview) URL.revokeObjectURL(entry.preview);
      return prev.filter(e => e.id !== id);
    });
  }

  function handleRetry(id) {
    const entry = entries.find(e => e.id === id);
    if (entry) uploadPhoto({ ...entry, status: UPLOAD_STATUS.PENDING }, bookingId);
  }

  const uploadedCount = entries.filter(e => e.status === UPLOAD_STATUS.UPLOADED).length;
  const failedCount   = entries.filter(e => e.status === UPLOAD_STATUS.FAILED).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        {entries.length > 0 && (
          <span className="text-xs text-gray-500">
            {uploadedCount}/{entries.length} uploaded
            {failedCount > 0 && <span className="text-red-500 ml-1">({failedCount} failed)</span>}
          </span>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {entries.map(entry => (
          <PhotoThumbnail
            key={entry.id}
            entry={entry}
            onDelete={handleDelete}
            onRetry={handleRetry}
          />
        ))}

        <button
          onClick={() => inputRef.current?.click()}
          className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors flex-shrink-0"
        >
          <span className="text-2xl mb-1">+</span>
          <span className="text-xs">Photo</span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.bookingId
 * @param {function} props.onPhotoCountChange  - called with ({ before, after }) whenever counts change
 */
export default function CrewPhotoCapture({ bookingId, onPhotoCountChange }) {
  const [beforeEntries, setBeforeEntries] = useState([]);
  const [afterEntries,  setAfterEntries]  = useState([]);

  function setBeforeAndNotify(updater) {
    setBeforeEntries(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const uploadedBefore = next.filter(e => e.status === UPLOAD_STATUS.UPLOADED).length;
      const uploadedAfter  = afterEntries.filter(e => e.status === UPLOAD_STATUS.UPLOADED).length;
      onPhotoCountChange?.({ before: uploadedBefore, after: uploadedAfter });
      return next;
    });
  }

  function setAfterAndNotify(updater) {
    setAfterEntries(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const uploadedBefore = beforeEntries.filter(e => e.status === UPLOAD_STATUS.UPLOADED).length;
      const uploadedAfter  = next.filter(e => e.status === UPLOAD_STATUS.UPLOADED).length;
      onPhotoCountChange?.({ before: uploadedBefore, after: uploadedAfter });
      return next;
    });
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Crew Photos</h2>

      <PhotoSection
        label="On-Site Before Photos"
        kind="before"
        bookingId={bookingId}
        entries={beforeEntries}
        setEntries={setBeforeAndNotify}
      />

      <PhotoSection
        label="After Photos"
        kind="after"
        bookingId={bookingId}
        entries={afterEntries}
        setEntries={setAfterAndNotify}
      />
    </div>
  );
}
