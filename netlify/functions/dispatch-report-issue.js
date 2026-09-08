/**
 * POST /api/dispatch-report-issue
 *
 * Records a field issue report for a booking.
 * Does NOT change the booking status.
 * Issue photos (if any) must already have been registered via /api/dispatch-photo
 * with kind='issue'; this endpoint links them to the created issue record.
 *
 * Note: the client should call /api/dispatch-photo-upload-url → PUT → /api/dispatch-photo
 * for each issue photo BEFORE calling this endpoint, then pass the resulting photoIds.
 * This endpoint updates those photo rows to set job_issue_id.
 */

import { getServiceClient, verifyAdmin, jsonResponse, errorResponse } from './_shared/supabase.js';

const ALLOWED_ISSUE_TYPES = new Set([
  'customer_unavailable', 'cannot_access_property', 'scope_differs',
  'prohibited_material', 'customer_canceled', 'equipment_issue', 'other',
]);

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const body = await req.json();
    const { bookingId, issueType, notes, issuePhotoIds } = body;

    if (!bookingId)  return errorResponse('bookingId is required');
    if (!issueType)  return errorResponse('issueType is required');
    if (!notes?.trim()) return errorResponse('notes is required');

    if (!ALLOWED_ISSUE_TYPES.has(issueType)) {
      return errorResponse(`Invalid issueType: ${issueType}`);
    }

    const supabase = getServiceClient();

    // Verify booking exists
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, business_id')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    // Save issue record
    const { data: issue, error: issueErr } = await supabase
      .from('job_issues')
      .insert({
        booking_id:         bookingId,
        business_id:        booking.business_id,
        issue_type:         issueType,
        notes:              notes.trim(),
        flagged_for_review: true,
      })
      .select('id, booking_id, issue_type, notes, created_at')
      .single();

    if (issueErr) {
      console.error('dispatch-report-issue: insert failed:', issueErr);
      return errorResponse('Failed to save issue report', 500);
    }

    // Link any pre-uploaded issue photos to this issue record
    if (issuePhotoIds && Array.isArray(issuePhotoIds) && issuePhotoIds.length > 0) {
      await supabase
        .from('booking_photos')
        .update({ job_issue_id: issue.id })
        .in('id', issuePhotoIds)
        .eq('booking_id', bookingId)
        .eq('kind', 'issue')
        .eq('source', 'crew');
    }

    // Audit log
    await supabase.from('audit_log').insert({
      booking_id: bookingId,
      business_id: booking.business_id,
      event_type: 'issue_reported',
      admin_id:   admin.id,
      metadata: {
        issue_id:           issue.id,
        issue_type:         issueType,
        flagged_for_review: true,
      },
    });

    return jsonResponse({ success: true, issueId: issue.id });

  } catch (e) {
    console.error('dispatch-report-issue error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/dispatch-report-issue' };
