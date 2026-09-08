import { useState } from 'react';
import type { WorkItem } from './types';
import { recCopy, recIcon, reasonGlyph, sourceLabel, StatusBadge, BillingBadge } from './components';
import { ArrowRight, ChevronDown, CircleHelp, Clock3, Loader2, MapPin, Phone, Mail, FileText, Building2, User, X } from 'lucide-react';
import { getRepo } from '../utils/repository';
import { buildEstimate } from '../utils/estimateBuilder';
import { getSettings } from '../utils/storage';
import { CUSTOMER_TERMS } from '../utils/quoteSnapshot';

type DrawerProps = {
  item: WorkItem;
  onClose: () => void;
  onActionComplete?: () => void;
};

export function WorkDetailDrawer({ item, onClose, onActionComplete }: DrawerProps) {
  const [price, setPrice] = useState(item.price);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const estimatedProfit = price - item.costs;
  const hourlyRate = item.hoursNum > 0 ? Math.round(estimatedProfit / item.hoursNum) : 0;
  const priceStatus = price >= item.price ? 'take' : price >= item.price * 0.82 ? 'review' : 'pass';
  const priceMessage = priceStatus === 'take' ? 'Recommended price for this job.' : priceStatus === 'review' ? 'Below your target earnings rate.' : 'We recommend passing at this price.';
  const isCommercial = item.source === 'commercial_work_order';
  const copy = recCopy(item.recommendation, item.rate);

  const ctaLabel = isCommercial
    ? item.recommendation === 'take' ? `Accept Work Order — $${price.toLocaleString()}` : item.recommendation === 'review' ? 'Review Work Order' : 'Decline Work Order'
    : item.recommendation === 'take' ? `Create Quote — $${price.toLocaleString()}` : item.recommendation === 'review' ? 'Keep reviewing' : 'Pass on job';

  async function handleApprove() {
    if (item.recommendation === 'pass' || item.recommendation === 'review') {
      // For review/pass, just close — no API call yet
      onClose();
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      const repo = await getRepo();
      const settings = getSettings();

      // Build estimate snapshot for the approval
      const booking = await repo.getBookingById(item.id);
      const estimateSnapshot = buildEstimate(booking, settings);

      // Build admin override if price differs from recommended
      const adminOverride = price !== estimateSnapshot.recommendedPrice
        ? {
            originalRecommendedPrice: estimateSnapshot.recommendedPrice,
            approvedPrice: price,
            reason: 'Owner adjusted price in Rivet dashboard',
            adjustedAt: new Date().toISOString(),
          }
        : undefined;

      // Set expiration to 7 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await repo.approveBooking(item.id, {
        approvedPrice: price,
        recommendedPrice: estimateSnapshot.recommendedPrice,
        estimateSnapshot,
        settingsSnapshot: settings,
        customerTerms: CUSTOMER_TERMS,
        expiresAt: expiresAt.toISOString(),
        ...(adminOverride && { adminOverride }),
        decisionContext: {
          recommendation: item.recommendation,
          confidence: item.confidence,
          reasons: item.reasons.map(r => r.text),
        },
      });

      setActionSuccess(isCommercial ? 'Work order accepted' : 'Quote created and sent');
      setTimeout(() => {
        onClose();
        onActionComplete?.();
      }, 1200);
    } catch (err: any) {
      setActionError(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDecline() {
    setActionLoading(true);
    setActionError(null);
    try {
      const repo = await getRepo();
      await repo.updateBooking(item.id, { status: 'declined' });
      setActionSuccess('Job declined');
      setTimeout(() => {
        onClose();
        onActionComplete?.();
      }, 800);
    } catch (err: any) {
      setActionError(err.message || 'Failed to decline');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="job-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="drawer-photo">
          {item.photos[0] ? (
            <img src={item.photos[0]} alt={item.title} />
          ) : (
            <div className="drawer-photo-placeholder" />
          )}
          <button className="drawer-close" onClick={onClose} aria-label="Close details"><X size={20} /></button>
          <div className="drawer-photo-tags">
            <span className={`source-tag ${isCommercial ? 'commercial' : 'residential'}`}>{sourceLabel(item.source)}</span>
            {item.workOrderNumber && <span className="wo-number">{item.workOrderNumber}</span>}
          </div>
        </div>
        <div className="drawer-header">
          <h2>{item.title}</h2>
          <div className="hero-meta">
            <span>{item.customerName}</span>
            {item.customerSub && <><span className="dot-sep" /><span>{item.customerSub}</span></>}
            <span className="dot-sep" />
            <span><MapPin size={13} /> {item.location}</span>
            <span className="dot-sep" />
            <span><Clock3 size={13} /> {item.travel}</span>
          </div>
          <div className="drawer-status-row">
            <StatusBadge status={item.opStatus} />
            <BillingBadge status={item.billingStatus} />
          </div>
        </div>
        <div className="drawer-scroll">
          <div className={`drawer-rec ${item.recommendation}`}>
            <div className="rec-badge-large">
              <span className="rec-icon-large">{recIcon(item.recommendation)}</span>
              <span className="rec-label-large">{copy.label.toUpperCase()}</span>
            </div>
            <p>{copy.sentence}</p>
          </div>
          <div className="drawer-insight">
            <div className="drawer-insight-block">
              <span className="insight-rate">{item.rate}</span>
              <span className="insight-rate-label">Profit per hour</span>
            </div>
            <div className="drawer-insight-block">
              <span className="insight-profit">${item.profit}</span>
              <span className="insight-rate-label">Estimated profit</span>
            </div>
            <div className="drawer-insight-block">
              <span className="insight-profit">{item.hours}</span>
              <span className="insight-rate-label">Estimated time</span>
            </div>
            <div className="drawer-insight-block">
              <span className="insight-profit">{item.travel}</span>
              <span className="insight-rate-label">Travel</span>
            </div>
          </div>
          <div className="detail-section">
            <div className="section-heading"><h3>Estimate</h3><span>At recommended price</span></div>
            <div className="estimate-breakdown">
              <div className="estimate-line"><span>Recommended price</span><strong>${item.price.toLocaleString()}</strong></div>
              {item.costBreakdown.map((line) => (
                <div key={line.label} className="estimate-line sub"><span>{line.label}</span><strong>{line.value ?? '—'}</strong></div>
              ))}
              <div className="estimate-line total"><span>Estimated profit</span><strong className="success-text">${item.profit}</strong></div>
              <div className="estimate-line"><span>Profit per hour</span><strong>{item.rate}</strong></div>
              <div className="estimate-line"><span>Estimate confidence</span><strong>{item.confidence}%</strong></div>
            </div>
          </div>
          <div className="detail-section">
            <div className="section-heading"><h3>{item.recommendation === 'take' ? 'Why we like this job' : item.recommendation === 'review' ? 'Why this needs review' : 'Why we\'d pass'}</h3></div>
            <ul className="reason-list">
              {item.reasons.map((reason, i) => (
                <li key={i} className={reason.icon === 'caution' ? 'caution' : reason.icon === 'x' ? 'pass' : ''}>
                  <span className={`reason-icon ${reason.icon === 'caution' ? 'caution' : reason.icon === 'x' ? 'pass' : ''}`}>{reasonGlyph(reason.icon)}</span>
                  {reason.text}
                </li>
              ))}
            </ul>
            <p className="confidence-note"><CircleHelp size={16} /> {item.recommendation === 'take' ? 'Labor time is reasonably certain, but material quantities may vary.' : 'Some assumptions need verification before committing.'}</p>
          </div>

          {/* Context section: residential vs commercial */}
          {isCommercial ? (
            <div className="detail-section">
              <div className="section-heading"><h3>Work order details</h3></div>
              <div className="context-grid">
                <div className="context-item"><span className="context-label"><Building2 size={14} /> Client</span><strong>{item.companyName}</strong></div>
                <div className="context-item"><span className="context-label"><Building2 size={14} /> Property</span><strong>{item.propertyName}</strong></div>
                <div className="context-item"><span className="context-label"><MapPin size={14} /> Unit</span><strong>{item.unitLabel}</strong></div>
                <div className="context-item"><span className="context-label"><FileText size={14} /> Work order</span><strong>{item.workOrderNumber}</strong></div>
                <div className="context-item"><span className="context-label"><User size={14} /> Requested by</span><strong>{item.requestedBy}<small>{item.requestedByRole}</small></strong></div>
                <div className="context-item"><span className="context-label"><Clock3 size={14} /> Requested date</span><strong>{item.requestedDate}</strong></div>
              </div>
              {item.scope && <div className="context-scope"><span className="context-label">Scope</span><p>{item.scope}</p></div>}
            </div>
          ) : (
            <div className="detail-section">
              <div className="section-heading"><h3>Customer details</h3></div>
              <div className="context-grid">
                <div className="context-item"><span className="context-label"><User size={14} /> Customer</span><strong>{item.customerName}</strong></div>
                {item.phone && <div className="context-item"><span className="context-label"><Phone size={14} /> Phone</span><strong>{item.phone}</strong></div>}
                {item.email && <div className="context-item"><span className="context-label"><Mail size={14} /> Email</span><strong>{item.email}</strong></div>}
                {item.address && <div className="context-item"><span className="context-label"><MapPin size={14} /> Service address</span><strong>{item.address}</strong></div>}
                {item.preferredDate && <div className="context-item"><span className="context-label"><Clock3 size={14} /> Preferred date</span><strong>{item.preferredDate}</strong></div>}
              </div>
              {item.customerNotes && <div className="context-scope"><span className="context-label">Customer notes</span><p>{item.customerNotes}</p></div>}
            </div>
          )}

          {/* Photo gallery */}
          {item.photos.length > 1 && (
            <div className="detail-section">
              <div className="section-heading"><h3>Photos</h3><span>{item.photos.length} photos</span></div>
              <div className="photo-gallery">
                {item.photos.map((src, i) => (
                  <img key={i} src={src} alt={`${item.title} photo ${i + 1}`} loading="lazy" />
                ))}
              </div>
            </div>
          )}

          {/* Price editor */}
          <div className="detail-section quote-editor">
            <div className="section-heading"><h3>Set your price</h3><span>Change it if needed</span></div>
            <label htmlFor="price" className="quote-label">Your {isCommercial ? 'invoice' : 'quote'} amount</label>
            <div className="price-input">
              <span>$</span>
              <input id="price" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
              <span>USD</span>
            </div>
            <div className={`price-impact ${priceStatus}`}>
              <span className="impact-icon">{priceStatus === 'take' ? '\u2713' : priceStatus === 'review' ? '!' : '\u00d7'}</span>
              <div>
                <strong>{priceMessage}</strong>
                <small>${estimatedProfit.toLocaleString()} estimated profit · ${hourlyRate}/hr</small>
              </div>
            </div>
          </div>

          <button className="advanced-toggle" onClick={() => setShowAnalysis(!showAnalysis)}>
            See full analysis <ChevronDown size={17} className={showAnalysis ? 'flip' : ''} />
          </button>
          {showAnalysis && (
            <div className="full-analysis">
              <div className="analysis-row"><span>Goal pace</span><strong>On track</strong></div>
              <div className="analysis-row"><span>Opportunity cost</span><strong>Low</strong></div>
              <div className="analysis-row"><span>Capacity scarcity</span><strong>Moderate</strong></div>
              <div className="analysis-row"><span>Margin threshold</span><strong>35% minimum</strong></div>
              <div className="analysis-row"><span>Conservative estimate</span><strong>${Math.round(item.profit * 0.75)} profit</strong></div>
              <div className="analysis-row"><span>Decision score</span><strong>{item.recommendation === 'take' ? 78 : item.recommendation === 'review' ? 52 : 28} / 100</strong></div>
            </div>
          )}
        </div>

        {/* Action feedback */}
        {actionError && (
          <div className="drawer-action-feedback error">{actionError}</div>
        )}
        {actionSuccess && (
          <div className="drawer-action-feedback success">{actionSuccess}</div>
        )}

        <div className="drawer-actions">
          <button className="btn-secondary" onClick={handleDecline} disabled={actionLoading}>
            Decline
          </button>
          <button className={`btn-primary-cta ${item.recommendation}`} onClick={handleApprove} disabled={actionLoading}>
            {actionLoading ? (
              <><Loader2 size={17} className="spin" /> Processing...</>
            ) : (
              <>{ctaLabel}{item.recommendation === 'take' && <ArrowRight size={17} />}</>
            )}
          </button>
        </div>
      </aside>
    </div>
  );
}
