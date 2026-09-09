import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, MapPin, TrendingUp, Clock, ChevronRight } from 'lucide-react';
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

function getJobTags(item) {
  const tags = [];
  const margin = item.price > 0 ? item.profit / item.price : 0;
  if (margin >= 0.45) tags.push({ label: 'High margin', color: 'green' });
  else if (margin < 0.25) tags.push({ label: 'Thin margin', color: 'amber' });
  if (item.hoursNum > 0 && item.hoursNum <= 3) tags.push({ label: 'Quick job', color: 'blue' });
  if (item.hoursNum > 0 && item.hoursNum <= 6) tags.push({ label: 'Fits schedule', color: 'green' });
  if (item.confidence < 60) tags.push({ label: 'Low confidence', color: 'amber' });
  if (item.recommendation === 'take') tags.push({ label: 'Recommended', color: 'green' });
  return tags.slice(0, 3);
}

const TAG_STYLES = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
};

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

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Categorize items
  const queueItems = items.filter(w => w.opStatus === 'needs_review');
  const acceptedItems = items.filter(w => ['approved', 'quoted', 'scheduled'].includes(w.opStatus));
  const passedItems = items.filter(w => w.opStatus === 'declined');
  const completedItems = items.filter(w => w.opStatus === 'completed');

  const tabItems = activeTab === 'queue' ? queueItems
    : activeTab === 'accepted' ? acceptedItems
    : passedItems;

  const tabCounts = { queue: queueItems.length, accepted: acceptedItems.length, passed: passedItems.length };

  // Weekly progress
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
      await supabase
        .from('work_items')
        .update({ op_status: newStatus })
        .eq('id', item.id);

      // Record owner decision if we have an estimation run
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
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <>
      {/* Dark header */}
      <div className="bg-slate-900 px-5 pt-2 pb-5 flex-shrink-0" style={safeTop}>
        <div className="flex items-start justify-between mb-1">
          <p className="text-blue-400 text-[11px] font-bold tracking-widest">{dateStr}</p>
          <span className="text-gray-400 text-[11px] flex items-center gap-1">
            <span className="text-amber-400 text-sm">&#10024;</span> AI reviewed
          </span>
        </div>
        <h1 className="text-white text-[22px] font-bold leading-tight">
          {greeting}{displayName ? `, ${displayName}` : ''}
        </h1>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-gray-50" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">

          {/* Revenue target card */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Weekly revenue target</span>
              <span className="text-slate-900 text-sm font-bold">
                ${earnedThisWeek.toLocaleString()} / ${weeklyGoal.toLocaleString()}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center gap-4 mt-3">
              <span className="text-sm text-slate-700">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />
                <strong>{queueItems.length}</strong> in queue
              </span>
              <span className="text-sm text-slate-700">
                <TrendingUp className="inline w-3.5 h-3.5 mr-1 text-emerald-500" />
                <strong>${pendingValue.toLocaleString()}</strong> pending
              </span>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
              <p className="text-red-700 font-medium text-sm mb-2">{error}</p>
              <button onClick={handleRefresh} className="text-sm text-blue-600 font-semibold">Try again</button>
            </div>
          )}

          {/* Your jobs heading */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Your jobs</h2>
              <p className="text-gray-400 text-sm">Make the call that's right for your week.</p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 active:bg-gray-100 disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  activeTab === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                {tab.label}
                {tabCounts[tab.key] > 0 && (
                  <span className={`ml-1.5 text-xs ${activeTab === tab.key ? 'text-blue-500' : 'text-gray-400'}`}>
                    {tabCounts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Job cards */}
          {tabItems.length === 0 ? (
            <div className="py-12 text-center">
              <div className="text-gray-300 text-4xl mb-3">
                {activeTab === 'queue' ? '\uD83D\uDCCB' : activeTab === 'accepted' ? '\u2705' : '\u274C'}
              </div>
              <p className="text-gray-400 text-sm font-medium">
                {activeTab === 'queue' ? 'No estimates in queue' : activeTab === 'accepted' ? 'No accepted jobs yet' : 'No passed jobs'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tabItems.map(item => {
                const margin = item.price > 0 ? Math.round(item.profit / item.price * 100) : 0;
                const targetPct = weeklyGoal > 0 ? Math.round(item.profit / weeklyGoal * 100) : 0;
                const tags = getJobTags(item);

                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden active:scale-[0.98] transition-transform duration-100"
                  >
                    {/* Blue accent bar */}
                    <div className="h-1 bg-blue-500" />

                    <div className="p-4">
                      {/* Title row */}
                      <div className="flex items-start justify-between mb-1">
                        <div className="min-w-0 flex-1 mr-3">
                          <h3 className="text-base font-bold text-slate-900 truncate">{item.title}</h3>
                          <p className="text-sm text-gray-500 truncate">{item.customerName}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-bold text-slate-900">${item.price.toLocaleString()}</p>
                          <p className="text-xs text-gray-400">{timeAgo(item.createdAt)}</p>
                        </div>
                      </div>

                      {/* Address */}
                      {item.address && (
                        <p className="text-sm text-gray-500 mt-2 flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
                          <span className="truncate">{item.address}</span>
                        </p>
                      )}

                      {/* Metrics row */}
                      <div className="flex items-center gap-3 mt-3 text-sm">
                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" />
                          {margin}% margin
                        </span>
                        {item.travel && (
                          <span className="text-gray-500 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {item.travel}
                          </span>
                        )}
                        {targetPct > 0 && (
                          <span className="text-gray-500 font-medium">
                            Target {targetPct}%
                          </span>
                        )}
                      </div>

                      {/* Tags */}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {tags.map(tag => (
                            <span
                              key={tag.label}
                              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${TAG_STYLES[tag.color]}`}
                            >
                              {tag.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Bottom spacer for safe area */}
          <div className="h-4" />
        </div>
      </div>

      {/* Job detail sheet */}
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
        <div className={`fixed bottom-24 left-4 right-4 mx-auto max-w-sm rounded-xl px-4 py-3 text-white text-sm font-semibold shadow-lg z-[60] text-center
          ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.message}
        </div>
      )}
    </>
  );
}
