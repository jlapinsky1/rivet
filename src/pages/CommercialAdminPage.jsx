import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Search, ChevronRight, AlertTriangle, CheckCircle,
  Clock, Truck, DollarSign, Camera, X, Phone, Mail, MapPin,
  FileText, ArrowLeft, RefreshCw, Upload, Send, Calendar,
  ExternalLink, Image, Loader,
} from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import CommercialQuoteIntelligence from '../components/CommercialQuoteIntelligence';
import { useCommercialQuoteAnalysis } from '../hooks/useCommercialQuoteAnalysis';

// ── Helpers ───────────────────────────────────────────────────────────────

async function adminFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function fmt(cents) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const STATUS_META = {
  pending_review:  { label: 'Pending Review',    color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' },
  quote_sent:      { label: 'Quote Sent',         color: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  awaiting_payment:{ label: 'Awaiting Payment',   color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  scheduled:       { label: 'Scheduled',          color: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  in_progress:     { label: 'In Progress',        color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20' },
  completed:       { label: 'Completed',          color: 'bg-green-500/15 text-green-400 border-green-500/20' },
  cancelled:       { label: 'Cancelled',          color: 'bg-red-500/15 text-red-400 border-red-500/20' },
};

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending_review', label: 'Pending' },
  { id: 'quote_sent', label: 'Quote Sent' },
  { id: 'awaiting_payment', label: 'Awaiting Payment' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
];

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'bg-gray-500/15 text-gray-400 border-gray-500/20' };
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${m.color}`}>
      {m.label}
    </span>
  );
}

// ── Job List Card ─────────────────────────────────────────────────────────

function JobCard({ job, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-4 border-b border-white/5 hover:bg-white/3 transition-colors ${
        selected ? 'bg-white/5 border-l-2 border-l-[#22c55e]' : 'border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-white font-semibold text-sm leading-snug line-clamp-1">
          {job.property?.name || 'Unknown Property'}
        </span>
        <StatusBadge status={job.status} />
      </div>
      {job.unit && <p className="text-xs text-white/40 mb-1">Unit {job.unit}</p>}
      <p className="text-xs text-white/35 mb-1">
        {job.client?.companyName || job.client?.contactName || 'Unknown client'}
      </p>
      <p className="text-xs text-white/40 line-clamp-1">{job.description || 'No description'}</p>
      <p className="text-xs text-white/30 mt-1.5">{fmtDate(job.createdAt)}</p>
    </button>
  );
}

// ── Quote Panel ───────────────────────────────────────────────────────────

function QuotePanel({ job, onRefresh }) {
  const analysis = useCommercialQuoteAnalysis(job);
  const { estimate, getPriceFlags, blockerOverrides } = analysis;

  const [quotePrice, setQuotePrice] = useState(
    job.estimate ? String(job.estimate) : '',
  );
  const [overrideReason, setOverrideReason] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const [prefilled, setPrefilled] = useState(!!job.estimate);

  useEffect(() => {
    if (!prefilled && estimate?.recommendedPrice && !quotePrice) {
      setQuotePrice(String(estimate.recommendedPrice));
      setPrefilled(true);
    }
  }, [estimate?.recommendedPrice, prefilled, quotePrice]);

  const priceFlags = quotePrice ? getPriceFlags(quotePrice) : [];
  const activeBlockers = [...analysis.riskFlags, ...priceFlags].filter(
    (f) => f.severity === 'blocker' && !blockerOverrides[f.flag],
  );

  const handleSend = async () => {
    const val = parseFloat(quotePrice);
    if (!val || val <= 0) { setError('Enter a valid estimate amount'); return; }
    if (activeBlockers.length > 0) {
      setError('Resolve or override all blockers before sending the quote.');
      return;
    }
    if (estimate && val !== estimate.recommendedPrice && !overrideReason.trim()) {
      setError('Add a reason when quoting below or above the recommended price.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      await adminFetch('/api/send-commercial-quote', {
        method: 'POST',
        body: JSON.stringify({ jobId: job.id, estimate: val }),
      });
      setSent(true);
      setTimeout(onRefresh, 800);
    } catch (e) {
      setError(e.message);
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-sm text-green-400 flex items-center gap-2">
        <CheckCircle className="w-4 h-4" /> Quote sent! Client has been notified by email.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CommercialQuoteIntelligence
        analysis={analysis}
        quotePrice={quotePrice}
        priceFlags={priceFlags}
      />

      <div className="bg-white/4 border border-white/8 rounded-xl p-5 space-y-4">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#22c55e]" />
          {job.status === 'quote_sent' ? 'Resend Quote' : 'Send Quote to Client'}
        </h3>
        {job.status === 'quote_sent' && (
          <p className="text-xs text-white/40">
            Last sent: {fmtDateTime(job.quoteSentAt)}. You can update the estimate and resend.
          </p>
        )}
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Total Estimate ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={quotePrice}
            onChange={(e) => setQuotePrice(e.target.value)}
            placeholder={estimate ? String(estimate.recommendedPrice) : 'e.g. 350.00'}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#22c55e]/50"
          />
          {estimate && quotePrice && Number(quotePrice) !== estimate.recommendedPrice && (
            <p className="text-xs text-amber-400 mt-1">
              Recommended: ${estimate.recommendedPrice} (difference:{' '}
              {Number(quotePrice) > estimate.recommendedPrice ? '+' : ''}
              ${Number(quotePrice) - estimate.recommendedPrice})
            </p>
          )}
          {quotePrice && parseFloat(quotePrice) > 0 && (
            <p className="text-xs text-white/40 mt-1">
              Deposit (50%): ${(parseFloat(quotePrice) / 2).toFixed(2)} - Balance: ${(parseFloat(quotePrice) / 2).toFixed(2)}
            </p>
          )}
        </div>

        {estimate && quotePrice && Number(quotePrice) !== estimate.recommendedPrice && (
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Reason for price adjustment</label>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. Repeat client, competitive bid, bundled property rate…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#22c55e]/50"
            />
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
        <button
          onClick={handleSend}
          disabled={sending}
          className="w-full bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-black font-bold text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />
          {sending ? 'Sending…' : 'Send Quote Email'}
        </button>
      </div>
    </div>
  );
}

// ── Decline Panel ─────────────────────────────────────────────────────────

function DeclinePanel({ job, onRefresh, onDeclined }) {
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const canDecline = ['pending_review', 'quote_sent', 'awaiting_payment'].includes(job.status);
  if (!canDecline || done) {
    if (done) {
      return (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-300">
          Request declined. The client has been notified by email.
        </div>
      );
    }
    return null;
  }

  const handleDecline = async () => {
    if (!confirm('Decline this job and email the client?')) return;
    setDeclining(true);
    setError(null);
    try {
      const result = await adminFetch('/api/decline-commercial-job', {
        method: 'POST',
        body: JSON.stringify({ jobId: job.id }),
      });
      setDone(true);
      if (!result.emailSent && result.emailError) {
        setError(`Declined, but email failed: ${result.emailError}`);
      }
      setTimeout(() => {
        onRefresh();
        onDeclined?.();
      }, 1200);
    } catch (e) {
      setError(e.message);
      setDeclining(false);
    }
  };

  return (
    <div className="bg-white/4 border border-red-500/20 rounded-xl p-5 space-y-3">
      <h3 className="font-bold text-white text-sm">Decline Request</h3>
      <p className="text-xs text-white/50 leading-relaxed">
        Decline this job and send the client a courtesy email explaining we cannot take it at this time.
      </p>
      {error && (
        <p className="text-xs text-amber-400 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
      <button
        onClick={handleDecline}
        disabled={declining}
        className="w-full bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
      >
        {declining ? 'Declining…' : 'Decline & Notify Client'}
      </button>
    </div>
  );
}

// ── Payment Panel ─────────────────────────────────────────────────────────

function PaymentPanel({ job }) {
  const p = job.paymentSummary;
  if (!p) return null;

  return (
    <div className="bg-white/4 border border-white/8 rounded-xl p-5 space-y-3">
      <h3 className="font-bold text-white text-sm flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-[#22c55e]" />
        Payment
      </h3>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-white/40 mb-0.5">Total</p>
          <p className="text-white font-medium">{fmt(p.invoiceTotalCents)}</p>
        </div>
        <div>
          <p className="text-white/40 mb-0.5">Paid</p>
          <p className="text-white font-medium">{fmt(p.amountPaidCents)}</p>
        </div>
        <div>
          <p className="text-white/40 mb-0.5">Remaining</p>
          <p className={`font-medium ${p.amountRemainingCents > 0 ? 'text-orange-400' : 'text-green-400'}`}>
            {fmt(p.amountRemainingCents)}
          </p>
        </div>
        <div>
          <p className="text-white/40 mb-0.5">Deposit</p>
          <p className={`font-medium ${job.depositConfirmedAt ? 'text-green-400' : 'text-yellow-400'}`}>
            {job.depositConfirmedAt ? 'Paid' : 'Pending'}
          </p>
        </div>
      </div>
      {p.invoicePdfUrl && (
        <a
          href={p.invoicePdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-[#22c55e] hover:underline"
        >
          <FileText className="w-3.5 h-3.5" /> Download Invoice PDF
        </a>
      )}
      {p.hostedInvoiceUrl && (
        <a
          href={p.hostedInvoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open in Stripe Dashboard
        </a>
      )}
    </div>
  );
}

// ── Schedule Panel ────────────────────────────────────────────────────────

function SchedulePanel({ job, onRefresh }) {
  const [date, setDate] = useState(job.scheduledDate ? job.scheduledDate.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/api/update-commercial-job', {
        method: 'POST',
        body: JSON.stringify({ jobId: job.id, scheduledDate: date || null }),
      });
      onRefresh();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    setSaving(true);
    setError(null);
    try {
      await adminFetch('/api/update-commercial-job', {
        method: 'POST',
        body: JSON.stringify({ jobId: job.id, status: newStatus }),
      });
      onRefresh();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="bg-white/4 border border-white/8 rounded-xl p-5 space-y-4">
      <h3 className="font-bold text-white text-sm flex items-center gap-2">
        <Calendar className="w-4 h-4 text-[#22c55e]" />
        Schedule
      </h3>
      <div>
        <label className="block text-xs text-white/50 mb-1.5">Service Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#22c55e]/50"
        />
      </div>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-white/8 hover:bg-white/12 border border-white/10 text-white font-semibold text-xs py-2 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save Date'}
        </button>
        {job.status === 'scheduled' && (
          <button
            onClick={() => handleStatusChange('in_progress')}
            disabled={saving}
            className="flex-1 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/20 text-cyan-400 font-semibold text-xs py-2 rounded-lg transition-colors"
          >
            Mark In Progress
          </button>
        )}
      </div>
    </div>
  );
}

// ── Completion Panel ──────────────────────────────────────────────────────

function CompletionPanel({ job, onRefresh }) {
  const [completionNotes, setCompletionNotes] = useState(job.completionNotes || '');
  const [itemsRemoved, setItemsRemoved] = useState(job.itemsRemoved || '');
  const [finalAmount, setFinalAmount] = useState(job.finalAmount ? String(job.finalAmount) : job.estimate ? String(job.estimate) : '');
  const [beforeFiles, setBeforeFiles] = useState([]);
  const [afterFiles, setAfterFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState(null);
  const beforeRef = useRef();
  const afterRef = useRef();

  const uploadPhotos = async (files, kind) => {
    const { data: { session } } = await supabase.auth.getSession();
    const paths = [];
    for (const file of files) {
      const path = `jobs/${job.id}/${kind}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
      const { data, error } = await supabase.storage
        .from('job-photos')
        .upload(path, file, { contentType: file.type });
      if (error) throw new Error(`Photo upload failed: ${error.message}`);

      // Create job_photos record
      await fetch('/api/update-commercial-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ jobId: job.id }), // just a ping - photos handled separately
      }).catch(() => {});

      // Insert photo record directly via adminFetch to a dedicated endpoint isn't available;
      // we'll pass paths to complete-commercial-job
      paths.push(data.path);
    }
    return paths;
  };

  const handleComplete = async () => {
    setCompleting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Upload before photos
      const beforePaths = [];
      for (const file of beforeFiles) {
        const path = `jobs/${job.id}/before/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
        const { data, error: upErr } = await supabase.storage
          .from('job-photos')
          .upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        beforePaths.push(data.path);
      }

      // Upload after photos
      const afterPaths = [];
      for (const file of afterFiles) {
        const path = `jobs/${job.id}/after/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
        const { data, error: upErr } = await supabase.storage
          .from('job-photos')
          .upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        afterPaths.push(data.path);
      }

      // Insert job_photos records via supabase directly (admin has service role access via function)
      await adminFetch('/api/complete-commercial-job', {
        method: 'POST',
        body: JSON.stringify({
          jobId: job.id,
          completionNotes: completionNotes || null,
          itemsRemoved: itemsRemoved || null,
          finalAmount: parseFloat(finalAmount) || null,
          beforePhotoPaths: beforePaths,
          afterPhotoPaths: afterPaths,
        }),
      });

      onRefresh();
    } catch (e) {
      setError(e.message);
      setCompleting(false);
    }
  };

  if (job.status === 'completed') {
    return (
      <div className="bg-green-500/8 border border-green-500/15 rounded-xl p-5 space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <span className="text-green-400 font-bold text-sm">Job Completed</span>
        </div>
        {job.completedAt && <p className="text-xs text-white/40">Completed: {fmtDateTime(job.completedAt)}</p>}
        {job.itemsRemoved && <p className="text-xs text-white/60"><strong className="text-white/40">Items:</strong> {job.itemsRemoved}</p>}
        {job.completionNotes && <p className="text-xs text-white/60"><strong className="text-white/40">Notes:</strong> {job.completionNotes}</p>}
      </div>
    );
  }

  return (
    <div className="bg-white/4 border border-white/8 rounded-xl p-5 space-y-4">
      <h3 className="font-bold text-white text-sm flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-[#22c55e]" />
        Complete Job
      </h3>

      <div>
        <label className="block text-xs text-white/50 mb-1.5">Items Removed</label>
        <textarea
          rows={2}
          value={itemsRemoved}
          onChange={e => setItemsRemoved(e.target.value)}
          placeholder="e.g. 2 mattresses, sofa, 4 bags of trash"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-[#22c55e]/50"
        />
      </div>

      <div>
        <label className="block text-xs text-white/50 mb-1.5">Completion Notes</label>
        <textarea
          rows={3}
          value={completionNotes}
          onChange={e => setCompletionNotes(e.target.value)}
          placeholder="Any issues noticed, access notes, etc."
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-[#22c55e]/50"
        />
      </div>

      <div>
        <label className="block text-xs text-white/50 mb-1.5">Final Amount ($)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={finalAmount}
          onChange={e => setFinalAmount(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#22c55e]/50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Before Photos</label>
          <button
            onClick={() => beforeRef.current?.click()}
            className="w-full border border-dashed border-white/15 hover:border-white/30 rounded-lg p-3 text-center transition-colors"
          >
            <Camera className="w-4 h-4 text-white/40 mx-auto mb-1" />
            <span className="text-xs text-white/40">{beforeFiles.length > 0 ? `${beforeFiles.length} files` : 'Add photos'}</span>
          </button>
          <input ref={beforeRef} type="file" multiple accept="image/*" className="hidden"
            onChange={e => setBeforeFiles(Array.from(e.target.files || []))} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">After Photos</label>
          <button
            onClick={() => afterRef.current?.click()}
            className="w-full border border-dashed border-white/15 hover:border-white/30 rounded-lg p-3 text-center transition-colors"
          >
            <Camera className="w-4 h-4 text-white/40 mx-auto mb-1" />
            <span className="text-xs text-white/40">{afterFiles.length > 0 ? `${afterFiles.length} files` : 'Add photos'}</span>
          </button>
          <input ref={afterRef} type="file" multiple accept="image/*" className="hidden"
            onChange={e => setAfterFiles(Array.from(e.target.files || []))} />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      <button
        onClick={handleComplete}
        disabled={completing}
        className="w-full bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 text-black font-bold text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {completing ? (
          <><Loader className="w-4 h-4 animate-spin" /> Completing…</>
        ) : (
          <><CheckCircle className="w-4 h-4" /> Complete &amp; Send Packet</>
        )}
      </button>
      <p className="text-xs text-white/30 text-center">
        This will send the completion packet and final invoice to the client.
      </p>
    </div>
  );
}

// ── Admin Notes ───────────────────────────────────────────────────────────

function AdminNotes({ job, onRefresh }) {
  const [notes, setNotes] = useState(job.adminNotes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminFetch('/api/update-commercial-job', {
        method: 'POST',
        body: JSON.stringify({ jobId: job.id, adminNotes: notes }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white/4 border border-white/8 rounded-xl p-5 space-y-3">
      <h3 className="font-bold text-white text-sm">Admin Notes</h3>
      <textarea
        rows={3}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Internal notes (not visible to client)"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-[#22c55e]/50"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="text-xs text-white/50 hover:text-white transition-colors"
      >
        {saving ? 'Saving…' : 'Save Notes'}
      </button>
    </div>
  );
}

// ── Photo Gallery ─────────────────────────────────────────────────────────

function PhotoGallery({ photos, title, kinds }) {
  const filtered = photos.filter(p => kinds.includes(p.kind));
  if (filtered.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-white/40 uppercase tracking-widest mb-2">{title}</p>
      <div className="grid grid-cols-3 gap-2">
        {filtered.map(p => (
          <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"
            className="aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/8 hover:border-white/20 transition-colors">
            <img src={p.url} alt={p.kind} className="w-full h-full object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Job Detail Panel ──────────────────────────────────────────────────────

function JobDetail({ jobSummary, onRefresh, onClose }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch(`/api/get-admin-commercial-job-detail?jobId=${jobSummary.id}`);
      setJob(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [jobSummary.id]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const handleRefresh = () => { loadDetail(); onRefresh(); };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={loadDetail} className="mt-3 text-xs text-white/50 hover:text-white">Retry</button>
      </div>
    );
  }

  if (!job) return null;

  const showQuotePanel = ['pending_review', 'quote_sent'].includes(job.status);
  const showSchedulePanel = ['awaiting_payment', 'scheduled', 'in_progress'].includes(job.status);
  const showCompletionPanel = ['scheduled', 'in_progress', 'completed'].includes(job.status);

  return (
    <div className="p-6 space-y-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={job.status} />
            <span className="text-xs text-white/30 font-mono">{job.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <h2 className="text-xl font-black text-white">{job.property.name}</h2>
          {job.unit && <p className="text-sm text-white/50">Unit {job.unit}</p>}
        </div>
        <button onClick={handleRefresh} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
          <RefreshCw className="w-4 h-4 text-white/40" />
        </button>
      </div>

      {/* Client + Property Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/4 border border-white/8 rounded-xl p-4 space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-wider">Client</p>
          <p className="text-sm font-semibold text-white">{job.client.companyName || job.client.contactName || '-'}</p>
          {job.client.contactName && job.client.companyName && (
            <p className="text-xs text-white/50">{job.client.contactName}</p>
          )}
          {job.client.email && (
            <a href={`mailto:${job.client.email}`} className="flex items-center gap-1.5 text-xs text-[#22c55e] hover:underline">
              <Mail className="w-3 h-3" /> {job.client.email}
            </a>
          )}
          {job.client.phone && (
            <a href={`tel:${job.client.phone}`} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors">
              <Phone className="w-3 h-3" /> {job.client.phone}
            </a>
          )}
        </div>
        <div className="bg-white/4 border border-white/8 rounded-xl p-4 space-y-2">
          <p className="text-xs text-white/40 uppercase tracking-wider">Property</p>
          <p className="text-sm font-semibold text-white">{job.property.name}</p>
          <p className="flex items-start gap-1.5 text-xs text-white/50">
            <MapPin className="w-3 h-3 mt-0.5 shrink-0" /> {job.property.address}
          </p>
          {job.property.primaryContactPhone && (
            <a href={`tel:${job.property.primaryContactPhone}`} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors">
              <Phone className="w-3 h-3" /> {job.property.primaryContactPhone}
            </a>
          )}
        </div>
      </div>

      {/* Job Details */}
      <div className="bg-white/4 border border-white/8 rounded-xl p-4 space-y-3">
        <p className="text-xs text-white/40 uppercase tracking-wider">Job Details</p>
        {job.description && (
          <div>
            <p className="text-xs text-white/40 mb-1">Description</p>
            <p className="text-sm text-white/75 leading-relaxed">{job.description}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-white/40 mb-0.5">Preferred Date</p>
            <p className="text-white/70">{fmtDate(job.preferredDate)}</p>
          </div>
          <div>
            <p className="text-white/40 mb-0.5">Submitted</p>
            <p className="text-white/70">{fmtDate(job.createdAt)}</p>
          </div>
          {job.scheduledDate && (
            <div>
              <p className="text-white/40 mb-0.5">Scheduled</p>
              <p className="text-white/70">{fmtDate(job.scheduledDate)}</p>
            </div>
          )}
          {job.estimate && (
            <div>
              <p className="text-white/40 mb-0.5">Estimate</p>
              <p className="text-white/70">${Number(job.estimate).toFixed(2)}</p>
            </div>
          )}
        </div>
        {job.accessNotes && (
          <div>
            <p className="text-xs text-white/40 mb-1">Access Notes</p>
            <p className="text-sm text-white/60">{job.accessNotes}</p>
          </div>
        )}
      </div>

      {/* Submission Photos */}
      {job.photos.some(p => p.kind === 'submission') && (
        <div className="bg-white/4 border border-white/8 rounded-xl p-4">
          <PhotoGallery photos={job.photos} title="Submitted Photos" kinds={['submission']} />
        </div>
      )}

      {/* Before/After Photos */}
      {job.photos.some(p => ['before', 'after'].includes(p.kind)) && (
        <div className="bg-white/4 border border-white/8 rounded-xl p-4 space-y-4">
          <PhotoGallery photos={job.photos} title="Before" kinds={['before']} />
          <PhotoGallery photos={job.photos} title="After" kinds={['after']} />
        </div>
      )}

      {/* Action Panels */}
      {showQuotePanel && <QuotePanel job={job} onRefresh={handleRefresh} />}
      {showQuotePanel && (
        <DeclinePanel
          job={job}
          onRefresh={handleRefresh}
          onDeclined={() => onRefresh()}
        />
      )}
      {job.status === 'awaiting_payment' && (
        <DeclinePanel job={job} onRefresh={handleRefresh} onDeclined={() => onRefresh()} />
      )}
      {job.paymentSummary && <PaymentPanel job={job} />}
      {showSchedulePanel && <SchedulePanel job={job} onRefresh={handleRefresh} />}
      {showCompletionPanel && <CompletionPanel job={job} onRefresh={handleRefresh} />}
      <AdminNotes job={job} onRefresh={handleRefresh} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function CommercialAdminPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(undefined); // undefined=loading
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState(null);

  // Auth check
  useEffect(() => {
    if (!supabase) { navigate('/admin/settings'); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate('/admin/settings'); return; }
      // Verify admin
      try {
        await adminFetch('/api/get-admin-commercial-jobs?limit=1');
        setAuthed(true);
      } catch {
        navigate('/admin/settings');
        return;
      }
    });
  }, [navigate]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      const data = await adminFetch(`/api/get-admin-commercial-jobs?${params}`);
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error('Failed to load jobs:', e);
      setJobs([]);
      setTotal(0);
      setLoadError(e?.message || 'Failed to load commercial jobs.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    if (authed) loadJobs();
  }, [authed, loadJobs]);

  if (authed === undefined) {
    return (
      <div className="min-h-screen bg-[#0a0f0d] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-white font-sans antialiased flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#0a0f0d] sticky top-0 z-40">
        <div className="flex items-center justify-between px-5 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin/settings')}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Admin
            </button>
            <span className="text-white/20">/</span>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#22c55e]" />
              <span className="font-bold text-sm">Commercial Jobs</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/30">{total} jobs</span>
            <button
              onClick={loadJobs}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-white/40" />
            </button>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1 px-4 pb-3 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setStatusFilter(tab.id); setSelected(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? 'bg-[#22c55e] text-black'
                  : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/8'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Job List */}
        <aside className="w-80 shrink-0 border-r border-white/5 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search client, property, description…"
                className="w-full bg-white/5 border border-white/8 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadError && (
              <div className="m-3 bg-red-400/10 border border-red-400/20 rounded-lg p-3 text-xs text-red-300">
                {loadError}
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Building2 className="w-8 h-8 text-white/15 mx-auto mb-2" />
                <p className="text-xs text-white/30">No jobs found</p>
              </div>
            ) : (
              jobs.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  selected={selected?.id === job.id}
                  onClick={() => setSelected(job)}
                />
              ))
            )}
          </div>
        </aside>

        {/* Detail Panel */}
        <main className="flex-1 overflow-y-auto">
          {selected ? (
            <JobDetail
              key={selected.id}
              jobSummary={selected}
              onRefresh={loadJobs}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-center py-20">
              <div>
                <Building2 className="w-10 h-10 text-white/10 mx-auto mb-3" />
                <p className="text-sm text-white/25">Select a job to view details</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
