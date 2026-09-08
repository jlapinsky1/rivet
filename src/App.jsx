import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import QuoteForm from './pages/QuoteForm';
import QuoteHistory from './pages/QuoteHistory';
import Settings from './pages/Settings';
import RequestQueue from './pages/RequestQueue';
import Dashboard from './pages/Dashboard';
import LearningDashboard from './pages/LearningDashboard';

import AdminLogin from './pages/AdminLogin';

const RivetApp = lazy(() => import('./admin/RivetApp'));
const MarketingApp = lazy(() => import('./marketing/MarketingApp'));
const MarketingPricing = lazy(() => import('./marketing/PricingPage'));
const HostedQuoteForm = lazy(() => import('./pages/HostedQuoteForm'));
import PortalStart from './pages/PortalStart';
import CommercialAdminPage from './pages/CommercialAdminPage';
import ServiceAreaAdmin from './pages/ServiceAreaAdmin';
import ClientLogin from './pages/ClientLogin';
import ClientPortal from './pages/ClientPortal';
import DispatchPage from './pages/DispatchPage';
import { getSettings } from './utils/storage';
import { getRepo } from './utils/repository';

const ApprovedQuote = lazy(() => import('./pages/ApprovedQuote'));
const FinalPaymentPage = lazy(() => import('./pages/FinalPaymentPage'));
const CommercialQuotePage = lazy(() => import('./pages/CommercialQuotePage'));

function AdminDashboard() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settings, setSettings] = useState(getSettings);
  const [duplicateData, setDuplicateData] = useState(null);

  useEffect(() => {
    let unsub;
    (async () => {
      const repo = await getRepo();
      const session = await repo.getSession();
      setUser(session || null);

      if (repo.onAuthStateChange) {
        const { data } = repo.onAuthStateChange((u) => setUser(u || null));
        unsub = data?.subscription;
      }
    })();
    return () => unsub?.unsubscribe?.();
  }, []);

  async function handleSignOut() {
    const repo = await getRepo();
    await repo.signOut();
    setUser(null);
  }

  function handleDuplicate(formData) {
    setDuplicateData(formData);
    setActiveTab('quote');
  }

  useEffect(() => {
    if (duplicateData && activeTab === 'quote') {
      const timer = setTimeout(() => setDuplicateData(null), 100);
      return () => clearTimeout(timer);
    }
  }, [duplicateData, activeTab]);

  // Loading state
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return <AdminLogin onLogin={() => getRepo().then(r => r.getSession()).then(s => setUser(s))} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} onSignOut={handleSignOut} />
      <main className={`mx-auto px-4 py-4 ${
        ['dashboard', 'learning'].includes(activeTab) ? 'max-w-5xl' : 'max-w-lg'
      }`}>
        {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
        {activeTab === 'requests' && <RequestQueue />}
        {activeTab === 'quote' && (
          <QuoteForm
            key={duplicateData ? Date.now() : 'form'}
            settings={settings}
            initialData={duplicateData}
          />
        )}
        {activeTab === 'history' && (
          <QuoteHistory onDuplicate={handleDuplicate} />
        )}
        {activeTab === 'learning' && <LearningDashboard />}
        {activeTab === 'service-area' && <ServiceAreaAdmin />}
        {activeTab === 'settings' && (
          <Settings settings={settings} onSettingsChange={setSettings} />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-100 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" /></div>}>
    <Routes>
      {/* Rivet platform routes */}
      <Route path="/" element={<MarketingApp />} />
      <Route path="/pricing" element={<MarketingPricing />} />
      <Route path="/login" element={<RivetApp />} />
      <Route path="/signup" element={<RivetApp />} />
      <Route path="/admin" element={<RivetApp />} />

      {/* Legacy admin */}
      <Route path="/admin/legacy" element={<Navigate to="/admin/legacy/commercial" replace />} />
      <Route path="/admin/legacy/settings" element={<AdminDashboard />} />
      <Route path="/admin/legacy/commercial" element={<CommercialAdminPage />} />

      {/* Hosted quote request form (tenant-facing) */}
      <Route path="/request/:slug" element={<HostedQuoteForm />} />

      {/* Shared functional routes (quote viewing, payments, dispatch) */}
      <Route path="/quote/:id" element={<ApprovedQuote />} />
      <Route path="/invoice/:token/final" element={<FinalPaymentPage />} />
      <Route path="/dispatch" element={<DispatchPage />} />

      {/* Commercial portal */}
      <Route path="/portal/start" element={<PortalStart />} />
      <Route path="/portal/login" element={<ClientLogin />} />
      <Route path="/portal" element={<ClientPortal />} />
      <Route path="/commercial/quote/:token" element={<CommercialQuotePage />} />
    </Routes>
    </Suspense>
  );
}
