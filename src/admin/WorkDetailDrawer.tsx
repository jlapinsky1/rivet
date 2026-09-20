import { useState, useRef, useCallback } from 'react';
import type { WorkItem } from './types';
import type { ReasonCode } from '../estimator/types';
import type { OwnerAction, DecisionSnapshot } from '../estimator/types';
import { createAdjustmentEntry, saveAdjustment, saveOwnerDecision } from '../estimator/persistence';
import { priceMoveReason, recReasonPrompt } from '../estimator/decisionFeedback';
import { useAuth } from '../lib/AuthProvider';
import { useWorkItemsContext } from './WorkItemsContext';
import { useGoalData } from './useGoalData';
import { useSettings } from './useSettings';
import { recCopy, recIcon, reasonGlyph, sourceLabel, StatusBadge, BillingBadge } from './components';
import { ArrowRight, ChevronDown, CircleHelp, Clock3, Loader2, MapPin, Phone, Mail, FileText, Building2, User, X } from 'lucide-react';
import { getRepo } from '../utils/repository';
import { buildEstimate } from '../utils/estimateBuilder';
import { getSettings } from '../utils/storage';
import { CUSTOMER_TERMS } from '../utils/quoteSnapshot';

const PRICE_REASON_LABELS: { code: ReasonCode; label: string }[] = [
  { code: 'SYSTEM_TOO_LOW', label: 'System estimate too low' },
  { code: 'SYSTEM_TOO_HIGH', label: 'System estimate too high' },
  { code: 'SCOPE_CHANGED', label: 'Scope changed' },
  { code: 'NEW_CUSTOMER_INFO', label: 'New customer info' },
  { code: 'OWNER_EXPERIENCE', label: 'My experience' },
  { code: 'MATERIAL_COST_DIFFERENT', label: 'Material cost different' },
  { code: 'SITE_CONDITION_DIFFERENT', label: 'Site condition different' },
  { code: 'OTHER', label: 'Other' },
];

type DrawerProps = {
  item: WorkItem;
  onClose: () => void;
  onActionComplete?: () => void;
};

export function WorkDetailDrawer({ item, onClose, onActionComplete }: DrawerProps) {
  const [price, setPrice] = useState(item.price);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [pendingPrice, setPendingPrice] = useState<number | null>(null);
  const previousPriceRef = useRef(item.price);
  const [actionPrompt, setActionPrompt] = useState<null | { intent: 'approve' | 'decline' }>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const { business, user } = useAuth();
  const businessId = business?.businessId ?? 'default';
  const userId = user?.id ?? 'owner';

  // Context for decision snapshot (captures "it was Thursday, 15h left, needed $1k")
  const { workItems } = useWorkItemsContext();
  const { settings: businessSettings } = useSettings();
  const goal = useGoalData(businessSettings);

  const buildDecisionSnapshot = useCallback((): DecisionSnapshot => {
    const now = new Date();
    const weeklyGoal = goal.weeklyTarget || 2500;
    const weeklyHours = (businessSettings?.weeklyHours as number) || 35;

    // Queue = pending items excluding this one
    const pending = workItems.filter(w => w.opStatus === 'needs_review' && w.id !== item.id);
    const completed = workItems.filter(w => w.opStatus === 'completed');

    return {
      dayOfWeek: now.getDay(),
      weekNumber: Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)),
      hourOfDay: now.getHours(),
      remainingCapacityHours: goal.availableHours,
      hoursWorkedThisWeek: weeklyHours - goal.availableHours,
      jobsCompletedThisWeek: completed.length,
      weeklyEarningsToDate: goal.earnedThisWeek,
      weeklyEarningsGoal: weeklyGoal,
      gapToWeeklyGoal: weeklyGoal - goal.earnedThisWeek,
      requiredContributionPerCapacityHour: goal.neededPerHour,
      queueDepth: pending.length,
      queueTotalValue: pending.reduce((s, w) => s + w.price, 0),
      queueTotalHours: pending.reduce((s, w) => s + w.hoursNum, 0),
    };
  }, [workItems, goal, businessSettings, item.id]);

  const recordOwnerDecision = useCallback(async (
    action: OwnerAction,
    ownerPrice: number | null,
    quotedPrice: number | null,
    reasonCode?: ReasonCode,
  ) => {
    if (!item.estimationRunId) return;
    try {
      await saveOwnerDecision({
        id: crypto.randomUUID(),
        estimationRunId: item.estimationRunId,
        businessId,
        userId,
        rivetRecommendation: item.recommendation,
        ownerAction: action,
        rivetPrice: item.suggestedPrice ?? item.price,
        ownerPrice,
        quotedPrice,
        reasonCode,
        decisionSnapshot: buildDecisionSnapshot(),
        decidedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to record owner decision:', err);
    }
  }, [item, buildDecisionSnapshot, businessId, userId]);

  const logPriceAdjustment = useCallback((newPrice: number, reasonCode: ReasonCode) => {
    if (!item.estimationRunId || newPrice === previousPriceRef.current) return;
    const entry = createAdjustmentEntry({
      estimationRunId: item.estimationRunId,
      businessId,
      userId,
      field: 'price',
      systemValue: item.price,
      previousValue: previousPriceRef.current,
      newValue: newPrice,
      reasonCode,
    });
    saveAdjustment(entry).catch(console.error);
    previousPriceRef.current = newPrice;
  }, [item.estimationRunId, item.price, businessId, userId]);

  const estimatedProfit = price - item.costs;
  const hourlyRate = item.hoursNum > 0 ? Math.round(estimatedProfit / item.hoursNum) : 0;
  const priceStatus = price >= item.price ? 'take' : price >= item.price * 0.82 ? 'review' : 'pass';
  const priceMessage = priceStatus === 'take' ? 'Recommended price for this job.' : priceStatus === 'review' ? 'Below your target earnings rate.' : 'We recommend passing at this price.';
  const isCommercial = item.source === 'commercial_work_order';
  const copy = recCopy(item.recommendation, item.rate, item.suggestedPrice, item.price, item.lookFirst, item.walkAwayPrice);

  const ctaLabel = isCommercial
    ? `Accept Work Order - $${price.toLocaleString()}`
    : `Create Quote - $${price.toLocaleString()}`;

  function requestApprove() {
    if (recReasonPrompt(item.recommendation, 'approve')) {
      setActionPrompt({ intent: 'approve' });
      return;
    }
    void executeApprove();
  }

  function requestDecline() {
    if (recReasonPrompt(item.recommendation, 'decline')) {
      setActionPrompt({ intent: 'decline' });
      return;
    }
    void executeDecline();
  }

  async function executeApprove(reasonCode?: ReasonCode) {
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

      // Record the owner's decision with full situational context
      const action: OwnerAction = price !== item.price ? 'approved_adjusted' : 'approved';
      await recordOwnerDecision(action, price, price, reasonCode);

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

  async function executeDecline(reasonCode?: ReasonCode) {
    setActionLoading(true);
    setActionError(null);
    try {
      const repo = await getRepo();
      await repo.updateBooking(item.id, { status: 'declined' });
      await recordOwnerDecision('declined', null, null, reasonCode);
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

  const pendingRecPrompt = actionPrompt ? recReasonPrompt(item.recommendation, actionPrompt.intent) : null;

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="job-drawer" onMouseDown={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="Close details"><X size={20} /></button>
        <div className="drawer-photo">
          {item.photos[0] ? (
            <img src={item.photos[0]} alt={item.title} />
          ) : (
            <div className="drawer-photo-placeholder" />
          )}
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
              <div className="estimate-line"><span>Send this</span><strong>${(item.suggestedPrice ?? item.price).toLocaleString()}</strong></div>
              {item.walkAwayPrice != null && item.walkAwayPrice < (item.suggestedPrice ?? item.price) && (
                <div className="estimate-line sub"><span>Don't go below</span><strong>${item.walkAwayPrice.toLocaleString()}</strong></div>
              )}
              {item.costBreakdown.map((line) => (
                <div key={line.label} className="estimate-line sub"><span>{line.label}</span><strong>{line.value ?? '-'}</strong></div>
              ))}
              <div className="estimate-line total"><span>Estimated profit</span><strong className="success-text">${item.profit}</strong></div>
              <div className="estimate-line"><span>Profit per hour</span><strong>{item.rate}</strong></div>
              <div className="estimate-line"><span>Estimate confidence</span><strong>{item.confidence}%</strong></div>
            </div>
          </div>
          <div className="detail-section">
            <div className="section-heading"><h3>{
              item.recommendation === 'take' || item.recommendation === 'take_at_price' ? 'Why send this number'
              : item.recommendation === 'review' ? 'What to look at'
              : 'Why pass'
            }</h3></div>
            <ul className="reason-list">
              {item.reasons.map((reason, i) => (
                <li key={i} className={reason.icon === 'caution' ? 'caution' : reason.icon === 'x' ? 'pass' : ''}>
                  <span className={`reason-icon ${reason.icon === 'caution' ? 'caution' : reason.icon === 'x' ? 'pass' : ''}`}>{reasonGlyph(reason.icon)}</span>
                  {reason.text}
                </li>
              ))}
            </ul>
            <p className="confidence-note"><CircleHelp size={16} /> {
              item.recommendation === 'review'
                ? (item.lookFirst ? `Check this before you send a number: ${item.lookFirst}.` : copy.sentence)
                : copy.sentence
            }</p>
          </div>

          {/* Price editor */}
          <div className="detail-section quote-editor">
            <div className="section-heading"><h3>Set your price</h3><span>Change it if needed</span></div>
            <label htmlFor="price" className="quote-label">Your {isCommercial ? 'invoice' : 'quote'} amount</label>
            <div className="price-input">
              <span>$</span>
              <input id="price" type="number" value={price} onChange={(e) => {
                const newPrice = Number(e.target.value);
                const prev = previousPriceRef.current;
                const changePercent = prev > 0 ? Math.abs(newPrice - prev) / prev : 0;
                const inferred = priceMoveReason(item.price, newPrice);

                setPrice(newPrice);

                if (!item.estimationRunId || newPrice === prev || !inferred) return;

                if (changePercent > 0.05) {
                  setPendingPrice(newPrice);
                  setShowReasonPicker(true);
                } else {
                  logPriceAdjustment(newPrice, inferred);
                }
              }} />
              <span>USD</span>
            </div>
            {showReasonPicker && pendingPrice !== null && (
              <div className="reason-picker">
                <p>Why are you changing the price?</p>
                <div className="reason-options">
                  {PRICE_REASON_LABELS.map(({ code, label }) => (
                    <button key={code} className="reason-option" onClick={() => {
                      logPriceAdjustment(pendingPrice, code);
                      setShowReasonPicker(false);
                      setPendingPrice(null);
                    }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={`price-impact ${priceStatus}`}>
              <span className="impact-icon">{priceStatus === 'take' ? '\u2713' : priceStatus === 'review' ? '!' : '\u00d7'}</span>
              <div>
                <strong>{priceMessage}</strong>
                <small>${estimatedProfit.toLocaleString()} estimated profit · ${hourlyRate}/hr</small>
              </div>
            </div>
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

          <button className="advanced-toggle" onClick={() => setShowAnalysis(!showAnalysis)}>
            See full analysis <ChevronDown size={17} className={showAnalysis ? 'flip' : ''} />
          </button>
          {showAnalysis && (
            <div className="full-analysis">
              <div className="analysis-row"><span>System quote</span><strong>${item.price.toLocaleString()}</strong></div>
              {item.suggestedPrice != null && (
                <div className="analysis-row"><span>Send this week</span><strong>${item.suggestedPrice.toLocaleString()}</strong></div>
              )}
              <div className="analysis-row"><span>Confidence</span><strong>{item.confidence}%</strong></div>
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

        {pendingRecPrompt && actionPrompt && (
          <div className="reason-picker action-reason-picker">
            <p>{pendingRecPrompt.title}</p>
            <div className="reason-options">
              {pendingRecPrompt.options.map(({ code, label }) => (
                <button
                  key={code}
                  className="reason-option"
                  disabled={actionLoading}
                  onClick={() => {
                    const intent = actionPrompt.intent;
                    setActionPrompt(null);
                    if (intent === 'approve') void executeApprove(code);
                    else void executeDecline(code);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="reason-picker-back" type="button" onClick={() => setActionPrompt(null)} disabled={actionLoading}>
              Back
            </button>
          </div>
        )}

        <div className="drawer-actions">
          <button className="btn-secondary" onClick={requestDecline} disabled={actionLoading || !!actionPrompt}>
            Decline
          </button>
          <button className={`btn-primary-cta ${item.recommendation}`} onClick={requestApprove} disabled={actionLoading || !!actionPrompt}>
            {actionLoading ? (
              <><Loader2 size={17} className="spin" /> Processing...</>
            ) : (
              <>{ctaLabel}<ArrowRight size={17} /></>
            )}
          </button>
        </div>
      </aside>
    </div>
  );
}
