import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { CheckCircle, AlertTriangle, Building2, Trash2 } from 'lucide-react';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

function fmt(cents) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DepositForm({ jobId, token, depositCents, invoiceTotalCents, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    setError(null);

    const { error: stripeErr } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (stripeErr) {
      setError(stripeErr.message || 'Payment failed. Please try again.');
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-black font-bold text-base py-3.5 rounded-xl transition-colors"
      >
        {processing ? 'Processing…' : `Pay Deposit - ${fmt(depositCents)}`}
      </button>
      <p className="text-xs text-white/30 text-center">
        Remaining balance of {fmt(invoiceTotalCents - depositCents)} is due after the job is complete.
      </p>
    </form>
  );
}

export default function CommercialQuotePage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState('loading'); // loading | view | accepting | payment | success
  const [clientSecret, setClientSecret] = useState(null);
  const [depositCents, setDepositCents] = useState(0);
  const [invoiceTotalCents, setInvoiceTotalCents] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/get-commercial-quote?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Quote not found'); setStage('error'); return; }
        setQuote(data);

        if (['awaiting_payment', 'scheduled', 'in_progress', 'completed'].includes(data.status)) {
          // Already accepted - go straight to payment or show status
          if (data.status === 'awaiting_payment') {
            await loadPayment(data);
          } else {
            setStage('already_scheduled');
          }
        } else {
          setStage('view');
        }
      } catch (e) {
        setError('Failed to load quote. Please try again.');
        setStage('error');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const loadPayment = async (q = quote) => {
    try {
      const res = await fetch('/api/create-commercial-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to set up payment'); setStage('error'); return; }
      setClientSecret(data.clientSecret);
      setDepositCents(data.depositCents);
      setInvoiceTotalCents(data.invoiceTotalCents);
      setStage('payment');
    } catch (e) {
      setError('Failed to set up payment. Please try again.');
      setStage('error');
    }
  };

  const handleAccept = async () => {
    setStage('accepting');
    try {
      const res = await fetch('/api/accept-commercial-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to accept quote'); setStage('error'); return; }
      await loadPayment();
    } catch (e) {
      setError('Failed to accept quote. Please try again.');
      setStage('error');
    }
  };

  const stripeOptions = clientSecret ? {
    clientSecret,
    appearance: {
      theme: 'night',
      variables: { colorPrimary: '#22c55e', borderRadius: '8px' },
    },
  } : null;

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white font-sans antialiased">
      <header className="border-b border-white/5 px-5 h-14 flex items-center justify-between max-w-2xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-[#0a0f0d]" />
          </div>
          <span className="font-black tracking-widest text-xs uppercase">Squatterz</span>
        </div>
        <span className="text-[#22c55e] text-xs font-semibold uppercase tracking-widest">Commercial</span>
      </header>

      <main className="max-w-lg mx-auto px-5 py-12">
        {(loading || stage === 'loading' || stage === 'accepting') && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center py-20">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Unable to load quote</h2>
            <p className="text-white/50 text-sm">{error}</p>
          </div>
        )}

        {stage === 'already_scheduled' && quote && (
          <div className="text-center py-20">
            <CheckCircle className="w-12 h-12 text-[#22c55e] mx-auto mb-4" />
            <h2 className="text-2xl font-black mb-2">You're all set!</h2>
            <p className="text-white/55 text-sm mb-6">
              This job is already accepted and scheduled. Check your portal for updates.
            </p>
            <button
              onClick={() => navigate('/portal')}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold px-8 py-3 rounded-full text-sm"
            >
              Go to Portal
            </button>
          </div>
        )}

        {stage === 'success' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-[#22c55e]/15 border border-[#22c55e]/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-[#22c55e]" />
            </div>
            <h2 className="text-3xl font-black mb-3">Deposit confirmed!</h2>
            <p className="text-white/55 text-sm leading-relaxed mb-8 max-w-sm mx-auto">
              Your deposit is received and your job is scheduled. We'll be in touch with a service date.
              The remaining balance is due after the job is complete.
            </p>
            <button
              onClick={() => navigate('/portal')}
              className="bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold px-8 py-3.5 rounded-full"
            >
              View in Portal
            </button>
          </div>
        )}

        {stage === 'view' && quote && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm mb-5">
                <Building2 className="w-4 h-4 text-[#22c55e]" />
                <span className="text-white/70">Estimate Ready</span>
              </div>
              <h1 className="text-3xl font-black">Your estimate</h1>
              <p className="text-white/50 text-sm mt-2">
                {quote.propertyName}{quote.unit ? ` - Unit ${quote.unit}` : ''}
              </p>
            </div>

            <div className="bg-white/4 border border-white/8 rounded-2xl p-6 space-y-4">
              <div className="text-center">
                <p className="text-white/40 text-xs uppercase tracking-widest mb-1">Total estimate</p>
                <p className="text-[#22c55e] text-4xl font-black">${Number(quote.estimate).toFixed(2)}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/8">
                <div className="bg-white/4 rounded-xl p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Deposit due now</p>
                  <p className="text-white font-bold">{fmt(quote.depositCents)}</p>
                </div>
                <div className="bg-white/4 rounded-xl p-3 text-center">
                  <p className="text-white/40 text-xs mb-1">Balance after job</p>
                  <p className="text-white font-bold">{fmt(quote.balanceDueCents)}</p>
                </div>
              </div>
            </div>

            {quote.description && (
              <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
                <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Job description</p>
                <p className="text-sm text-white/75 leading-relaxed">{quote.description}</p>
              </div>
            )}

            <div className="bg-white/4 border border-white/8 rounded-2xl p-5 text-sm text-white/60 leading-relaxed space-y-1">
              <p>✓ Price is locked - no surprises</p>
              <p>✓ Before &amp; after photos delivered</p>
              <p>✓ Completion packet sent when done</p>
            </div>

            <button
              onClick={handleAccept}
              className="w-full bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold text-base py-4 rounded-xl transition-colors"
            >
              Accept &amp; Pay Deposit - {fmt(quote.depositCents)}
            </button>
          </div>
        )}

        {stage === 'payment' && stripeOptions && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-black">Pay deposit</h1>
              <p className="text-white/50 text-sm mt-1">
                {quote?.propertyName}{quote?.unit ? ` - Unit ${quote.unit}` : ''}
              </p>
            </div>

            <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-white/50">Total estimate</span>
                <span className="text-white font-medium">{fmt(invoiceTotalCents)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span className="text-white/70">Deposit due now (50%)</span>
                <span className="text-[#22c55e]">{fmt(depositCents)}</span>
              </div>
            </div>

            <Elements stripe={stripePromise} options={stripeOptions}>
              <DepositForm
                jobId={quote?.jobId}
                token={token}
                depositCents={depositCents}
                invoiceTotalCents={invoiceTotalCents}
                onSuccess={() => setStage('success')}
              />
            </Elements>
          </div>
        )}
      </main>
    </div>
  );
}
