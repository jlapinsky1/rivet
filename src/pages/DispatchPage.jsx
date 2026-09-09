import React, { useState, useEffect } from 'react';
import { RefreshCw, Truck, LogOut, ClipboardList } from 'lucide-react';
import { getRepo } from '../utils/repository';
import AdminLogin from './AdminLogin';
import ConnectionStatus from '../components/dispatch/ConnectionStatus';
import NextJobCard from '../components/dispatch/NextJobCard';
import TodayJobsList from '../components/dispatch/TodayJobsList';
import DispatchJobDetail from '../components/dispatch/DispatchJobDetail';
import EstimatesView from '../components/dispatch/EstimatesView';

// Use 100dvh (dynamic viewport height) instead of position:fixed + inset:0.
// iOS Safari's position:fixed breaks after keyboard interactions; dvh adapts
// correctly to the visual viewport including keyboard and toolbar changes.
const appShell = {
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',          // modern iOS/Android — adapts to keyboard & toolbar
  maxHeight: '-webkit-fill-available', // Safari <15.4 fallback
  overflow: 'hidden',
  background: '#f3f4f6',
  position: 'relative',
};
const safeTop    = { paddingTop:    'env(safe-area-inset-top)' };
const safeBottom = { paddingBottom: 'env(safe-area-inset-bottom)' };

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );
}

export default function DispatchPage() {
  const [user, setUser]             = useState(undefined); // undefined = loading
  const [jobs, setJobs]             = useState([]);
  const [nextJobId, setNextJobId]   = useState(null);
  const [todayDate, setTodayDate]   = useState(null);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError]   = useState(null);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [toast, setToast]           = useState(null);
  const [isOffline, setIsOffline]   = useState(!navigator.onLine);
  const [view, setView]             = useState('estimates'); // 'jobs' | 'estimates'

  // Prevent background scrolling — keep it simple, just lock overflow
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline  = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  // Auth: mirrors AdminDashboard pattern
  useEffect(() => {
    let unsub;
    (async () => {
      const repo = await getRepo();
      const session = await repo.getSession();
      setUser(session || null);

      if (repo.onAuthStateChange) {
        const { data } = repo.onAuthStateChange(u => setUser(u || null));
        unsub = data?.subscription;
      }
    })();
    return () => unsub?.unsubscribe?.();
  }, []);

  // Load today's jobs when user is authenticated and on Jobs tab
  useEffect(() => {
    if (user && view === 'jobs') loadJobs();
  }, [user, view]);

  async function loadJobs() {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const repo = await getRepo();
      const data = await repo.getDispatchJobsToday();
      setJobs(data.jobs ?? []);
      setNextJobId(data.nextJobId ?? null);
      setTodayDate(data.date ?? null);
    } catch (err) {
      setJobsError(err.message || 'Failed to load jobs');
    } finally {
      setJobsLoading(false);
    }
  }

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleStatusAction(jobId, currentStatus) {
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
      await repo.updateDispatchStatus(jobId, targetStatus, `${jobId}-${targetStatus}`);
      await loadJobs();
      showToast(`Status updated: ${targetStatus.replace('_', ' ')}`);
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleSignOut() {
    const repo = await getRepo();
    await repo.signOut();
    setUser(null);
  }

  // ── Auth states ──────────────────────────────────────────────────────────
  if (user === undefined) return <LoadingSpinner />;

  if (!user) {
    return (
      <AdminLogin
        onLogin={async () => {
          const repo = await getRepo();
          const session = await repo.getSession();
          setUser(session);
        }}
      />
    );
  }

  // ── Shared bottom nav ─────────────────────────────────────────────────────
  const BottomNav = ({ onJobs, activeView }) => (
    <div
      className="bg-white border-t border-gray-200 flex-shrink-0 flex"
      style={safeBottom}
    >
      <button
        onClick={onJobs}
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 ${activeView === 'jobs' ? 'text-blue-600' : 'text-gray-400'}`}
      >
        <Truck className="w-6 h-6" />
        <span className="text-[10px] font-semibold tracking-wide">Jobs</span>
      </button>
      <button
        onClick={() => { setSelectedJobId(null); setView('estimates'); }}
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 ${activeView === 'estimates' ? 'text-blue-600' : 'text-gray-400'}`}
      >
        <ClipboardList className="w-6 h-6" />
        <span className="text-[10px] font-semibold tracking-wide">Estimates</span>
      </button>
      <button
        onClick={handleSignOut}
        className="flex-1 flex flex-col items-center justify-center gap-1 py-2 text-gray-400"
      >
        <LogOut className="w-6 h-6" />
        <span className="text-[10px] font-semibold tracking-wide">Sign Out</span>
      </button>
    </div>
  );

  // ── Estimates view ───────────────────────────────────────────────────────
  if (view === 'estimates') {
    return (
      <div style={appShell}>
        <ConnectionStatus />
        <EstimatesView user={user} safeTop={safeTop} />
        <BottomNav onJobs={() => setView('jobs')} activeView="estimates" />
      </div>
    );
  }

  // ── Job detail view ──────────────────────────────────────────────────────
  if (selectedJobId) {
    const goBack = () => { setSelectedJobId(null); loadJobs(); };
    return (
      <div style={appShell}>
        <ConnectionStatus />
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <DispatchJobDetail
            bookingId={selectedJobId}
            onBack={goBack}
            onJobCompleted={loadJobs}
          />
        </div>
        <BottomNav onJobs={goBack} activeView="jobs" />
      </div>
    );
  }

  // ── Home / today's schedule ──────────────────────────────────────────────
  const nextJob = nextJobId ? jobs.find(j => j.id === nextJobId) : null;

  return (
    <div style={appShell}>
      <ConnectionStatus />

      {/* Top nav bar */}
      <div className="bg-gray-900 text-white flex-shrink-0" style={safeTop}>
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <div className="w-10" />
          <div className="text-center">
            <h1 className="text-base font-bold tracking-tight">Rivet</h1>
            {todayDate && (
              <p className="text-[11px] text-gray-400 leading-none mt-0.5">
                {new Date(todayDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>
          <button
            onClick={loadJobs}
            disabled={jobsLoading}
            className="w-10 h-10 flex items-center justify-center text-gray-400 disabled:opacity-40"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${jobsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isOffline && (
        <div className="bg-yellow-400 text-yellow-900 text-xs font-semibold text-center py-2 px-4 flex-shrink-0">
          You're offline — showing cached jobs
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
          {jobsError ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
              <p className="text-red-700 font-medium mb-3">{jobsError}</p>
              <button onClick={loadJobs} className="text-sm text-blue-600 font-semibold">Try again</button>
            </div>
          ) : (
            <>
              <NextJobCard
                job={nextJob}
                onStatusAction={handleStatusAction}
                onSelectJob={setSelectedJobId}
                statusLoading={statusLoading}
              />
              <TodayJobsList
                jobs={jobs}
                nextJobId={nextJobId}
                onSelectJob={setSelectedJobId}
              />
            </>
          )}
        </div>
      </div>

      {/* Bottom tab bar */}
      <BottomNav onJobs={() => setView('jobs')} activeView="jobs" />

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-4 right-4 mx-auto max-w-sm rounded-xl px-4 py-3 text-white text-sm font-semibold shadow-lg z-50 text-center
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-700'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
