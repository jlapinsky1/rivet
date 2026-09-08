import {
  getServiceClient, verifyAdmin,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';

/**
 * POST /api/admin-support-note
 *
 * Admin-only. Adds a timestamped, attributed support note to a booking.
 * Support notes are internal only — never exposed to customers.
 */
export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const { bookingId, noteText } = await req.json();
    if (!bookingId) return errorResponse('bookingId is required');
    if (!noteText?.trim()) return errorResponse('noteText is required');

    const supabase = getServiceClient();

    // Verify booking exists
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, business_id')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    // Get admin email from the session user
    const adminEmail = admin.email || null;

    // Insert support note
    const { data: note, error: noteErr } = await supabase
      .from('support_notes')
      .insert({
        booking_id: bookingId,
        business_id: booking.business_id,
        note_text: noteText.trim(),
        admin_id: admin.id,
        admin_email: adminEmail,
      })
      .select('id, note_text, admin_email, created_at')
      .single();

    if (noteErr) {
      console.error('admin-support-note insert error:', noteErr);
      return errorResponse('Failed to save note', 500);
    }

    // Audit log entry
    await supabase.from('audit_log').insert({
      booking_id: bookingId,
      business_id: booking.business_id,
      event_type: 'support_note_added',
      admin_id: admin.id,
      metadata: { note_id: note.id },
    });

    return jsonResponse({
      note: {
        id: note.id,
        noteText: note.note_text,
        adminEmail: note.admin_email,
        createdAt: note.created_at,
      },
    });

  } catch (e) {
    console.error('admin-support-note error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/admin-support-note' };
