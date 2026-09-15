/**
 * POST /api/dispatch-complete
 *
 * Completes a job from the dispatch interface.
 *
 * Key differences from /api/complete-job (admin):
 *  - Does NOT accept finalAmountCents from the client. Reads approved_quote
 *    from the DB and uses that as the final amount.  Price cannot be changed
 *    from the dispatch interface.
 *  - No deposit override. Deposit must be confirmed - period.
 *  - Fetches after-photo paths from the DB (crew photos already uploaded via
 *    dispatch-photo). Client never sends paths.
 *  - Resumable: if the booking is already completed, resumes from the first
 *    incomplete step (same as runCompleteJob idempotency).
 */

import {
  getServiceClient, verifyAdmin, jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { toCents } from './_shared/stripe.js';
import { runCompleteJob } from './_shared/completeJobCore.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const body = await req.json();
    const {
      bookingId,
      technicianName,
      itemsRemoved,
      volumeEstimate,
      completionNotes,
      disposalNotes,
      completedAt,
    } = body;

    // ── Basic field validation ────────────────────────────────────────────────
    if (!bookingId)              return errorResponse('bookingId is required');
    if (!technicianName?.trim()) return errorResponse('technicianName is required');
    if (!itemsRemoved?.trim())   return errorResponse('itemsRemoved is required');
    if (!completionNotes?.trim()) return errorResponse('completionNotes is required');
    if (!completedAt)            return errorResponse('completedAt is required');

    // Validate completedAt is a parseable date
    const completedDate = new Date(completedAt);
    if (isNaN(completedDate.getTime())) {
      return errorResponse('completedAt must be a valid ISO datetime');
    }

    const supabase = getServiceClient();

    // ── Load booking ─────────────────────────────────────────────────────────
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, status, deposit_confirmed_at, approved_quote')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    // Must be in_progress or already completed (retry path)
    if (!['in_progress', 'completed'].includes(booking.status)) {
      return errorResponse(
        `Cannot complete a booking in '${booking.status}' status. ` +
        'The job must be in progress before it can be completed.',
        422
      );
    }

    // ── Deposit enforcement - no override from dispatch ──────────────────────
    if (!booking.deposit_confirmed_at) {
      return errorResponse(
        'Deposit not confirmed. Contact the office before completing this job.',
        403
      );
    }

    // ── Photo validation ─────────────────────────────────────────────────────
    const { count: beforeCount } = await supabase
      .from('booking_photos')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('source', 'crew')
      .eq('kind', 'before');

    if ((beforeCount ?? 0) === 0) {
      return errorResponse(
        'At least one on-site before photo is required to complete the job.',
        422
      );
    }

    const { count: afterCount, data: afterPhotos } = await supabase
      .from('booking_photos')
      .select('id, storage_path', { count: 'exact' })
      .eq('booking_id', bookingId)
      .eq('source', 'crew')
      .eq('kind', 'after');

    if ((afterCount ?? 0) === 0) {
      return errorResponse(
        'At least one after photo is required to complete the job.',
        422
      );
    }

    // ── Final amount: read from DB, never accept from client ─────────────────
    const finalAmountCents = toCents(Number(booking.approved_quote));
    if (!finalAmountCents || finalAmountCents <= 0) {
      return errorResponse('Invalid approved quote amount on booking', 500);
    }

    // After photo paths from DB (server-side) - client never sends paths here
    const afterPhotoStoragePaths = (afterPhotos || []).map(p => p.storage_path);

    // ── Run completion (resumable) ────────────────────────────────────────────
    const result = await runCompleteJob({
      supabase,
      admin,
      bookingId,
      completedAt,
      technicianName,
      itemsRemoved,
      volumeEstimate,
      completionNotes,
      disposalNotes,
      afterPhotoStoragePaths,
      finalAmountCents,
      // No priceAdjustmentReason - amount always equals approved quote
    });

    return jsonResponse(result);

  } catch (e) {
    console.error('dispatch-complete error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/dispatch-complete' };
