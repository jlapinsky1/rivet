import { getServiceClient } from './supabase.js';
import { extractJobFactsStub } from '../../../src/estimator/extract';
import { estimateHandymanJob, applyCalibration } from '../../../src/estimator/estimator';
import { deriveRecommendation } from '../../../src/estimator/decision';
import { buildDecisionContext, parseTravelMiles } from '../../../src/estimator/weekContext';
import { economicsFromSettings } from '../../../src/estimator/economicsFromSettings';
import { ESTIMATOR_VERSION } from '../../../src/estimator/types';
import { PROMPT_VERSION, AI_MODEL } from '../../../src/estimator/extract';

/**
 * Process a booking into a work item. Callable directly from any function.
 */
export async function processBooking(bookingId, businessId) {
  const supabase = getServiceClient();

  // Find booking — try with business_id filter, fall back without
  let booking = null;
  const { data: b1 } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .eq('business_id', businessId)
    .single();

  if (b1) {
    booking = b1;
  } else {
    const { data: b2 } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();
    booking = b2;
  }

  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const { data: existing } = await supabase
    .from('work_items')
    .select('id')
    .eq('business_id', businessId)
    .eq('description', booking.description || '')
    .eq('phone', booking.customer_phone || '')
    .limit(1)
    .maybeSingle();

  if (existing) return { workItemId: existing.id, alreadyProcessed: true };

  const { data: business } = await supabase
    .from('businesses')
    .select('settings, vertical')
    .eq('id', businessId)
    .single();

  if (business?.vertical && business.vertical !== 'handyman') {
    return { skipped: true, reason: 'not_handyman' };
  }

  const description = booking.description || 'Handyman job request';
  const extraction = extractJobFactsStub({
    description,
    customerNotes: booking.customer_notes || undefined,
  });

  const { data: siblingItems } = await supabase
    .from('work_items')
    .select('op_status, profit, hours_num, created_at, completed_at')
    .eq('business_id', businessId);

  const settings = business?.settings || {};
  const config = economicsFromSettings(settings, businessId);
  const ctx = buildDecisionContext(
    (siblingItems || []).map(row => ({
      opStatus: row.op_status,
      profit: row.profit,
      hoursNum: row.hours_num,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    })),
    { weeklyGoal: config.weeklyEarningsGoal, weeklyHours: config.weeklyCapacityHours },
  );

  const miles = Number(booking.distance_miles) || parseTravelMiles(null);
  const estimate = estimateHandymanJob(extraction);
  const economicJob = applyCalibration(estimate, config, null, miles, ctx);
  const decision = deriveRecommendation(economicJob, config, ctx);

  const runId = crypto.randomUUID();
  const displayPrice = decision.suggestedPrice ?? Math.round(economicJob.evaluatedPrice);
  const title = (description.split(/[.!\n]/)[0] || 'New handyman request').slice(0, 80);

  const { error: runErr } = await supabase.from('estimation_runs').insert({
    id: runId,
    business_id: businessId,
    created_at: new Date().toISOString(),
    project_family: extraction.tradeContexts[0] || 'general_handyman',
    estimator_version: ESTIMATOR_VERSION,
    ai_model: AI_MODEL,
    prompt_version: PROMPT_VERSION,
    customer_inputs: { description, photos: [] },
    extraction,
    baseline_estimate: estimate,
    calibration_applied: null,
    economic_job: economicJob,
    decision_context: ctx,
    recommendation: decision.recommendation,
    reasons: decision.reasons,
    confidence: economicJob.confidence,
  });

  if (runErr) console.error('estimation_runs insert failed:', runErr);

  const location = [booking.city, booking.state].filter(Boolean).join(', ') || booking.full_address || '';
  const { data: workItem, error: workErr } = await supabase.from('work_items').insert({
    business_id: businessId,
    title,
    source: 'customer_request',
    customer_type: 'individual',
    customer_name: booking.customer_name,
    location,
    travel: `${miles} mi`,
    profit: Math.round(economicJob.contributionProfit.expected),
    hours: `${economicJob.laborHours.low.toFixed(0)}–${economicJob.laborHours.high.toFixed(0)} hrs`,
    hours_num: economicJob.laborHours.expected,
    rate: `$${Math.round(economicJob.contributionPerLaborHour.expected)}/hr`,
    rate_num: Math.round(economicJob.contributionPerLaborHour.expected),
    recommendation: decision.recommendation,
    confidence: Math.round(economicJob.confidence * 100),
    description,
    price: displayPrice,
    costs: Math.round(economicJob.totalDirectCost.expected),
    cost_breakdown: [
      { label: 'Materials', value: `$${Math.round(economicJob.materialCost.expected)}` },
      { label: 'Travel', value: `$${Math.round(economicJob.travelCost)}` },
    ],
    reasons: decision.reasons,
    photos: await (async () => {
      const { data: bPhotos } = await supabase
        .from('booking_photos')
        .select('storage_path')
        .eq('booking_id', bookingId)
        .order('sort_order');
      if (!bPhotos?.length) return [];
      const urls = await Promise.all(
        bPhotos.map(p =>
          supabase.storage.from('booking-photos').createSignedUrl(p.storage_path, 604800)
            .then(({ data }) => data?.signedUrl || null)
        )
      );
      return urls.filter(Boolean);
    })(),
    op_status: 'needs_review',
    billing_status: 'not_invoiced',
    preferred_date: booking.preferred_date,
    phone: booking.customer_phone,
    email: booking.customer_email,
    address: booking.full_address,
    service_type: 'Handyman',
    estimation_run_id: runId,
  }).select('id').single();

  if (workErr) throw new Error(`work_items insert failed: ${workErr.message}`);

  if (!runErr && workItem?.id) {
    await supabase.from('estimation_runs').update({ work_id: workItem.id }).eq('id', runId);
  }

  return { workItemId: workItem.id, runId, recommendation: decision.recommendation };
}
