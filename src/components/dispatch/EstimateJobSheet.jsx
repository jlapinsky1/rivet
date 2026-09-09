import React, { useState, useEffect } from 'react';
import { X, MapPin, Phone, Mail, CheckCircle2, AlertCircle, TrendingUp, Calendar } from 'lucide-react';

export default function EstimateJobSheet({ item, weeklyGoal, earnedThisWeek, onClose, onAction }) {
  const [visible, setVisible] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  async function handleAccept() { setActing(true); await onAction(item, 'accept'); setActing(false); }
  async function handlePass()   { setActing(true); await onAction(item, 'pass');   setActing(false); }

  const margin = item.price > 0 ? Math.round(item.profit / item.price * 100) : 0;
  const jobTargetPct = weeklyGoal > 0 ? Math.round(item.profit / weeklyGoal * 100) : 0;
  const projectedPct = weeklyGoal > 0 ? Math.min(100, Math.round((earnedThisWeek + item.profit) / weeklyGoal * 100)) : 0;

  // Separate positive vs caution reasons
  const positiveReasons = item.reasons.filter(r => r.icon === 'check');
  const cautionReasons  = item.reasons.filter(r => r.icon === 'caution' || r.icon === 'x');

  return (
    <div className="fixed inset-0 z-50" style={{ pointerEvents: visible ? 'auto' : 'none' }}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-[20px] flex flex-col transition-transform duration-300 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '90vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pb-3 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900 leading-tight">{item.title}</h2>
            <p className="text-[13px] text-gray-400 mt-0.5">{item.customerName}</p>
          </div>
          <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center text-gray-400 -mr-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="px-5 pb-4">

            {/* Key numbers */}
            <div className="flex gap-2.5 mb-5">
              <div className="flex-1 bg-gray-50 rounded-xl py-3 px-3.5">
                <p className="text-[11px] text-gray-400 font-medium">Revenue</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">${item.price.toLocaleString()}</p>
              </div>
              <div className="flex-1 bg-emerald-50 rounded-xl py-3 px-3.5">
                <p className="text-[11px] text-emerald-600 font-medium">Profit</p>
                <p className="text-lg font-bold text-emerald-600 mt-0.5">${item.profit.toLocaleString()}</p>
              </div>
              <div className="flex-1 bg-gray-50 rounded-xl py-3 px-3.5">
                <p className="text-[11px] text-gray-400 font-medium">Margin</p>
                <p className="text-lg font-bold text-slate-900 mt-0.5">{margin}%</p>
              </div>
            </div>

            {/* Why this job matters */}
            {positiveReasons.length > 0 && (
              <div className="mb-5">
                <h3 className="text-[13px] font-bold text-slate-900 mb-2.5">Why this job matters</h3>
                <div className="space-y-2">
                  {positiveReasons.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex items-start gap-2.5 bg-emerald-50 rounded-xl px-3.5 py-3">
                      <CheckCircle2 className="w-[18px] h-[18px] text-emerald-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[13px] text-emerald-800 leading-snug">{r.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Caution reasons */}
            {cautionReasons.length > 0 && (
              <div className="mb-5">
                <h3 className="text-[13px] font-bold text-slate-900 mb-2.5">Things to consider</h3>
                <div className="space-y-2">
                  {cautionReasons.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex items-start gap-2.5 bg-amber-50 rounded-xl px-3.5 py-3">
                      <AlertCircle className="w-[18px] h-[18px] text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[13px] text-amber-800 leading-snug">{r.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Job description */}
            {item.description && (
              <div className="mb-5">
                <h3 className="text-[13px] font-bold text-slate-900 mb-2">Job description</h3>
                <p className="text-[13px] text-gray-600 leading-relaxed bg-gray-50 rounded-xl px-3.5 py-3">
                  {item.description}
                </p>
              </div>
            )}

            {/* Customer info */}
            {(item.address || item.phone || item.email) && (
              <div className="mb-5">
                <h3 className="text-[13px] font-bold text-slate-900 mb-2.5">Customer</h3>
                <div className="space-y-2.5">
                  {item.address && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="pt-1">
                        <p className="text-[11px] text-gray-400">Service address</p>
                        <p className="text-[13px] text-slate-800">{item.address}</p>
                      </div>
                    </div>
                  )}
                  {item.phone && (
                    <a href={`tel:${item.phone}`} className="flex items-start gap-3 active:opacity-60">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                        <Phone className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div className="pt-1">
                        <p className="text-[11px] text-gray-400">Phone</p>
                        <p className="text-[13px] text-blue-600">{item.phone}</p>
                      </div>
                    </a>
                  )}
                  {item.email && (
                    <a href={`mailto:${item.email}`} className="flex items-start gap-3 active:opacity-60">
                      <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
                        <Mail className="w-4 h-4 text-purple-500" />
                      </div>
                      <div className="pt-1">
                        <p className="text-[11px] text-gray-400">Email</p>
                        <p className="text-[13px] text-blue-600">{item.email}</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Cost breakdown */}
            {item.costBreakdown.length > 0 && (
              <div className="mb-5">
                <h3 className="text-[13px] font-bold text-slate-900 mb-2">Cost breakdown</h3>
                <div className="rounded-xl overflow-hidden border border-gray-100">
                  {item.costBreakdown.map((line, i) => (
                    <div key={i} className="flex justify-between px-3.5 py-2.5 border-b border-gray-50 last:border-b-0">
                      <span className="text-[13px] text-gray-500">{line.label}</span>
                      <span className="text-[13px] font-medium text-slate-800">{line.value || '\u2014'}</span>
                    </div>
                  ))}
                  <div className="flex justify-between px-3.5 py-2.5 bg-emerald-50">
                    <span className="text-[13px] font-semibold text-emerald-700 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" /> Estimated profit
                    </span>
                    <span className="text-[13px] font-bold text-emerald-600">${item.profit.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Weekly target widget */}
            <div className="bg-slate-800 rounded-2xl px-4 py-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-300 text-[13px] font-medium flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" /> Weekly target
                </span>
                <span className="text-white text-base font-bold">{jobTargetPct}%</span>
              </div>
              <div className="h-1.5 bg-gray-600 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${projectedPct}%` }} />
              </div>
              <p className="text-gray-500 text-[11px]">
                This job covers {jobTargetPct}% of your ${weeklyGoal.toLocaleString()} goal
              </p>
            </div>

            <div className="h-3" />
          </div>
        </div>

        {/* Sticky buttons */}
        <div
          className="flex-shrink-0 flex gap-3 px-5 pt-3 bg-white border-t border-gray-100"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handlePass}
            disabled={acting}
            className="flex-1 py-3.5 rounded-xl text-[15px] font-bold text-slate-600 bg-gray-100 active:bg-gray-200 disabled:opacity-50"
          >
            Pass
          </button>
          <button
            onClick={handleAccept}
            disabled={acting}
            className="flex-1 py-3.5 rounded-xl text-[15px] font-bold text-white bg-emerald-500 active:bg-emerald-600 disabled:opacity-50"
          >
            {acting ? 'Processing...' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
