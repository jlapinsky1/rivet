import {
  getServiceClient, verifyAdmin, verifyBusinessMember,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { toCents } from './_shared/stripe.js';
import { runCompleteJob } from './_shared/completeJobCore.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const bizAuth = await verifyBusinessMember(req);
    const admin = bizAuth?.user || await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const body = await req.json();
    const {
      bookingId,
      completedAt,
      technicianName,
      technicianId,
      itemsRemoved,
      volumeEstimate,
      completionNotes,
      disposalNotes,
      finalAmountCents,
      priceAdjustmentReason,
      afterPhotoStoragePaths,
      // Legacy actuals (still accepted for backwards compatibility)
      actuals,
      // Deposit override
      override,
      overrideReason,
    } = body;

    if (!bookingId) return errorResponse('bookingId is required');

    // ── Validate required completion package fields ────────────────────────
    if (!afterPhotoStoragePaths || !Array.isArray(afterPhotoStoragePaths) || afterPhotoStoragePaths.length === 0) {
      return errorResponse('At least one after photo is required to complete the job');
    }
    if (!completionNotes?.trim()) return errorResponse('completionNotes is required');
    if (!itemsRemoved?.trim())    return errorResponse('itemsRemoved is required');
    if (!technicianName?.trim())  return errorResponse('technicianName is required');
    if (!finalAmountCents || !Number.isInteger(finalAmountCents) || finalAmountCents <= 0) {
      return errorResponse('finalAmountCents must be a positive integer');
    }
    if (!completedAt) return errorResponse('completedAt is required');

    // Validate storage paths to prevent path injection
    const validPathPrefix = `completions/${bookingId}/`;
    for (const path of afterPhotoStoragePaths) {
      if (!path.startsWith(validPathPrefix)) {
        return errorResponse('Invalid photo storage path');
      }
    }

    const supabase = getServiceClient();

    // ── Load booking ──────────────────────────────────────────────────────
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select(
        'id, business_id, status, deposit_confirmed_at, stripe_invoice_id, stripe_customer_id, ' +
        'stripe_final_payment_intent_id, customer_email, customer_name, approved_quote'
      )
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    if (booking.status === 'completed') {
      return errorResponse('This booking has already been completed', 409);
    }
    if (!['scheduled', 'in_progress', 'en_route', 'arrived'].includes(booking.status)) {
      return errorResponse(`Cannot complete a booking in '${booking.status}' status`);
    }

    // ── Deposit enforcement ───────────────────────────────────────────────
    if (!booking.deposit_confirmed_at) {
      if (!override || !overrideReason?.trim()) {
        return errorResponse(
          'Deposit has not been confirmed. The deposit must be received before the job can be ' +
          'completed and the final payment requested. Provide override: true and overrideReason to bypass.',
          403
        );
      }
      // Log override
      await supabase.from('audit_log').insert({
        booking_id: bookingId,
        business_id: booking.business_id,
        event_type: 'dispatch_override',
        admin_id:   admin.id,
        reason:     overrideReason.trim(),
        metadata:   { override_type: 'complete_without_deposit' },
      });
    }

    // ── Validate price adjustment reason if amount differs ────────────────
    const approvedQuoteCents = Math.round(Number(booking.approved_quote) * 100);
    if (finalAmountCents !== approvedQuoteCents && !priceAdjustmentReason?.trim()) {
      return errorResponse(
        'priceAdjustmentReason is required when the final amount differs from the approved quote'
      );
    }

    const result = await runCompleteJob({
      supabase,
      admin,
      bookingId,
      completedAt,
      technicianName,
      technicianId,
      itemsRemoved,
      volumeEstimate,
      completionNotes,
      disposalNotes,
      afterPhotoStoragePaths,
      finalAmountCents,
      priceAdjustmentReason,
    });

    return jsonResponse(result);

  } catch (e) {
    console.error('complete-job error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/complete-job' };
