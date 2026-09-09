/**
 * DEV-ONLY: No row-level security policies yet.
 * Do NOT expose to multi-tenant production until RLS is implemented.
 */

import { supabase } from '../lib/supabase';
import type { EstimationRun, AdjustmentEntry, ActualOutcome, ReasonCode } from './types';

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
    price: run.economicJob.suggestedPrice.expected,
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
