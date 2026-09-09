import { useState, useEffect, useMemo } from 'react';
import type { EstimationRun, AdjustmentEntry, ActualOutcome } from '../estimator/types';
import { getRunsForBusiness, getAllOutcomes, getAllAdjustments } from '../estimator/persistence';
import { useAuth } from '../lib/AuthProvider';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronDown, Download, FlaskConical, X } from 'lucide-react';

// ─── Access Gate ───

const LAB_USERS = new Set([
  'mason@myrivet.io',
]);

export function isDecisionLabEnabled(userEmail?: string | null): boolean {
  if (!userEmail) return false;
  return LAB_USERS.has(userEmail);
}

// ─── Types ───

type LabRun = {
  run: EstimationRun;
  adjustments: AdjustmentEntry[];
  outcome: ActualOutcome | null;
  humanValues: { price?: number; laborHours?: number; materialCost?: number } | null;
};

type FilterState = {
  tradeContext: string;
  recommendation: string;
  status: string; // 'all' | 'completed' | 'pending'
  humanAdjusted: string; // 'all' | 'yes' | 'no'
  confidence: string; // 'all' | 'high' | 'medium' | 'low'
  customer: string; // 'all' | customer name
};

// ─── Helpers ───

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtRange(r: { low: number; expected: number; high: number }) {
  return `${r.low.toFixed(1)}–${r.expected.toFixed(1)}–${r.high.toFixed(1)}`;
}

function fmtDollars(n: number) {
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

function pctError(system: number, actual: number): number {
  if (actual === 0) return 0;
  return Math.abs(system - actual) / actual;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildHumanValues(adjustments: AdjustmentEntry[]): { price?: number; laborHours?: number; materialCost?: number } | null {
  if (adjustments.length === 0) return null;
  const latest = new Map<string, number>();
  for (const adj of adjustments) {
    latest.set(adj.field, adj.newValue);
  }
  if (latest.size === 0) return null;
  return {
    price: latest.get('price'),
    laborHours: latest.get('laborHours'),
    materialCost: latest.get('materialCost'),
  };
}

function getCustomerLabel(run: EstimationRun): string {
  // Use customerId-style anonymized label from customerInputs
  // For now, extract from description or use workId
  return run.workId ? `Job #${run.workId}` : run.id.slice(0, 8);
}

// ─── Export ───

function buildExportRecord(item: LabRun) {
  const { run, adjustments, outcome, humanValues } = item;
  const systemLabor = run.economicJob.laborHours.expected;
  const systemMaterial = run.economicJob.materialCost.expected;

  const record: Record<string, unknown> = {
    runId: run.id,
    businessId: run.businessId,
    createdAt: run.createdAt,
    estimatorVersion: run.estimatorVersion,
    promptVersion: run.promptVersion,
    aiModel: run.aiModel,
    customerInput: {
      description: run.customerInputs.description,
      photoCount: run.customerInputs.photos.length,
      notes: run.customerInputs.notes,
    },
    extraction: {
      tradeContexts: run.extraction.tradeContexts,
      assemblyCandidate: run.extraction.assemblyCandidate,
      assemblyConfidence: run.extraction.assemblyConfidence,
      tasks: run.extraction.tasks,
      conditions: run.extraction.conditions,
      unknowns: run.extraction.unknowns,
      materialSupplyStatus: run.extraction.materialSupplyStatus,
      overallConfidence: run.extraction.overallConfidence,
    },
    assemblyUsed: run.baselineEstimate.assemblyUsed ?? null,
    taskComponents: run.baselineEstimate.estimationPath === 'component'
      ? run.baselineEstimate.breakdown.map(b => ({ code: b.code, description: b.description, deltaHours: b.deltaHours, deltaMaterial: b.deltaMaterialCost }))
      : null,
    baselineEstimate: {
      estimationPath: run.baselineEstimate.estimationPath,
      laborHours: run.baselineEstimate.laborHours,
      materialCost: run.baselineEstimate.materialCost,
      confidence: run.baselineEstimate.confidence,
      riskFlags: run.baselineEstimate.riskFlags,
      missingInputs: run.baselineEstimate.missingInputs,
    },
    deterministicAdjustments: run.baselineEstimate.breakdown,
    calibrationApplied: run.calibrationApplied,
    businessEconomicsSnapshot: {
      // Captured from the economicJob outputs
      estimatedQuoteRange: run.economicJob.estimatedQuoteRange,
      recommendedQuote: run.economicJob.recommendedQuote,
      evaluatedPrice: run.economicJob.evaluatedPrice,
      contributionMargin: run.economicJob.contributionMargin,
      travelCost: run.economicJob.travelCost,
      procurementHours: run.economicJob.procurementHours,
      capacityHours: run.economicJob.capacityHours,
    },
    decisionContext: run.decisionContext,
    economicJob: {
      laborHours: run.economicJob.laborHours,
      materialCost: run.economicJob.materialCost,
      totalDirectCost: run.economicJob.totalDirectCost,
      estimatedQuoteRange: run.economicJob.estimatedQuoteRange,
      recommendedQuote: run.economicJob.recommendedQuote,
      evaluatedPrice: run.economicJob.evaluatedPrice,
      minimumAcceptablePrice: run.economicJob.minimumAcceptablePrice,
      pricingFloors: run.economicJob.pricingFloors,
      contributionProfit: run.economicJob.contributionProfit,
      contributionPerLaborHour: run.economicJob.contributionPerLaborHour,
      contributionPerCapacityHour: run.economicJob.contributionPerCapacityHour,
      ownerAdjustedProfit: run.economicJob.ownerAdjustedProfit,
      ownerAdjustedPerHour: run.economicJob.ownerAdjustedPerHour,
      contributionMargin: run.economicJob.contributionMargin,
      confidence: run.economicJob.confidence,
      riskFlags: run.economicJob.riskFlags,
      travelHours: run.economicJob.travelHours,
      returnTripHours: run.economicJob.returnTripHours,
    },
    recommendation: run.recommendation,
    reasons: run.reasons,
    humanAdjustments: adjustments.map(a => ({
      field: a.field,
      systemValue: a.systemValue,
      previousValue: a.previousValue,
      newValue: a.newValue,
      reasonCode: a.reasonCode,
      reasonText: a.reasonText,
      createdAt: a.createdAt,
    })),
    finalHumanValues: humanValues,
    actualOutcome: outcome ? {
      actualLaborHours: outcome.actualLaborHours,
      actualMaterialCost: outcome.actualMaterialCost,
      actualProcurementHours: outcome.actualProcurementHours,
      finalRevenue: outcome.finalRevenue,
      returnTrips: outcome.returnTrips,
      notes: outcome.notes,
    } : null,
    comparison: outcome ? (() => {
      const sysLaborErr = Math.abs(systemLabor - outcome.actualLaborHours);
      const sysMatErr = Math.abs(systemMaterial - outcome.actualMaterialCost);
      const humLaborErr = humanValues?.laborHours != null ? Math.abs(humanValues.laborHours - outcome.actualLaborHours) : null;
      const humMatErr = humanValues?.materialCost != null ? Math.abs(humanValues.materialCost - outcome.actualMaterialCost) : null;
      return {
        systemVsActual: {
          laborErrorAbs: sysLaborErr,
          laborErrorPct: pctError(systemLabor, outcome.actualLaborHours),
          materialErrorAbs: sysMatErr,
          materialErrorPct: pctError(systemMaterial, outcome.actualMaterialCost),
          revenueVsPrice: outcome.finalRevenue - run.economicJob.evaluatedPrice,
        },
        humanVsActual: humanValues ? {
          laborErrorAbs: humLaborErr,
          laborErrorPct: humanValues.laborHours != null ? pctError(humanValues.laborHours, outcome.actualLaborHours) : null,
          materialErrorAbs: humMatErr,
          materialErrorPct: humanValues.materialCost != null ? pctError(humanValues.materialCost, outcome.actualMaterialCost) : null,
        } : null,
        laborWinner: humLaborErr != null ? (humLaborErr < sysLaborErr ? 'human' : sysLaborErr < humLaborErr ? 'rivet' : 'tie') : null,
        materialWinner: humMatErr != null ? (humMatErr < sysMatErr ? 'human' : sysMatErr < humMatErr ? 'rivet' : 'tie') : null,
      };
    })() : null,
  };
  return record;
}

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCSV(items: LabRun[], filename: string) {
  const headers = [
    'runId', 'createdAt', 'tradeContexts', 'estimationPath', 'recommendation', 'confidence',
    'systemLaborHours', 'systemMaterialCost', 'evaluatedPrice', 'minimumAcceptablePrice',
    'humanLaborHours', 'humanMaterialCost', 'humanPrice',
    'actualLaborHours', 'actualMaterialCost', 'actualRevenue',
    'laborErrorPct', 'materialErrorPct', 'humanAdjusted', 'estimatorVersion',
  ];
  const rows = items.map(({ run, humanValues, outcome }) => {
    const sysLabor = run.economicJob.laborHours.expected;
    const sysMat = run.economicJob.materialCost.expected;
    return [
      run.id,
      run.createdAt,
      run.extraction.tradeContexts.join(';'),
      run.baselineEstimate.estimationPath,
      run.recommendation,
      run.confidence,
      sysLabor,
      sysMat,
      run.economicJob.evaluatedPrice,
      run.economicJob.minimumAcceptablePrice,
      humanValues?.laborHours ?? '',
      humanValues?.materialCost ?? '',
      humanValues?.price ?? '',
      outcome?.actualLaborHours ?? '',
      outcome?.actualMaterialCost ?? '',
      outcome?.finalRevenue ?? '',
      outcome ? (pctError(sysLabor, outcome.actualLaborHours) * 100).toFixed(1) + '%' : '',
      outcome ? (pctError(sysMat, outcome.actualMaterialCost) * 100).toFixed(1) + '%' : '',
      humanValues ? 'yes' : 'no',
      run.estimatorVersion,
    ].map(v => typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v));
  });
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Summary Metrics ───

function SummaryMetrics({ items }: { items: LabRun[] }) {
  const completed = items.filter(i => i.outcome);
  if (completed.length === 0) {
    return (
      <div className="lab-summary">
        <div className="lab-summary-empty">No completed jobs with actuals yet.</div>
      </div>
    );
  }

  const laborErrors = completed.map(i => pctError(i.run.economicJob.laborHours.expected, i.outcome!.actualLaborHours));
  const materialErrors = completed.map(i => pctError(i.run.economicJob.materialCost.expected, i.outcome!.actualMaterialCost));
  const adjusted = completed.filter(i => i.adjustments.length > 0);
  const adjustedImproved = adjusted.filter(i => {
    if (!i.humanValues?.laborHours || !i.outcome) return false;
    const sysErr = pctError(i.run.economicJob.laborHours.expected, i.outcome.actualLaborHours);
    const humErr = pctError(i.humanValues.laborHours, i.outcome.actualLaborHours);
    return humErr < sysErr;
  });
  const rivetCloser = adjusted.filter(i => {
    if (!i.humanValues?.laborHours || !i.outcome) return false;
    const sysErr = pctError(i.run.economicJob.laborHours.expected, i.outcome.actualLaborHours);
    const humErr = pctError(i.humanValues.laborHours, i.outcome.actualLaborHours);
    return sysErr < humErr;
  });

  // By trade context
  const byTrade = new Map<string, number[]>();
  for (const item of completed) {
    for (const ctx of item.run.extraction.tradeContexts) {
      const list = byTrade.get(ctx) ?? [];
      list.push(pctError(item.run.economicJob.laborHours.expected, item.outcome!.actualLaborHours));
      byTrade.set(ctx, list);
    }
  }

  return (
    <div className="lab-summary">
      <div className="lab-summary-grid">
        <div className="lab-stat">
          <span className="lab-stat-value">{completed.length}</span>
          <span className="lab-stat-label">Completed with actuals</span>
        </div>
        <div className="lab-stat">
          <span className="lab-stat-value">{fmtPct(median(laborErrors))}</span>
          <span className="lab-stat-label">Median labor error</span>
        </div>
        <div className="lab-stat">
          <span className="lab-stat-value">{fmtPct(median(materialErrors))}</span>
          <span className="lab-stat-label">Median material error</span>
        </div>
        <div className="lab-stat">
          <span className="lab-stat-value">{adjusted.length} / {completed.length}</span>
          <span className="lab-stat-label">Human adjusted</span>
        </div>
        {adjusted.length > 0 && (
          <>
            <div className="lab-stat">
              <span className="lab-stat-value">{adjustedImproved.length} / {adjusted.length}</span>
              <span className="lab-stat-label">Human improved estimate</span>
            </div>
            <div className="lab-stat">
              <span className="lab-stat-value">{rivetCloser.length} / {adjusted.length}</span>
              <span className="lab-stat-label">Rivet closer than human</span>
            </div>
          </>
        )}
      </div>
      {byTrade.size > 1 && (
        <div className="lab-summary-bytrade">
          <span className="lab-bytrade-title">Labor error by trade context</span>
          {Array.from(byTrade.entries()).map(([ctx, errors]) => (
            <span key={ctx} className="lab-bytrade-item">
              {ctx}: {fmtPct(median(errors))}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Run Detail ───

function RunDetail({ item, onBack }: { item: LabRun; onBack: () => void }) {
  const { run, adjustments, outcome, humanValues } = item;
  const est = run.baselineEstimate;
  const econ = run.economicJob;

  return (
    <div className="lab-detail">
      <button className="lab-back" onClick={onBack}><ChevronLeft size={16} /> Back to list</button>

      <div className="lab-detail-header">
        <h3>Run {run.id.slice(0, 12)}</h3>
        <span className={`rec-pill ${run.recommendation} compact`}>
          {run.recommendation.toUpperCase()}
        </span>
        <span className="lab-detail-date">{fmtDate(run.createdAt)}</span>
      </div>

      {/* Input */}
      <section className="lab-section">
        <h4>Input</h4>
        <div className="lab-kv-grid">
          <div className="lab-kv"><span className="lab-k">Description</span><span className="lab-v">{run.customerInputs.description}</span></div>
          <div className="lab-kv"><span className="lab-k">Photos</span><span className="lab-v">{run.customerInputs.photos.length} attached</span></div>
          {run.customerInputs.notes && <div className="lab-kv"><span className="lab-k">Notes</span><span className="lab-v">{run.customerInputs.notes}</span></div>}
        </div>
      </section>

      {/* AI Extraction */}
      <section className="lab-section">
        <h4>AI Extraction</h4>
        <div className="lab-kv-grid">
          <div className="lab-kv"><span className="lab-k">Trade contexts</span><span className="lab-v">{run.extraction.tradeContexts.join(', ') || 'none'}</span></div>
          <div className="lab-kv"><span className="lab-k">Assembly candidate</span><span className="lab-v">{run.extraction.assemblyCandidate ?? 'none'}</span></div>
          <div className="lab-kv"><span className="lab-k">Assembly confidence</span><span className="lab-v">{fmtPct(run.extraction.assemblyConfidence)}</span></div>
          <div className="lab-kv"><span className="lab-k">Overall confidence</span><span className="lab-v">{fmtPct(run.extraction.overallConfidence)}</span></div>
          <div className="lab-kv"><span className="lab-k">Material supply</span><span className="lab-v">{run.extraction.materialSupplyStatus}</span></div>
          <div className="lab-kv"><span className="lab-k">Conditions</span><span className="lab-v">{run.extraction.conditions.join(', ') || 'none'}</span></div>
          <div className="lab-kv"><span className="lab-k">Unknowns</span><span className="lab-v">{run.extraction.unknowns.join(', ') || 'none'}</span></div>
        </div>
        {run.extraction.tasks.length > 0 && (
          <div className="lab-subtable">
            <span className="lab-subtable-title">Extracted Tasks</span>
            <table>
              <thead><tr><th>Component</th><th>Qty</th><th>Complexity</th><th>Confidence</th><th>Source</th></tr></thead>
              <tbody>
                {run.extraction.tasks.map((t, i) => (
                  <tr key={i}>
                    <td>{t.component}</td>
                    <td>{t.quantity}{t.quantityUnit ? ` ${t.quantityUnit}` : ''}</td>
                    <td>{t.complexity ?? 'standard'}</td>
                    <td>{fmtPct(t.confidence)}</td>
                    <td>{t.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Deterministic Estimator */}
      <section className="lab-section">
        <h4>Deterministic Estimator</h4>
        <div className="lab-kv-grid">
          <div className="lab-kv"><span className="lab-k">Path</span><span className="lab-v">{est.estimationPath}</span></div>
          {est.assemblyUsed && <div className="lab-kv"><span className="lab-k">Assembly used</span><span className="lab-v">{est.assemblyUsed}</span></div>}
          <div className="lab-kv"><span className="lab-k">Labor hours (L/E/H)</span><span className="lab-v">{fmtRange(est.laborHours)}</span></div>
          <div className="lab-kv"><span className="lab-k">Material cost (L/E/H)</span><span className="lab-v">{fmtRange(est.materialCost)}</span></div>
          <div className="lab-kv"><span className="lab-k">Confidence</span><span className="lab-v">{fmtPct(est.confidence)}</span></div>
          <div className="lab-kv"><span className="lab-k">Risk flags</span><span className="lab-v">{est.riskFlags.join(', ') || 'none'}</span></div>
          <div className="lab-kv"><span className="lab-k">Missing inputs</span><span className="lab-v">{est.missingInputs.join(', ') || 'none'}</span></div>
          <div className="lab-kv"><span className="lab-k">Version</span><span className="lab-v">{est.estimatorVersion}</span></div>
        </div>
        {est.breakdown.length > 0 && (
          <div className="lab-subtable">
            <span className="lab-subtable-title">Breakdown (rules/modifiers fired)</span>
            <table>
              <thead><tr><th>Code</th><th>Description</th><th>+Hours</th><th>+Material</th></tr></thead>
              <tbody>
                {est.breakdown.map((b, i) => (
                  <tr key={i}>
                    <td className="lab-mono">{b.code}</td>
                    <td>{b.description}</td>
                    <td>{b.deltaHours > 0 ? `+${b.deltaHours.toFixed(2)}` : b.deltaHours.toFixed(2)}</td>
                    <td>{b.deltaMaterialCost > 0 ? `+${fmtDollars(b.deltaMaterialCost)}` : fmtDollars(b.deltaMaterialCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Calibration */}
      <section className="lab-section">
        <h4>Calibration</h4>
        {run.calibrationApplied ? (
          <div className="lab-kv-grid">
            <div className="lab-kv"><span className="lab-k">Labor multiplier</span><span className="lab-v">{run.calibrationApplied.laborMultiplier.toFixed(2)}x</span></div>
            <div className="lab-kv"><span className="lab-k">Material multiplier</span><span className="lab-v">{run.calibrationApplied.materialMultiplier.toFixed(2)}x</span></div>
            <div className="lab-kv"><span className="lab-k">Sample size</span><span className="lab-v">{run.calibrationApplied.sampleSize}</span></div>
          </div>
        ) : (
          <span className="lab-none">No calibration applied</span>
        )}
      </section>

      {/* Economics */}
      <section className="lab-section">
        <h4>Economics</h4>
        <div className="lab-kv-grid">
          <div className="lab-kv"><span className="lab-k">Estimated quote (L/E/H)</span><span className="lab-v">{fmtRange(econ.estimatedQuoteRange)}</span></div>
          <div className="lab-kv"><span className="lab-k">Recommended quote</span><span className="lab-v">{fmtDollars(econ.recommendedQuote)}</span></div>
          <div className="lab-kv"><span className="lab-k">Evaluated price</span><span className="lab-v">{fmtDollars(econ.evaluatedPrice)}</span></div>
          <div className="lab-kv"><span className="lab-k">Minimum acceptable price</span><span className="lab-v">{fmtDollars(econ.minimumAcceptablePrice)} ({econ.pricingFloors.binding})</span></div>
          <div className="lab-kv"><span className="lab-k">Contribution profit</span><span className="lab-v">{fmtRange(econ.contributionProfit)}</span></div>
          <div className="lab-kv"><span className="lab-k">$/work hour</span><span className="lab-v">{fmtRange(econ.contributionPerLaborHour)}</span></div>
          <div className="lab-kv"><span className="lab-k">$/schedule hour</span><span className="lab-v">{fmtDollars(econ.contributionPerCapacityHour)}</span></div>
          <div className="lab-kv"><span className="lab-k">Contribution margin</span><span className="lab-v">{fmtRange(econ.contributionMargin)}</span></div>
          <div className="lab-kv"><span className="lab-k">Total direct cost</span><span className="lab-v">{fmtRange(econ.totalDirectCost)}</span></div>
          <div className="lab-kv"><span className="lab-k">Travel cost</span><span className="lab-v">{fmtDollars(econ.travelCost)}</span></div>
          <div className="lab-kv"><span className="lab-k">Travel hours</span><span className="lab-v">{econ.travelHours.toFixed(1)}</span></div>
          <div className="lab-kv"><span className="lab-k">Return trip hours</span><span className="lab-v">{econ.returnTripHours.toFixed(1)}</span></div>
          <div className="lab-kv"><span className="lab-k">Capacity hours</span><span className="lab-v">{econ.capacityHours.toFixed(1)}</span></div>
          <div className="lab-kv"><span className="lab-k">Owner-adjusted profit</span><span className="lab-v">{fmtRange(econ.ownerAdjustedProfit)}</span></div>
          <div className="lab-kv"><span className="lab-k">$/hour (owner-adjusted)</span><span className="lab-v">{fmtRange(econ.ownerAdjustedPerHour)}</span></div>
        </div>
        <div className="lab-subtable">
          <span className="lab-subtable-title">Pricing Floors</span>
          <div className="lab-kv-grid">
            <div className="lab-kv"><span className="lab-k">Minimum job</span><span className="lab-v">{fmtDollars(econ.pricingFloors.minimumJob)}</span></div>
            <div className="lab-kv"><span className="lab-k">Margin floor</span><span className="lab-v">{fmtDollars(econ.pricingFloors.margin)}</span></div>
            <div className="lab-kv"><span className="lab-k">Absolute profit</span><span className="lab-v">{fmtDollars(econ.pricingFloors.absoluteProfit)}</span></div>
            <div className="lab-kv"><span className="lab-k">Labor productivity</span><span className="lab-v">{fmtDollars(econ.pricingFloors.laborProductivity)}</span></div>
            <div className="lab-kv"><span className="lab-k">Weekly capacity pace</span><span className="lab-v">{econ.pricingFloors.weeklyCapacityPace > 0 ? fmtDollars(econ.pricingFloors.weeklyCapacityPace) : 'n/a'}</span></div>
            <div className="lab-kv"><span className="lab-k">Binding</span><span className="lab-v lab-mono">{econ.pricingFloors.binding}</span></div>
          </div>
        </div>
      </section>

      {/* Decision */}
      <section className="lab-section">
        <h4>Decision</h4>
        <div className="lab-kv-grid">
          <div className="lab-kv"><span className="lab-k">Recommendation</span><span className="lab-v"><span className={`lab-rec-badge ${run.recommendation}`}>{run.recommendation.toUpperCase()}</span></span></div>
          <div className="lab-kv"><span className="lab-k">Confidence</span><span className="lab-v">{fmtPct(run.confidence)}</span></div>
        </div>
        {run.reasons.length > 0 && (
          <div className="lab-reasons">
            {run.reasons.map((r, i) => (
              <div key={i} className={`lab-reason lab-reason-${r.icon}`}>
                <span className="lab-reason-icon">{r.icon === 'check' ? '\u2713' : r.icon === 'caution' ? '!' : '\u00d7'}</span>
                {r.text}
              </div>
            ))}
          </div>
        )}
        <div className="lab-subtable">
          <span className="lab-subtable-title">Decision Context</span>
          <div className="lab-kv-grid">
            <div className="lab-kv"><span className="lab-k">Weekly earnings to date</span><span className="lab-v">{fmtDollars(run.decisionContext.weeklyEarningsToDate)}</span></div>
            <div className="lab-kv"><span className="lab-k">Remaining capacity</span><span className="lab-v">{run.decisionContext.remainingCapacityHours.toFixed(1)} hrs</span></div>
            <div className="lab-kv"><span className="lab-k">Pipeline value</span><span className="lab-v">{fmtDollars(run.decisionContext.pipelineValue)}</span></div>
            <div className="lab-kv"><span className="lab-k">Pipeline hours</span><span className="lab-v">{run.decisionContext.pipelineHours.toFixed(1)}</span></div>
            <div className="lab-kv"><span className="lab-k">Required $/schedule hr</span><span className="lab-v">{fmtDollars(run.decisionContext.requiredContributionPerCapacityHour)}</span></div>
          </div>
        </div>
      </section>

      {/* Human Adjustments */}
      <section className="lab-section">
        <h4>Human Adjustments</h4>
        {adjustments.length > 0 ? (
          <div className="lab-subtable">
            <table>
              <thead><tr><th>Time</th><th>Field</th><th>System</th><th>Previous</th><th>New</th><th>Reason</th><th>Note</th></tr></thead>
              <tbody>
                {adjustments.map((a, i) => (
                  <tr key={i}>
                    <td>{fmtDate(a.createdAt)}</td>
                    <td>{a.field}</td>
                    <td>{a.systemValue.toFixed(2)}</td>
                    <td>{a.previousValue.toFixed(2)}</td>
                    <td>{a.newValue.toFixed(2)}</td>
                    <td className="lab-mono">{a.reasonCode}</td>
                    <td>{a.reasonText ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <span className="lab-none">No human adjustments</span>
        )}
      </section>

      {/* Actual Outcome */}
      <section className="lab-section">
        <h4>Actual Outcome</h4>
        {outcome ? (
          <div className="lab-kv-grid">
            <div className="lab-kv"><span className="lab-k">Actual labor hours</span><span className="lab-v">{outcome.actualLaborHours.toFixed(1)}</span></div>
            <div className="lab-kv"><span className="lab-k">Actual material cost</span><span className="lab-v">{fmtDollars(outcome.actualMaterialCost)}</span></div>
            <div className="lab-kv"><span className="lab-k">Actual procurement hours</span><span className="lab-v">{outcome.actualProcurementHours.toFixed(1)}</span></div>
            <div className="lab-kv"><span className="lab-k">Final revenue</span><span className="lab-v">{fmtDollars(outcome.finalRevenue)}</span></div>
            <div className="lab-kv"><span className="lab-k">Return trips</span><span className="lab-v">{outcome.returnTrips}</span></div>
            {outcome.notes && <div className="lab-kv"><span className="lab-k">Notes</span><span className="lab-v">{outcome.notes}</span></div>}
            <div className="lab-kv lab-kv-highlight"><span className="lab-k">System labor error</span><span className="lab-v">{fmtPct(pctError(econ.laborHours.expected, outcome.actualLaborHours))}</span></div>
            <div className="lab-kv lab-kv-highlight"><span className="lab-k">System material error</span><span className="lab-v">{fmtPct(pctError(econ.materialCost.expected, outcome.actualMaterialCost))}</span></div>
            {humanValues?.laborHours != null && (
              <div className="lab-kv lab-kv-highlight"><span className="lab-k">Human labor error</span><span className="lab-v">{fmtPct(pctError(humanValues.laborHours, outcome.actualLaborHours))}</span></div>
            )}
          </div>
        ) : (
          <span className="lab-none">Not completed yet</span>
        )}
      </section>
    </div>
  );
}

// ─── Main Component ───

export function DecisionLab() {
  const { business } = useAuth();
  const [items, setItems] = useState<LabRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    tradeContext: 'all',
    recommendation: 'all',
    status: 'all',
    humanAdjusted: 'all',
    confidence: 'all',
    customer: 'all',
  });
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    if (business) loadData();
  }, [business]);

  async function loadData() {
    if (!business) return;
    setLoading(true);
    setError(null);
    try {
      // Look up business slug for legacy seed data compatibility
      const { data: biz } = await supabase
        .from('businesses')
        .select('slug')
        .eq('id', business.businessId)
        .single();
      const runs = await getRunsForBusiness(business.businessId, biz?.slug ?? undefined);
      const runIds = runs.map(r => r.id);
      const [outcomeMap, adjustmentMap] = await Promise.all([
        getAllOutcomes(runIds),
        getAllAdjustments(runIds),
      ]);
      const labRuns: LabRun[] = runs.map(run => {
        const adjs = adjustmentMap.get(run.id) ?? [];
        return {
          run,
          adjustments: adjs,
          outcome: outcomeMap.get(run.id) ?? null,
          humanValues: buildHumanValues(adjs),
        };
      });
      setItems(labRuns);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // Unique values for filter dropdowns
  const tradeContexts = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) for (const ctx of i.run.extraction.tradeContexts) set.add(ctx);
    return Array.from(set).sort();
  }, [items]);

  const customers = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) set.add(getCustomerLabel(i.run));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filters.tradeContext !== 'all' && !i.run.extraction.tradeContexts.includes(filters.tradeContext)) return false;
      if (filters.recommendation !== 'all' && i.run.recommendation !== filters.recommendation) return false;
      if (filters.status === 'completed' && !i.outcome) return false;
      if (filters.status === 'pending' && i.outcome) return false;
      if (filters.humanAdjusted === 'yes' && i.adjustments.length === 0) return false;
      if (filters.humanAdjusted === 'no' && i.adjustments.length > 0) return false;
      if (filters.confidence === 'high' && i.run.confidence < 0.75) return false;
      if (filters.confidence === 'medium' && (i.run.confidence < 0.5 || i.run.confidence >= 0.75)) return false;
      if (filters.confidence === 'low' && i.run.confidence >= 0.5) return false;
      if (filters.customer !== 'all' && getCustomerLabel(i.run) !== filters.customer) return false;
      return true;
    });
  }, [items, filters]);

  const selectedItem = selectedId ? filtered.find(i => i.run.id === selectedId) ?? items.find(i => i.run.id === selectedId) : null;

  function handleExportJSON() {
    const records = filtered.map(buildExportRecord);
    downloadJSON(records, `rivet-decision-lab-${new Date().toISOString().slice(0, 10)}.json`);
    setShowExportMenu(false);
  }

  function handleExportCSV() {
    downloadCSV(filtered, `rivet-decision-lab-${new Date().toISOString().slice(0, 10)}.csv`);
    setShowExportMenu(false);
  }

  if (selectedItem) {
    return <RunDetail item={selectedItem} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="lab-container">
      <div className="lab-header">
        <div className="lab-header-left">
          <FlaskConical size={20} />
          <div>
            <h3>Decision Lab</h3>
            <span className="lab-header-sub">Internal estimation evaluation</span>
          </div>
        </div>
        <div className="lab-header-actions">
          <div className="lab-export-wrap">
            <button className="lab-btn" onClick={() => setShowExportMenu(!showExportMenu)}>
              <Download size={15} /> Export <ChevronDown size={14} />
            </button>
            {showExportMenu && (
              <div className="lab-export-menu">
                <button onClick={handleExportJSON}>Export JSON</button>
                <button onClick={handleExportCSV}>Export CSV</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <SummaryMetrics items={filtered} />

      {/* Filters */}
      <div className="lab-filters">
        <select value={filters.customer} onChange={e => setFilters(f => ({ ...f, customer: e.target.value }))}>
          <option value="all">All customers</option>
          {customers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filters.tradeContext} onChange={e => setFilters(f => ({ ...f, tradeContext: e.target.value }))}>
          <option value="all">All trades</option>
          {tradeContexts.map(tc => <option key={tc} value={tc}>{tc}</option>)}
        </select>
        <select value={filters.recommendation} onChange={e => setFilters(f => ({ ...f, recommendation: e.target.value }))}>
          <option value="all">All recommendations</option>
          <option value="take">Take</option>
          <option value="review">Review</option>
          <option value="pass">Pass</option>
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
        </select>
        <select value={filters.humanAdjusted} onChange={e => setFilters(f => ({ ...f, humanAdjusted: e.target.value }))}>
          <option value="all">All adjustments</option>
          <option value="yes">Human adjusted</option>
          <option value="no">Not adjusted</option>
        </select>
        <select value={filters.confidence} onChange={e => setFilters(f => ({ ...f, confidence: e.target.value }))}>
          <option value="all">All confidence</option>
          <option value="high">High (75%+)</option>
          <option value="medium">Medium (50-74%)</option>
          <option value="low">Low (&lt;50%)</option>
        </select>
        {Object.values(filters).some(v => v !== 'all') && (
          <button className="lab-clear-filters" onClick={() => setFilters({ tradeContext: 'all', recommendation: 'all', status: 'all', humanAdjusted: 'all', confidence: 'all', customer: 'all' })}>
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      {loading && <div className="lab-empty">Loading estimation runs...</div>}
      {error && <div className="lab-empty lab-error">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="lab-empty">
          {items.length === 0
            ? 'No estimation runs yet. Runs will appear here as jobs are estimated.'
            : 'No runs match the current filters.'}
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <div className="lab-table-wrap">
          <table className="lab-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Trade</th>
                <th>Rec</th>
                <th>Sys Labor</th>
                <th>Human Labor</th>
                <th>Actual Labor</th>
                <th>Sys Mat</th>
                <th>Human Mat</th>
                <th>Actual Mat</th>
                <th>Quote</th>
                <th>Revenue</th>
                <th>Conf</th>
                <th>Ver</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const { run, outcome, humanValues } = item;
                return (
                  <tr key={run.id} className="lab-row" onClick={() => setSelectedId(run.id)}>
                    <td>{fmtDate(run.createdAt)}</td>
                    <td>{getCustomerLabel(run)}</td>
                    <td>{run.extraction.tradeContexts.join(', ')}</td>
                    <td><span className={`lab-rec-badge ${run.recommendation}`}>{run.recommendation}</span></td>
                    <td>{run.economicJob.laborHours.expected.toFixed(1)}h</td>
                    <td>{humanValues?.laborHours != null ? `${humanValues.laborHours.toFixed(1)}h` : '-'}</td>
                    <td>{outcome ? `${outcome.actualLaborHours.toFixed(1)}h` : '-'}</td>
                    <td>{fmtDollars(run.economicJob.materialCost.expected)}</td>
                    <td>{humanValues?.materialCost != null ? fmtDollars(humanValues.materialCost) : '-'}</td>
                    <td>{outcome ? fmtDollars(outcome.actualMaterialCost) : '-'}</td>
                    <td>{fmtDollars(run.economicJob.evaluatedPrice)}</td>
                    <td>{outcome ? fmtDollars(outcome.finalRevenue) : '-'}</td>
                    <td>{fmtPct(run.confidence)}</td>
                    <td className="lab-mono">{run.estimatorVersion}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="lab-footer">
        {filtered.length} run{filtered.length !== 1 ? 's' : ''}
        {filtered.length !== items.length && ` (${items.length} total)`}
      </div>
    </div>
  );
}
