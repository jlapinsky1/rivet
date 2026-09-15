/**
 * GET /api/dispatch-job?bookingId=
 *
 * Returns the full dispatch-safe detail for a single booking, including
 * signed customer photo URLs (3600s expiry).  Never returns raw storage
 * paths, Stripe IDs, pricing, or financial data.
 */

import { getServiceClient, verifyAdmin, jsonResponse, errorResponse } from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const url = new URL(req.url, 'https://placeholder.local');
    const bookingId = url.searchParams.get('bookingId');
    if (!bookingId) return errorResponse('bookingId is required');

    const supabase = getServiceClient();

    // Load booking - dispatch-safe columns only
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select(
        'id, status, deposit_confirmed_at, preferred_date, time_preference, ' +
        'scheduled_pickup, customer_name, customer_phone, full_address, ' +
        'access_type, quantity, stairs, elevator, description, internal_notes, ' +
        'en_route_at, arrived_at, started_at, completed_at'
      )
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    // Load customer photos (source='customer') - generate signed URLs
    const { data: customerPhotoRows } = await supabase
      .from('booking_photos')
      .select('id, kind, file_name, sort_order, storage_path')
      .eq('booking_id', bookingId)
      .eq('source', 'customer')
      .in('kind', ['before'])
      .order('sort_order', { ascending: true });

    const customerPhotos = await Promise.all(
      (customerPhotoRows || []).map(async (photo) => {
        const { data: signed } = await supabase.storage
          .from('booking-photos')
          .createSignedUrl(photo.storage_path, 3600);
        return {
          id:         photo.id,
          kind:       photo.kind,
          fileName:   photo.file_name ?? null,
          sortOrder:  photo.sort_order,
          signedUrl:  signed?.signedUrl ?? null,
          // storage_path intentionally omitted
        };
      })
    );

    // Count crew photos (no paths returned)
    const { count: crewBeforePhotoCount } = await supabase
      .from('booking_photos')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('source', 'crew')
      .eq('kind', 'before');

    const { count: crewAfterPhotoCount } = await supabase
      .from('booking_photos')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('source', 'crew')
      .eq('kind', 'after');

    const dto = {
      id:                   booking.id,
      bookingRef:           'RES-' + booking.id.slice(0, 8).toUpperCase(),
      status:               booking.status,
      depositConfirmed:     booking.deposit_confirmed_at != null,
      appointmentDate:      booking.preferred_date ?? null,
      appointmentWindow:    booking.time_preference ?? null,
      scheduledPickup:      booking.scheduled_pickup ?? null,
      customerName:         booking.customer_name ?? null,
      customerPhone:        booking.customer_phone ?? null,
      fullAddress:          booking.full_address ?? null,
      accessInstructions:   booking.access_type ?? null,
      quantity:             booking.quantity ?? null,
      accessType:           booking.access_type ?? null,
      stairs:               booking.stairs ?? null,
      elevator:             booking.elevator ?? null,
      description:          booking.description ?? null,
      internalJobNotes:     booking.internal_notes ?? null,
      enRouteAt:            booking.en_route_at ?? null,
      arrivedAt:            booking.arrived_at ?? null,
      startedAt:            booking.started_at ?? null,
      completedAt:          booking.completed_at ?? null,
      customerPhotos,
      crewBeforePhotoCount: crewBeforePhotoCount ?? 0,
      crewAfterPhotoCount:  crewAfterPhotoCount ?? 0,
    };

    return jsonResponse({ job: dto });

  } catch (e) {
    console.error('dispatch-job error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/dispatch-job' };
