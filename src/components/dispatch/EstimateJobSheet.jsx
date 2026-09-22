import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Phone, Mail, TrendingUp } from 'lucide-react';
import { truckHeadline, truckSendPrice } from '../../estimator/truckCopy';
import { bindTap } from './tap';

function recTone(rec) {
  if (rec === 'pass') return 'bg-red-50 text-red-800';
  if (rec === 'review') return 'bg-amber-50 text-amber-900';
  return 'bg-emerald-50 text-emerald-900';
}

function isQuote(rec) {
  return rec === 'take' || rec === 'take_at_price';
}

export default function EstimateJobSheet({ item, onClose, onAction }) {
  const [visible, setVisible] = useState(false);
  const [acting, setActing] = useState(false);
  const openedAt = useRef(Date.now());

  const [box, setBox] = useState(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    const vv = window.visualViewport;
    const place = () => {
      if (!vv) return;
      setBox({ top: vv.offsetTop, height: vv.height });
    };
    place();
    vv?.addEventListener('resize', place);
    vv?.addEventListener('scroll', place);
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener('resize', place);
      vv?.removeEventListener('scroll', place);
    };
  }, []);

  function handleClose() {
    if (Date.now() - openedAt.current < 400) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    onClose();
  }

  const recommended = truckSendPrice(item.recommendation, item.price, item.suggestedPrice) ?? item.price;
  const lookFirst = item.recommendation === 'review';
  const [checked, setChecked] = useState(false);
  const quoting = isQuote(item.recommendation) || (lookFirst && checked);
  const [quote, setQuote] = useState(recommended);

  useEffect(() => {
    setQuote(recommended);
    setChecked(false);
  }, [item.id, recommended]);

  async function handleAccept() {
    if (acting) return;
    setActing(true);
    try {
      await onAction(item, 'accept', quoting ? quote : recommended);
    } finally {
      setActing(false);
    }
  }
  async function handlePass() {
    if (acting) return;
    setActing(true);
    try {
      await onAction(item, 'pass');
    } finally {
      setActing(false);
    }
  }

  const floor = item.walkAwayPrice;
  const underFloor = quoting && floor != null && quote < floor;
  const headline = quoting
    ? `Quote at $${Math.round(quote).toLocaleString()}`
    : truckHeadline(item.recommendation, item.price, item.suggestedPrice, item.lookFirst);
  const floorLine = floor != null && floor < recommended
    ? `If they push back, $${Math.round(floor).toLocaleString()} is as low as you can go.`
    : '';
  const sentence = quoting
    ? floorLine
    : (item.recommendation === 'pass'
      ? (floor != null ? `If you take it anyway, don't go below $${Math.round(floor).toLocaleString()}.` : 'Skip this one this week.')
      : 'Check that, then set the quote.');
  const jobProfit = Math.round(quote - (item.costs || 0));

  return (
    <div
      className="fixed inset-x-0 z-50"
      style={{ top: box ? box.top : 0, height: box ? box.height : '100%' }}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        {...bindTap(handleClose)}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-[20px] flex flex-col transition-transform duration-300 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ maxHeight: '100%', paddingTop: 'env(safe-area-inset-top)' }}
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
          <button type="button" {...bindTap(handleClose)} className="touch-manipulation w-11 h-11 flex items-center justify-center text-gray-400 -mr-2" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="px-5 pb-4">

            <div className={`rounded-xl px-3.5 py-3 mb-4 ${quoting ? recTone('take') : recTone(item.recommendation)}`}>
              <p className="text-[18px] font-bold leading-snug">{headline}</p>
              {sentence && <p className="text-[13px] mt-1 leading-snug">{sentence}</p>}
              {lookFirst && checked && item.lookFirst && (
                <p className="text-[13px] mt-1 leading-snug">Checked: {item.lookFirst}.</p>
              )}
            </div>

            {quoting && (
              <div className="mb-5">
                <p className="text-[13px] font-bold text-slate-900 mb-2">Your quote</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuote(q => Math.max(0, q - 10))}
                    className="touch-manipulation w-12 h-12 rounded-xl bg-gray-100 text-2xl font-semibold text-slate-700 active:bg-gray-200"
                    aria-label="Lower quote by 10 dollars"
                  >
                    −
                  </button>
                  <label className="flex-1 flex items-center justify-center bg-gray-50 rounded-xl h-12 px-3">
                    <span className="text-lg font-bold text-slate-400 mr-0.5">$</span>
                    <input
                      inputMode="numeric"
                      value={quote}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, '');
                        setQuote(digits === '' ? 0 : Number(digits));
                      }}
                      className="w-full bg-transparent text-center text-xl font-bold text-slate-900 outline-none"
                      aria-label="Quote amount"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setQuote(q => q + 10)}
                    className="touch-manipulation w-12 h-12 rounded-xl bg-gray-100 text-2xl font-semibold text-slate-700 active:bg-gray-200"
                    aria-label="Raise quote by 10 dollars"
                  >
                    +
                  </button>
                </div>
                {underFloor && (
                  <p className="text-[13px] text-red-700 mt-2">
                    ${Math.round(floor).toLocaleString()} is as low as this job should go.
                  </p>
                )}
                {item.costs > 0 && quote > 0 && (
                  <p className="text-[13px] text-gray-500 mt-2">
                    About ${jobProfit.toLocaleString()} profit on this job.
                  </p>
                )}
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

            <div className="h-3" />
          </div>
        </div>

        {/* Sticky buttons */}
        <div
          className="flex-shrink-0 flex gap-3 px-5 pt-3 bg-white border-t border-gray-100"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            {...bindTap(handlePass)}
            disabled={acting}
            className="touch-manipulation flex-1 py-3.5 rounded-xl text-[15px] font-bold text-slate-600 bg-gray-100 active:bg-gray-200 disabled:opacity-50"
          >
            Pass
          </button>
          <button
            type="button"
            {...bindTap(lookFirst && !checked ? () => setChecked(true) : handleAccept)}
            disabled={acting}
            className="touch-manipulation flex-1 py-3.5 rounded-xl text-[15px] font-bold text-white bg-emerald-500 active:bg-emerald-600 disabled:opacity-50"
          >
            {acting ? 'Saving...' : (lookFirst && !checked ? 'I checked it' : (quoting ? `Quote $${Math.round(quote).toLocaleString()}` : 'Accept'))}
          </button>
        </div>
      </div>
    </div>
  );
}
