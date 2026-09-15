/**
 * Geocodes a booking's customer address via Nominatim (free, no API key required),
 * calculates straight-line distance from the shop origin, then stores both the
 * geocode result and the estimated one-way travel time on the booking row.
 *
 * Road distance is approximated as straight-line × 1.3 (standard road factor).
 * Travel time assumes an average speed of 30 mph (typical suburban/rural mix).
 *
 * Requires env vars:
 *   SHOP_LAT  - latitude of the shop / home base
 *   SHOP_LNG  - longitude of the shop / home base
 *
 * Called fire-and-forget from create-booking.js and on-demand from the admin UI.
 */
import {
  getServiceClient, jsonResponse, errorResponse,
} from './_shared/supabase.js';

/** Haversine distance in miles between two lat/lng pairs. */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { bookingId } = await req.json();
    if (!bookingId) return errorResponse('bookingId required');

    const shopLat = Number(process.env.SHOP_LAT);
    const shopLng = Number(process.env.SHOP_LNG);
    if (!shopLat || !shopLng) {
      return jsonResponse({ skipped: true, reason: 'SHOP_LAT/SHOP_LNG not configured' });
    }

    const supabase = getServiceClient();

    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, full_address, geocoding_status')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    // Already geocoded - return cached values
    if (booking.geocoding_status === 'success') {
      const { data: row } = await supabase
        .from('bookings')
        .select('geocoded_lat, geocoded_lng, distance_miles, travel_minutes_one_way')
        .eq('id', bookingId)
        .single();
      return jsonResponse({
        distanceMiles: row?.distance_miles,
        travelMinutes: row?.travel_minutes_one_way,
        cached: true,
      });
    }

    // Mark as in-progress
    await supabase
      .from('bookings')
      .update({
        geocoding_status: 'pending',
        geocoding_attempted_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    // Geocode via Nominatim (OpenStreetMap)
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(booking.full_address)}&format=json&limit=1`;
    const geoRes = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'Squatterz/1.0 (hello@gosquatterz.com)',
        'Accept-Language': 'en',
      },
    });

    if (!geoRes.ok) {
      await supabase
        .from('bookings')
        .update({ geocoding_status: 'failed', geocoding_error: `Nominatim ${geoRes.status}` })
        .eq('id', bookingId);
      return errorResponse('Geocoding service unavailable', 502);
    }

    const results = await geoRes.json();
    if (!results || results.length === 0) {
      await supabase
        .from('bookings')
        .update({ geocoding_status: 'failed', geocoding_error: 'Address not found' })
        .eq('id', bookingId);
      return errorResponse('Address could not be geocoded', 422);
    }

    const custLat = Number(results[0].lat);
    const custLng = Number(results[0].lon);

    const straightLineMiles = haversineDistance(shopLat, shopLng, custLat, custLng);
    const roadMiles = straightLineMiles * 1.3; // road-distance multiplier
    const travelMinutes = Math.max(5, Math.round((roadMiles / 30) * 60)); // 30 mph avg, min 5 min

    await supabase
      .from('bookings')
      .update({
        geocoded_lat: custLat,
        geocoded_lng: custLng,
        geocoding_status: 'success',
        distance_miles: Math.round(straightLineMiles * 10) / 10,
        travel_minutes_one_way: travelMinutes,
      })
      .eq('id', bookingId);

    return jsonResponse({ distanceMiles: straightLineMiles, travelMinutes });
  } catch (e) {
    console.error('geocode-booking error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/geocode-booking' };
