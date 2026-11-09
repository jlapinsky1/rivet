import { useState, useRef, useCallback, useEffect } from 'react';
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
import { ArrowRight, ChevronDown, Clock3, Loader2, MapPin, Phone, Mail, FileText, Building2, User, X } from 'lucide-react';
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

  // Contractor notes + scope analysis state
  const [contractorNotes, setContractorNotes] = useState(item.contractorNotes ?? '');
  const [scopeAnalysis, setScopeAnalysis] = useState(item.scopeAnalysis ?? null);
  const [scopeLoading, setScopeLoading] = useState(false);

  // Auto-generate scope analysis when drawer opens for a review job with no stored analysis
  useEffect(() => {
    if (item.recommendation === 'review' && !item.scopeAnalysis) {
      void refreshScope();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshScope(notes?: string) {
    setScopeLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_AGENTS_URL ?? 'https://rivet-agents.onrender.com'}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'refresh-scope',
          businessId,
          workItemId: item.id,
          ...(typeof notes === 'string' ? { contractorNotes: notes } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Agent ${res.status}`);
      const data = await res.json();
      setScopeAnalysis(data.scopeAnalysis);
      if (typeof notes === 'string') setContractorNotes(notes);
      // If the agent says scope is clear, re-run the estimator with enriched info
      if (data.scopeAnalysis?.readyToQuote) {
        void reEstimate();
      }
    } catch (err) {
      console.error('refresh-scope failed:', err);
    } finally {
      setScopeLoading(false);
    }
  }

  // Context for decision snapshot (captures "it was Thursday, 15h left, needed $1k")
  const { workItems, refresh } = useWorkItemsContext();

  async function reEstimate() {
    try {
      const res = await fetch('/api/re-estimate-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workItemId: item.id, businessId }),
      });
      if (!res.ok) throw new Error(`re-estimate ${res.status}`);
      await refresh();
    } catch (err) {
      console.error('re-estimate failed:', err);
    }
  }
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
  const priceStatus = price >= item.price ? 'take' : price >= item.price * 0.82 ? 'review' : 'pass';
  const priceMessage = priceStatus === 'take' ? 'Recommended price for this job.' : priceStatus === 'review' ? 'Below your target earnings rate.' : 'We recommend passing at this price.';
  const isCommercial = item.source === 'commercial_work_order';
  // When agent says readyToQuote, treat the job as quotable in the UI (recommendation stays 'review' in DB)
  const effectiveRec = (scopeAnalysis ?? item.scopeAnalysis)?.readyToQuote ? 'take' as const : item.recommendation;
  const copy = recCopy(effectiveRec, item.rate, item.suggestedPrice, item.price, item.lookFirst, item.walkAwayPrice);

  const contactHref = item.phone
    ? `tel:${item.phone.replace(/\s/g, '')}`
    : item.email
      ? `mailto:${item.email}`
      : null;

  const ctaLabel = effectiveRec === 'review'
    ? (item.phone ? `Call ${item.phone}` : item.email ? `Email ${item.email}` : 'Contact Customer')
    : isCommercial
      ? `Accept Work Order - $${price.toLocaleString()}`
      : `Create Quote - $${price.toLocaleString()}`;

  function requestApprove() {
    if (recReasonPrompt(effectiveRec, 'approve')) {
      setActionPrompt({ intent: 'approve' });
      return;
    }
    void executeApprove();
  }

  function requestDecline() {
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
      await repo.declineWorkItem(item.id);
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

  const pendingRecPrompt = actionPrompt ? recReasonPrompt(effectiveRec, actionPrompt.intent) : null;

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
          <div className={`drawer-rec ${effectiveRec}`}>
            <div className="rec-badge-large">
              <span className="rec-icon-large">{recIcon(effectiveRec)}</span>
              <span className="rec-label-large">{copy.label.toUpperCase()}</span>
            </div>
            <p>{copy.sentence}</p>
          </div>

          {/* Quotable job: evaluation card */}
          {effectiveRec !== 'review' && (
            <div className="detail-section quote-eval">
              <div className="eval-header">
                <span className="eval-eyebrow">Quote Evaluation</span>
                <span className={`eval-outcome-badge ${effectiveRec}`}>
                  {effectiveRec === 'take' ? 'Good to quote' : effectiveRec === 'take_at_price' ? 'Send this number' : 'Pass'}
                </span>
              </div>
              <div className="eval-price-block">
                <span className="eval-price-label">Recommended quote</span>
                <span className="eval-price">${(item.suggestedPrice ?? item.price).toLocaleString()}</span>
              </div>
              <div className="eval-secondary-row">
                <div className="eval-secondary-stat">
                  <span className="eval-stat-value">${estimatedProfit.toLocaleString()}</span>
                  <span className="eval-stat-label">After direct expenses</span>
                </div>
                <div className="eval-secondary-stat">
                  <span className="eval-stat-value">{item.hours}</span>
                  <span className="eval-stat-label">Total time committed</span>
                </div>
              </div>

              {/* Evaluation signals */}
              <div className="eval-signals">
                {(effectiveRec === 'take' || effectiveRec === 'take_at_price') && (
                  <div className="eval-signal positive">
                    <span className="signal-glyph">✓</span>
                    <span>Meets your pricing goals</span>
                  </div>
                )}
                {item.confidence >= 70 && (
                  <div className="eval-signal positive">
                    <span className="signal-glyph">✓</span>
                    <span>Estimate is {item.confidence}% confident</span>
                  </div>
                )}
                {item.reasons.filter(r => r.icon !== 'check').map((r, i) => (
                  <div key={i} className={`eval-signal ${r.icon === 'caution' ? 'caution' : 'negative'}`}>
                    <span className="signal-glyph">{reasonGlyph(r.icon)}</span>
                    <span>{r.text}</span>
                  </div>
                ))}
                {item.confidence < 70 && (
                  <div className="eval-signal caution">
                    <span className="signal-glyph">!</span>
                    <span>Estimate confidence is {item.confidence}% — confirm scope before quoting</span>
                  </div>
                )}
              </div>

              {/* Estimate breakdown */}
              <div className="eval-breakdown">
                <span className="eval-breakdown-label">Estimate breakdown</span>
                <div className="breakdown-row">
                  <span>Job price</span>
                  <strong>${(item.suggestedPrice ?? item.price).toLocaleString()}</strong>
                </div>
                {item.costs > 0 && (
                  <div className="breakdown-row">
                    <span>Travel and materials</span>
                    <strong className="breakdown-neg">−${item.costs.toLocaleString()}</strong>
                  </div>
                )}
                <div className="breakdown-row">
                  <span>On-site work</span>
                  <strong>{item.hours}</strong>
                </div>
                <div className="breakdown-row">
                  <span>Travel</span>
                  <strong>{item.travel}</strong>
                </div>
              </div>

              {/* Pricing calculations — collapsed */}
              <button className="eval-pricing-toggle" onClick={() => setShowAnalysis(!showAnalysis)}>
                Pricing calculations <ChevronDown size={14} className={showAnalysis ? 'flip' : ''} />
              </button>
              {showAnalysis && (
                <div className="eval-pricing-detail">
                  <div className="analysis-row"><span>Profit per hour</span><strong>{item.rate}</strong></div>
                  {item.costBreakdown.map((line) => (
                    <div key={line.label} className="analysis-row"><span>{line.label}</span><strong>{line.value ?? '-'}</strong></div>
                  ))}
                  {item.walkAwayPrice != null && item.walkAwayPrice < (item.suggestedPrice ?? item.price) && (
                    <div className="analysis-row"><span>Don't go below</span><strong>${item.walkAwayPrice.toLocaleString()}</strong></div>
                  )}
                  <div className="analysis-row"><span>Confidence</span><strong>{item.confidence}%</strong></div>
                </div>
              )}
            </div>
          )}

          {/* Review job UI */}
          {effectiveRec === 'review' && (
            <>
              <div className="detail-section review-contact-prompt">
                <div className="section-heading"><h3>Contact customer</h3></div>
                <p className="review-contact-note">Don't send a number yet. You need more info before you can price this.</p>
                {(item.customerNotes || item.scope) && (
                  <div className="review-customer-said">
                    <span className="context-label">What they said</span>
                    <p>{item.customerNotes || item.scope}</p>
                  </div>
                )}
                <div className="review-photo-note">
                  <span className="context-label">What they shared</span>
                  <p>{item.photos.length === 0
                    ? 'No photos attached.'
                    : item.photos.length === 1
                      ? '1 photo submitted. Not enough to scope this remotely.'
                      : `${item.photos.length} photos attached.`}
                  </p>
                </div>
              </div>
              {item.photos.length > 1 && (
                <div className="detail-section">
                  <div className="section-heading"><h3>Photos</h3><span>{item.photos.length} submitted</span></div>
                  <div className="photo-gallery">
                    {item.photos.map((src, i) => (
                      <img key={i} src={src} alt={`${item.title} photo ${i + 1}`} loading="lazy" />
                    ))}
                  </div>
                </div>
              )}
              {scopeAnalysis?.readyToQuote ? (
                <div className="detail-section scope-ready">
                  <div className="scope-ready-badge">Ready to quote</div>
                  {scopeAnalysis.context && (
                    <p className="review-contact-note">{scopeAnalysis.context}</p>
                  )}
                </div>
              ) : (
                <div className="detail-section">
                  <div className="section-heading"><h3>What to find out</h3></div>
                  {scopeLoading ? (
                    <div className="agent-loading">
                      <Loader2 size={15} className="spin" />
                      <span>Analyzing request...</span>
                    </div>
                  ) : scopeAnalysis && scopeAnalysis.questions.length > 0 ? (
                    <>
                      {scopeAnalysis.context && (
                        <p className="review-contact-note">{scopeAnalysis.context}</p>
                      )}
                      <ul className="reason-list">
                        {scopeAnalysis.questions.map((q, i) => (
                          <li key={i} className="caution">
                            <span className="reason-icon caution">{reasonGlyph('caution')}</span>
                            {q}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              )}
              <div className="detail-section">
                <div className="section-heading"><h3>Your notes</h3></div>
                <p className="review-contact-note">Add anything the customer told you. Rivet will review the full picture and either generate a quote or flag what's still needed.</p>
                <textarea
                  className="contractor-notes-input"
                  value={contractorNotes}
                  onChange={e => setContractorNotes(e.target.value)}
                  placeholder="e.g. Customer called back, said the deck boards on the east side are rotted but the frame is solid..."
                  rows={4}
                />
                <button
                  className="btn-save-notes"
                  onClick={() => refreshScope(contractorNotes)}
                  disabled={scopeLoading || contractorNotes === (item.contractorNotes ?? '')}
                >
                  {scopeLoading ? <><Loader2 size={14} className="spin" /> Reviewing...</> : 'Save'}
                </button>
              </div>
            </>
          )}

          {/* Price editor */}
          {effectiveRec !== 'review' && <div className="detail-section quote-editor">
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
                <small>${estimatedProfit.toLocaleString()} after direct expenses</small>
              </div>
            </div>
          </div>}

          {/* Customer/commercial details */}
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
          {item.photos.length > 1 && effectiveRec !== 'review' && (
            <div className="detail-section">
              <div className="section-heading"><h3>Photos</h3><span>{item.photos.length} photos</span></div>
              <div className="photo-gallery">
                {item.photos.map((src, i) => (
                  <img key={i} src={src} alt={`${item.title} photo ${i + 1}`} loading="lazy" />
                ))}
              </div>
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
          {effectiveRec === 'review' && contactHref ? (
            <a className={`btn-primary-cta ${effectiveRec}`} href={contactHref}>
              {ctaLabel}<ArrowRight size={17} />
            </a>
          ) : (
            <button className={`btn-primary-cta ${effectiveRec}`} onClick={requestApprove} disabled={actionLoading || !!actionPrompt}>
              {actionLoading ? (
                <><Loader2 size={17} className="spin" /> Processing...</>
              ) : (
                <>{ctaLabel}<ArrowRight size={17} /></>
              )}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
