import { useState, useRef, useCallback, useEffect } from 'react';
import type { WorkItem, MaterialsBom, ResearchBrief, EnrichmentStatus, EstimateDelta } from './types';
import type { ReasonCode } from '../estimator/types';
import type { OwnerAction, DecisionSnapshot } from '../estimator/types';
import { createAdjustmentEntry, saveAdjustment, saveOwnerDecision } from '../estimator/persistence';
import { priceMoveReason, recReasonPrompt } from '../estimator/decisionFeedback';
import { useAuth } from '../lib/AuthProvider';
import { useWorkItemsContext } from './WorkItemsContext';
import { useGoalData } from './useGoalData';
import { useSettings } from './useSettings';
import { recCopy, recIcon, reasonGlyph, sourceLabel, StatusBadge, BillingBadge } from './components';
import { ArrowRight, ChevronDown, Clock3, ExternalLink, Loader2, MapPin, Phone, Mail, FileText, Building2, User, X } from 'lucide-react';
import { useMaterialPricer } from '../hooks/useMaterialPricer';
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

  // Close-out form — shown for in_progress / approved / scheduled jobs
  const [showCloseOut, setShowCloseOut] = useState(false);
  const [closeOutHours, setCloseOutHours] = useState('');
  const [closeOutMaterials, setCloseOutMaterials] = useState('');
  const [closeOutRevenue, setCloseOutRevenue] = useState(String(item.price));
  const [closeOutNotes, setCloseOutNotes] = useState('');
  const [closeOutLoading, setCloseOutLoading] = useState(false);
  const [closeOutError, setCloseOutError] = useState<string | null>(null);

  const { business, user } = useAuth();
  const businessId = business?.businessId ?? 'default';
  const userId = user?.id ?? 'owner';

  // Contractor notes + scope analysis state
  const [contractorNotes, setContractorNotes] = useState(item.contractorNotes ?? '');
  const [scopeAnalysis, setScopeAnalysis] = useState(item.scopeAnalysis ?? null);
  const [scopeLoading, setScopeLoading] = useState(false);

  // Materials BOM
  const [bom, setBom] = useState<MaterialsBom | null>(item.materialsBom ?? null);
  const [showBom, setShowBom] = useState(false);
  const { priceMaterials, loading: bomLoading } = useMaterialPricer(businessId);

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

  async function executeCloseOut() {
    const hours = parseFloat(closeOutHours);
    if (!hours || hours <= 0) {
      setCloseOutError('Actual hours worked is required.');
      return;
    }
    setCloseOutLoading(true);
    setCloseOutError(null);
    try {
      const res = await fetch('/api/record-job-actuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workItemId: item.id,
          businessId,
          actualLaborHours: hours,
          actualMaterialCost: closeOutMaterials ? parseFloat(closeOutMaterials) : undefined,
          finalRevenue: closeOutRevenue ? parseFloat(closeOutRevenue) : undefined,
          notes: closeOutNotes || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onClose();
      onActionComplete?.();
    } catch (err: any) {
      setCloseOutError(err.message || 'Close-out failed');
    } finally {
      setCloseOutLoading(false);
    }
  }

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
  const rawSummary = (item.contractorNotes || item.customerNotes || item.description || '').trim();
  const jobSummary = rawSummary.length > 130 ? rawSummary.slice(0, 130).trimEnd() + '…' : rawSummary;
  const sentenceIsRedundant = !item.walkAwayPrice && (effectiveRec === 'take' || effectiveRec === 'take_at_price');

  // Mirrors getSendBlockForState from estimateState.js.
  // Hard-block mode is opt-in via VITE_ESTIMATE_STATE_HARD_BLOCK=true (default: shadow).
  const ESTIMATE_STATE_HARD_BLOCK = import.meta.env.VITE_ESTIMATE_STATE_HARD_BLOCK === 'true';
  const sendBlock = (() => {
    const state = item.estimateState;
    if (!state || state === 'ready_final' || state === 'ready_initial') return { blocked: false as const };
    if (state === 'pending_enrichment') {
      const es = item.enrichmentStatus;
      let msg = 'Finalizing estimate…';
      if (es) {
        const active = (s?: { status?: string }) => s?.status === 'pending' || s?.status === 'running';
        if (active(es.research)) msg = 'Analyzing scope…';
        else if (active(es.bom)) msg = 'Pricing materials…';
      }
      return ESTIMATE_STATE_HARD_BLOCK
        ? { blocked: true as const, reason: msg }
        : { blocked: false as const, shadowReason: msg };
    }
    if (state === 'ready_initial_with_warning') return { blocked: false as const, warning: 'Estimate still refining — sending now may underprice.' };
    if (state === 'failed_enrichment') return { blocked: false as const, warning: 'Enrichment failed — review manually before sending.' };
    return { blocked: false as const };
  })();

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
            {(scopeAnalysis ?? item.scopeAnalysis)?.readyToQuote && item.opStatus === 'needs_review'
              ? <span className="status-badge quoted">Ready to Quote</span>
              : <StatusBadge status={item.opStatus} />}
            <BillingBadge status={item.billingStatus} />
            {item.researchBrief && (
              <span className="status-badge research-assist" title="AI research was used to enrich this job's scope">Research Assist</span>
            )}
            <EnrichmentStatusChips status={item.enrichmentStatus} />
          </div>
        </div>
        <div className="drawer-scroll">
          {/* Estimate state banners */}
          {(('reason' in sendBlock && sendBlock.reason) || ('shadowReason' in sendBlock && (sendBlock as any).shadowReason)) && (
            <div className={`estimate-state-banner pending${sendBlock.blocked ? ' hard-block' : ''}`}>
              <Loader2 size={14} className="spin" />
              {'reason' in sendBlock ? sendBlock.reason : (sendBlock as any).shadowReason}
            </div>
          )}
          {'warning' in sendBlock && sendBlock.warning && (
            <div className="estimate-state-banner warning">
              {sendBlock.warning}
            </div>
          )}

          <div className={`drawer-rec ${effectiveRec}`}>
            <div className="rec-badge-large">
              <span className="rec-icon-large">{recIcon(effectiveRec)}</span>
              <span className="rec-label-large">{copy.label.toUpperCase()}</span>
            </div>
            {!sentenceIsRedundant && <p>{copy.sentence}</p>}
            {jobSummary && <p>{jobSummary}</p>}
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
                  <span className="eval-stat-value">{price > 0 ? Math.round((estimatedProfit / price) * 100) : 0}%</span>
                  <span className="eval-stat-label">Profit margin</span>
                </div>
              </div>

              {/* Single outcome signal */}
              <div className="eval-signals">
                {effectiveRec === 'take' && (
                  <div className="eval-signal positive">
                    <span className="signal-glyph">✓</span>
                    <span>Meets your pricing goals</span>
                  </div>
                )}
                {effectiveRec === 'take_at_price' && (
                  <div className="eval-signal caution">
                    <span className="signal-glyph">!</span>
                    <span>Below your target rate — but covers your costs</span>
                  </div>
                )}
                {effectiveRec === 'pass' && (
                  <div className="eval-signal negative">
                    <span className="signal-glyph">×</span>
                    <span>Not worth taking at this price</span>
                  </div>
                )}
              </div>

              {/* Cost breakdown — collapsed */}
              {item.costBreakdown.length > 0 && (
                <>
                  <button className="eval-pricing-toggle" onClick={() => setShowAnalysis(!showAnalysis)}>
                    Cost breakdown <ChevronDown size={14} className={showAnalysis ? 'flip' : ''} />
                  </button>
                  {showAnalysis && (
                    <div className="eval-pricing-detail">
                      {item.costBreakdown.map((line) => (
                        <div key={line.label} className="analysis-row"><span>{line.label}</span><strong>{line.value ?? '-'}</strong></div>
                      ))}
                      {item.walkAwayPrice != null && item.walkAwayPrice < (item.suggestedPrice ?? item.price) && (
                        <div className="analysis-row"><span>Don't go below</span><strong>${item.walkAwayPrice.toLocaleString()}</strong></div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Materials BOM */}
              <div className="bom-section">
                <div className="bom-header">
                  <button
                    className="eval-pricing-toggle"
                    onClick={() => {
                      if (!bom) return;
                      setShowBom(!showBom);
                    }}
                    disabled={!bom}
                  >
                    Materials list {bom && <ChevronDown size={14} className={showBom ? 'flip' : ''} />}
                  </button>
                  <button
                    className="bom-price-btn"
                    onClick={async () => {
                      const result = await priceMaterials(item.id);
                      if (result) { setBom(result); setShowBom(true); void reEstimate(); }
                    }}
                    disabled={bomLoading}
                  >
                    {bomLoading ? <><Loader2 size={13} className="spin" /> Pricing…</> : bom ? 'Refresh prices' : 'Price materials'}
                  </button>
                </div>
                {bom && showBom && (
                  <div className="bom-panel">
                    {bom.region && <p className="bom-region">Prices: {bom.region}</p>}
                    <table className="bom-table">
                      <thead>
                        <tr><th>Material</th><th>Qty</th><th>Unit $</th><th>Total</th><th></th></tr>
                      </thead>
                      <tbody>
                        {bom.materials.map((line, i) => (
                          <tr key={i} className={`bom-row confidence-${line.confidence}`}>
                            <td>
                              <span className="bom-name">{line.name}</span>
                              {line.description && <span className="bom-desc">{line.description}</span>}
                            </td>
                            <td>{line.quantity} {line.unit}</td>
                            <td>${line.unit_price_mid.toFixed(2)}</td>
                            <td>${line.total_mid.toFixed(2)}</td>
                            <td>
                              {line.source_url && (
                                <a href={line.source_url} target="_blank" rel="noopener noreferrer" className="bom-link">
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bom-total-row">
                          <td colSpan={3}>Estimated total</td>
                          <td>${bom.total_mid.toFixed(2)}</td>
                          <td></td>
                        </tr>
                        <tr className="bom-range-row">
                          <td colSpan={5}>Range: ${bom.total_low.toFixed(2)} – ${bom.total_high.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    {bom.notes && <p className="bom-notes">{bom.notes}</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Research Assist panel — shown whenever a brief exists */}
          {item.researchBrief && <ResearchAssistPanel brief={item.researchBrief} />}

          {/* Estimate delta panel — shown when enrichment improved the estimate */}
          {item.estimateDelta && item.estimateState === 'ready_final' && (
            <EstimateDeltaPanel delta={item.estimateDelta} />
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
                <p>Why are you changing the price? <strong>(required)</strong></p>
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
                <button
                  className="reason-picker-back"
                  type="button"
                  onClick={() => {
                    // Revert price to previous value — user must pick a reason or undo
                    setPrice(previousPriceRef.current);
                    setShowReasonPicker(false);
                    setPendingPrice(null);
                  }}
                >
                  Revert price change
                </button>
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

          {/* ── Close-out form — shown for jobs that are past the quote stage ── */}
          {['approved', 'scheduled', 'in_progress'].includes(item.opStatus) && (
            <div className="detail-section closeout-section">
              <div className="section-heading">
                <h3>Close out job</h3>
                <span>Records actuals so estimates improve</span>
              </div>
              {!showCloseOut ? (
                <button className="closeout-trigger-btn" onClick={() => setShowCloseOut(true)}>
                  Mark job complete &amp; record actuals
                </button>
              ) : (
                <div className="closeout-form">
                  <p className="closeout-why">
                    Actual hours are the most important signal for the estimation engine.
                    Every job you close out makes future estimates more accurate.
                  </p>
                  <label>
                    Hours actually worked <span className="req">*</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      placeholder="e.g. 3.5"
                      value={closeOutHours}
                      onChange={e => setCloseOutHours(e.target.value)}
                    />
                  </label>
                  <label>
                    Materials cost (actual $)
                    <input
                      type="number"
                      step="1"
                      min="0"
                      placeholder={`estimated $${item.costs}`}
                      value={closeOutMaterials}
                      onChange={e => setCloseOutMaterials(e.target.value)}
                    />
                  </label>
                  <label>
                    Final amount charged ($)
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={closeOutRevenue}
                      onChange={e => setCloseOutRevenue(e.target.value)}
                    />
                  </label>
                  <label>
                    Notes (optional)
                    <textarea
                      rows={2}
                      placeholder="Anything unusual that affected time or cost…"
                      value={closeOutNotes}
                      onChange={e => setCloseOutNotes(e.target.value)}
                    />
                  </label>
                  {closeOutError && <p className="closeout-error">{closeOutError}</p>}
                </div>
              )}
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

        {/* Close-out action buttons — replace normal actions for in-progress jobs */}
        {showCloseOut ? (
          <div className="drawer-actions">
            <button className="btn-secondary" onClick={() => setShowCloseOut(false)} disabled={closeOutLoading}>
              Cancel
            </button>
            <button className="btn-primary-cta take" onClick={executeCloseOut} disabled={closeOutLoading || !closeOutHours}>
              {closeOutLoading ? <><Loader2 size={17} className="spin" /> Saving...</> : <>Complete job &amp; save<ArrowRight size={17} /></>}
            </button>
          </div>
        ) : (
          <div className="drawer-actions">
            <button className="btn-secondary" onClick={requestDecline} disabled={actionLoading || !!actionPrompt || showReasonPicker}>
              Decline
            </button>
            {effectiveRec === 'review' && contactHref ? (
              <a className={`btn-primary-cta ${effectiveRec}`} href={contactHref}>
                {ctaLabel}<ArrowRight size={17} />
              </a>
            ) : (
              <button
                className={`btn-primary-cta ${effectiveRec}${sendBlock.blocked ? ' cta-blocked' : ''}`}
                onClick={requestApprove}
                disabled={actionLoading || !!actionPrompt || showReasonPicker || sendBlock.blocked}
                title={sendBlock.blocked ? (sendBlock as any).reason : undefined}
              >
                {actionLoading ? (
                  <><Loader2 size={17} className="spin" /> Processing...</>
                ) : sendBlock.blocked ? (
                  <><Loader2 size={17} className="spin" /> {(sendBlock as any).reason ?? 'Finalizing…'}</>
                ) : showReasonPicker ? (
                  <>Pick a reason above first</>
                ) : (
                  <>{ctaLabel}<ArrowRight size={17} /></>
                )}
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function EnrichmentStatusChips({ status }: { status?: EnrichmentStatus }) {
  if (!status) return null;

  const chips: { label: string; cls: string }[] = [];

  for (const [stage, label] of [['research', 'Research'], ['bom', 'BOM pricing'], ['reestimate', 'Re-estimating']] as const) {
    const s = status[stage]?.status;
    if (!s || s === 'succeeded' || s === 'skipped') continue;
    if (s === 'pending' || s === 'running') chips.push({ label: `${label}…`, cls: 'enrichment-pending' });
    if (s === 'failed') chips.push({ label: `${label} failed`, cls: 'enrichment-failed' });
  }

  if (chips.length === 0) return null;

  return (
    <>
      {chips.map((c, i) => (
        <span key={i} className={`status-badge ${c.cls}`}>{c.label}</span>
      ))}
    </>
  );
}

function EstimateDeltaPanel({ delta }: { delta: EstimateDelta }) {
  const sign = delta.delta_amount >= 0 ? '+' : '';
  const cls = delta.delta_amount >= 0 ? 'positive' : 'negative';
  const reasonLabel = delta.reason_flags.includes('research') && delta.reason_flags.includes('bom')
    ? 'Research + material pricing'
    : delta.reason_flags.includes('research') ? 'AI research'
    : delta.reason_flags.includes('bom') ? 'Material pricing'
    : 'Re-estimate';

  return (
    <div className={`detail-section estimate-delta-panel ${cls}`}>
      <div className="section-heading"><h3>Estimate updated</h3><span>{reasonLabel}</span></div>
      <div className="delta-row">
        <div className="delta-stat">
          <span className="eval-stat-label">Was</span>
          <span className="eval-stat-value">${delta.previous_price.toLocaleString()}</span>
        </div>
        <ArrowRight size={16} className="delta-arrow" />
        <div className="delta-stat">
          <span className="eval-stat-label">Now</span>
          <span className="eval-stat-value">${delta.new_price.toLocaleString()}</span>
        </div>
        <div className={`delta-change ${cls}`}>
          {sign}${Math.abs(delta.delta_amount).toLocaleString()} ({sign}{delta.delta_pct}%)
        </div>
      </div>
    </div>
  );
}

function ResearchAssistPanel({ brief }: { brief: ResearchBrief }) {
  const [expanded, setExpanded] = useState(false);
  const topAssumptions = brief.taskSequence.slice(0, 3);
  const topUnknowns = brief.criticalUnknowns.slice(0, 3);

  return (
    <div className="detail-section research-assist-panel">
      <div className="section-heading">
        <h3>Research Assist</h3>
        <button className="eval-pricing-toggle" onClick={() => setExpanded(!expanded)}>
          {brief.probableJobArchetype} <ChevronDown size={14} className={expanded ? 'flip' : ''} />
        </button>
      </div>
      {topAssumptions.length > 0 && (
        <div className="research-assumptions">
          <span className="context-label">Likely scope</span>
          <ul className="reason-list">
            {topAssumptions.map((step, i) => (
              <li key={i} className="check">
                <span className="reason-icon check">{reasonGlyph('check')}</span>
                {step}
              </li>
            ))}
          </ul>
        </div>
      )}
      {topUnknowns.length > 0 && (
        <div className="research-unknowns">
          <span className="context-label">Confirm before quoting</span>
          <ul className="reason-list">
            {topUnknowns.map((q, i) => (
              <li key={i} className="caution">
                <span className="reason-icon caution">{reasonGlyph('caution')}</span>
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}
      {expanded && (
        <>
          {brief.hiddenWorkCandidates.length > 0 && (
            <div className="research-hidden-work">
              <span className="context-label">Often missed</span>
              <ul className="reason-list">
                {brief.hiddenWorkCandidates.map((item, i) => (
                  <li key={i} className="caution">
                    <span className="reason-icon caution">{reasonGlyph('caution')}</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.scopeRisks.length > 0 && (
            <div className="research-risks">
              <span className="context-label">Scope risks</span>
              <ul className="reason-list">
                {brief.scopeRisks.map((risk, i) => (
                  <li key={i} className="x">
                    <span className="reason-icon x">{reasonGlyph('x')}</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.confidenceNotes && (
            <p className="review-contact-note">{brief.confidenceNotes}</p>
          )}
        </>
      )}
    </div>
  );
}
