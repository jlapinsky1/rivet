import type { Recommendation, WorkSource, OperationalStatus, BillingStatus, WorkItem } from './types';
import { ArrowRight, Clock3, MapPin, Zap } from 'lucide-react';

export function recCopy(rec: Recommendation, rate?: string) {
  if (rec === 'take') return { label: 'Take this job', sentence: rate ? `Worth about ${rate} to you — good profit and a smart use of your remaining time.` : 'Good profit and a smart use of your remaining time.' };
  if (rec === 'review') return { label: 'Review this job', sentence: 'Could be worth it, but a few details need a closer look before you commit.' };
  return { label: 'Pass on this job', sentence: 'Too much time and travel for the expected profit — your hours are better spent elsewhere.' };
}

export function recIcon(rec: Recommendation) {
  return rec === 'take' ? '✓' : rec === 'review' ? '!' : '×';
}

export function reasonGlyph(icon: string) {
  return icon === 'check' ? '✓' : icon === 'caution' ? '!' : '×';
}

export function sourceLabel(source: WorkSource) {
  if (source === 'customer_request') return 'Customer Request';
  if (source === 'commercial_work_order') return 'Work Order';
  return 'Owner Created';
}

export function sourceIcon(source: WorkSource) {
  return source === 'commercial_work_order' ? 'work-order' : 'request';
}

export function opStatusLabel(status: OperationalStatus) {
  const labels: Record<OperationalStatus, string> = {
    needs_review: 'Needs Review',
    quoted: 'Quoted',
    approved: 'Approved',
    scheduled: 'Scheduled',
    in_progress: 'In Progress',
    completed: 'Completed',
    declined: 'Declined',
  };
  return labels[status];
}

export function billingStatusLabel(status: BillingStatus) {
  const labels: Record<BillingStatus, string> = {
    not_invoiced: 'Not Invoiced',
    deposit_pending: 'Deposit Pending',
    partially_paid: 'Partially Paid',
    paid: 'Paid',
    overdue: 'Overdue',
  };
  return labels[status];
}

export function RecPill({ rec, compact }: { rec: Recommendation; compact?: boolean }) {
  const copy = recCopy(rec);
  return (
    <span className={`rec-pill ${rec} ${compact ? 'compact' : ''}`}>
      <span className="pill-icon">{recIcon(rec)}</span>
      {compact ? copy.label.replace(' this job', '').replace(' on this job', '') : copy.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: OperationalStatus }) {
  return <span className={`status-badge ${status}`}>{opStatusLabel(status)}</span>;
}

export function BillingBadge({ status }: { status: BillingStatus }) {
  return <span className={`billing-badge ${status}`}>{billingStatusLabel(status)}</span>;
}

export function SourceTag({ source }: { source: WorkSource }) {
  return <span className={`source-tag ${source === 'commercial_work_order' ? 'commercial' : 'residential'}`}>{sourceLabel(source)}</span>;
}

export function MetricCard({ value, label, detail, icon: Icon, accent, progress }: { value: string; label: string; detail: string; icon: typeof Zap; accent?: boolean; progress?: number }) {
  return (
    <div className={`metric-card ${accent ? 'accent' : ''}`}>
      <div className="metric-top">
        <div className="metric-icon"><Icon size={17} /></div>
        {accent && <span className="metric-badge">KEY</span>}
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-detail">{detail}</div>
      {progress !== undefined && <div className="mini-bar"><span style={{ width: `${progress}%` }} /></div>}
    </div>
  );
}

export function WorkRecommendationCard({ item, onView }: { item: WorkItem; onView: () => void }) {
  const copy = recCopy(item.recommendation, item.rate);
  return (
    <section className={`hero-card ${item.recommendation}`}>
      <div className="hero-accent-bar" />
      <div className="hero-body">
        <div className="hero-top">
          <div className="hero-info">
            <div className="hero-eyebrow-row">
              <span className="hero-eyebrow"><Zap size={13} /> {sourceLabel(item.source)}</span>
            </div>
            <h2 className="hero-title">{item.title}</h2>
            <div className="hero-meta">
              <span>{item.customerName}</span>
              {item.customerSub && <><span className="dot-sep" /><span>{item.customerSub}</span></>}
              <span className="dot-sep" />
              <span><MapPin size={13} /> {item.location}</span>
              <span className="dot-sep" />
              <span><Clock3 size={13} /> {item.travel}</span>
            </div>
          </div>
          <div className="hero-photo-strip">
            {item.photos.slice(0, 3).map((src, i) => (
              <img key={i} src={src} alt={item.title} className="hero-thumb" loading="lazy" />
            ))}
          </div>
        </div>
        <div className="hero-recommendation">
          <div className="rec-badge-large">
            <span className="rec-icon-large">{recIcon(item.recommendation)}</span>
            <span className="rec-label-large">{copy.label.toUpperCase()}</span>
          </div>
          <p className="hero-sentence">{copy.sentence}</p>
        </div>
        <div className="hero-insight">
          <div className="insight-primary">
            <span className="insight-rate">{item.rate}</span>
            <span className="insight-rate-label">Profit per hour</span>
          </div>
          <div className="insight-secondary">
            <span className="insight-profit">${item.profit}</span>
            <span className="insight-detail">estimated profit</span>
            <span className="insight-bullet">·</span>
            <span className="insight-detail">{item.hours}</span>
            <span className="insight-bullet">·</span>
            <span className="insight-detail">{item.travel}</span>
          </div>
          <div className="insight-confidence">
            <span className="confidence-label">Estimate confidence</span>
            <span className="confidence-value">{item.confidence}%</span>
          </div>
        </div>
      </div>
      <div className="hero-footer">
        <button className="btn-primary-cta" onClick={onView}>
          View details <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
}

export function WorkRow({ item, onClick }: { item: WorkItem; onClick: () => void }) {
  return (
    <button className="lead-row" onClick={onClick}>
      <div className="lead-thumb">
        <img src={item.photos[0]} alt={item.title} loading="lazy" />
      </div>
      <div className="lead-main">
        <div className="lead-source-row"><SourceTag source={item.source} /></div>
        <strong>{item.title}</strong>
        <small>{item.customerName}{item.customerSub ? ` · ${item.customerSub}` : ''} · {item.travel}</small>
      </div>
      <div className="lead-numbers">
        <strong>${item.profit} profit</strong>
        <small>{item.hours} · {item.rate}</small>
      </div>
      <RecPill rec={item.recommendation} compact />
      <ArrowRight className="lead-chevron" size={18} />
    </button>
  );
}
