import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements, PaymentElement, useStripe, useElements,
} from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

// ── Final payment form (inside <Elements>) ─────────────────────────────────
function FinalPaymentForm({ token, amountRemainingCents, onPaymentSubmitted, onPaymentError }) {
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
        return_url: `${window.location.origin}/invoice/${token}/final?final_return=1`,
      },
      redirect: 'if_required',
    });

    if (error) {
      const msg = error.message || 'Payment failed. Please try again.';
      setLocalError(msg);
      onPaymentError(msg);
      setProcessing(false);
    } else {
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
        className="w-full bg-green-600 text-white py-4 rounded-xl text-lg font-bold shadow-lg disabled:opacity-40 active:bg-green-700 transition-colors"
      >
        {processing
          ? 'Processing…'
          : `Pay Remaining Balance ($${(amountRemainingCents / 100).toFixed(2)})`}
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

// ── Photo grid ────────────────────────────────────────────────────────────
function PhotoGrid({ urls, label }) {
  if (!urls || urls.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
        {label}
      </div>
      <div className={`grid gap-2 ${urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {urls.map((url, i) => (
          <div key={i} className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
            <img
              src={url}
              alt={`${label} ${i + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function FinalPaymentPage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();

  // page states: loading | error | ready | payment_submitted | paid
  const [pageState, setPageState] = useState('loading');
  const [pageData, setPageData] = useState(null);
  const [payError, setPayError] = useState(null);
  const pollRef = useRef(null);

  // ── Load page data ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/get-final-job-page?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok) {
          setPageState('error');
          return;
        }

        setPageData(data);

        // Already fully paid
        if (data.booking?.financiallyCompletedAt || data.payment?.invoiceStatus === 'paid') {
          setPageState('paid');
          return;
        }

        // Returning from 3DS redirect
        if (searchParams.get('final_return') === '1') {
          setPageState('payment_submitted');
          startPolling();
          return;
        }

        setPageState('ready');
      } catch {
        setPageState('error');
      }
    })();

    return () => stopPolling();
  }, [token]);

  // ── Poll for invoice paid ────────────────────────────────────────────────
  function startPolling() {
    let attempts = 0;
    const maxAttempts = 20;

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/get-final-job-page?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.booking?.financiallyCompletedAt || data.payment?.invoiceStatus === 'paid') {
            stopPolling();
            setPageData(data);
            setPageState('paid');
            return;
          }
        }
      } catch {}

      if (attempts >= maxAttempts) {
        stopPolling();
        // Keep showing payment_submitted - customer should check email
      }
    }, 3000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function handlePaymentSubmitted() {
    setPageState('payment_submitted');
    startPolling();
  }

  function handlePaymentError(msg) {
    setPayError(msg);
    setPageState('ready'); // allow retry
  }

  // ── Render: loading ──────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // ── Render: error ────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center">
          <h2 className="text-xl font-bold text-gray-800">Link Unavailable</h2>
          <p className="text-gray-500 mt-2 text-sm">
            This link may be expired or invalid. Please check your email for the latest link.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: payment submitted / polling ──────────────────────────────────
  if (pageState === 'payment_submitted') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 text-center space-y-4">
          <div className="animate-spin w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full mx-auto" />
          <h2 className="text-xl font-bold text-gray-900">Confirming your payment…</h2>
          <p className="text-gray-500 text-sm">
            This usually takes a few seconds. You'll receive a receipt by email.
          </p>
        </div>
      </div>
    );
  }

  const { booking, completion, beforePhotoSignedUrls, afterPhotoSignedUrls, payment, clientSecret, completionPdfPath } = pageData || {};

  // ── Render: paid ─────────────────────────────────────────────────────────
  if (pageState === 'paid') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
        <div className="max-w-md mx-auto px-4 py-8 space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Payment Received!</h1>
            <p className="text-gray-600 mt-1">Your job is fully paid. Thank you!</p>
          </div>

          {/* Completion summary */}
          {completion && (
            <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Completion Summary</h3>
              <SummaryRow label="Completed" value={formatDate(completion.completedAt)} />
              <SummaryRow label="Crew" value={completion.technicianName} />
              <SummaryRow label="Items Removed" value={completion.itemsRemoved} />
              {completion.volumeEstimate && <SummaryRow label="Volume" value={completion.volumeEstimate} />}
              {completion.completionNotes && <SummaryRow label="Notes" value={completion.completionNotes} />}
            </div>
          )}

          {/* Photos */}
          {(beforePhotoSignedUrls?.length > 0 || afterPhotoSignedUrls?.length > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Photos</h3>
              <PhotoGrid urls={beforePhotoSignedUrls} label="Before" />
              <PhotoGrid urls={afterPhotoSignedUrls} label="After" />
            </div>
          )}

          {/* PDF download */}
          {completionPdfPath && (
            <a
              href={completionPdfPath}
              className="block w-full text-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl text-sm font-medium transition-colors"
            >
              Download Completion Report PDF
            </a>
          )}
        </div>
      </div>
    );
  }

  // ── Render: ready (main page) ─────────────────────────────────────────────
  const amountRemainingCents = payment?.amountRemainingCents ?? 0;
  const alreadyFullyPaid = amountRemainingCents === 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Your Job Is Complete</h1>
          {booking?.address && (
            <p className="text-gray-500 mt-1 text-sm">{booking.address}</p>
          )}
        </div>

        {/* Completion summary card */}
        {completion && (
          <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Completion Summary</h3>
            <SummaryRow label="Completed" value={formatDate(completion.completedAt)} />
            <SummaryRow label="Crew" value={completion.technicianName} />
            <SummaryRow label="Items Removed" value={completion.itemsRemoved} />
            {completion.volumeEstimate && <SummaryRow label="Volume" value={completion.volumeEstimate} />}
            {completion.completionNotes && (
              <div className="pt-2 border-t">
                <div className="text-xs text-gray-400 mb-1">Notes</div>
                <div className="text-sm text-gray-700">{completion.completionNotes}</div>
              </div>
            )}
            {completion.disposalNotes && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Disposal / Donation</div>
                <div className="text-sm text-gray-700">{completion.disposalNotes}</div>
              </div>
            )}
          </div>
        )}

        {/* Before & After photos */}
        {(beforePhotoSignedUrls?.length > 0 || afterPhotoSignedUrls?.length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Before & After</h3>
            <PhotoGrid urls={beforePhotoSignedUrls} label="Before" />
            <PhotoGrid urls={afterPhotoSignedUrls} label="After" />
          </div>
        )}

        {/* Invoice summary */}
        {payment && (
          <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Invoice</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Job total</span>
              <span className="text-gray-800 font-medium">
                ${(payment.invoiceTotalCents / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Deposit paid</span>
              <span className="text-gray-800 font-medium">
                ${(payment.amountPaidCents / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t font-semibold">
              <span className={amountRemainingCents > 0 ? 'text-amber-600' : 'text-green-600'}>
                {amountRemainingCents > 0 ? 'Balance due' : 'Fully paid'}
              </span>
              <span className={amountRemainingCents > 0 ? 'text-amber-700' : 'text-green-700'}>
                ${(amountRemainingCents / 100).toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Payment error */}
        {payError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {payError}
          </div>
        )}

        {/* Stripe Payment Element */}
        {!alreadyFullyPaid && clientSecret && (
          <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
            <h3 className="font-bold text-gray-800">Pay Remaining Balance</h3>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: { theme: 'stripe' },
              }}
            >
              <FinalPaymentForm
                token={token}
                amountRemainingCents={amountRemainingCents}
                onPaymentSubmitted={handlePaymentSubmitted}
                onPaymentError={handlePaymentError}
              />
            </Elements>
          </div>
        )}

        {alreadyFullyPaid && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800 text-center font-medium">
            This invoice is fully paid. Thank you!
          </div>
        )}

        {/* PDF download */}
        {completionPdfPath && (
          <a
            href={completionPdfPath}
            className="block w-full text-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl text-sm font-medium transition-colors"
          >
            Download Completion Report PDF
          </a>
        )}

        <div className="text-center pb-4">
          <p className="text-sm text-gray-500">Thank you for choosing Squatterz!</p>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium text-right">{value}</span>
    </div>
  );
}

function formatDate(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}
