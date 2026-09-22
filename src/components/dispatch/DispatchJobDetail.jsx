import React, { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { getRepo } from '../../utils/repository';
import DispatchJobHeader from './DispatchJobHeader';
import CustomerContactCard from './CustomerContactCard';
import PickupDetailsCard from './PickupDetailsCard';
import CustomerPhotoGallery from './CustomerPhotoGallery';
import CrewPhotoCapture from './CrewPhotoCapture';
import CompletionForm from './CompletionForm';
import CompletionReview from './CompletionReview';
import IssueReportSheet from './IssueReportSheet';
import WorkItemPhotos from './WorkItemPhotos';
import JobInvoice from './JobInvoice';

function Skeleton() {
  return (
    <div className="space-y-4 p-4 animate-pulse">
      <div className="h-32 bg-gray-200 rounded-2xl" />
      <div className="h-28 bg-gray-200 rounded-2xl" />
      <div className="h-40 bg-gray-200 rounded-2xl" />
    </div>
  );
}

/**
 * @param {object} props
 * @param {string} props.bookingId
 * @param {function} props.onBack
 * @param {function} [props.onJobCompleted]  - called when job is completed successfully
 */
export default function DispatchJobDetail({ bookingId, onBack, onJobCompleted }) {
  const [job, setJob]             = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [toast, setToast]         = useState(null);
  const [view, setView]           = useState('detail'); // 'detail' | 'review' | 'success'
  const [reviewData, setReviewData] = useState(null);
  const [showIssue, setShowIssue] = useState(false);
  const [isOnline, setIsOnline]   = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Track locally uploaded crew photo counts (in addition to DB counts)
  const [localPhotoCounts, setLocalPhotoCounts] = useState({ before: 0, after: 0 });

  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  async function loadJob(opts) {
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const repo = await getRepo();
      const data = await repo.getDispatchJob(bookingId);
      setJob(data.job);
    } catch (err) {
      setError(err.message || 'Failed to load job');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadJob(); }, [bookingId]);

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleStatusAction(currentStatus) {
    const NEXT = {
      scheduled: 'en_route',
      en_route:  'arrived',
      arrived:   'in_progress',
    };
    const targetStatus = NEXT[currentStatus];
    if (!targetStatus) return;

    setStatusLoading(true);
    try {
      const repo = await getRepo();
      await repo.updateDispatchStatus(bookingId, targetStatus, `${bookingId}-${targetStatus}`);
      await loadJob();
      showToast(`Status updated: ${targetStatus.replace('_', ' ')}`);
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleFinishJob() {
    if (job?.source === 'work_item') {
      setStatusLoading(true);
      try {
        const repo = await getRepo();
        await repo.completeWorkItem(bookingId);
        await loadJob();
        setView('invoice');
        onJobCompleted?.();
      } catch (err) {
        showToast(err.message || 'Failed to finish job', 'error');
      } finally {
        setStatusLoading(false);
      }
      return;
    }
    setView('review_prep');
  }

  function handleReview(formData) {
    setReviewData(formData);
    setView('review');
  }

  async function handleConfirmComplete(formData) {
    const repo = await getRepo();
    await repo.dispatchCompleteJob({
      bookingId,
      technicianName:  formData.technicianName,
      itemsRemoved:    formData.itemsRemoved,
      volumeEstimate:  formData.volumeEstimate || undefined,
      completionNotes: formData.completionNotes,
      disposalNotes:   formData.disposalNotes || undefined,
      completedAt:     formData.completedAt || new Date().toISOString(),
    });
    // Clear saved form from localStorage
    try { localStorage.removeItem(`dispatch_form_${bookingId}`); } catch {}
    setView('success');
    onJobCompleted?.();
  }

  // Combined photo count: max of what's in DB vs what we've uploaded in this session
  const crewBeforePhotoCount = Math.max(job?.crewBeforePhotoCount ?? 0, localPhotoCounts.before);
  const crewAfterPhotoCount  = Math.max(job?.crewAfterPhotoCount  ?? 0, localPhotoCounts.after);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="p-4 space-y-4">
        <button onClick={onBack} className="flex items-center gap-0.5 text-blue-600 font-semibold text-base -ml-1">
          <ChevronLeft className="w-5 h-5" /> Jobs
        </button>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
          <p className="text-red-700 font-medium mb-3">{error}</p>
          <button onClick={loadJob} className="text-sm text-blue-600 font-semibold">Try again</button>
        </div>
      </div>
    );
  }

  if (!job) return null;

  if (view === 'invoice' && job.source === 'work_item') {
    return <JobInvoice job={job} onBack={onBack} />;
  }

  // Success screen
  if (view === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-green-50 text-center">
        <div className="text-6xl mb-6">✓</div>
        <h1 className="text-2xl font-bold text-green-800 mb-3">Job Completed</h1>
        <p className="text-green-700 mb-8">
          The customer's completion package and final payment request have been sent.
        </p>
        <button
          onClick={onBack}
          className="w-full max-w-xs py-4 rounded-xl bg-green-700 text-white font-bold text-lg"
        >
          Go to Next Job
        </button>
      </div>
    );
  }

  // Review screen
  if (view === 'review') {
    return (
      <div className="pb-8">
        <DispatchJobHeader
          job={job}
          crewBeforePhotoCount={crewBeforePhotoCount}
          onBack={() => setView('review_prep')}
          onStatusAction={handleStatusAction}
          statusLoading={statusLoading}
          onFinishJob={handleFinishJob}
        />
        <div className="p-4">
          <CompletionReview
            formData={reviewData}
            crewBeforePhotoCount={crewBeforePhotoCount}
            crewAfterPhotoCount={crewAfterPhotoCount}
            isOnline={isOnline}
            onConfirm={handleConfirmComplete}
            onBack={() => setView('review_prep')}
          />
        </div>
      </div>
    );
  }

  const isWorkItem = job.source === 'work_item';
  const showCompletionForm = !isWorkItem && (job.status === 'in_progress' || view === 'review_prep');
  const showCrewPhotos = !isWorkItem && ['arrived', 'in_progress', 'completed'].includes(job.status);

  return (
    <div className="pb-24">
      <DispatchJobHeader
        job={job}
        crewBeforePhotoCount={crewBeforePhotoCount}
        onBack={onBack}
        onStatusAction={handleStatusAction}
        statusLoading={statusLoading}
        onFinishJob={handleFinishJob}
      />

      <div className="p-4 space-y-4">
        <CustomerContactCard job={job} />
        <PickupDetailsCard   job={job} />
        <CustomerPhotoGallery photos={job.customerPhotos ?? []} />

        {isWorkItem && job.status !== 'completed' && (
          <WorkItemPhotos job={job} onUploaded={() => loadJob({ quiet: true })} />
        )}
        {isWorkItem && job.status === 'completed' && (
          <JobInvoice job={job} />
        )}

        {showCrewPhotos && (
          <CrewPhotoCapture
            bookingId={bookingId}
            onPhotoCountChange={setLocalPhotoCounts}
          />
        )}

        {showCompletionForm && (
          <CompletionForm
            bookingId={bookingId}
            approvedQuoteCents={null} // approved quote not in dispatch DTO for security
            crewBeforePhotoCount={crewBeforePhotoCount}
            crewAfterPhotoCount={crewAfterPhotoCount}
            onReview={handleReview}
          />
        )}

        {!isWorkItem && job.status !== 'completed' && (
          <button
            onClick={() => setShowIssue(true)}
            className="w-full py-4 rounded-xl border-2 border-amber-400 text-amber-700 font-semibold text-base hover:bg-amber-50 transition-colors"
          >
            Report an Issue
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-4 right-4 mx-auto max-w-sm rounded-xl px-4 py-3 text-white text-sm font-semibold shadow-lg z-50 text-center
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-700'}`}>
          {toast.message}
        </div>
      )}

      {showIssue && (
        <IssueReportSheet
          bookingId={bookingId}
          onClose={() => setShowIssue(false)}
          onSuccess={() => showToast('Issue reported')}
        />
      )}
    </div>
  );
}
