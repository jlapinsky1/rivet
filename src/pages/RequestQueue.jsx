import React, { useState, useEffect } from 'react';
import CompletedTab from '../components/admin/completed/CompletedTab';
import CompletedDetail from '../components/admin/completed/CompletedDetail';
import { STATUS_LABELS, STATUS_COLORS } from '../utils/bookings';
import { getSettings } from '../utils/storage';
import { buildEstimate } from '../utils/estimateBuilder';
import { detectRiskFlags, checkPriceFlags, calculateConfidence, hasBlockers, SEVERITY_COLORS } from '../utils/riskFlags';
import { rateJob, RATING_COLORS, RATING_LABELS, CONFIDENCE_COLORS } from '../utils/jobRating';
import { createQuoteSnapshot, createPriceOverrideAudit, CUSTOMER_TERMS } from '../utils/quoteSnapshot';
import { calculateActuals, emptyActuals } from '../utils/completion';
import { validateCompletionData } from '../utils/validation';
import { getRepo } from '../utils/repository';
import { supabase } from '../utils/supabaseClient';
import { evaluateDecision, DECISION_COLORS, DECISION_LABELS } from '../utils/decisionEngine';
import { calculateGoalProgress, getTodayProgress, calculateDynamicTargets } from '../utils/goalEngine';
import { PACE_STATUS_COLORS, PACE_STATUS_LABELS } from '../utils/goalDefaults';

const TIME_PREF_LABELS = {
  morning: 'Morning (8am-12pm)',
  afternoon: 'Afternoon (12pm-4pm)',
  flexible: 'Flexible',
};

const STAIRS_LABELS = {
  none: 'No stairs',
  few: 'A few steps',
  one_flight: 'One flight',
  multiple: 'Multiple flights',
};

// ── Request list ────────────────────────────────────────────

export default function RequestQueue() {
  const [bookings, setBookings] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');

  async function loadBookings() {
    const repo = await getRepo();
    const data = await repo.getBookings();
    setBookings(data);
  }

  useEffect(() => { loadBookings(); }, []);

  function refresh() { loadBookings(); }

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);

  // Route completed bookings to the dedicated support view
  if (selected) {
    if (selected.status === 'completed') {
      return <CompletedDetail bookingId={selected.id} onBack={() => { setSelected(null); refresh(); }} />;
    }
    return <RequestDetail booking={selected} onBack={() => { setSelected(null); refresh(); }} />;
  }

  // Completed filter gets the full-featured support tab
  if (filter === 'completed') {
    return <CompletedTab onBack={() => setFilter('all')} />;
  }

  const pendingCount = bookings.filter(b => b.status === 'pending_review').length;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">
          Customer Requests
          {pendingCount > 0 && (
            <span className="ml-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingCount} new</span>
          )}
        </h2>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {['all', 'pending_review', 'quote_sent', 'scheduled', 'completed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {f === 'all' ? 'All' : STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">No requests</p>
          <p className="text-sm mt-1">Customer submissions will appear here</p>
        </div>
      )}

      {filtered.map(booking => (
        <button
          key={booking.id}
          onClick={() => setSelected(booking)}
          className="w-full text-left bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-800">{booking.customerName || 'No name'}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[booking.status]}`}>
                  {STATUS_LABELS[booking.status]}
                </span>
              </div>
              <div className="text-sm text-gray-600 mt-1 truncate">{booking.fullAddress || 'No address'}</div>
              <div className="text-xs text-gray-400 mt-1 flex items-center gap-3">
                <span>{booking.quantity}</span>
                <span>{booking.photoCount} photos</span>
                <span>{new Date(booking.createdAt).toLocaleDateString()}</span>
              </div>
              {booking.approvedQuote && (
                <div className="text-sm font-bold text-green-700 mt-1">${booking.approvedQuote}</div>
              )}
            </div>
            <svg className="w-5 h-5 text-gray-300 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Request detail ──────────────────────────────────────────

function RequestDetail({ booking, onBack }) {
  const [data, setData] = useState(booking);
  const [quotePrice, setQuotePrice] = useState(booking.approvedQuote || '');
  const [expiresIn, setExpiresIn] = useState(7);
  const [slots, setSlots] = useState(booking.availableSlots?.join('\n') || '');
  const [internalNotes, setInternalNotes] = useState(booking.internalNotes || '');
  const [lastQuoteToken, setLastQuoteToken] = useState(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [photoUrls, setPhotoUrls] = useState(null);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [blockerOverrides, setBlockerOverrides] = useState({});
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionData, setCompletionData] = useState(data.actuals || emptyActuals());
  const [completionErrors, setCompletionErrors] = useState(null);
  const [goalProgress, setGoalProgress] = useState(null);
  const [goal, setGoal] = useState(null);
  const [dynamicTargets, setDynamicTargets] = useState(null);
  const [scheduleCtx, setScheduleCtx] = useState(null);
  const [showDecisionRules, setShowDecisionRules] = useState(false);

  // Stripe payment summary
  const [paymentSummary, setPaymentSummary] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // New job completion form (for scheduled/in_progress bookings)
  const [showJobCompletion, setShowJobCompletion] = useState(false);
  const [jobCompletionForm, setJobCompletionForm] = useState({
    technicianName: '',
    itemsRemoved: '',
    volumeEstimate: '',
    completionNotes: '',
    disposalNotes: '',
    finalAmountDollars: booking.approvedQuote ? String(booking.approvedQuote) : '',
    priceAdjustmentReason: '',
    completedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16),
  });
  const [afterPhotos, setAfterPhotos] = useState([]); // [{ storagePath, fileName }]
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [jobCompletionSubmitting, setJobCompletionSubmitting] = useState(false);
  const [jobCompletionError, setJobCompletionError] = useState(null);

  const settings = getSettings();
  const estimate = buildEstimate(data, settings);
  const riskFlags = detectRiskFlags(data, estimate);
  const confidence = calculateConfidence(data, riskFlags);
  const rating = rateJob(estimate, confidence);

  // Load goal context + dynamic targets for decision engine
  useEffect(() => {
    (async () => {
      try {
        const repo = await getRepo();
        const activeGoal = await repo.getActiveGoal('cash_profit');
        if (activeGoal) {
          setGoal(activeGoal);
          const [completed, scheduled, pipeline] = await Promise.all([
            repo.getCompletedBookingsInRange(activeGoal.start_date, activeGoal.end_date),
            repo.getActiveBookingsByStatus(['scheduled']),
            repo.getActiveBookingsByStatus(['pending_review', 'quote_sent']),
          ]);
          const prog = calculateGoalProgress(activeGoal, completed, scheduled, pipeline);
          setGoalProgress(prog);

          // Build today's progress for dynamic targets
          const todayStr = new Date().toISOString().slice(0, 10);
          const todayBookings = [...completed, ...scheduled].filter(b => {
            if (b.status === 'completed' && b.completed_at) return b.completed_at.slice(0, 10) === todayStr;
            return false;
          });
          let scheduledToday = [];
          try {
            const todaySlots = await repo.getScheduledBookingsForDateRange(todayStr, todayStr);
            scheduledToday = todaySlots.filter(s => s.bookings).map(s => ({ ...s.bookings, status: 'scheduled' }));
          } catch { /* table may not exist */ }
          const allToday = [...todayBookings, ...scheduledToday];
          const todayProg = getTodayProgress(activeGoal, allToday, prog);
          const dt = calculateDynamicTargets(prog, todayProg, activeGoal);
          setDynamicTargets(dt);
          setScheduleCtx({ jobsToday: todayProg.capacityBooked, capacityLimit: todayProg.capacityLimit });
        }
      } catch { /* goal tables may not exist yet */ }
    })();
  }, []);

  // Load Stripe payment summary for bookings with approved quotes
  useEffect(() => {
    if (data.approvedQuote) {
      loadPaymentSummary();
    }
  }, []);

  // Trigger geocoding if travel time is unknown (existing bookings or new ones not yet geocoded)
  useEffect(() => {
    if (data.travelMinutes != null || data.geocodingStatus === 'success') return;
    (async () => {
      try {
        const res = await fetch('/api/geocode-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: data.id }),
        });
        if (res.ok) {
          const body = await res.json();
          if (body.skipped) {
            throw new Error(body.reason || 'geocode skipped');
          }
          if (body.travelMinutes != null) {
            setData(prev => ({
              ...prev,
              travelMinutes: body.travelMinutes,
              distanceMiles: body.distanceMiles,
              geocodingStatus: 'success',
            }));
            return;
          }
        }
      } catch {
        // Fall through to address-based geocode
      }

      const settings = getSettings();
      const shopAddress = settings.homeBaseAddress?.trim();
      const jobAddress = data.fullAddress;
      if (!jobAddress) return;

      try {
        if (shopAddress) {
          const { calculateDistance } = await import('../utils/distance');
          const result = await calculateDistance(shopAddress, jobAddress);
          if (result.success) {
            setData(prev => ({
              ...prev,
              travelMinutes: result.durationMinutes ?? Math.max(5, Math.round((result.miles / 30) * 60)),
              distanceMiles: result.miles,
              geocodingStatus: 'success',
            }));
            return;
          }
        }

        const res = await fetch('/api/geocode-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: jobAddress, shopAddress: shopAddress || undefined }),
        });
        if (res.ok) {
          const body = await res.json();
          if (body.travelMinutes != null) {
            setData(prev => ({
              ...prev,
              travelMinutes: body.travelMinutes,
              distanceMiles: body.distanceMiles,
              geocodingStatus: 'success',
            }));
          }
        }
      } catch {
        // Non-fatal - estimate will show default
      }
    })();
  }, []);

  // Lazy-load photos when the accordion is opened
  useEffect(() => {
    if (!showPhotos || photoUrls !== null) return;
    (async () => {
      setPhotosLoading(true);
      try {
        const repo = await getRepo();
        const urls = await repo.getPhotoUrls(data.id);
        setPhotoUrls(urls);
      } catch (e) {
        console.error('Failed to load photos:', e);
        setPhotoUrls([]);
      } finally {
        setPhotosLoading(false);
      }
    })();
  }, [showPhotos]);

  // Evaluate decision
  const decision = estimate ? evaluateDecision({
    estimate,
    confidence,
    jobRating: rating,
    riskFlags,
    blockerOverrides,
    goalProgress,
    goal,
    scheduleContext: scheduleCtx,
    dynamicTargets,
  }) : null;

  // Price-specific flags (recalculate when price changes)
  const priceFlags = quotePrice ? checkPriceFlags(quotePrice, estimate, settings) : [];
  const allApprovalFlags = [...riskFlags, ...priceFlags];
  const activeBlockers = allApprovalFlags.filter(f => f.severity === 'blocker' && !blockerOverrides[f.flag]);

  async function handleApprove() {
    if (!quotePrice) return;
    if (activeBlockers.length > 0) {
      alert('Resolve or override all blockers before approving.');
      return;
    }

    const repo = await getRepo();
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + expiresIn);
    const availableSlots = slots.split('\n').map(s => s.trim()).filter(Boolean);
    const approvedPrice = Number(quotePrice);

    // Create override audit if price differs from recommended
    let adminOverride = null;
    if (approvedPrice !== estimate.recommendedPrice) {
      adminOverride = createPriceOverrideAudit({
        bookingId: data.id,
        recommendedPrice: estimate.recommendedPrice,
        approvedPrice,
        reason: overrideReason,
      });
    }

    // Capture decision context at approval time
    const decisionContext = decision ? {
      recommendation: decision.recommendation,
      score: decision.score,
      headline: decision.headline,
      reasons: decision.reasons,
      suggestedMinPrice: decision.suggestedMinPrice,
      goalContext: decision.goalContext,
      scheduleContext: decision.scheduleContext,
      evaluatedAt: decision.evaluatedAt,
    } : null;

    try {
      const result = await repo.approveBooking(data.id, {
        approvedPrice,
        recommendedPrice: estimate.recommendedPrice,
        estimateSnapshot: estimate,
        settingsSnapshot: settings,
        availableSlots,
        expiresAt: expDate.toISOString(),
        customerTerms: CUSTOMER_TERMS,
        adminOverride,
        decisionContext,
      });

      if (internalNotes !== data.internalNotes) {
        await repo.updateBooking(data.id, { internal_notes: internalNotes });
      }

      if (Object.keys(blockerOverrides).length > 0) {
        await repo.updateBooking(data.id, { blocker_overrides: blockerOverrides });
      }

      if (result.quoteToken) setLastQuoteToken(result.quoteToken);
      const quoteUrl = result.quoteToken
        ? `${window.location.origin}/quote/${result.quoteToken}`
        : null;
      if (quoteUrl) alert(`Quote approved! Customer quote link: ${quoteUrl}`);
      onBack();
    } catch (err) {
      alert(`Approval failed: ${err.message}`);
    }
  }

  async function handleStatusChange(status) {
    const repo = await getRepo();
    await repo.updateBooking(data.id, { status });
    setData(prev => ({ ...prev, status }));
  }

  async function handleDecline() {
    if (!confirm('Decline this request and email the customer?')) return;

    try {
      const token = await getAdminToken();
      const res = await fetch('/api/decline-booking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bookingId: data.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to decline booking');

      if (body.emailSent) {
        alert('Request declined. The customer has been notified by email.');
      } else if (body.emailError) {
        alert(`Request declined, but the email could not be sent: ${body.emailError}`);
      } else {
        alert('Request declined.');
      }
      onBack();
    } catch (err) {
      alert(`Decline failed: ${err.message}`);
    }
  }

  const canDecline = ['pending_review', 'quote_sent', 'awaiting_deposit', 'awaiting_payment'].includes(data.status);

  async function handleDelete() {
    if (!confirm('Delete this request permanently?')) return;
    try {
      const repo = await getRepo();
      await repo.deleteBooking(data.id);
      onBack();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  async function handleSaveNotes() {
    const repo = await getRepo();
    await repo.updateBooking(data.id, { internal_notes: internalNotes });
    alert('Notes saved');
  }

  async function getAdminToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function loadPaymentSummary() {
    setPaymentLoading(true);
    try {
      const token = await getAdminToken();
      const res = await fetch(`/api/payment-summary?bookingId=${encodeURIComponent(data.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPaymentSummary(await res.json());
      }
    } catch {}
    setPaymentLoading(false);
  }

  async function handleAfterPhotoUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingPhotos(true);
    const token = await getAdminToken();
    const uploaded = [];

    for (const file of files) {
      try {
        const contentType = file.type || 'image/jpeg';
        const urlRes = await fetch('/api/get-completion-photo-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ bookingId: data.id, fileName: file.name, contentType }),
        });
        if (!urlRes.ok) {
          const err = await urlRes.json().catch(() => ({}));
          setJobCompletionError(`Photo upload failed: ${err.error || urlRes.status}`);
          continue;
        }
        const { signedUploadUrl, storagePath } = await urlRes.json();
        const uploadRes = await fetch(signedUploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: file,
        });
        if (uploadRes.ok) {
          uploaded.push({ storagePath, fileName: file.name });
        } else {
          setJobCompletionError(`Photo storage upload failed: ${uploadRes.status}`);
        }
      } catch (err) {
        setJobCompletionError(`Photo upload error: ${err.message}`);
      }
    }

    setAfterPhotos(prev => [...prev, ...uploaded]);
    setUploadingPhotos(false);
    // Reset file input so the same file can be re-selected after removal
    e.target.value = '';
  }

  async function handleCompleteJob() {
    setJobCompletionError(null);

    if (afterPhotos.length === 0) {
      setJobCompletionError('At least one after photo is required.');
      return;
    }
    if (!jobCompletionForm.completionNotes.trim()) {
      setJobCompletionError('Completion notes are required.');
      return;
    }
    if (!jobCompletionForm.itemsRemoved.trim()) {
      setJobCompletionError('Items removed description is required.');
      return;
    }
    if (!jobCompletionForm.technicianName.trim()) {
      setJobCompletionError('Technician name is required.');
      return;
    }

    const finalAmountCents = Math.round(Number(jobCompletionForm.finalAmountDollars) * 100);
    if (!finalAmountCents || finalAmountCents <= 0) {
      setJobCompletionError('Final amount must be a positive number.');
      return;
    }

    if (data.approvedQuote) {
      const approvedCents = Math.round(Number(data.approvedQuote) * 100);
      if (finalAmountCents !== approvedCents && !jobCompletionForm.priceAdjustmentReason.trim()) {
        setJobCompletionError('Price adjustment reason is required when the amount differs from the approved quote.');
        return;
      }
    }

    setJobCompletionSubmitting(true);
    try {
      const token = await getAdminToken();
      const res = await fetch('/api/complete-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bookingId: data.id,
          completedAt: new Date(jobCompletionForm.completedAt).toISOString(),
          technicianName: jobCompletionForm.technicianName.trim(),
          itemsRemoved: jobCompletionForm.itemsRemoved.trim(),
          volumeEstimate: jobCompletionForm.volumeEstimate.trim() || undefined,
          completionNotes: jobCompletionForm.completionNotes.trim(),
          disposalNotes: jobCompletionForm.disposalNotes.trim() || undefined,
          finalAmountCents,
          priceAdjustmentReason: jobCompletionForm.priceAdjustmentReason.trim() || undefined,
          afterPhotoStoragePaths: afterPhotos.map(p => p.storagePath),
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setJobCompletionError(result.error || 'Failed to complete job.');
        return;
      }

      setData(prev => ({ ...prev, status: 'completed' }));
      setShowJobCompletion(false);
      alert(
        result.finalPaymentLinkSent
          ? 'Job completed! Final payment link sent to customer.'
          : 'Job completed! Note: final payment link was not sent - check the email on file.'
      );
    } catch {
      setJobCompletionError('Network error. Please try again.');
    } finally {
      setJobCompletionSubmitting(false);
    }
  }

  async function handleComplete() {
    const errors = validateCompletionData(completionData);
    if (errors) {
      setCompletionErrors(errors);
      return;
    }
    const repo = await getRepo();
    await repo.completeBooking(data.id, completionData);
    setData(prev => ({ ...prev, status: 'completed', actuals: completionData }));
    setShowCompletion(false);
  }

  // Compute actuals comparison if completed
  const actualsResult = data.actuals ? calculateActuals(data.actuals, estimate) : null;

  return (
    <div className="space-y-4 pb-8">
      <button onClick={onBack} className="flex items-center gap-1 text-blue-600 text-sm font-medium">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to requests
      </button>

      {/* ── Decision engine recommendation ── */}
      {decision && (
        <div className={`rounded-xl border-2 p-4 space-y-2 ${DECISION_COLORS[decision.recommendation]}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold">{DECISION_LABELS[decision.recommendation]}</span>
              <span className="text-sm opacity-70">({decision.score}/100)</span>
            </div>
            <div className="flex items-center gap-2">
              {goalProgress && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${PACE_STATUS_COLORS[goalProgress.paceStatus]}`}>
                  {PACE_STATUS_LABELS[goalProgress.paceStatus]}
                </span>
              )}
            </div>
          </div>
          <div className="text-sm font-medium">{decision.headline}</div>
          {decision.explanation && (
            <div className="text-sm opacity-90 leading-relaxed mt-1">{decision.explanation}</div>
          )}
          {decision.suggestedMinPrice && (
            <div className="text-xs mt-1">
              Min acceptable price: <span className="font-semibold">${decision.suggestedMinPrice}</span>
              {decision.goalContribution?.dailyPct != null && (
                <span className="ml-3 opacity-70">Covers {decision.goalContribution.dailyPct}% of daily target</span>
              )}
            </div>
          )}
          <button onClick={() => setShowDecisionRules(!showDecisionRules)}
            className="text-xs underline opacity-60 hover:opacity-100">
            {showDecisionRules ? 'Hide details' : 'Why this recommendation?'}
          </button>
          {showDecisionRules && (
            <div className="space-y-1 pt-1 border-t border-current/10">
              {decision.ruleResults.map(r => (
                <div key={r.ruleId} className="flex justify-between text-xs">
                  <span className="opacity-70">{r.ruleName}</span>
                  <span className={`font-medium ${
                    r.result === 'fail' ? 'text-red-700'
                    : r.result === 'review' ? 'text-amber-700'
                    : r.result === 'skip' ? 'text-gray-400'
                    : ''
                  }`}>{r.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Decision summary card ── */}
      <div className={`rounded-xl border-2 p-4 space-y-3 ${RATING_COLORS[rating.rating]}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">${estimate.recommendedPrice}</div>
            <div className="text-xs">Recommended price</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold">{RATING_LABELS[rating.rating]}</div>
            <div className="text-xs">Job rating ({rating.score}/100)</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <Row label="Expected profit" value={`$${estimate.estimatedProfit}`} />
          <Row label="Expected margin" value={`${(estimate.estimatedMargin * 100).toFixed(0)}%`} />
          <Row label="Est. travel" value={`${estimate.estimatedTravelMinutes} min`} />
          <Row label="Est. on-site" value={`${estimate.estimatedOnSiteHours.toFixed(1)} hrs`} />
          <Row label="Truck volume" value={estimate.estimatedVolumePct !== null ? `${estimate.estimatedVolumePct}%` : 'Unknown'} />
          <div className="flex justify-between col-span-2">
            <span className="text-current opacity-70">Confidence</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_COLORS[confidence.level]}`}>
              {confidence.level.charAt(0).toUpperCase() + confidence.level.slice(1)} ({confidence.score}/100)
            </span>
          </div>
        </div>

        {estimate.weightRisk && (
          <div className="text-xs font-medium opacity-80">
            Weight risk: {estimate.weightRiskReason}
          </div>
        )}

        {rating.reasons.length > 0 && (
          <div className="text-xs opacity-70">
            {rating.reasons.join(' · ')}
          </div>
        )}
      </div>

      {/* ── Risk flags ── */}
      {riskFlags.length > 0 && (
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <h3 className="font-bold text-gray-800">Risk Flags</h3>
          {riskFlags.map((f, i) => (
            <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border text-sm ${SEVERITY_COLORS[f.severity]}`}>
              <span className="font-bold text-xs w-5 h-5 flex items-center justify-center rounded-full bg-current/10 flex-shrink-0 mt-0.5">
                {f.severity === 'blocker' ? 'X' : f.severity === 'warning' ? '!' : 'i'}
              </span>
              <span className="flex-1">{f.message}</span>
              {f.severity === 'blocker' && (
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={!!blockerOverrides[f.flag]}
                    onChange={e => setBlockerOverrides(prev => ({ ...prev, [f.flag]: e.target.checked ? `Overridden at ${new Date().toISOString()}` : undefined }))}
                  />
                  Override
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Why this price? (collapsed) ── */}
      <div className="bg-white rounded-xl border p-4">
        <button onClick={() => setShowBreakdown(!showBreakdown)} className="w-full flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Why this price?</h3>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${showBreakdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showBreakdown && (
          <div className="mt-3 space-y-1">
            {estimate.breakdown.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className={`text-gray-600 ${item.unverified ? 'italic' : ''}`}>
                  {item.label}
                  {item.unverified && <span className="text-amber-500 text-xs ml-1">(est.)</span>}
                </span>
                <span className={`font-medium ${item.type === 'cost' ? 'text-gray-400' : item.type === 'adjustment' ? 'text-amber-700' : ''}`}>
                  ${item.value}
                </span>
              </div>
            ))}
            <div className="border-t pt-2 mt-2 flex justify-between text-sm font-bold">
              <span>Recommended total</span>
              <span>${estimate.recommendedPrice}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Est. direct cost</span>
              <span className="text-gray-500">${estimate.estimatedDirectCost}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Target margin</span>
              <span className="text-gray-500">{(estimate.targetMargin * 100).toFixed(0)}%</span>
            </div>
            {estimate.missingInputs.length > 0 && (
              <div className="mt-2 bg-amber-50 rounded-lg p-2 text-xs text-amber-700">
                <div className="font-medium mb-1">Missing inputs:</div>
                {estimate.missingInputs.map((m, i) => (
                  <div key={i}>· {m.message}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Customer info ── */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">{data.customerName}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[data.status]}`}>
            {STATUS_LABELS[data.status]}
          </span>
        </div>
        <div className="text-sm text-gray-600 mt-1">{data.customerPhone}</div>
        {data.customerEmail && <div className="text-sm text-gray-600">{data.customerEmail}</div>}
        <div className="text-sm text-gray-600 mt-2">{data.fullAddress}</div>
        <div className="text-xs text-gray-400 mt-2">
          Submitted {new Date(data.createdAt).toLocaleString()}
        </div>
      </div>

      {/* ── Request details ── */}
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <h3 className="font-bold text-gray-800">Request Details</h3>
        <Row label="Quantity" value={data.quantity} />
        <Row label="Access" value={data.accessType} />
        <Row label="Stairs" value={STAIRS_LABELS[data.stairs] || data.stairs} />
        {data.elevator === 'yes' && <Row label="Elevator" value="Yes" />}
        <Row label="Preferred date" value={data.preferredDate ? new Date(data.preferredDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Not specified'} />
        {data.secondChoiceDate && (
          <Row label="Second choice" value={new Date(data.secondChoiceDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} />
        )}
        <Row label="Time preference" value={TIME_PREF_LABELS[data.timePreference] || data.timePreference || data.preferredTime} />
        {data.description && (
          <div className="pt-2 border-t">
            <div className="text-xs text-gray-500 font-medium">Customer notes:</div>
            <div className="text-sm text-gray-700 mt-1">{data.description}</div>
          </div>
        )}
      </div>

      {/* ── Detected items ── */}
      {data.detectedItems?.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-bold text-gray-800 mb-2">Items Identified</h3>
          <div className="space-y-1">
            {data.detectedItems.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.item}</span>
                <span className="text-gray-500">x{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Photos ── */}
      <div className="bg-white rounded-xl border p-4">
        <button onClick={() => setShowPhotos(!showPhotos)} className="w-full flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Photos ({data.photoCount})</h3>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${showPhotos ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showPhotos && (
          <div className="mt-3">
            {photosLoading && <p className="text-sm text-gray-400">Loading photos…</p>}
            {!photosLoading && photoUrls?.length === 0 && <p className="text-sm text-gray-400">No photos found.</p>}
            {!photosLoading && photoUrls?.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {photoUrls.map((photo, i) => (
                  <img key={i} src={photo.url} alt={`Photo ${i + 1}`} className="w-full rounded-lg" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Pricing / Approve ── */}
      {(data.status === 'pending_review' || data.status === 'quote_sent') && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="font-bold text-gray-800">Set Quote Price</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Final quote price ($)</label>
            <input
              type="number"
              className="w-full border rounded-lg px-3 py-2 text-lg font-bold"
              value={quotePrice}
              onChange={e => setQuotePrice(e.target.value)}
              placeholder={String(estimate.recommendedPrice)}
            />
            {quotePrice && Number(quotePrice) !== estimate.recommendedPrice && (
              <div className="text-xs text-amber-600 mt-1">
                Recommended: ${estimate.recommendedPrice} (difference: {Number(quotePrice) > estimate.recommendedPrice ? '+' : ''}${Number(quotePrice) - estimate.recommendedPrice})
              </div>
            )}
          </div>

          {/* Price flags */}
          {priceFlags.length > 0 && (
            <div className="space-y-1">
              {priceFlags.map((f, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${SEVERITY_COLORS[f.severity]}`}>
                  <span className="font-bold">{f.severity === 'blocker' ? 'X' : '!'}</span>
                  <span>{f.message}</span>
                  {f.severity === 'blocker' && (
                    <label className="flex items-center gap-1 ml-auto whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={!!blockerOverrides[f.flag]}
                        onChange={e => setBlockerOverrides(prev => ({ ...prev, [f.flag]: e.target.checked ? `Overridden` : undefined }))}
                      />
                      Override
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Override reason (when price differs from recommended) */}
          {quotePrice && Number(quotePrice) !== estimate.recommendedPrice && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for price adjustment</label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="e.g. Repeat customer, competitive pricing..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quote valid for (days)</label>
            <input
              type="number"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={expiresIn}
              onChange={e => setExpiresIn(Number(e.target.value))}
              min="1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Available time slots (one per line)</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={3}
              value={slots}
              onChange={e => setSlots(e.target.value)}
              placeholder={"Mon Jul 21, 8am-12pm\nTue Jul 22, 1pm-5pm"}
            />
          </div>

          <button
            onClick={handleApprove}
            disabled={!quotePrice || activeBlockers.length > 0}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-bold disabled:opacity-40"
          >
            {activeBlockers.length > 0
              ? `${activeBlockers.length} blocker(s) - resolve to approve`
              : data.status === 'quote_sent' ? 'Update Quote' : 'Approve & Send Quote'}
          </button>

          {canDecline && (
            <button
              onClick={handleDecline}
              className="w-full bg-red-50 text-red-700 border border-red-200 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors"
            >
              Decline &amp; Notify Customer
            </button>
          )}
        </div>
      )}

      {canDecline && data.status !== 'pending_review' && data.status !== 'quote_sent' && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="font-bold text-gray-800">Decline Request</h3>
          <p className="text-sm text-gray-500">
            Decline this request and send the customer a courtesy email explaining we cannot take the job.
          </p>
          <button
            onClick={handleDecline}
            className="w-full bg-red-50 text-red-700 border border-red-200 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-100 transition-colors"
          >
            Decline &amp; Notify Customer
          </button>
        </div>
      )}

      {/* ── Internal notes ── */}
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <h3 className="font-bold text-gray-800">Internal Notes</h3>
        <textarea
          className="w-full border rounded-lg px-3 py-2 text-sm"
          rows={3}
          value={internalNotes}
          onChange={e => setInternalNotes(e.target.value)}
          placeholder="Internal notes (not visible to customer)..."
        />
        <button onClick={handleSaveNotes} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium">
          Save Notes
        </button>
      </div>

      {/* ── Stripe payment summary ── */}
      {(paymentSummary || paymentLoading) && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800">Stripe Financial Summary</h3>
            <button
              onClick={loadPaymentSummary}
              disabled={paymentLoading}
              className="text-xs text-blue-600 disabled:opacity-50"
            >
              {paymentLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {paymentSummary && (
            <>
              {paymentSummary.depositConfirmed ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 font-medium">
                  ✓ Deposit confirmed - dispatch allowed
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 font-medium">
                  ⚠ Deposit not confirmed - do not dispatch
                </div>
              )}

              <div className="space-y-1">
                <PRow label="Invoice total" value={`$${(paymentSummary.invoiceTotalCents / 100).toFixed(2)}`} />
                <PRow label="Amount paid" value={`$${(paymentSummary.amountPaidCents / 100).toFixed(2)}`} />
                <PRow label="Amount remaining" value={`$${(paymentSummary.amountRemainingCents / 100).toFixed(2)}`} />
                <PRow label="Invoice status" value={paymentSummary.invoiceStatus} />
                {paymentSummary.depositConfirmedAt && (
                  <PRow label="Deposit confirmed" value={new Date(paymentSummary.depositConfirmedAt).toLocaleString()} />
                )}
                {paymentSummary.financiallyCompletedAt && (
                  <PRow label="Financially complete" value={new Date(paymentSummary.financiallyCompletedAt).toLocaleString()} />
                )}
              </div>

              <div className="border-t pt-2 space-y-0.5 text-xs text-gray-400 font-mono break-all">
                <div>Customer: {paymentSummary.stripeCustomerId || '-'}</div>
                <div>Invoice: {paymentSummary.stripeInvoiceId || '-'}</div>
              </div>

              {paymentSummary.hostedInvoiceUrl && (
                <a
                  href={paymentSummary.hostedInvoiceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-center text-xs text-blue-600 underline"
                >
                  View invoice on Stripe →
                </a>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Complete job (new completion form for Stripe flow) ── */}
      {['scheduled', 'in_progress'].includes(data.status) && !showJobCompletion && (
        <button
          onClick={() => setShowJobCompletion(true)}
          className="w-full bg-green-50 text-green-700 py-3 rounded-xl font-bold border border-green-200"
        >
          Complete Job &amp; Request Final Balance
        </button>
      )}

      {showJobCompletion && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="font-bold text-gray-800">Complete Job</h3>

          {/* After photos */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              After photos <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(at least 1 required)</span>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
              multiple
              onChange={handleAfterPhotoUpload}
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700"
            />
            {uploadingPhotos && <div className="text-xs text-gray-500 mt-1">Uploading…</div>}
            {afterPhotos.length > 0 && (
              <div className="mt-2 space-y-1">
                {afterPhotos.map((p, i) => (
                  <div key={i} className="flex items-center gap-1 text-xs text-green-700">
                    <span>✓</span>
                    <span className="flex-1 truncate">{p.fileName}</span>
                    <button
                      onClick={() => setAfterPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-600 ml-1"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Technician name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Technician name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={jobCompletionForm.technicianName}
              onChange={e => setJobCompletionForm(p => ({ ...p, technicianName: e.target.value }))}
              placeholder="Who performed the work?"
            />
          </div>

          {/* Items removed */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Items removed <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={2}
              value={jobCompletionForm.itemsRemoved}
              onChange={e => setJobCompletionForm(p => ({ ...p, itemsRemoved: e.target.value }))}
              placeholder="What was removed? (shown to customer)"
            />
          </div>

          {/* Volume estimate */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Volume / load size</label>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={jobCompletionForm.volumeEstimate}
              onChange={e => setJobCompletionForm(p => ({ ...p, volumeEstimate: e.target.value }))}
              placeholder="e.g. 3/4 truck, full load"
            />
          </div>

          {/* Completion notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Completion notes <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={3}
              value={jobCompletionForm.completionNotes}
              onChange={e => setJobCompletionForm(p => ({ ...p, completionNotes: e.target.value }))}
              placeholder="Summary of the job for the customer…"
            />
          </div>

          {/* Disposal / donation notes */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Disposal / donation notes</label>
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={jobCompletionForm.disposalNotes}
              onChange={e => setJobCompletionForm(p => ({ ...p, disposalNotes: e.target.value }))}
              placeholder="e.g. Donated 3 boxes to Habitat for Humanity"
            />
          </div>

          {/* Final amount */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Amount charged to customer
              {data.approvedQuote && (
                <span className="text-gray-400 font-normal ml-1">(quoted: ${Number(data.approvedQuote).toFixed(2)} - only change if adjusted on-site)</span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={jobCompletionForm.finalAmountDollars}
              onChange={e => setJobCompletionForm(p => ({ ...p, finalAmountDollars: e.target.value }))}
              placeholder={data.approvedQuote ? Number(data.approvedQuote).toFixed(2) : '0.00'}
            />
            {data.approvedQuote && jobCompletionForm.finalAmountDollars &&
              Math.round(Number(jobCompletionForm.finalAmountDollars) * 100) !== Math.round(Number(data.approvedQuote) * 100) && (
              <div className="text-xs text-amber-600 mt-1">
                Price changed from quoted amount - please explain below
              </div>
            )}
          </div>

          {/* Price adjustment reason - shown only when amount differs */}
          {data.approvedQuote && jobCompletionForm.finalAmountDollars &&
            Math.round(Number(jobCompletionForm.finalAmountDollars) * 100) !== Math.round(Number(data.approvedQuote) * 100) && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Reason for price change <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={jobCompletionForm.priceAdjustmentReason}
                onChange={e => setJobCompletionForm(p => ({ ...p, priceAdjustmentReason: e.target.value }))}
                placeholder="e.g. Additional items found on-site"
              />
            </div>
          )}

          {/* Job completed at */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Job completed at <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={jobCompletionForm.completedAt}
              onChange={e => setJobCompletionForm(p => ({ ...p, completedAt: e.target.value }))}
            />
          </div>

          {jobCompletionError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {jobCompletionError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCompleteJob}
              disabled={jobCompletionSubmitting || uploadingPhotos || afterPhotos.length === 0}
              className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold disabled:opacity-40"
            >
              {jobCompletionSubmitting ? 'Completing…' : 'Complete Job & Request Final Balance'}
            </button>
            <button
              onClick={() => { setShowJobCompletion(false); setJobCompletionError(null); }}
              className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Estimated vs Actual comparison ── */}
      {actualsResult && (
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <h3 className="font-bold text-gray-800">Estimated vs Actual</h3>
          <div className="grid grid-cols-3 gap-1 text-xs text-gray-500 font-medium border-b pb-1">
            <span></span><span className="text-right">Estimated</span><span className="text-right">Actual</span>
          </div>
          <ComparisonRow label="Amount" est={`$${estimate.recommendedPrice}`} actual={`$${actualsResult.finalAmount}`}
            delta={actualsResult.deltas.priceDelta} unit="$" />
          <ComparisonRow label="Cash profit" est={`$${estimate.estimatedProfit}`} actual={`$${actualsResult.cashProfit}`}
            delta={actualsResult.deltas.profitDelta} unit="$" />
          <ComparisonRow label="Cash margin" est={`${(estimate.estimatedMargin * 100).toFixed(0)}%`}
            actual={`${(actualsResult.cashMargin * 100).toFixed(0)}%`}
            delta={actualsResult.deltas.marginDelta ? actualsResult.deltas.marginDelta * 100 : null} unit="pp" />
          {data.actuals.ownerLabor && Number(data.actuals.ownerLabor) > 0 && (
            <ComparisonRow label="Owner-adj profit" est="-" actual={`$${actualsResult.ownerAdjustedProfit}`} />
          )}
          {actualsResult.deltas.travelDelta !== undefined && (
            <ComparisonRow label="Travel" est={`${estimate.estimatedTravelMinutes} min`}
              actual={`${data.actuals.actualTravelMinutes} min`}
              delta={actualsResult.deltas.travelDelta} unit=" min" />
          )}
          {actualsResult.deltas.onSiteDelta !== undefined && (
            <ComparisonRow label="On-site" est={`${(estimate.estimatedOnSiteHours * 60).toFixed(0)} min`}
              actual={`${data.actuals.actualOnSiteMinutes} min`}
              delta={actualsResult.deltas.onSiteDelta} unit=" min" />
          )}
          {actualsResult.deltas.truckDelta !== undefined && (
            <ComparisonRow label="Truck vol." est={`${estimate.estimatedVolumePct}%`}
              actual={`${data.actuals.actualTruckVolumePct}%`}
              delta={actualsResult.deltas.truckDelta} unit="pp" />
          )}
          {actualsResult.deltas.pricingAccuracy !== undefined && (
            <div className="border-t pt-2 flex justify-between text-sm font-bold">
              <span className="text-gray-700">Pricing accuracy</span>
              <span className={actualsResult.deltas.pricingAccuracy >= 0.9 ? 'text-green-700' : actualsResult.deltas.pricingAccuracy >= 0.75 ? 'text-amber-700' : 'text-red-700'}>
                {(actualsResult.deltas.pricingAccuracy * 100).toFixed(0)}%
              </span>
            </div>
          )}
          {data.actuals.additionalItems && (
            <div className="border-t pt-2 text-sm">
              <span className="text-gray-500 font-medium">Additional items: </span>
              <span className="text-gray-700">{data.actuals.additionalItems}</span>
            </div>
          )}
          {data.actuals.notes && (
            <div className="text-sm">
              <span className="text-gray-500 font-medium">Notes: </span>
              <span className="text-gray-700">{data.actuals.notes}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Status actions ── */}
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <h3 className="font-bold text-gray-800">Update Status</h3>
        <div className="grid grid-cols-2 gap-2">
          {data.status !== 'completed' && data.status !== 'scheduled' && (
            <button onClick={() => handleStatusChange('completed')} className="bg-green-50 text-green-700 py-2 rounded-lg text-sm font-medium">
              Mark Completed
            </button>
          )}
          {data.status !== 'declined' && canDecline && (
            <button onClick={handleDecline} className="bg-red-50 text-red-700 py-2 rounded-lg text-sm font-medium">
              Decline
            </button>
          )}
        </div>
        <button onClick={handleDelete} className="w-full bg-red-50 text-red-600 py-2 rounded-lg text-sm font-medium mt-2">
          Delete Request
        </button>
      </div>

      {/* ── Customer quote link ── */}
      {(data.status === 'quote_sent' || data.status === 'awaiting_deposit') && (
        <QuoteLinkPanel
          booking={data}
          lastQuoteToken={lastQuoteToken}
          onNewToken={token => setLastQuoteToken(token)}
          getAdminToken={getAdminToken}
        />
      )}
    </div>
  );
}

// ── Quote link panel (resend / copy) ────────────────────────

function QuoteLinkPanel({ booking, lastQuoteToken, onNewToken, getAdminToken }) {
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [freshToken, setFreshToken] = React.useState(lastQuoteToken);

  const quoteUrl = freshToken ? `${window.location.origin}/quote/${freshToken}` : null;

  async function handleResend() {
    setSending(true);
    setError(null);
    setSent(false);
    try {
      const token = await getAdminToken();
      const res = await fetch('/api/resend-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Resend failed');
      setFreshToken(json.quoteToken);
      onNewToken(json.quoteToken);
      setSent(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <div className="text-sm font-semibold text-blue-800">Customer Quote Link</div>

      {quoteUrl ? (
        <>
          <div className="text-xs text-blue-600 break-all font-mono bg-white rounded p-2 border border-blue-100">
            {quoteUrl}
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(quoteUrl); }}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Copy Link
          </button>
        </>
      ) : (
        <p className="text-xs text-blue-700">
          The original link is no longer available in this session. Use the button below to generate a fresh link and resend the email.
        </p>
      )}

      <button
        onClick={handleResend}
        disabled={sending}
        className="w-full bg-white border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 disabled:opacity-50"
      >
        {sending ? 'Sending…' : 'Resend Quote Email to Customer'}
      </button>

      {sent && <p className="text-xs text-green-700 font-medium">Email sent - new link generated above.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Shared components ───────────────────────────────────────

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function PRow({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function CompletionField({ label, value, onChange, error, required }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="number"
        step="any"
        className={`w-full border rounded-lg px-3 py-2 text-sm ${error ? 'border-red-400' : ''}`}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
      {error && <div className="text-xs text-red-500 mt-0.5">{error}</div>}
    </div>
  );
}

function ComparisonRow({ label, est, actual, delta, unit }) {
  return (
    <div className="grid grid-cols-3 gap-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="text-right text-gray-400">{est}</span>
      <span className="text-right font-medium">
        {actual}
        {delta !== undefined && delta !== null && (
          <span className={`text-xs ml-1 ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
            ({delta > 0 ? '+' : ''}{typeof delta === 'number' ? (unit === '$' ? `$${delta.toFixed(0)}` : `${delta.toFixed(0)}${unit || ''}`) : delta})
          </span>
        )}
      </span>
    </div>
  );
}
