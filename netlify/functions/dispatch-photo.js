/**
 * POST /api/dispatch-photo
 *
 * Registers a crew or issue photo in booking_photos after the client has
 * successfully PUT the file to the signed upload URL.
 *
 * Returns { success, photoId } - never returns the storage path.
 */

import { getServiceClient, verifyAdmin, jsonResponse, errorResponse } from './_shared/supabase.js';

const ALLOWED_KINDS = new Set(['before', 'after', 'issue']);

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const body = await req.json();
    const {
      bookingId,
      storagePath,
      fileName,
      contentType,
      sizeBytes,
      kind,
      capturedAt,
      jobIssueId,
    } = body;

    if (!bookingId)    return errorResponse('bookingId is required');
    if (!storagePath)  return errorResponse('storagePath is required');
    if (!kind)         return errorResponse('kind is required');

    if (!ALLOWED_KINDS.has(kind)) {
      return errorResponse(`Invalid kind '${kind}'. Allowed: before, after, issue`);
    }

    // Path injection guard - all crew photos must live under completions/{bookingId}/
    const validPathPrefix = `completions/${bookingId}/`;
    if (!storagePath.startsWith(validPathPrefix)) {
      return errorResponse('Invalid storage path', 422);
    }

    const supabase = getServiceClient();

    // Verify booking exists
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    // Issue photos must have a valid jobIssueId belonging to this booking
    if (kind === 'issue') {
      if (!jobIssueId) return errorResponse('jobIssueId is required for issue photos');

      const { data: issue, error: issueErr } = await supabase
        .from('job_issues')
        .select('id')
        .eq('id', jobIssueId)
        .eq('booking_id', bookingId)
        .single();

      if (issueErr || !issue) {
        return errorResponse('Invalid jobIssueId for this booking', 422);
      }
    }

    const { data: photo, error: insertErr } = await supabase
      .from('booking_photos')
      .insert({
        booking_id:   bookingId,
        storage_path: storagePath,
        file_name:    fileName ?? null,
        content_type: contentType ?? null,
        size_bytes:   sizeBytes ?? null,
        kind,
        source:       'crew',
        captured_at:  capturedAt ?? null,
        job_issue_id: kind === 'issue' ? jobIssueId : null,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('dispatch-photo: insert failed:', insertErr);
      return errorResponse('Failed to save photo record', 500);
    }

    // Return photoId only - never return storage_path
    return jsonResponse({ success: true, photoId: photo.id });

  } catch (e) {
    console.error('dispatch-photo error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/dispatch-photo' };
