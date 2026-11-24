import { jsonResponse, errorResponse, getServiceClient, loadBusinessCalibration } from './_shared/supabase.js';
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

    const prevPrice = (item.price as number) ?? 0;
    const prevHoursNum = (item.hours_num as number) ?? 0;
    const prevVersion = (item.estimate_version as number) ?? 1;

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
    const projectFamily = extraction.tradeContexts[0] || 'general_handyman';
    // Hierarchical lookup: assembly (most specific) → trade family → global fallback
    const assemblyUsed = estimate.assemblyUsed ?? null;
    const calibration =
      (assemblyUsed ? await (loadBusinessCalibration as any)(supabase, businessId, assemblyUsed) : null)
      ?? await (loadBusinessCalibration as any)(supabase, businessId, projectFamily)
      ?? await (loadBusinessCalibration as any)(supabase, businessId, 'all');
    const economicJob = applyCalibration(estimate, config, calibration, miles, ctx);
    const decision = deriveRecommendation(economicJob, config, ctx, (estimate as any).reliabilityTier);

    const displayPrice = decision.suggestedPrice ?? Math.round(economicJob.evaluatedPrice);
    const newHoursNum = economicJob.laborHours.expected;

    // Compute delta — only record if price changed >= 2%
    let estimateDelta: Record<string, unknown> | null = null;
    if (prevPrice > 0) {
      const deltaAmount = displayPrice - prevPrice;
      const deltaPct = deltaAmount / prevPrice;
      if (Math.abs(deltaPct) >= 0.02) {
        estimateDelta = {
          previous_price: Math.round(prevPrice),
          new_price:      Math.round(displayPrice),
          delta_amount:   Math.round(deltaAmount),
          delta_pct:      Math.round(deltaPct * 1000) / 10,
          previous_hours: prevHoursNum,
          new_hours:      newHoursNum,
          reason_flags:   ['manual_reestimate'],
          recorded_at:    new Date().toISOString(),
        };
      }
    }

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
      calibration_applied: calibration
        ? { laborMultiplier: (calibration as any).laborMultiplier, materialMultiplier: (calibration as any).materialMultiplier, sampleSize: (calibration as any).sampleSize }
        : null,
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
        estimate_version: prevVersion + 1,
        ...(estimateDelta ? { estimate_delta: estimateDelta } : {}),
      })
      .eq('id', workItemId)
      .eq('business_id', businessId);

    if (updateErr) return errorResponse(`Update failed: ${updateErr.message}`, 500);

    // Re-select to get the authoritative post-update state (concurrent enrichment worker may
    // have already transitioned estimate_state between our update and this read).
    const { data: freshItem } = await supabase
      .from('work_items')
      .select('estimate_state, estimate_version, estimate_delta, estimate_finalized_at')
      .eq('id', workItemId)
      .eq('business_id', businessId)
      .single();

    // Fire enrichment trigger non-blocking — re-evaluate whether research/BOM are needed.
    const origin = new URL(req.url).origin;
    fetch(`${origin}/api/enrichment-trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INTERNAL_SERVICE_TOKEN ? { 'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN } : {}),
      },
      body: JSON.stringify({ businessId, workItemId, estimationRunId: runId }),
    }).catch(err => console.error('[enrichment] trigger after re-estimate failed:', err));

    return jsonResponse({
      updated: true,
      recommendation: decision.recommendation,
      price: displayPrice,
      profit: Math.round(economicJob.contributionProfit.expected),
      hours: `${economicJob.laborHours.low.toFixed(0)}–${economicJob.laborHours.high.toFixed(0)} hrs`,
      estimationRunId: runId,
      estimateState: (freshItem?.estimate_state as string) ?? null,
      estimateVersion: (freshItem?.estimate_version as number) ?? prevVersion + 1,
      estimateDelta: (freshItem?.estimate_delta as Record<string, unknown>) ?? estimateDelta,
    });
  } catch (err: any) {
    console.error('re-estimate-job error:', err);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/re-estimate-job' };
