import React, { useState, useEffect } from 'react';
import { getRepo } from '../../../utils/repository';

function formatCurrency(cents) {
  if (cents == null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status }) {
  const styles = {
    paid: 'bg-green-100 text-green-700',
    open: 'bg-blue-100 text-blue-700',
    draft: 'bg-gray-100 text-gray-600',
    uncollectible: 'bg-red-100 text-red-700',
    void: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.toUpperCase() || '-'}
    </span>
  );
}

export default function PaymentSummaryPanel({ bookingId, stripeInvoiceId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const repo = await getRepo();
      const data = await repo.getPaymentSummary(bookingId);
      setSummary(data);
    } catch (e) {
      setError(e.message || 'Failed to load payment data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [bookingId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-4 bg-gray-100 rounded w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-red-600">{error}</div>
        <button onClick={load} className="text-xs text-blue-600 hover:text-blue-800">
          Retry
        </button>
      </div>
    );
  }

  if (!summary) return null;

  const depositDate = formatDate(summary.depositConfirmedAt);
  const finalDate = formatDate(summary.financiallyCompletedAt);

  // Derive clean amounts from Stripe DTO
  const depositCents = summary.depositRequiredCents ?? null;
  const finalPaidCents = summary.depositConfirmed && depositCents != null
    ? Math.max(0, (summary.amountPaidCents || 0) - depositCents)
    : null;

  return (
    <div className="space-y-3">
      {/* Amounts */}
      <div className="space-y-2">
        <PayRow label="Job total" value={formatCurrency(summary.invoiceTotalCents)} bold />
        <PayRow
          label={`Deposit paid${depositDate ? ` · ${depositDate}` : ''}`}
          value={summary.depositConfirmed && depositCents != null
            ? formatCurrency(depositCents)
            : '-'}
        />
        {(finalDate || finalPaidCents > 0) && (
          <PayRow
            label={`Final payment${finalDate ? ` · ${finalDate}` : ''}`}
            value={finalPaidCents != null ? formatCurrency(finalPaidCents) : '-'}
          />
        )}
        <div className="border-t pt-2">
          <PayRow
            label="Remaining balance"
            value={formatCurrency(summary.amountRemainingCents)}
            bold
            highlight={summary.amountRemainingCents > 0}
          />
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Invoice status</span>
        <StatusBadge status={summary.invoiceStatus} />
      </div>

      {/* Admin links */}
      <div className="flex flex-wrap gap-2 pt-1">
        {stripeInvoiceId && (
          <a
            href={`https://dashboard.stripe.com/invoices/${stripeInvoiceId}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Stripe Dashboard (admin)
          </a>
        )}
        {summary.invoicePdfUrl && (
          <a
            href={summary.invoicePdfUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Invoice PDF
          </a>
        )}
      </div>
    </div>
  );
}

function PayRow({ label, value, bold, highlight }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`${bold ? 'font-bold' : 'font-medium'} ${highlight ? 'text-amber-700' : 'text-gray-800'}`}>
        {value}
      </span>
    </div>
  );
}
