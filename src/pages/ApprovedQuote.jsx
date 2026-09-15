import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, PaymentElement, useStripe, useElements,
} from '@stripe/react-stripe-js';
import { CUSTOMER_TERMS } from '../utils/quoteSnapshot';
import { getRepo } from '../utils/repository';

// Stripe publishable key - safe to expose (server secret key is never here)
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// ── Payment form (must be inside <Elements>) ──────────────────────────────
function PaymentForm({ token, depositCents, onPaymentSubmitted, onPaymentError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setLocalError(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Return URL for 3DS redirects and wallet-based payments
        return_url: `${window.location.origin}/quote/${token}?deposit_return=1`,
      },
      redirect: 'if_required', // standard cards confirm inline; 3DS/wallets redirect
    });

    if (error) {
      // Card declined, network error, or validation failure
      const msg = error.message || 'Payment failed. Please try again.';
      setLocalError(msg);
      onPaymentError(msg);
      setProcessing(false);
    } else {
      // Payment submitted - no redirect means confirmPayment resolved without redirect
      onPaymentSubmitted();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{
        layout: 'tabs',
        wallets: { applePay: 'auto', googlePay: 'auto' },
      }} />
      {localError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {localError}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full bg-green-600 text-white py-4 rounded-xl text-lg font-bold shadow-lg disabled:opacity-40 disabled:shadow-none active:bg-green-700 transition-colors"
      >
        {processing
          ? 'Processing...'
          : `Pay Deposit ($${(depositCents / 100).toFixed(2)})`}
      </button>
      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 pt-1">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-gray-400" aria-hidden="true">
          <path d="M12 2a5 5 0 0 0-5 5v2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2V7a5 5 0 0 0-5-5zm-3 7V7a3 3 0 0 1 6 0v2H9zm3 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>
        </svg>
        <span>Secured by <span className="font-semibold text-gray-500">Stripe</span></span>
      </div>
    </form>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function ApprovedQuote() {
  const { id: token } = useParams();
  const [searchParams] = useSearchParams();

  // Page states:
  // loading | not_found | already_scheduled | quote_view |
  // initiating_payment | payment_entry | payment_failed |
  // payment_submitted | payment_confirmed
  const [pageState, setPageState] = useState('loading');
  const [quoteData, setQuoteData] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [confirmations, setConfirmations] = useState([false, false, false]);
  const [error, setError] = useState(null);
  const [paymentInfo, setPaymentInfo] = useState(null); // { clientSecret, depositCents, invoiceTotalCents }
  const pollRef = useRef(null);

  // ── Load quote on mount ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const repo = await getRepo();
        const data = await repo.getCustomerQuote(token);
        setQuoteData(data);

        const status = data?.booking?.status;
        if (!data?.quote) {
          setPageState('not_found');
        } else if (status === 'scheduled' || status === 'completed' || data?.booking?.deposit_confirmed_at) {
          setPageState('already_scheduled');
        } else if (searchParams.get('deposit_return') === '1') {
          // Returning from a 3DS redirect - start polling immediately
          setPageState('payment_submitted');
          startPolling();
        } else {
          setPageState('quote_view');
        }
      } catch {
        setPageState('not_found');
      }
    })();

    return () => stopPolling();
  }, [token]);

  // ── Poll payment-summary until deposit confirmed ─────────────────────────
  function startPolling() {
    let attempts = 0;
    const maxAttempts = 20; // 60 seconds at 3s intervals

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/payment-summary?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.depositConfirmed) {
            stopPolling();
            setPageState('payment_confirmed');
            return;
          }
        }
      } catch {}

      if (attempts >= maxAttempts) {
        stopPolling();
        setPageState('payment_submitted'); // stays in "processing" state - check email
      }
    }, 3000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // ── Initiate payment: call create-deposit-payment ────────────────────────
  async function handleInitiatePayment() {
    if (!allConfirmed) {
      setError('Please confirm all items before continuing.');
      return;
    }
    if (availableSlots.length > 0 && !selectedSlot) {
      setError('Please select a pickup time.');
      return;
    }

    setError(null);
    setPageState('initiating_payment');

    const slot = availableSlots.find(s => JSON.stringify(s) === selectedSlot);
    const pickupDate  = slot?.date     || quoteData.booking?.preferredDate || '';
    const startTime   = slot?.startTime || '08:00';
    const endTime     = slot?.endTime   || '12:00';
    const resourceId  = slot?.resourceId || 'truck-1';
    const terms = quoteData.quote.customerTerms || CUSTOMER_TERMS;

    try {
      const res = await fetch('/api/create-deposit-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          resourceId,
          pickupDate,
          startTime,
          endTime,
          confirmations: terms.customerConfirmations,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || 'Unable to set up payment. Please try again.';
        if (res.status === 409) {
          // Slot taken - go back to quote view so they can pick another slot
          setPageState('quote_view');
          setError(msg);
        } else {
          setError(msg);
          setPageState('quote_view');
        }
        return;
      }

      setPaymentInfo({
        clientSecret: data.clientSecret,
        depositCents: data.depositCents,
        invoiceTotalCents: data.invoiceTotalCents,
      });
      setPageState('payment_entry');

    } catch {
      setError('Network error. Please check your connection and try again.');
      setPageState('quote_view');
    }
  }

  // ── Handle payment result from PaymentForm ───────────────────────────────
  function handlePaymentSubmitted() {
    setPageState('payment_submitted');
    startPolling();
  }

  function handlePaymentError(msg) {
    setError(msg);
    // Stay in payment_entry so user can retry - slot is still reserved
    setPageState('payment_entry');
  }

  function toggleConfirmation(index) {
    setConfirmations(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const { booking, quote, bookedSlots = [] } = quoteData || {};
  const allSlots = quote?.availableSlots || [];
  const bookedSet = new Set(
    (bookedSlots).map(s =>
      `${s.resource_id || s.resourceId}:${s.pickup_date || s.pickupDate}:${s.start_time || s.startTime}`
    )
  );
  const availableSlots = allSlots.filter(s => {
    const key = `${s.resourceId || 'truck-1'}:${s.date}:${s.startTime}`;
    return !bookedSet.has(key);
  });
  const terms = quote?.customerTerms || CUSTOMER_TERMS;
  const allConfirmed = confirmations.every(Boolean);
  const isExpired = quote?.expiresAt && new Date(quote.expiresAt) < new Date();

  // ── Render: loading ───────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // ── Render: not found ─────────────────────────────────────────────────────
  if (pageState === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <h2 className="text-xl font-bold text-gray-800">Quote Not Found</h2>
          <p className="text-gray-500 mt-2">This quote link may be expired or invalid.</p>
        </div>
      </div>
    );
  }

  // ── Render: already scheduled (deposit confirmed) ─────────────────────────
  if (pageState === 'already_scheduled') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">You're All Set!</h2>
          <p className="text-gray-600">Your deposit was received and your appointment is confirmed.</p>
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
            <div className="font-bold text-lg text-gray-900">${quote?.price}</div>
            <div className="text-gray-600">
              <span className="font-medium">Address:</span> {booking?.address}
            </div>
          </div>
          <p className="text-sm text-gray-500">
            We'll be in touch before your pickup. Need to reschedule? Call the number in your confirmation email.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: payment confirmed (deposit just received) ─────────────────────
  if (pageState === 'payment_confirmed') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Deposit Received!</h2>
          <p className="text-gray-600">Your appointment is confirmed. Check your email for a confirmation.</p>
          {paymentInfo && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1 text-left">
              <div className="flex justify-between">
                <span className="text-gray-500">Deposit paid</span>
                <span className="font-semibold text-green-700">
                  ${(paymentInfo.depositCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Remaining (due after service)</span>
                <span className="font-medium text-gray-700">
                  ${((paymentInfo.invoiceTotalCents - paymentInfo.depositCents) / 100).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: payment submitted / polling ───────────────────────────────────
  if (pageState === 'payment_submitted') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center space-y-4">
          <div className="animate-spin w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">Confirming your payment…</h2>
          <p className="text-gray-500 text-sm">
            This usually takes a few seconds. You'll receive a confirmation email shortly.
          </p>
          <p className="text-xs text-gray-400">
            You can close this tab. We'll send your receipt by email.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: quote view + payment entry ────────────────────────────────────
  // Deposit split display
  const totalCents       = paymentInfo?.invoiceTotalCents ?? Math.round(Number(quote?.price || 0) * 100);
  const depositCents     = paymentInfo?.depositCents     ?? Math.floor(totalCents / 2);
  const remainingCents   = totalCents - depositCents;

  const canInitiate = pageState === 'quote_view';
  const isInitiating = pageState === 'initiating_payment';
  const showPayment = pageState === 'payment_entry';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Squatterz</h1>
          <p className="text-xs text-gray-400 tracking-widest uppercase">Junk Removal</p>
          <p className="text-gray-500 mt-3">
            Hi {booking?.customerName?.split(' ')[0] || 'there'}, here's your estimate
          </p>
        </div>

        {/* Price card with deposit split */}
        <div className="bg-gray-900 rounded-2xl shadow-lg px-6 py-6">
          <div className="text-center mb-5">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              Total Quote
            </div>
            <div className="text-4xl font-extrabold text-white">${quote?.price}</div>
            <div className="text-sm text-gray-400 mt-1">No hidden fees</div>
          </div>

          <div className="border-t border-gray-700 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Deposit due today</span>
              <span className="text-green-400 font-semibold">
                ${(depositCents / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Remaining after service</span>
              <span className="text-gray-300 font-medium">
                ${(remainingCents / 100).toFixed(2)}
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4 leading-relaxed">
            A 50% deposit is required to reserve your appointment.
            The remaining balance is due when the job is completed.
          </p>
          <p className="text-xs text-amber-500 text-center mt-1">
            Your appointment is not confirmed until the deposit has been received.
          </p>
        </div>

        {/* What's included */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Includes</h3>
          <div className="space-y-2.5">
            {terms.included.map(item => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-gray-700">
                <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </div>
            ))}
          </div>
          {terms.excluded?.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <div className="text-xs text-gray-500 font-medium mb-1">Not included:</div>
              {terms.excluded.map(item => (
                <div key={item} className="text-sm text-gray-500">{item}</div>
              ))}
            </div>
          )}
        </div>

        {/* Pickup details */}
        <div className="bg-white rounded-2xl shadow-sm border p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Pickup Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Address</span>
              <span className="text-gray-800 font-medium text-right">{booking?.address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Items</span>
              <span className="text-gray-800 font-medium">{booking?.quantity}</span>
            </div>
          </div>
        </div>

        {/* Time slot selection - only shown before payment entry */}
        {!showPayment && availableSlots.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <h3 className="font-bold text-gray-800 mb-3">Choose your pickup time</h3>
            <div className="space-y-2">
              {availableSlots.map((slot, i) => {
                const slotKey = JSON.stringify(slot);
                const label = slot.label || `${slot.date} ${slot.startTime}–${slot.endTime}`;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedSlot(slotKey)}
                    className={`w-full text-left p-3 rounded-xl border text-sm font-medium transition-colors ${
                      selectedSlot === slotKey
                        ? 'bg-green-50 border-green-500 text-green-800'
                        : 'bg-white border-gray-200 text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {allSlots.length > availableSlots.length && (
              <p className="text-xs text-gray-400 mt-2">Some time slots are no longer available.</p>
            )}
          </div>
        )}

        {/* Confirmations - only shown before payment entry */}
        {!showPayment && !isExpired && (
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <h3 className="font-bold text-gray-800 mb-3">Before you continue</h3>
            <div className="space-y-3">
              {terms.customerConfirmations.map((text, i) => (
                <label key={i} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmations[i]}
                    onChange={() => toggleConfirmation(i)}
                    className="mt-0.5 rounded"
                  />
                  <span className="text-sm text-gray-700">{text}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Quote expiry */}
        {quote?.expiresAt && (
          <div className={`text-center text-sm ${isExpired ? 'text-red-500' : 'text-gray-400'}`}>
            {isExpired
              ? 'This quote has expired. Please contact us for an updated price.'
              : `Quote valid until ${new Date(quote.expiresAt).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric',
                })}`}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 text-center">
            {error}
          </div>
        )}

        {/* Stripe Payment Element */}
        {showPayment && paymentInfo && (
          <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
            <h3 className="font-bold text-gray-800">Pay Deposit</h3>
            <div className="flex justify-between text-sm text-gray-600 pb-3 border-b">
              <span>Deposit due now</span>
              <span className="font-semibold text-green-700">
                ${(paymentInfo.depositCents / 100).toFixed(2)}
              </span>
            </div>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: paymentInfo.clientSecret,
                appearance: { theme: 'stripe' },
              }}
            >
              <PaymentForm
                token={token}
                depositCents={paymentInfo.depositCents}
                onPaymentSubmitted={handlePaymentSubmitted}
                onPaymentError={handlePaymentError}
              />
            </Elements>
          </div>
        )}

        {/* Continue to payment button */}
        {!isExpired && canInitiate && (
          <button
            onClick={handleInitiatePayment}
            disabled={
              !allConfirmed ||
              (availableSlots.length > 0 && !selectedSlot)
            }
            className="w-full bg-green-600 text-white py-4 rounded-xl text-lg font-bold shadow-lg disabled:opacity-40 disabled:shadow-none active:bg-green-700 transition-colors"
          >
            Continue to Payment
          </button>
        )}

        {/* Initiating spinner */}
        {isInitiating && (
          <div className="flex items-center justify-center gap-3 py-4">
            <div className="animate-spin w-5 h-5 border-4 border-green-600 border-t-transparent rounded-full" />
            <span className="text-sm text-gray-600">Setting up payment…</span>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pb-4">
          <p className="text-sm text-gray-700">
            Thank you for considering <span className="font-semibold text-gray-900">Squatterz</span>.
          </p>
        </div>

      </div>
    </div>
  );
}
