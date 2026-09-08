/**
 * POST /api/dispatch-status
 *
 * Advances a booking through the dispatch status sequence.
 * Enforces deposit confirmation and before-photo requirements.
 * Idempotent: returns success if the booking is already in targetStatus.
 * Notification events are queued by the DB trigger — not inserted here.
 *
 * Valid transitions:
 *   scheduled   → en_route    (deposit required)
 *   en_route    → arrived
 *   arrived     → in_progress (deposit required + ≥1 crew before photo)
 *   in_progress → completed   → rejected (use /api/dispatch-complete)
 */

import { getServiceClient, verifyAdmin, jsonResponse, errorResponse } from './_shared/supabase.js';

// Hard-coded valid transitions for the dispatch interface
const TRANSITIONS = {
  scheduled:   'en_route',
  en_route:    'arrived',
  arrived:     'in_progress',
};

// Transitions that require deposit_confirmed_at
const DEPOSIT_REQUIRED = new Set(['en_route', 'in_progress']);

// Timestamp column to set for each target status
const TIMESTAMP_COLUMN = {
  en_route:    'en_route_at',
  arrived:     'arrived_at',
  in_progress: 'started_at',
};

// Audit event type for each target status
const AUDIT_EVENT = {
  en_route:    'crew_dispatched',
  arrived:     'crew_arrived',
  in_progress: 'job_started',
};

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const body = await req.json();
    const { bookingId, targetStatus } = body;

    if (!bookingId)     return errorResponse('bookingId is required');
    if (!targetStatus)  return errorResponse('targetStatus is required');

    // Reject direct-to-completed via this endpoint
    if (targetStatus === 'completed') {
      return errorResponse('Use /api/dispatch-complete to mark a job as completed', 422);
    }

    // Validate targetStatus is a known dispatch status
    if (!Object.values(TRANSITIONS).includes(targetStatus)) {
      return errorResponse(`Invalid targetStatus: ${targetStatus}`, 422);
    }

    const supabase = getServiceClient();

    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, business_id, status, deposit_confirmed_at')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    // ── Idempotency: already in target status ────────────────────────────────
    if (booking.status === targetStatus) {
      return jsonResponse({
        success:   true,
        idempotent: true,
        booking: {
          id:     booking.id,
          status: booking.status,
        },
      });
    }

    // ── Validate transition ──────────────────────────────────────────────────
    const expectedSource = Object.entries(TRANSITIONS).find(([, t]) => t === targetStatus)?.[0];
    if (booking.status !== expectedSource) {
      return errorResponse(
        `Cannot transition from '${booking.status}' to '${targetStatus}'. ` +
        `Expected current status: '${expectedSource}'.`,
        422
      );
    }

    // ── Deposit enforcement ──────────────────────────────────────────────────
    if (DEPOSIT_REQUIRED.has(targetStatus) && !booking.deposit_confirmed_at) {
      return errorResponse(
        'Deposit not confirmed. Contact the office before dispatching.',
        403
      );
    }

    // ── Before-photo requirement for arrived → in_progress ───────────────────
    if (targetStatus === 'in_progress') {
      const { count } = await supabase
        .from('booking_photos')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId)
        .eq('source', 'crew')
        .eq('kind', 'before');

      if ((count ?? 0) === 0) {
        return errorResponse(
          'At least one on-site before photo is required before starting the job.',
          422
        );
      }
    }

    // ── Apply status change ──────────────────────────────────────────────────
    const now = new Date().toISOString();
    const tsColumn = TIMESTAMP_COLUMN[targetStatus];

    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        status:     targetStatus,
        [tsColumn]: now,
      })
      .eq('id', bookingId)
      .eq('status', booking.status); // optimistic concurrency guard

    if (updateErr) {
      console.error('dispatch-status: update failed:', updateErr);
      return errorResponse('Failed to update status', 500);
    }

    // ── Audit log ────────────────────────────────────────────────────────────
    await supabase.from('audit_log').insert({
      booking_id: bookingId,
      business_id: booking.business_id,
      event_type: AUDIT_EVENT[targetStatus],
      admin_id:   admin.id,
      metadata:   { previous_status: booking.status, new_status: targetStatus },
    });

    // Notification event is inserted by the DB trigger on bookings.status update.

    return jsonResponse({
      success: true,
      booking: {
        id:               bookingId,
        status:           targetStatus,
        updatedTimestamp: now,
      },
    });

  } catch (e) {
    console.error('dispatch-status error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/dispatch-status' };
