import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Phone, Mail, CheckCircle2, TrendingUp, Clock, Calendar } from 'lucide-react';

export default function EstimateJobSheet({ item, weeklyGoal, earnedThisWeek, onClose, onAction }) {
  const [visible, setVisible] = useState(false);
  const [acting, setActing] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  async function handleAccept() {
    setActing(true);
    await onAction(item, 'accept');
    setActing(false);
  }

  async function handlePass() {
    setActing(true);
    await onAction(item, 'pass');
    setActing(false);
  }

  const margin = item.price > 0 ? Math.round(item.profit / item.price * 100) : 0;
  const jobTargetPct = weeklyGoal > 0 ? Math.round(item.profit / weeklyGoal * 100) : 0;
  const projectedPct = weeklyGoal > 0 ? Math.min(100, Math.round((earnedThisWeek + item.profit) / weeklyGoal * 100)) : 0;

  // Build "why this job matters" reasons from item.reasons
  const positiveReasons = item.reasons
    .filter(r => r.icon === 'check')
    .map(r => ({ title: summarizeReason(r.text), detail: r.text }));

  // Add margin insight if not already covered
  if (margin >= 40 && !positiveReasons.some(r => r.title.toLowerCase().includes('margin'))) {
    positiveReasons.unshift({ title: 'High margin', detail: `${margin}% margin on this job` });
  }

  return (
    <div className="fixed inset-0 z-50" style={{ pointerEvents: visible ? 'auto' : 'none' }}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl transition-transform duration-300 ease-out flex flex-col ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '92vh' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pb-4 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-900">{item.title}</h2>
            <p className="text-gray-500 text-sm mt-0.5">{item.customerName}</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100 -mr-1 flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 pb-4"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Financial summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Revenue</p>
              <p className="text-lg font-bold text-slate-900">${item.price.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-emerald-600 font-medium mb-1">Profit</p>
              <p className="text-lg font-bold text-emerald-600">${item.profit.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500 font-medium mb-1">Margin</p>
              <p className="text-lg font-bold text-slate-900">{margin}%</p>
            </div>
          </div>

          {/* Why this job matters */}
          {positiveReasons.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                <span className="text-gray-400 text-base">&#9432;</span>
                Why this job matters
              </h3>
              <div className="space-y-2">
                {positiveReasons.map((reason, i) => (
                  <div key={i} className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-bold text-emerald-800 text-sm">{reason.title}</p>
                        <p className="text-emerald-700 text-sm mt-0.5">{reason.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Caution reasons */}
          {item.reasons.filter(r => r.icon === 'caution' || r.icon === 'x').length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Things to consider</h3>
              <div className="space-y-2">
                {item.reasons.filter(r => r.icon === 'caution' || r.icon === 'x').map((reason, i) => (
                  <div key={i} className={`border rounded-xl p-3.5 ${
                    reason.icon === 'x'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    <p className={`text-sm font-medium ${
                      reason.icon === 'x' ? 'text-red-700' : 'text-amber-700'
                    }`}>
                      {reason.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Job description */}
          {item.description && (
            <div className="mb-5">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Job description</h3>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-700 leading-relaxed">{item.description}</p>
              </div>
            </div>
          )}

          {/* Customer information */}
          <div className="mb-5">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Customer information</h3>
            <div className="space-y-3">
              {item.address && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-xs text-gray-400 font-medium">Service address</p>
                    <p className="text-sm text-slate-900 font-medium">{item.address}</p>
                  </div>
                </div>
              )}
              {item.phone && (
                <a href={`tel:${item.phone}`} className="flex items-start gap-3 active:opacity-70">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-xs text-gray-400 font-medium">Phone</p>
                    <p className="text-sm text-blue-600 font-medium">{item.phone}</p>
                  </div>
                </a>
              )}
              {item.email && (
                <a href={`mailto:${item.email}`} className="flex items-start gap-3 active:opacity-70">
                  <div className="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-xs text-gray-400 font-medium">Email</p>
                    <p className="text-sm text-blue-600 font-medium">{item.email}</p>
                  </div>
                </a>
              )}
              {item.preferredDate && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-xs text-gray-400 font-medium">Preferred date</p>
                    <p className="text-sm text-slate-900 font-medium">{item.preferredDate}</p>
                  </div>
                </div>
              )}
              {item.customerNotes && (
                <div className="bg-gray-50 rounded-xl p-3 mt-2">
                  <p className="text-xs text-gray-400 font-medium mb-1">Customer notes</p>
                  <p className="text-sm text-gray-700">{item.customerNotes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Financial breakdown */}
          {item.costBreakdown.length > 0 && (
            <div className="mb-5">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
                <span className="text-emerald-500 text-base">$</span>
                Financial breakdown
              </h3>
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {item.costBreakdown.map((line, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0"
                  >
                    <span className="text-sm text-gray-600">{line.label}</span>
                    <span className="text-sm font-semibold text-slate-900">{line.value || '\u2014'}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <span className="text-sm font-bold text-slate-900">Estimated cost</span>
                  <span className="text-sm font-bold text-slate-900">${item.costs.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-emerald-50">
                  <span className="text-sm font-bold text-emerald-700 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    Estimated profit
                  </span>
                  <span className="text-sm font-bold text-emerald-600">${item.profit.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Weekly revenue target */}
          <div className="bg-slate-800 rounded-2xl p-4 mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-300 text-sm font-medium flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                Weekly revenue target
              </span>
              <span className="text-white text-lg font-bold">{jobTargetPct}%</span>
            </div>
            <div className="h-2 bg-gray-600 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${projectedPct}%` }}
              />
            </div>
            <p className="text-gray-400 text-xs">
              This job covers {jobTargetPct}% of your ${weeklyGoal.toLocaleString()} weekly goal
            </p>
          </div>

          {/* Spacer for action buttons */}
          <div className="h-2" />
        </div>

        {/* Sticky action buttons */}
        <div
          className="flex-shrink-0 flex gap-3 px-5 pt-3 pb-3 border-t border-gray-100 bg-white"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handlePass}
            disabled={acting}
            className="flex-1 py-4 rounded-xl text-base font-bold text-slate-700 bg-gray-100 active:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Pass
          </button>
          <button
            onClick={handleAccept}
            disabled={acting}
            className="flex-1 py-4 rounded-xl text-base font-bold text-white bg-emerald-500 active:bg-emerald-600 disabled:opacity-50 transition-colors"
          >
            {acting ? 'Processing...' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Extract a short title from a full reason text.
 * e.g. "At $120/hr, well above $70 minimum" → "Strong hourly rate"
 */
function summarizeReason(text) {
  const t = text.toLowerCase();
  if (t.includes('margin') && (t.includes('above') || t.includes('healthy'))) return 'High margin';
  if (t.includes('per work hour') || t.includes('per labor hour') || t.includes('/hr')) return 'Strong hourly rate';
  if (t.includes('per schedule hour') || t.includes('capacity hour')) return 'Efficient use of time';
  if (t.includes('confidence')) return 'High confidence';
  if (t.includes('goal') || t.includes('pace') || t.includes('target')) return 'Hits weekly target';
  if (t.includes('fits') || t.includes('schedule') || t.includes('capacity')) return 'Fits schedule';
  if (t.includes('profit')) return 'Good profit';
  if (t.includes('quick') || t.includes('fast') || t.includes('short')) return 'Quick turnaround';
  return 'Positive signal';
}
