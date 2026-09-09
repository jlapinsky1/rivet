import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, MapPin, TrendingUp, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getSettings } from '../../utils/storage';
import EstimateJobSheet from './EstimateJobSheet';

function mapRow(row) {
  return {
    id: row.id,
    title: row.title || '',
    customerName: row.customer_name || '',
    customerSub: row.customer_sub,
    location: row.location || '',
    travel: row.travel || '',
    profit: row.profit || 0,
    hours: row.hours || '',
    hoursNum: row.hours_num || 0,
    rate: row.rate || '',
    rateNum: row.rate_num || 0,
    recommendation: row.recommendation || 'review',
    confidence: row.confidence || 0,
    description: row.description || '',
    price: row.price || 0,
    costs: row.costs || 0,
    costBreakdown: row.cost_breakdown || [],
    reasons: row.reasons || [],
    photos: row.photos || [],
    opStatus: row.op_status || 'needs_review',
    billingStatus: row.billing_status,
    preferredDate: row.preferred_date,
    phone: row.phone,
    email: row.email,
    address: row.address,
    customerNotes: row.customer_notes,
    serviceType: row.service_type || '',
    estimationRunId: row.estimation_run_id,
    createdAt: row.created_at,
    source: row.source,
    companyName: row.company_name,
    propertyName: row.property_name,
  };
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TABS = [
  { key: 'queue', label: 'Queue' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'passed', label: 'Passed' },
];

export default function EstimatesView({ user, safeTop }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('queue');
  const [selectedItem, setSelectedItem] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState(null);

  const settings = getSettings();
  const weeklyGoal = settings?.weeklyGoal || 2500;

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const userId = user.id;
      if (!userId) throw new Error('No user ID');

      const { data: mem } = await supabase
        .from('business_memberships')
        .select('business_id')
        .eq('user_id', userId)
        .limit(1)
        .single();

      if (!mem) throw new Error('No business found');

      const { data, error: fetchErr } = await supabase
        .from('work_items')
        .select('*')
        .eq('business_id', mem.business_id)
        .order('created_at', { ascending: false });

      if (fetchErr) throw new Error(fetchErr.message);
      setItems((data || []).map(mapRow));
    } catch (err) {
      setError(err.message || 'Failed to load estimates');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = () => { setRefreshing(true); loadData(); };

  // Categorize
  const queueItems = items.filter(w => w.opStatus === 'needs_review');
  const acceptedItems = items.filter(w => ['approved', 'quoted', 'scheduled'].includes(w.opStatus));
  const passedItems = items.filter(w => w.opStatus === 'declined');
  const completedItems = items.filter(w => w.opStatus === 'completed');

  const tabItems = activeTab === 'queue' ? queueItems
    : activeTab === 'accepted' ? acceptedItems : passedItems;
  const tabCounts = { queue: queueItems.length, accepted: acceptedItems.length, passed: passedItems.length };

  // Weekly progress (profit-based, matching admin dashboard)
  const earnedThisWeek = completedItems.reduce((s, w) => s + w.profit, 0)
    + acceptedItems.reduce((s, w) => s + w.profit, 0);
  const progressPct = weeklyGoal > 0 ? Math.min(100, Math.round(earnedThisWeek / weeklyGoal * 100)) : 0;
  const pendingValue = queueItems.reduce((s, w) => s + w.price, 0);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  const displayName = (user.email?.split('@')[0] || '').replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  function showToast(message, type = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleAction(item, action) {
    const newStatus = action === 'accept' ? 'approved' : 'declined';
    try {
      await supabase.from('work_items').update({ op_status: newStatus }).eq('id', item.id);

      if (item.estimationRunId) {
        const { saveOwnerDecision } = await import('../../estimator/persistence');
        const now = new Date();
        const pending = items.filter(w => w.opStatus === 'needs_review' && w.id !== item.id);
        const completed = items.filter(w => w.opStatus === 'completed');
        const accepted = items.filter(w => ['approved', 'quoted', 'scheduled'].includes(w.opStatus));
        const earned = completed.reduce((s, w) => s + w.profit, 0) + accepted.reduce((s, w) => s + w.profit, 0);

        await saveOwnerDecision({
          id: crypto.randomUUID(),
          estimationRunId: item.estimationRunId,
          businessId: 'default',
          userId: user.id || 'owner',
          rivetRecommendation: item.recommendation,
          ownerAction: action === 'accept' ? 'approved' : 'declined',
          rivetPrice: item.price,
          ownerPrice: action === 'accept' ? item.price : null,
          quotedPrice: action === 'accept' ? item.price : null,
          decisionSnapshot: {
            dayOfWeek: now.getDay(),
            weekNumber: Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)),
            hourOfDay: now.getHours(),
            remainingCapacityHours: 35,
            hoursWorkedThisWeek: 0,
            jobsCompletedThisWeek: completed.length,
            weeklyEarningsToDate: earned,
            weeklyEarningsGoal: weeklyGoal,
            gapToWeeklyGoal: Math.max(0, weeklyGoal - earned),
            requiredContributionPerCapacityHour: 0,
            queueDepth: pending.length,
            queueTotalValue: pending.reduce((s, w) => s + w.price, 0),
            queueTotalHours: pending.reduce((s, w) => s + w.hoursNum, 0),
          },
          decidedAt: now.toISOString(),
        }).catch(err => console.error('Failed to record decision:', err));
      }

      showToast(action === 'accept' ? 'Job accepted' : 'Job passed');
      setSelectedItem(null);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Action failed', 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin w-7 h-7 border-[3px] border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      {/* ── Dark header ── */}
      <div className="bg-slate-900 flex-shrink-0" style={safeTop}>
        <div className="px-5 pt-3 pb-5">
          <div className="flex items-start justify-between">
            <p className="text-blue-400 text-[11px] font-semibold tracking-widest">{dateStr}</p>
            <span className="text-gray-500 text-[11px] flex items-center gap-1">
              <span className="text-amber-400">&#10024;</span> AI reviewed
            </span>
          </div>
          <h1 className="text-white text-2xl font-bold mt-1">
            {greeting}{displayName ? `, ${displayName}` : ''}
          </h1>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="px-5 pt-4 pb-6">

          {/* Revenue target */}
          <div className="bg-white rounded-2xl px-4 py-4 shadow-sm">
            <div className="flex items-baseline justify-between mb-2.5">
              <span className="text-gray-500 text-[13px] font-medium">Weekly revenue target</span>
              <span className="text-sm font-bold text-slate-800">
                ${earnedThisWeek.toLocaleString()} <span className="text-gray-400 font-normal">/ ${weeklyGoal.toLocaleString()}</span>
              </span>
            </div>
            <div className="h-[6px] bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center gap-5 mt-3">
              <span className="text-[13px] text-gray-500">
                <span className="inline-block w-[6px] h-[6px] rounded-full bg-blue-500 mr-1.5 relative top-[-1px]" />
                <strong className="text-slate-800">{queueItems.length}</strong> in queue
              </span>
              <span className="text-[13px] text-gray-500">
                <TrendingUp className="inline w-3.5 h-3.5 mr-1 text-emerald-500 relative top-[-1px]" />
                <strong className="text-slate-800">${pendingValue.toLocaleString()}</strong> pending
              </span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center mt-4">
              <p className="text-red-700 font-medium text-sm mb-2">{error}</p>
              <button onClick={handleRefresh} className="text-sm text-blue-600 font-semibold">Try again</button>
            </div>
          )}

          {/* Section header */}
          <div className="flex items-center justify-between mt-6 mb-1">
            <h2 className="text-[17px] font-bold text-slate-900">Your jobs</h2>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-[13px] text-gray-400 mb-4">Make the call that's right for your week.</p>

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-all duration-150 ${
                  activeTab === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-gray-400'
                }`}
              >
                {tab.label}
                {tabCounts[tab.key] > 0 && (
                  <span className={`ml-1 ${activeTab === tab.key ? 'text-blue-500' : 'text-gray-400'}`}>
                    {tabCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Job list */}
          {tabItems.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-gray-300 text-sm">
                {activeTab === 'queue' ? 'No estimates in queue' : activeTab === 'accepted' ? 'No accepted jobs' : 'No passed jobs'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tabItems.map(item => {
                const margin = item.price > 0 ? Math.round(item.profit / item.price * 100) : 0;

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="w-full text-left bg-white rounded-2xl shadow-sm overflow-hidden active:scale-[0.98] transition-transform duration-100"
                  >
                    <div className="h-[3px] bg-blue-500 rounded-t-2xl" />
                    <div className="px-4 py-3.5">
                      {/* Row 1: title + price */}
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-[15px] font-semibold text-slate-900 leading-snug">{item.title}</h3>
                        <span className="text-[17px] font-bold text-slate-900 flex-shrink-0">
                          ${item.price.toLocaleString()}
                        </span>
                      </div>

                      {/* Row 2: customer + time */}
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[13px] text-gray-400">{item.customerName}</span>
                        <span className="text-[12px] text-gray-400">{timeAgo(item.createdAt)}</span>
                      </div>

                      {/* Row 3: metrics — compact single line */}
                      <div className="flex items-center gap-3 mt-2.5 text-[12px]">
                        <span className="text-emerald-600 font-semibold">{margin}% margin</span>
                        {item.travel && (
                          <span className="text-gray-400">{item.travel}</span>
                        )}
                        <span className="text-gray-400">{item.hours}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail sheet */}
      {selectedItem && (
        <EstimateJobSheet
          item={selectedItem}
          weeklyGoal={weeklyGoal}
          earnedThisWeek={earnedThisWeek}
          onClose={() => setSelectedItem(null)}
          onAction={handleAction}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 left-5 right-5 mx-auto max-w-sm rounded-xl px-4 py-3 text-white text-sm font-semibold shadow-lg z-[60] text-center
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}
