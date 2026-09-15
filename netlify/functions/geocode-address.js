/**
 * Geocode an arbitrary address and return estimated one-way travel time from shop.
 * Used by commercial admin when property travel time is unknown.
 */
import { jsonResponse, errorResponse } from './_shared/supabase.js';

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function geocodeAddress(address) {
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address.trim())}&format=json&limit=1`;
  const geoRes = await fetch(nominatimUrl, {
    headers: {
      'User-Agent': 'Squatterz/1.0 (hello@gosquatterz.com)',
      'Accept-Language': 'en',
    },
  });

  if (!geoRes.ok) throw new Error(`Geocoding service unavailable (${geoRes.status})`);

  const results = await geoRes.json();
  if (!results?.length) throw new Error('Address could not be geocoded');

  return {
    lat: Number(results[0].lat),
    lng: Number(results[0].lon),
  };
}

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { address, shopAddress } = await req.json();
    if (!address?.trim()) return errorResponse('address required');

    let shopLat = Number(process.env.SHOP_LAT);
    let shopLng = Number(process.env.SHOP_LNG);

    if ((!shopLat || !shopLng) && shopAddress?.trim()) {
      const shop = await geocodeAddress(shopAddress);
      shopLat = shop.lat;
      shopLng = shop.lng;
    }

    if (!shopLat || !shopLng) {
      return jsonResponse({
        skipped: true,
        reason: 'Shop location not configured - set SHOP_LAT/SHOP_LNG or pass shopAddress',
      });
    }

    const job = await geocodeAddress(address);
    const straightLineMiles = haversineDistance(shopLat, shopLng, job.lat, job.lng);
    const roadMiles = straightLineMiles * 1.3;
    const travelMinutes = Math.max(5, Math.round((roadMiles / 30) * 60));

    return jsonResponse({
      distanceMiles: Math.round(roadMiles * 10) / 10,
      travelMinutes,
    });
  } catch (e) {
    console.error('geocode-address error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/geocode-address' };
