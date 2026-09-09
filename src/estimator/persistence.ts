/**
 * DEV-ONLY: No row-level security policies yet.
 * Do NOT expose to multi-tenant production until RLS is implemented.
 */

import { supabase } from '../lib/supabase';
import type { EstimationRun, AdjustmentEntry, ActualOutcome, OwnerDecision, FeedbackRecord, ReasonCode } from './types';

// ─── Estimation Runs (immutable, insert-only) ───

export async function saveEstimationRun(run: EstimationRun): Promise<void> {
  const { error } = await supabase.from('estimation_runs').insert({
    id: run.id,
    business_id: run.businessId,
    work_id: run.workId ?? null,
    created_at: run.createdAt,
    project_family: run.projectFamily,
    estimator_version: run.estimatorVersion,
    ai_model: run.aiModel,
    prompt_version: run.promptVersion,
    customer_inputs: run.customerInputs,
    extraction: run.extraction,
    baseline_estimate: run.baselineEstimate,
    calibration_applied: run.calibrationApplied,
    economic_job: run.economicJob,
    decision_context: run.decisionContext,
    recommendation: run.recommendation,
    reasons: run.reasons,
    confidence: run.confidence,
  });
  if (error) throw new Error(`Failed to save estimation run: ${error.message}`);
}

export async function getEstimationRun(id: string): Promise<EstimationRun | null> {
  const { data, error } = await supabase
    .from('estimation_runs')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return mapRunFromDb(data);
}

export async function getRunsForWork(workId: number): Promise<EstimationRun[]> {
  const { data, error } = await supabase
    .from('estimation_runs')
    .select('*')
    .eq('work_id', workId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map(mapRunFromDb);
}

export async function getRunsForBusiness(businessId: string, legacySlug?: string): Promise<EstimationRun[]> {
  const ids = legacySlug ? [businessId, legacySlug] : [businessId];
  const { data, error } = await supabase
    .from('estimation_runs')
    .select('*')
    .in('business_id', ids)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(mapRunFromDb);
}

export async function getAllOutcomes(runIds: string[]): Promise<Map<string, ActualOutcome>> {
  if (runIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('actual_outcomes')
    .select('*')
    .in('estimation_run_id', runIds);
  if (error || !data) return new Map();
  const map = new Map<string, ActualOutcome>();
  for (const row of data) {
    map.set(row.estimation_run_id, {
      id: row.id,
      estimationRunId: row.estimation_run_id,
      actualLaborHours: row.actual_labor_hours,
      actualMaterialCost: row.actual_material_cost,
      actualProcurementHours: row.actual_procurement_hours,
      finalRevenue: row.final_revenue,
      returnTrips: row.return_trips,
      quotedPrice: row.quoted_price ?? undefined,
      recordedAt: row.recorded_at,
      notes: row.notes ?? undefined,
    });
  }
  return map;
}

export async function getAllAdjustments(runIds: string[]): Promise<Map<string, AdjustmentEntry[]>> {
  if (runIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('adjustment_entries')
    .select('*')
    .in('estimation_run_id', runIds)
    .order('created_at', { ascending: true });
  if (error || !data) return new Map();
  const map = new Map<string, AdjustmentEntry[]>();
  for (const row of data) {
    const entry: AdjustmentEntry = {
      id: row.id,
      estimationRunId: row.estimation_run_id,
      businessId: row.business_id,
      userId: row.user_id,
      field: row.field,
      systemValue: row.system_value,
      previousValue: row.previous_value,
      newValue: row.new_value,
      reasonCode: row.reason_code as ReasonCode,
      reasonText: row.reason_text ?? undefined,
      createdAt: row.created_at,
    };
    const list = map.get(entry.estimationRunId) ?? [];
    list.push(entry);
    map.set(entry.estimationRunId, list);
  }
  return map;
}

function mapRunFromDb(row: Record<string, unknown>): EstimationRun {
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    workId: row.work_id as number | undefined,
    createdAt: row.created_at as string,
    projectFamily: row.project_family as EstimationRun['projectFamily'],
    estimatorVersion: row.estimator_version as string,
    aiModel: row.ai_model as string,
    promptVersion: row.prompt_version as string,
    customerInputs: row.customer_inputs as EstimationRun['customerInputs'],
    extraction: row.extraction as EstimationRun['extraction'],
    baselineEstimate: row.baseline_estimate as EstimationRun['baselineEstimate'],
    calibrationApplied: row.calibration_applied as EstimationRun['calibrationApplied'],
    economicJob: row.economic_job as EstimationRun['economicJob'],
    decisionContext: row.decision_context as EstimationRun['decisionContext'],
    recommendation: row.recommendation as EstimationRun['recommendation'],
    reasons: row.reasons as EstimationRun['reasons'],
    confidence: row.confidence as number,
  };
}

// ─── Human Adjustments (append-only, never update/delete) ───

export async function saveAdjustment(entry: AdjustmentEntry): Promise<void> {
  const { error } = await supabase.from('adjustment_entries').insert({
    id: entry.id,
    estimation_run_id: entry.estimationRunId,
    business_id: entry.businessId,
    user_id: entry.userId,
    field: entry.field,
    system_value: entry.systemValue,
    previous_value: entry.previousValue,
    new_value: entry.newValue,
    reason_code: entry.reasonCode,
    reason_text: entry.reasonText ?? null,
    created_at: entry.createdAt,
  });
  if (error) throw new Error(`Failed to save adjustment: ${error.message}`);
}

export async function getAdjustments(runId: string): Promise<AdjustmentEntry[]> {
  const { data, error } = await supabase
    .from('adjustment_entries')
    .select('*')
    .eq('estimation_run_id', runId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    estimationRunId: row.estimation_run_id,
    businessId: row.business_id,
    userId: row.user_id,
    field: row.field,
    systemValue: row.system_value,
    previousValue: row.previous_value,
    newValue: row.new_value,
    reasonCode: row.reason_code as ReasonCode,
    reasonText: row.reason_text ?? undefined,
    createdAt: row.created_at,
  }));
}

// ─── Actual Outcomes ───

export async function saveOutcome(outcome: ActualOutcome): Promise<void> {
  const { error } = await supabase.from('actual_outcomes').insert({
    id: outcome.id,
    estimation_run_id: outcome.estimationRunId,
    actual_labor_hours: outcome.actualLaborHours,
    actual_material_cost: outcome.actualMaterialCost,
    actual_procurement_hours: outcome.actualProcurementHours,
    final_revenue: outcome.finalRevenue,
    return_trips: outcome.returnTrips,
    quoted_price: outcome.quotedPrice ?? null,
    recorded_at: outcome.recordedAt,
    notes: outcome.notes ?? null,
  });
  if (error) throw new Error(`Failed to save outcome: ${error.message}`);
}

export async function getOutcome(runId: string): Promise<ActualOutcome | null> {
  const { data, error } = await supabase
    .from('actual_outcomes')
    .select('*')
    .eq('estimation_run_id', runId)
    .single();
  if (error || !data) return null;
  return {
    id: data.id,
    estimationRunId: data.estimation_run_id,
    actualLaborHours: data.actual_labor_hours,
    actualMaterialCost: data.actual_material_cost,
    actualProcurementHours: data.actual_procurement_hours,
    finalRevenue: data.final_revenue,
    returnTrips: data.return_trips,
    quotedPrice: data.quoted_price ?? undefined,
    recordedAt: data.recorded_at,
    notes: data.notes ?? undefined,
  };
}

// ─── System vs Human vs Actual Comparison ───

export async function compareEstimates(runId: string): Promise<{
  system: { price: number; laborHours: number; materialCost: number; contributionProfit: number; ownerAdjustedProfit: number };
  humanAdjusted: { price: number; laborHours: number; materialCost: number; contributionProfit: number; } | null;
  actual: { laborHours: number; materialCost: number; revenue: number; profit: number } | null;
}> {
  const run = await getEstimationRun(runId);
  if (!run) throw new Error(`Estimation run ${runId} not found`);

  const system = {
    price: run.economicJob.evaluatedPrice,
    laborHours: run.economicJob.laborHours.expected,
    materialCost: run.economicJob.materialCost.expected,
    contributionProfit: run.economicJob.contributionProfit.expected,
    ownerAdjustedProfit: run.economicJob.ownerAdjustedProfit.expected,
  };

  // Build human-adjusted values from latest adjustments per field
  const adjustments = await getAdjustments(runId);
  let humanAdjusted: { price: number; laborHours: number; materialCost: number; contributionProfit: number } | null = null;
  if (adjustments.length > 0) {
    const latestByField = new Map<string, number>();
    for (const adj of adjustments) {
      latestByField.set(adj.field, adj.newValue);
    }
    const adjPrice = latestByField.get('price') ?? system.price;
    const adjLabor = latestByField.get('laborHours') ?? system.laborHours;
    const adjMaterial = latestByField.get('materialCost') ?? system.materialCost;
    humanAdjusted = {
      price: adjPrice,
      laborHours: adjLabor,
      materialCost: adjMaterial,
      contributionProfit: adjPrice - adjMaterial - run.economicJob.travelCost,
    };
  }

  // Actual outcome
  const outcome = await getOutcome(runId);
  const actual = outcome ? {
    laborHours: outcome.actualLaborHours,
    materialCost: outcome.actualMaterialCost,
    revenue: outcome.finalRevenue,
    profit: outcome.finalRevenue - outcome.actualMaterialCost,
  } : null;

  return { system, humanAdjusted, actual };
}

// ─── Owner Decisions ───

export async function saveOwnerDecision(decision: OwnerDecision): Promise<void> {
  const { error } = await supabase.from('owner_decisions').insert({
    id: decision.id,
    estimation_run_id: decision.estimationRunId,
    business_id: decision.businessId,
    user_id: decision.userId,
    rivet_recommendation: decision.rivetRecommendation,
    owner_action: decision.ownerAction,
    rivet_price: decision.rivetPrice,
    owner_price: decision.ownerPrice,
    quoted_price: decision.quotedPrice,
    reason_code: decision.reasonCode ?? null,
    reason_text: decision.reasonText ?? null,
    decision_snapshot: decision.decisionSnapshot,
    decided_at: decision.decidedAt,
  });
  if (error) throw new Error(`Failed to save owner decision: ${error.message}`);
}

export async function getOwnerDecision(runId: string): Promise<OwnerDecision | null> {
  const { data, error } = await supabase
    .from('owner_decisions')
    .select('*')
    .eq('estimation_run_id', runId)
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapOwnerDecisionFromDb(data);
}

function mapOwnerDecisionFromDb(row: Record<string, unknown>): OwnerDecision {
  return {
    id: row.id as string,
    estimationRunId: row.estimation_run_id as string,
    businessId: row.business_id as string,
    userId: row.user_id as string,
    rivetRecommendation: row.rivet_recommendation as OwnerDecision['rivetRecommendation'],
    ownerAction: row.owner_action as OwnerDecision['ownerAction'],
    rivetPrice: row.rivet_price as number,
    ownerPrice: row.owner_price as number | null,
    quotedPrice: row.quoted_price as number | null,
    reasonCode: (row.reason_code as ReasonCode) ?? undefined,
    reasonText: (row.reason_text as string) ?? undefined,
    decisionSnapshot: row.decision_snapshot as OwnerDecision['decisionSnapshot'],
    decidedAt: row.decided_at as string,
  };
}

export async function getAllOwnerDecisions(runIds: string[]): Promise<Map<string, OwnerDecision>> {
  if (runIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('owner_decisions')
    .select('*')
    .in('estimation_run_id', runIds)
    .order('decided_at', { ascending: false });
  if (error || !data) return new Map();
  const map = new Map<string, OwnerDecision>();
  for (const row of data) {
    // Keep latest decision per run (ordered desc, first wins)
    if (map.has(row.estimation_run_id)) continue;
    map.set(row.estimation_run_id, mapOwnerDecisionFromDb(row));
  }
  return map;
}

// ─── Feedback Record Builder ───

export async function buildFeedbackRecord(runId: string): Promise<FeedbackRecord> {
  const run = await getEstimationRun(runId);
  if (!run) throw new Error(`Estimation run ${runId} not found`);

  const [adjustments, outcome, decision] = await Promise.all([
    getAdjustments(runId),
    getOutcome(runId),
    getOwnerDecision(runId),
  ]);

  // Derive adjusted price from latest price adjustment
  let adjustedPrice: number | null = null;
  for (const adj of adjustments) {
    if (adj.field === 'price') adjustedPrice = adj.newValue;
  }

  // Quoted price: owner decision > outcome > null
  const quotedPrice = decision?.quotedPrice ?? outcome?.quotedPrice ?? null;

  // Build actual
  const actual = outcome ? {
    laborHours: outcome.actualLaborHours,
    materialCost: outcome.actualMaterialCost,
    revenue: outcome.finalRevenue,
    returnTrips: outcome.returnTrips,
  } : null;

  // Build accuracy metrics
  let accuracy: FeedbackRecord['accuracy'] = null;
  if (actual) {
    const rivetLabor = run.economicJob.laborHours.expected;
    const rivetPrice = run.economicJob.evaluatedPrice;
    const actualLabor = actual.laborHours;
    const actualRevenue = actual.revenue;

    const rivetLaborError = actualLabor > 0 ? (rivetLabor - actualLabor) / actualLabor : null;
    const adjustedLaborEntry = adjustments.filter(a => a.field === 'laborHours').pop();
    const adjustedLabor = adjustedLaborEntry?.newValue ?? null;
    const adjustedLaborError = adjustedLabor !== null && actualLabor > 0
      ? (adjustedLabor - actualLabor) / actualLabor : null;

    const rivetPriceError = actualRevenue > 0 ? (rivetPrice - actualRevenue) / actualRevenue : null;
    const quotedPriceError = quotedPrice !== null && actualRevenue > 0
      ? (quotedPrice - actualRevenue) / actualRevenue : null;

    const rivetWasCloserOnLabor = rivetLaborError !== null && adjustedLaborError !== null
      ? Math.abs(rivetLaborError) <= Math.abs(adjustedLaborError) : null;
    const rivetWasCloserOnPrice = rivetPriceError !== null && quotedPriceError !== null
      ? Math.abs(rivetPriceError) <= Math.abs(quotedPriceError) : null;

    accuracy = {
      rivetLaborError,
      adjustedLaborError,
      rivetPriceError,
      quotedPriceError,
      rivetWasCloserOnLabor,
      rivetWasCloserOnPrice,
    };
  }

  return {
    estimationRunId: runId,
    createdAt: run.createdAt,
    projectFamily: run.projectFamily,
    rivet: {
      recommendation: run.recommendation,
      confidence: run.confidence,
      evaluatedPrice: run.economicJob.evaluatedPrice,
      minimumAcceptablePrice: run.economicJob.minimumAcceptablePrice,
      laborHours: run.economicJob.laborHours,
      materialCost: run.economicJob.materialCost,
      contributionProfit: run.economicJob.contributionProfit,
      reasons: run.reasons,
    },
    adjustments,
    adjustedPrice,
    ownerDecision: decision,
    quotedPrice,
    actual,
    accuracy,
  };
}

export async function buildFeedbackRecords(businessId: string): Promise<FeedbackRecord[]> {
  const runs = await getRunsForBusiness(businessId);
  if (runs.length === 0) return [];

  const runIds = runs.map(r => r.id);
  const [allAdjustments, allOutcomes, allDecisions] = await Promise.all([
    getAllAdjustments(runIds),
    getAllOutcomes(runIds),
    getAllOwnerDecisions(runIds),
  ]);

  return runs.map(run => {
    const adjustments = allAdjustments.get(run.id) ?? [];
    const outcome = allOutcomes.get(run.id);
    const decision = allDecisions.get(run.id);

    let adjustedPrice: number | null = null;
    for (const adj of adjustments) {
      if (adj.field === 'price') adjustedPrice = adj.newValue;
    }

    const quotedPrice = decision?.quotedPrice ?? outcome?.quotedPrice ?? null;

    const actual = outcome ? {
      laborHours: outcome.actualLaborHours,
      materialCost: outcome.actualMaterialCost,
      revenue: outcome.finalRevenue,
      returnTrips: outcome.returnTrips,
    } : null;

    let accuracy: FeedbackRecord['accuracy'] = null;
    if (actual) {
      const rivetLabor = run.economicJob.laborHours.expected;
      const rivetPrice = run.economicJob.evaluatedPrice;
      const actualLabor = actual.laborHours;
      const actualRevenue = actual.revenue;

      const rivetLaborError = actualLabor > 0 ? (rivetLabor - actualLabor) / actualLabor : null;
      const adjustedLaborEntry = adjustments.filter(a => a.field === 'laborHours').pop();
      const adjustedLabor = adjustedLaborEntry?.newValue ?? null;
      const adjustedLaborError = adjustedLabor !== null && actualLabor > 0
        ? (adjustedLabor - actualLabor) / actualLabor : null;

      const rivetPriceError = actualRevenue > 0 ? (rivetPrice - actualRevenue) / actualRevenue : null;
      const quotedPriceError = quotedPrice !== null && actualRevenue > 0
        ? (quotedPrice - actualRevenue) / actualRevenue : null;

      const rivetWasCloserOnLabor = rivetLaborError !== null && adjustedLaborError !== null
        ? Math.abs(rivetLaborError) <= Math.abs(adjustedLaborError) : null;
      const rivetWasCloserOnPrice = rivetPriceError !== null && quotedPriceError !== null
        ? Math.abs(rivetPriceError) <= Math.abs(quotedPriceError) : null;

      accuracy = {
        rivetLaborError,
        adjustedLaborError,
        rivetPriceError,
        quotedPriceError,
        rivetWasCloserOnLabor,
        rivetWasCloserOnPrice,
      };
    }

    return {
      estimationRunId: run.id,
      createdAt: run.createdAt,
      projectFamily: run.projectFamily,
      rivet: {
        recommendation: run.recommendation,
        confidence: run.confidence,
        evaluatedPrice: run.economicJob.evaluatedPrice,
        minimumAcceptablePrice: run.economicJob.minimumAcceptablePrice,
        laborHours: run.economicJob.laborHours,
        materialCost: run.economicJob.materialCost,
        contributionProfit: run.economicJob.contributionProfit,
        reasons: run.reasons,
      },
      adjustments,
      adjustedPrice,
      ownerDecision: decision ?? null,
      quotedPrice,
      actual,
      accuracy,
    };
  });
}

// ─── Helper: Create adjustment entry ───

export function createAdjustmentEntry(params: {
  estimationRunId: string;
  businessId: string;
  userId: string;
  field: string;
  systemValue: number;
  previousValue: number;
  newValue: number;
  reasonCode: ReasonCode;
  reasonText?: string;
}): AdjustmentEntry {
  return {
    id: crypto.randomUUID(),
    estimationRunId: params.estimationRunId,
    businessId: params.businessId,
    userId: params.userId,
    field: params.field,
    systemValue: params.systemValue,
    previousValue: params.previousValue,
    newValue: params.newValue,
    reasonCode: params.reasonCode,
    reasonText: params.reasonText,
    createdAt: new Date().toISOString(),
  };
}
