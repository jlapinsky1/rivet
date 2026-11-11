import { jsonResponse, errorResponse, getServiceClient } from './_shared/supabase.js';
import { extractJobFactsStub } from '../../src/estimator/extract';
import { estimateHandymanJob, applyCalibration } from '../../src/estimator/estimator';
import { deriveRecommendation } from '../../src/estimator/decision';
import { buildDecisionContext } from '../../src/estimator/weekContext';
import { economicsFromSettings } from '../../src/estimator/economicsFromSettings';
import { ESTIMATOR_VERSION } from '../../src/estimator/types';
import { PROMPT_VERSION, AI_MODEL } from '../../src/estimator/extract';

export default async function handler(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { workItemId, businessId } = await req.json();
    if (!workItemId || !businessId) return errorResponse('workItemId and businessId required');

    const supabase = getServiceClient();

    const { data: item, error: itemErr } = await supabase
      .from('work_items')
      .select('*')
      .eq('id', workItemId)
      .eq('business_id', businessId)
      .single();

    if (itemErr || !item) return errorResponse('Work item not found', 404);

    const { data: business } = await supabase
      .from('businesses')
      .select('settings')
      .eq('id', businessId)
      .single();

    // Enrich description with contractor notes so the extraction gets better signal
    const parts: string[] = [item.description || ''];
    if (item.customer_notes && item.customer_notes !== item.description) {
      parts.push(item.customer_notes);
    }
    if (item.contractor_notes) {
      parts.push(item.contractor_notes);
    }
    const enrichedDescription = parts.join('\n');

    const extraction = extractJobFactsStub({
      description: enrichedDescription,
      customerNotes: item.customer_notes || undefined,
    });

    const estimate = estimateHandymanJob(extraction);

    // If a priced BOM exists, use it as the authoritative material cost
    const bom = item.materials_bom as { total_low: number; total_mid: number; total_high: number } | null;
    if (bom?.total_mid) {
      estimate.materialCost = { low: bom.total_low, expected: bom.total_mid, high: bom.total_high };
    }

    const { data: siblingItems } = await supabase
      .from('work_items')
      .select('op_status, profit, hours_num, created_at, completed_at')
      .eq('business_id', businessId)
      .neq('id', workItemId);

    const settings = business?.settings || {};
    const config = economicsFromSettings(settings, businessId);
    const ctx = buildDecisionContext(
      (siblingItems || []).map((row: any) => ({
        opStatus: row.op_status,
        profit: row.profit,
        hoursNum: row.hours_num,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      })),
      { weeklyGoal: config.weeklyEarningsGoal, weeklyHours: config.weeklyCapacityHours },
    );

    const miles = parseInt(item.travel) || 0;
    const economicJob = applyCalibration(estimate, config, null, miles, ctx);
    const decision = deriveRecommendation(economicJob, config, ctx);

    const displayPrice = decision.suggestedPrice ?? Math.round(economicJob.evaluatedPrice);

    // Create a new estimation run to record the re-estimate
    const runId = crypto.randomUUID();
    await supabase.from('estimation_runs').insert({
      id: runId,
      business_id: businessId,
      work_id: workItemId,
      created_at: new Date().toISOString(),
      project_family: extraction.tradeContexts[0] || 'general_handyman',
      estimator_version: ESTIMATOR_VERSION,
      ai_model: AI_MODEL,
      prompt_version: PROMPT_VERSION,
      customer_inputs: { description: enrichedDescription, photos: [] },
      extraction,
      baseline_estimate: estimate,
      calibration_applied: null,
      economic_job: economicJob,
      decision_context: ctx,
      recommendation: decision.recommendation,
      reasons: decision.reasons,
      confidence: economicJob.confidence,
    });

    // Update work item in-place with refreshed estimate
    const { error: updateErr } = await supabase
      .from('work_items')
      .update({
        profit: Math.round(economicJob.contributionProfit.expected),
        hours: `${economicJob.laborHours.low.toFixed(0)}–${economicJob.laborHours.high.toFixed(0)} hrs`,
        hours_num: economicJob.laborHours.expected,
        rate: `$${Math.round(economicJob.contributionPerLaborHour.expected)}/hr`,
        rate_num: Math.round(economicJob.contributionPerLaborHour.expected),
        recommendation: decision.recommendation,
        confidence: Math.round(economicJob.confidence * 100),
        price: displayPrice,
        costs: Math.round(economicJob.totalDirectCost.expected),
        cost_breakdown: [
          { label: 'Materials', value: `$${Math.round(economicJob.materialCost.expected)}` },
          { label: 'Travel', value: `$${Math.round(economicJob.travelCost)}` },
        ],
        reasons: decision.reasons,
        estimation_run_id: runId,
        extraction_result: extraction,
      })
      .eq('id', workItemId)
      .eq('business_id', businessId);

    if (updateErr) return errorResponse(`Update failed: ${updateErr.message}`, 500);

    return jsonResponse({
      updated: true,
      recommendation: decision.recommendation,
      price: displayPrice,
      profit: Math.round(economicJob.contributionProfit.expected),
      hours: `${economicJob.laborHours.low.toFixed(0)}–${economicJob.laborHours.high.toFixed(0)} hrs`,
    });
  } catch (err: any) {
    console.error('re-estimate-job error:', err);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/re-estimate-job' };
